/**
 * Orchestrates root resolution (`root.ts`), the CLI child process (`devProcess.ts`) and the
 * singleton panel (`panel.ts`) into the flows the extension supports: click a file, click a
 * folder in the explorer, widen, close-then-reopen.
 *
 * One `SeemoreSession` per extension host — there is only ever one webview panel — so all
 * of this is one small piece of mutable state, not a registry.
 */
import { basename } from 'node:path';
import * as vscode from 'vscode';
import { resolveCliEntry } from './cliEntry.js';
import { type SpawnedDevServer, spawnDevServer } from './devProcess.js';
import { SeemorePanel } from './panel.js';
import { canonicalise, hasSeemoreConfig, resolveRelativePosix } from './pathUtil.js';
import { createPinnedRootStore, type PinnedRootStore } from './pinnedRoot.js';
import { fetchRoute } from './route.js';
import { decideNavigation, resolveInitialRoot } from './root.js';

/** Close-and-reopen inside this window skips the boot cost of spawning a new server. */
const CLOSE_GRACE_MS = 30_000;

/** Three fast clicks landing on different roots cause one respawn, not three. */
const WIDEN_DEBOUNCE_MS = 250;

export class SeemoreSession {
  private readonly pinned: PinnedRootStore;
  private readonly panel: SeemorePanel;
  private readonly statusBarItem: vscode.StatusBarItem;

  private liveRoot: string | undefined;
  private devServer: SpawnedDevServer | undefined;
  private closeTimer: NodeJS.Timeout | undefined;
  private widenTimer: NodeJS.Timeout | undefined;
  private pendingWiden: { root: string; file: string } | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.pinned = createPinnedRootStore(context.workspaceState);
    this.panel = new SeemorePanel(
      (file) => void this.openSourceFile(file),
      () => this.onPanelClosed(),
    );
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  }

  /** Editor-title icon: `resourceLangId == markdown`. */
  async openFile(uri: vscode.Uri): Promise<void> {
    this.cancelCloseTimer();
    const file = canonicalise(uri.fsPath);

    if (this.liveRoot !== undefined && this.devServer !== undefined) {
      const decision = decideNavigation({
        liveRoot: this.liveRoot,
        file,
        workspaceFolder: this.workspaceFolderPath(uri),
      });
      if (decision.action === 'navigate') {
        await this.goto(file);
        return;
      }
      this.scheduleWiden(decision.root, file);
      return;
    }

    const root = resolveInitialRoot({
      file,
      pinned: this.pinned.get(),
      hasConfig: hasSeemoreConfig,
      searchBoundary: this.workspaceFolderPath(uri),
    });
    await this.start(root, file);
  }

  /** Explorer folder context menu: pins the folder as the root and opens it. */
  async openFolder(uri: vscode.Uri): Promise<void> {
    this.cancelCloseTimer();
    const root = canonicalise(uri.fsPath);
    await this.pinned.set(root);
    this.stopServer();
    await this.start(root, undefined);
  }

  /**
   * The status bar item's click action. A widen is visible (the status bar names the live
   * root) and reversible in one click: rather than trying to reconstruct "the folder before
   * the widen" — which the click that caused the widen may have made meaningless anyway —
   * this pins the *current* live root, so it stops being re-derived on the next cold start
   * and stops widening further on its own.
   */
  async pinLiveRoot(): Promise<void> {
    if (this.liveRoot === undefined) return;
    await this.pinned.set(this.liveRoot);
    void vscode.window.showInformationMessage(`seemore: pinned "${this.liveRoot}" as the root for this workspace.`);
  }

  dispose(): void {
    this.cancelCloseTimer();
    if (this.widenTimer) clearTimeout(this.widenTimer);
    this.statusBarItem.dispose();
    this.panel.dispose();
    this.stopServer();
  }

  private workspaceFolderPath(uri: vscode.Uri): string | undefined {
    return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
  }

  /** Debounced so rapid clicks across roots respawn once, not once per click. */
  private scheduleWiden(root: string, file: string): void {
    this.pendingWiden = { root, file };
    if (this.widenTimer) clearTimeout(this.widenTimer);
    this.widenTimer = setTimeout(() => {
      this.widenTimer = undefined;
      const pending = this.pendingWiden;
      this.pendingWiden = undefined;
      if (pending === undefined) return;
      this.stopServer();
      void this.start(pending.root, pending.file);
    }, WIDEN_DEBOUNCE_MS);
  }

  private async start(root: string, file: string | undefined): Promise<void> {
    try {
      const cliEntry = resolveCliEntry({
        extensionPath: this.context.extensionPath,
        override: vscode.workspace.getConfiguration('seemore').get<string>('path'),
      });
      const spawned = await spawnDevServer({ cliEntry, root });
      this.devServer = spawned;
      this.liveRoot = spawned.ready.contentRoot;
      this.updateStatusBar();

      const target = file === undefined ? spawned.ready.url : await this.resolveTargetUrl(spawned.ready.url, file);
      await this.panel.show(target);
    } catch (error) {
      this.stopServer();
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`seemore: ${message}`);
    }
  }

  private async goto(file: string): Promise<void> {
    if (this.devServer === undefined) return;
    const target = await this.resolveTargetUrl(this.devServer.ready.url, file);
    await this.panel.navigate(target);
  }

  /**
   * Asks the running server what URL `file` resolved to, rather than recomputing route
   * resolution here — that resolution is corpus-level (index vs. README, duplicate slugs,
   * `exclude`, `base`) and a local copy would drift. `devUrl`'s own path (the site's
   * `base`) must not be dropped when resolving the route against it, so this resolves
   * against the bare origin rather than `devUrl` itself.
   */
  private async resolveTargetUrl(devUrl: string, file: string): Promise<string> {
    const origin = new URL(devUrl).origin;
    const result = await fetchRoute(origin, file);
    if (result.ok) return new URL(result.url, origin).toString();
    void vscode.window.showWarningMessage(`seemore: ${result.error}`);
    return devUrl;
  }

  /**
   * The webview posts `{ file: <posix-relative-path> }` when a rendered page's "open
   * source" affordance is used. Nothing in `packages/seemore`'s own UI sends this message
   * yet — adding that affordance is a change to the site's own React app, out of scope for
   * this pass — so this listener is wired and ready, but currently unreachable. Left as a
   * known gap rather than silently extending seemore's UI to fill it.
   */
  private async openSourceFile(relativeFile: string): Promise<void> {
    if (this.liveRoot === undefined) return;
    const uri = vscode.Uri.file(resolveRelativePosix(this.liveRoot, relativeFile));
    await vscode.window.showTextDocument(uri);
  }

  private onPanelClosed(): void {
    this.cancelCloseTimer();
    this.closeTimer = setTimeout(() => this.stopServer(), CLOSE_GRACE_MS);
  }

  private cancelCloseTimer(): void {
    if (this.closeTimer === undefined) return;
    clearTimeout(this.closeTimer);
    this.closeTimer = undefined;
  }

  private stopServer(): void {
    this.devServer?.process.kill();
    this.devServer = undefined;
    this.liveRoot = undefined;
    this.cancelCloseTimer();
    this.updateStatusBar();
  }

  private updateStatusBar(): void {
    if (this.liveRoot === undefined) {
      this.statusBarItem.hide();
      return;
    }
    this.statusBarItem.text = `$(book) seemore: ${basename(this.liveRoot)}`;
    this.statusBarItem.tooltip = `Serving ${this.liveRoot}\nClick to pin this folder instead of re-resolving it.`;
    this.statusBarItem.command = 'seemore.pinLiveRoot';
    this.statusBarItem.show();
  }
}

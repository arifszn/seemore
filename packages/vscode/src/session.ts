/**
 * Orchestrates root resolution (`root.ts`), the CLI child process (`devProcess.ts`) and the
 * singleton panel (`panel.ts`).
 *
 * Every "Open in seemore" click kills whatever server is currently running and starts a
 * fresh one for the freshly resolved root — no sticky root, no navigate-vs-widen decision,
 * no in-place postMessage navigation. That flow existed to make same-folder clicks free
 * (skip the respawn), but the two real bugs found by actually clicking through the
 * extension both lived in it: a message the webview bridge silently dropped, and a focus
 * handoff that worked in some layouts and not others. One path, always taken, is easier to
 * get right than two, and is the one this file has actually been proven correct on.
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
import { resolveInitialRoot } from './root.js';

/** Close-and-reopen inside this window skips the boot cost of spawning a new server. */
const CLOSE_GRACE_MS = 30_000;

export class SeemoreSession {
  private readonly pinned: PinnedRootStore;
  private readonly panel: SeemorePanel;
  private readonly statusBarItem: vscode.StatusBarItem;

  private liveRoot: string | undefined;
  private devServer: SpawnedDevServer | undefined;
  private closeTimer: NodeJS.Timeout | undefined;
  /** Serializes openFile/openFolder so two quick clicks respawn once each, in order, rather than racing and orphaning a process. */
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly context: vscode.ExtensionContext) {
    this.pinned = createPinnedRootStore(context.workspaceState);
    this.panel = new SeemorePanel(
      (file) => void this.openSourceFile(file),
      () => this.onPanelClosed(),
    );
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  }

  /** Editor-title icon: `resourceLangId == markdown`. Always kills and restarts fresh. */
  async openFile(uri: vscode.Uri): Promise<void> {
    return this.enqueue(async () => {
      this.cancelCloseTimer();
      const file = canonicalise(uri.fsPath);
      const viewColumn = vscode.window.activeTextEditor?.viewColumn;

      const root = resolveInitialRoot({
        file,
        pinned: this.pinned.get(),
        hasConfig: hasSeemoreConfig,
        searchBoundary: this.workspaceFolderPath(uri),
      });

      this.stopServer();
      await this.start(root, file);
      await this.restoreFocus(uri, viewColumn);
    });
  }

  /** Explorer folder context menu: pins the folder as the root and opens it. */
  async openFolder(uri: vscode.Uri): Promise<void> {
    return this.enqueue(async () => {
      this.cancelCloseTimer();
      const root = canonicalise(uri.fsPath);
      await this.pinned.set(root);
      this.stopServer();
      await this.start(root, undefined);
    });
  }

  /**
   * The status bar item's click action. Pins the live root so it stops being re-derived on
   * the next cold start — the closest thing to an "undo" now that there is no widen to undo.
   */
  async pinLiveRoot(): Promise<void> {
    if (this.liveRoot === undefined) return;
    await this.pinned.set(this.liveRoot);
    void vscode.window.showInformationMessage(`seemore: pinned "${this.liveRoot}" as the root for this workspace.`);
  }

  dispose(): void {
    this.cancelCloseTimer();
    this.statusBarItem.dispose();
    this.panel.dispose();
    this.stopServer();
  }

  private workspaceFolderPath(uri: vscode.Uri): string | undefined {
    return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
  }

  /** Runs `task`s one at a time, in call order, regardless of whether an earlier one threw. */
  private enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.queue.then(task, task);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * Reclaims focus for the editor the reader was actually in. `preserveFocus: true` on the
   * panel's own create/reveal calls stops it taking literal keyboard focus, but replacing
   * its HTML outright (`setHtml`, on every click now) is still enough to nudge VS Code's
   * "where does the next explorer click open" bookkeeping toward the panel's group in a way
   * `preserveFocus` alone doesn't cover. Explicitly reopening the original document, in its
   * original column, overrides whatever drifted.
   */
  private async restoreFocus(uri: vscode.Uri, viewColumn: vscode.ViewColumn | undefined): Promise<void> {
    try {
      await vscode.window.showTextDocument(uri, { viewColumn, preserveFocus: false, preview: false });
    } catch {
      // The document may have closed since; nothing to restore focus to.
    }
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
      spawned.process.once('exit', (code, signal) => this.onServerCrashed(spawned, code, signal));

      const target = file === undefined ? spawned.ready.url : await this.resolveTargetUrl(spawned.ready.url, file);
      await this.panel.show(target);
    } catch (error) {
      this.stopServer();
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`seemore: ${message}`);
    }
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

  /**
   * The dev server can die after its ready line — Vite's dependency optimizer, for one,
   * only actually runs once the first page loads, so a crash there lands well after
   * `spawnDevServer` already resolved successfully. Without this, that death was
   * indistinguishable from the iframe just being slow: nothing killed the panel, nothing
   * told the user, the page stayed blank forever.
   */
  private onServerCrashed(spawned: SpawnedDevServer, code: number | null, signal: NodeJS.Signals | null): void {
    if (this.devServer !== spawned) return; // already stopped/replaced deliberately
    this.devServer = undefined;
    this.liveRoot = undefined;
    this.cancelCloseTimer();
    this.updateStatusBar();
    void vscode.window.showErrorMessage(
      `seemore stopped unexpectedly while serving ${spawned.ready.contentRoot} ` +
        `(exit code ${code ?? 'unknown'}${signal !== null ? `, signal ${signal}` : ''}). ` +
        `Click "Open in seemore" again to restart it.`,
    );
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

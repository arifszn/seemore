/**
 * The one `WebviewPanel` this extension ever creates (Q4 — exactly one, ever). Owns the
 * iframe/postMessage bridge from `panelHtml.ts`; root resolution and server lifecycle live
 * in `session.ts`.
 */
import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { renderPanelHtml } from './panelHtml.js';

interface OpenSourceMessage {
  type: 'seemore:open-source';
  file: string;
}

function isOpenSourceMessage(value: unknown): value is OpenSourceMessage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.type === 'seemore:open-source' && typeof candidate.file === 'string';
}

interface CopyResponseMessage {
  type: 'seemore:copy-response';
  requestId: string;
  text: string;
}

function isCopyResponseMessage(value: unknown): value is CopyResponseMessage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === 'seemore:copy-response' &&
    typeof candidate.requestId === 'string' &&
    typeof candidate.text === 'string'
  );
}

/** A response the panel gave up waiting for shouldn't resolve a later, unrelated request. */
const COPY_TIMEOUT_MS = 1_000;

export class SeemorePanel {
  private panel: vscode.WebviewPanel | undefined;
  private pendingCopy: { requestId: string; resolve: (text: string) => void } | undefined;

  constructor(
    private readonly onOpenSource: (relativeFile: string) => void,
    private readonly onClosed: () => void,
  ) {}

  /**
   * Create the panel the first time; every later call reuses it, replacing its content —
   * there is exactly one `WebviewPanel`, ever, and every click resolves a fresh server and
   * shows it here rather than trying to patch the existing page in place.
   *
   * `preserveFocus: true` on both the initial creation and the reveal keeps the panel from
   * taking keyboard focus on its own — but that alone isn't enough: VS Code still opens the
   * *next* file the reader clicks in Explorer into whichever group last genuinely had
   * focus, and a reader who scrolls or clicks a link inside the rendered site does give the
   * panel real focus, legitimately, the same way clicking into any other editor group
   * would. So the panel's group is locked once, right after it's created — a locked group
   * never receives a plain file-open, no matter which group was last active. See
   * {@link lockGroup}.
   */
  async show(url: string): Promise<void> {
    const external = await vscode.env.asExternalUri(vscode.Uri.parse(url));

    if (this.panel === undefined) {
      this.panel = vscode.window.createWebviewPanel(
        'seemore',
        'seemore',
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true },
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.onClosed();
      });
      this.panel.webview.onDidReceiveMessage((message: unknown) => {
        if (isOpenSourceMessage(message)) this.onOpenSource(message.file);
        if (isCopyResponseMessage(message) && this.pendingCopy?.requestId === message.requestId) {
          this.pendingCopy.resolve(message.text);
          this.pendingCopy = undefined;
        }
      });
      await this.lockGroup();
    } else {
      this.panel.reveal(this.panel.viewColumn, true);
    }

    this.setHtml(external.toString(true));
  }

  /**
   * `workbench.action.lockEditorGroup` locks whichever group is currently focused — there
   * is no group-targeted overload — so this briefly takes real focus onto the panel
   * (`preserveFocus: false`) to make it that group, locks it, and leaves focus there; the
   * caller (`session.ts`, right after `show()` resolves) is the one that already restores
   * focus to the reader's own editor, so this doesn't need to undo the steal itself.
   */
  private async lockGroup(): Promise<void> {
    if (this.panel === undefined) return;
    this.panel.reveal(this.panel.viewColumn, false);
    await vscode.commands.executeCommand('workbench.action.lockEditorGroup');
  }

  private setHtml(iframeSrc: string): void {
    if (this.panel === undefined) return;
    const nonce = randomBytes(16).toString('hex');
    this.panel.webview.html = renderPanelHtml({ iframeSrc, cspSource: this.panel.webview.cspSource, nonce });
  }

  /**
   * Ctrl+C/Cmd+C never reaches the rendered page directly: it runs in a nested,
   * cross-origin iframe (`panelHtml.ts`), and VS Code's own keybinding dispatch is what
   * decides whether the keystroke goes anywhere near that iframe's native selection-copy
   * at all — it doesn't. So `seemore.copy` (bound to Ctrl+C/Cmd+C while this panel has
   * focus) asks the page for its current selection over the same postMessage bridge
   * instead, and writes the answer to the clipboard here, in the extension host, since the
   * iframe's page can't reach `vscode.env.clipboard` itself.
   */
  async copySelection(): Promise<void> {
    if (this.panel === undefined) return;
    const requestId = randomBytes(8).toString('hex');

    const text = await new Promise<string>((resolve) => {
      this.pendingCopy = { requestId, resolve };
      this.panel?.webview.postMessage({ type: 'seemore:copy-request', requestId });
      setTimeout(() => {
        if (this.pendingCopy?.requestId === requestId) {
          this.pendingCopy = undefined;
          resolve('');
        }
      }, COPY_TIMEOUT_MS);
    });

    if (text !== '') await vscode.env.clipboard.writeText(text);
  }

  dispose(): void {
    this.pendingCopy = undefined;
    this.panel?.dispose();
    this.panel = undefined;
  }
}

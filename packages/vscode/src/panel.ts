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

export class SeemorePanel {
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private readonly onOpenSource: (relativeFile: string) => void,
    private readonly onClosed: () => void,
  ) {}

  /**
   * Create the panel the first time; every later call reuses and reveals it.
   *
   * `preserveFocus: true` everywhere the panel takes or regains focus (here and in
   * {@link navigate}): without it, opening or revealing the panel makes its column the
   * active one, and VS Code opens the *next* file the reader clicks in the explorer there
   * too — so clicking a plain markdown file, not the seemore icon, would land it beside the
   * site instead of in the editor group the reader was actually working in.
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
      });
    } else {
      this.panel.reveal(this.panel.viewColumn, true);
    }

    this.setHtml(external.toString(true));
  }

  /**
   * Navigate in place: post the new src to the existing iframe rather than replacing the
   * panel's HTML, so a click that stays inside the live root is a plain in-page navigation.
   */
  async navigate(url: string): Promise<void> {
    if (this.panel === undefined) {
      await this.show(url);
      return;
    }
    const external = await vscode.env.asExternalUri(vscode.Uri.parse(url));
    this.panel.reveal(this.panel.viewColumn, true);
    void this.panel.webview.postMessage({ type: 'seemore:navigate', url: external.toString(true) });
  }

  private setHtml(iframeSrc: string): void {
    if (this.panel === undefined) return;
    const nonce = randomBytes(16).toString('hex');
    this.panel.webview.html = renderPanelHtml({ iframeSrc, cspSource: this.panel.webview.cspSource, nonce });
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }
}

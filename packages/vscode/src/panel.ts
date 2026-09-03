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

interface CopyMessage {
  type: 'seemore:copy';
  text: string;
}

function isCopyMessage(value: unknown): value is CopyMessage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.type === 'seemore:copy' && typeof candidate.text === 'string';
}

interface OpenExternalMessage {
  type: 'seemore:open-external';
  url: string;
}

function isOpenExternalMessage(value: unknown): value is OpenExternalMessage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.type === 'seemore:open-external' && typeof candidate.url === 'string';
}

/**
 * The schemes the host will launch for a page-posted URL — everything a rendered document can
 * legitimately point at (`mailto:` included). The iframe is untrusted content, so this
 * allowlist is what keeps a stray message from aiming `openExternal` at, say, a `file:` URI.
 */
const OPENABLE_SCHEMES = new Set(['http', 'https', 'mailto']);

export class SeemorePanel {
  private panel: vscode.WebviewPanel | undefined;

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
        // The page's own Clipboard API is denied inside a VS Code webview no matter how the
        // write is triggered — only `vscode.env.clipboard`, here in the extension host, can
        // actually reach the OS clipboard. See `SelectionCopyButton.tsx` for the trigger.
        if (isCopyMessage(message)) void vscode.env.clipboard.writeText(message.text);
        // Away-links come over the bridge too: a `target="_blank"` click inside the nested
        // iframe has no honoured popup path, so the page intercepts it (see
        // `ExternalLinkBridge.ts`) and the host opens the browser here instead. Unknown
        // schemes fail the allowlist silently.
        if (isOpenExternalMessage(message)) {
          const uri = vscode.Uri.parse(message.url);
          if (OPENABLE_SCHEMES.has(uri.scheme)) void vscode.env.openExternal(uri);
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

  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }
}

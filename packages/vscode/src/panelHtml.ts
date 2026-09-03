/**
 * The webview's own HTML shell: an iframe pointed at the dev server, plus the bridge script
 * that lets a rendered page ask the extension host to open its source file, or an away-link
 * in the reader's browser.
 *
 * Kept as a pure string builder — no `vscode` import — so the CSP and escaping are unit
 * testable without a webview.
 */

const BRIDGE_EVENT = 'seemore:open-source';
/** Posted for an away-link click; see `ExternalLinkBridge.ts`/`panel.ts` for the two ends. */
const OPEN_EXTERNAL_EVENT = 'seemore:open-external';
/** Posted with the current selection text; see `panel.ts` for why the write happens there. */
const COPY_EVENT = 'seemore:copy';

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface RenderPanelHtmlOptions {
  /** The dev server URL, already rewritten through `asExternalUri` for remote/Codespaces. */
  iframeSrc: string;
  /** `webview.cspSource`, scoping the CSP to what this specific webview may load. */
  cspSource: string;
  /** A per-load nonce for the bridge `<script>`, required by the CSP below. */
  nonce: string;
}

/**
 * The iframe origin is the dev server's own ephemeral-port origin, not `cspSource` — a
 * webview's `cspSource` covers `vscode-webview:` resources, and the dev server is loaded
 * cross-origin through `asExternalUri`. `frame-src` is intentionally wide (`https: http:`)
 * because that origin is only known at runtime and changes on every click (a fresh server,
 * a fresh ephemeral port); nothing else this page does needs a broad `frame-src`, so the
 * rest of the policy stays locked down.
 */
function contentSecurityPolicy(cspSource: string): string {
  return [
    `default-src 'none'`,
    `frame-src https: http:`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src ${cspSource} 'nonce-NONCE'`,
  ].join('; ');
}

export function renderPanelHtml(options: RenderPanelHtmlOptions): string {
  const csp = contentSecurityPolicy(options.cspSource).replace('NONCE', options.nonce);
  const src = escapeHtmlAttribute(options.iframeSrc);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(csp)}">
<style>
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
  iframe { border: 0; width: 100%; height: 100%; display: block; }
</style>
</head>
<body>
<iframe id="site" src="${src}"></iframe>
<script nonce="${options.nonce}">
  const vscode = acquireVsCodeApi();
  const iframe = document.getElementById('site');
  const FROM_IFRAME = new Set(['${BRIDGE_EVENT}', '${OPEN_EXTERNAL_EVENT}', '${COPY_EVENT}']);

  // The iframe posts these from its own origin, so this cannot be spoofed by an unrelated
  // page: { type: '${BRIDGE_EVENT}', file: '<posix-relative-path>' },
  // { type: '${OPEN_EXTERNAL_EVENT}', url: '<absolute-url>' } and
  // { type: '${COPY_EVENT}', text: '<selection>' }.
  window.addEventListener('message', (event) => {
    if (event.source !== iframe.contentWindow) return;
    const data = event.data;
    if (data && FROM_IFRAME.has(data.type)) vscode.postMessage(data);
  });
</script>
</body>
</html>`;
}

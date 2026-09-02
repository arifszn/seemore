/**
 * The webview's own HTML shell: an iframe pointed at the dev server, plus the bridge script
 * that lets a rendered page ask the extension host to open its source file.
 *
 * Kept as a pure string builder — no `vscode` import — so the CSP and escaping are unit
 * testable without a webview.
 */

const BRIDGE_EVENT = 'seemore:open-source';
/** Answers to a clipboard-copy request the extension host posted; see `panel.ts`. */
const COPY_RESPONSE_EVENT = 'seemore:copy-response';
/** The request itself, forwarded on into the iframe's page. */
const COPY_REQUEST_EVENT = 'seemore:copy-request';

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
<iframe id="site" src="${src}" allow="clipboard-read; clipboard-write"></iframe>
<script nonce="${options.nonce}">
  const vscode = acquireVsCodeApi();
  const iframe = document.getElementById('site');
  const FROM_IFRAME = new Set(['${BRIDGE_EVENT}', '${COPY_RESPONSE_EVENT}']);

  // Two directions share this one listener: the iframe posting up to the extension host
  // (its own origin, so this cannot be spoofed by an unrelated page), and the extension
  // host posting down into the iframe to ask for its current selection (nothing else in
  // this webview's window can be the source of that message).
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data.type !== 'string') return;

    if (event.source === iframe.contentWindow) {
      if (FROM_IFRAME.has(data.type)) vscode.postMessage(data);
      return;
    }

    if (data.type === '${COPY_REQUEST_EVENT}') iframe.contentWindow.postMessage(data, '*');
  });
</script>
</body>
</html>`;
}

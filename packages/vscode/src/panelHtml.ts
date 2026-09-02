/**
 * The webview's own HTML shell: an iframe pointed at the dev server, plus the bridge script
 * that lets a rendered page ask the extension host to open its source file.
 *
 * Kept as a pure string builder — no `vscode` import — so the CSP and escaping are unit
 * testable without a webview.
 */

const BRIDGE_EVENT = 'seemore:open-source';

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
 * because that origin is only known at runtime and changes on every widen; nothing else
 * this page does needs a broad `frame-src`, so the rest of the policy stays locked down.
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

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data) return;

    // Requires the seemore site to post { type: '${BRIDGE_EVENT}', file: '<posix-relative-path>' }
    // from inside the iframe — its own origin, so this cannot be spoofed by an unrelated page.
    if (event.source === iframe.contentWindow && data.type === '${BRIDGE_EVENT}') {
      vscode.postMessage(data);
      return;
    }

    // The extension host's own messages arrive through VS Code's webview bridge, not a real
    // same-window postMessage — event.source is not this window, so this cannot be gated the
    // same way. There is nothing to spoof it with: only the extension host can call
    // panel.webview.postMessage in the first place.
    if (data.type === 'seemore:navigate') {
      iframe.src = data.url;
    }
  });
</script>
</body>
</html>`;
}

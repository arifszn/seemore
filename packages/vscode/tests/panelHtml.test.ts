import { describe, expect, it } from 'vitest';
import { renderPanelHtml } from '../src/panelHtml.js';

const BASE = { iframeSrc: 'http://localhost:5173/', cspSource: 'vscode-webview://abc123', nonce: 'NONCE-VALUE' };

describe('renderPanelHtml', () => {
  it('points the iframe at the given src', () => {
    const html = renderPanelHtml(BASE);
    expect(html).toContain('src="http://localhost:5173/"');
  });

  it('scopes script-src and style-src to the webview\'s cspSource', () => {
    const html = renderPanelHtml(BASE);
    expect(html).toContain(`script-src ${BASE.cspSource} 'nonce-${BASE.nonce}'`);
    expect(html).toContain(`style-src ${BASE.cspSource} 'unsafe-inline'`);
  });

  it('tags the bridge script with the nonce the CSP requires', () => {
    const html = renderPanelHtml(BASE);
    expect(html).toContain(`<script nonce="${BASE.nonce}">`);
  });

  it('escapes an iframeSrc that could otherwise break out of the attribute', () => {
    const html = renderPanelHtml({ ...BASE, iframeSrc: 'http://localhost:5173/"><script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('sets a default-src none baseline', () => {
    expect(renderPanelHtml(BASE)).toContain("default-src 'none'");
  });
});

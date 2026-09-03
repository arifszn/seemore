import { useEffect } from 'react';

/**
 * Opens away-links in the reader's browser — from inside the VS Code extension's webview.
 *
 * Only matters embedded there: the page runs inside a nested, cross-origin iframe (see
 * `panelHtml.ts`), and VS Code only routes `target="_blank"` to the system browser for links
 * in the webview's *own* top document. A click inside the iframe has no honoured popup path
 * at all — the frame instead drags the view off to a page that cannot render, and the reader
 * is left with a blank webview. So while embedded, a click on any cross-origin link is
 * intercepted and posted up over the same bridge the copy button uses, and the extension host
 * opens it with `vscode.env.openExternal` (see `panel.ts`), the one side actually allowed to
 * launch the browser. A plain browser tab already does this natively and is never embedded,
 * so no listener is installed there.
 */
export function useExternalLinkBridge(): void {
  useEffect(() => {
    if (window.parent === window) return;

    function openExternally(event: MouseEvent): void {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a');
      if (anchor === null) return;
      const url = new URL(anchor.href, window.location.href);
      // Same-origin addresses navigate the iframe fine on their own; only away-links need
      // the host (this also leaves hash links and router Links untouched).
      if (url.origin === window.location.origin) return;
      event.preventDefault();
      window.parent.postMessage({ type: 'seemore:open-external', url: url.toString() }, '*');
    }

    // Capture phase, so the interception happens before anything downstream can act on the
    // click; `auxclick` covers middle-click, which would hit the same dead end.
    document.addEventListener('click', openExternally, true);
    document.addEventListener('auxclick', openExternally, true);
    return () => {
      document.removeEventListener('click', openExternally, true);
      document.removeEventListener('auxclick', openExternally, true);
    };
  }, []);
}

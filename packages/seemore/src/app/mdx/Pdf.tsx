import { useEffect, useState, type ComponentProps } from 'react';
import { FileText } from 'lucide-react';
import { isAuthBuild } from '../lib/auth.js';

/**
 * Sibling PDFs render in the browser's own viewer.
 *
 * Every element here is inline-level. Markdown puts an image in a paragraph, and a `<figure>`
 * or any other block element inside a `<p>` makes the HTML parser close the paragraph early —
 * so the prerendered markup and React's tree disagree, and hydration throws. `display: block`
 * on a `<span>` gets the same layout with none of that.
 *
 * `pdfjs-dist` is roughly a megabyte, which is a poor trade for a docs site. The accepted
 * cost is that some environments degrade `<embed>` to a blank box, since they don't support
 * inline PDF plugins — most mobile browsers, but also the VS Code extension's webview, whose
 * bundled Electron/Chromium doesn't ship Chrome's PDF viewer extension despite reporting a
 * fine pointer. The CSS `(pointer: coarse)` fallback in globals.css only catches the first
 * group. `navigator.pdfViewerEnabled` (Chromium/Firefox's direct feature check) would be the
 * clean way to catch the second, but the Electron build VS Code ships predates that API, so
 * `'pdfViewerEnabled' in navigator` is false there too and never flips it. Instead this reuses
 * the same signal `ExternalLinkBridge.ts` uses for the identical webview: the site only ever
 * runs inside a nested, cross-origin iframe when the VS Code extension put it there (see
 * `panelHtml.ts`), so `window.parent !== window` is a reliable stand-in.
 */
export function Pdf({ src, title, ...props }: ComponentProps<'embed'> & { src: string }) {
  const [unsupported, setUnsupported] = useState(false);
  const file = useDecryptedUrl(src);

  useEffect(() => {
    const noPdfViewerApi = 'pdfViewerEnabled' in navigator && !navigator.pdfViewerEnabled;
    const embeddedWebview = window.parent !== window;
    if (noPdfViewerApi || embeddedWebview) {
      setUnsupported(true);
    }
  }, []);

  return (
    <span className={unsupported ? 'seemore-pdf seemore-pdf-unsupported' : 'seemore-pdf'}>
      {file === undefined ? undefined : <embed src={file} type="application/pdf" title={title} {...props} />}
      <a className="seemore-pdf-fallback" href={file ?? src} download={src.split('/').pop()}>
        <FileText className="seemore-pdf-fallback-icon" aria-hidden="true" />
        <span className="seemore-pdf-fallback-title">Download {title ?? 'PDF'}</span>
      </a>
    </span>
  );
}

/**
 * The URL to hand `<embed>`. On a password-protected build the file on the host is ciphertext,
 * and browsers load `<embed>` without going through the service worker that decrypts — so the
 * PDF is fetched first, which does go through it, and embedded as a blob. The raw address is
 * never embedded: WebKit caches that ciphertext response and serves it to later fetches too.
 */
function useDecryptedUrl(src: string): string | undefined {
  const [url, setUrl] = useState<string | undefined>(isAuthBuild() ? undefined : src);

  useEffect(() => {
    if (!isAuthBuild()) return;
    let revoked = false;
    let blobUrl: string | undefined;
    void fetch(src)
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(String(response.status)))))
      .then((blob) => {
        if (revoked) return;
        blobUrl = URL.createObjectURL(blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' }));
        setUrl(blobUrl);
      })
      .catch(() => undefined);
    return () => {
      revoked = true;
      if (blobUrl !== undefined) URL.revokeObjectURL(blobUrl);
    };
  }, [src]);

  return url;
}

export default Pdf;

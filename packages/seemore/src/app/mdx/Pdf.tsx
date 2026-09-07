import { useEffect, useState, type ComponentProps } from 'react';
import { FileText } from 'lucide-react';

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

  useEffect(() => {
    const noPdfViewerApi = 'pdfViewerEnabled' in navigator && !navigator.pdfViewerEnabled;
    const embeddedWebview = window.parent !== window;
    if (noPdfViewerApi || embeddedWebview) {
      setUnsupported(true);
    }
  }, []);

  return (
    <span className={unsupported ? 'seemore-pdf seemore-pdf-unsupported' : 'seemore-pdf'}>
      <embed src={src} type="application/pdf" title={title} {...props} />
      <a className="seemore-pdf-fallback" href={src} download>
        <FileText className="seemore-pdf-fallback-icon" aria-hidden="true" />
        <span className="seemore-pdf-fallback-title">Download {title ?? 'PDF'}</span>
      </a>
    </span>
  );
}

export default Pdf;

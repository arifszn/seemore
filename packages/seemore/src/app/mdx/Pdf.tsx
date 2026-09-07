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
 * inline PDF plugins — most mobile browsers, but also Electron-based webviews (VS Code's
 * preview included), which don't ship Chrome's PDF viewer extension despite reporting a
 * fine pointer. The CSS `(pointer: coarse)` fallback in globals.css only catches the first
 * group, so `navigator.pdfViewerEnabled` — Chromium/Firefox's direct feature check — is used
 * to catch the second by toggling the same fallback via a class instead of a media query.
 */
export function Pdf({ src, title, ...props }: ComponentProps<'embed'> & { src: string }) {
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    if ('pdfViewerEnabled' in navigator && !navigator.pdfViewerEnabled) {
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

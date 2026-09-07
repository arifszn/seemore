import type { ComponentProps } from 'react';
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
 * cost is that most mobile browsers degrade `<embed>` to a blank box, since they don't
 * support inline PDF plugins. There's no reliable JS-free way to detect that, so the CSS
 * in globals.css hides the embed and expands this link into a full card under
 * `(pointer: coarse)` — touch devices are the same population that lacks embed support.
 */
export function Pdf({ src, title, ...props }: ComponentProps<'embed'> & { src: string }) {
  return (
    <span className="seemore-pdf">
      <embed src={src} type="application/pdf" title={title} {...props} />
      <a className="seemore-pdf-fallback" href={src} download>
        <FileText className="seemore-pdf-fallback-icon" aria-hidden="true" />
        <span className="seemore-pdf-fallback-title">Download {title ?? 'PDF'}</span>
      </a>
    </span>
  );
}

export default Pdf;

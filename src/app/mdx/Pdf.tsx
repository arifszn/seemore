import type { ComponentProps } from 'react';

/**
 * Sibling PDFs render in the browser's own viewer.
 *
 * Every element here is inline-level. Markdown puts an image in a paragraph, and a `<figure>`
 * or any other block element inside a `<p>` makes the HTML parser close the paragraph early —
 * so the prerendered markup and React's tree disagree, and hydration throws. `display: block`
 * on a `<span>` gets the same layout with none of that.
 *
 * `pdfjs-dist` is roughly a megabyte, which is a poor trade for a docs site. The accepted
 * cost is that most mobile browsers degrade `<embed>` to a download link.
 */
export function Pdf({ src, title, ...props }: ComponentProps<'embed'> & { src: string }) {
  return (
    <span className="openmd-pdf">
      <embed src={src} type="application/pdf" title={title} {...props} />
      <a href={src} download>
        Download {title ?? 'PDF'}
      </a>
    </span>
  );
}

export default Pdf;

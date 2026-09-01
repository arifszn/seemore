import type { ComponentProps } from 'react';

/**
 * Sibling PDFs render in the browser's own viewer.
 *
 * `pdfjs-dist` is roughly a megabyte, which is a poor trade for a docs site. The accepted
 * cost is that most mobile browsers degrade `<embed>` to a download link.
 */
export function Pdf({ src, title, ...props }: ComponentProps<'embed'> & { src: string }) {
  return (
    <figure className="openmd-pdf">
      <embed src={src} type="application/pdf" title={title} {...props} />
      <figcaption>
        <a href={src} download>
          Download {title ?? 'PDF'}
        </a>
      </figcaption>
    </figure>
  );
}

export default Pdf;

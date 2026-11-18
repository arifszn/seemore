import { useId, type ReactNode } from 'react';

interface TermProps {
  /** The explanation shown in the hint. */
  tip?: string;
  /** An image shown above the explanation; a sibling file, resolved like any other image. */
  image?: string;
  children?: ReactNode;
}

/**
 * A word or phrase with a hint: hover, tap or tab to it and `tip` and `image` pop up.
 *
 * The hint is rendered into the article up front and only hidden, never mounted on demand
 * (as a Radix popover would be), so it survives both exports, which take the article's
 * markup as it stands. The behaviour lives in `features/terms.ts`, bound once on the
 * document by every runtime that shows a page. Only phrasing elements are used: a term
 * sits inside a paragraph.
 */
export function Term({ tip, image, children }: TermProps) {
  const id = useId();
  return (
    <span className="seemore-term">
      <button type="button" className="seemore-term-trigger" aria-expanded="false" aria-describedby={id}>
        {children}
      </button>
      <span id={id} className="seemore-term-tip not-prose" role="tooltip" hidden>
        {image === undefined ? null : <img className="seemore-term-image" src={image} alt="" />}
        {tip === undefined ? null : <span className="seemore-term-text">{tip}</span>}
      </span>
    </span>
  );
}

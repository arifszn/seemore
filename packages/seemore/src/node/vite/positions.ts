import { visit } from 'unist-util-visit';
import type { Element, Root } from 'hast';
import type { Transformer } from 'unified';

/** The attribute a stamped block carries, read by the browser's inline editor. */
export const POSITION_ATTRIBUTE = 'data-seemore-pos';

/**
 * Blocks whose source range is safe to hand back to a text editor.
 *
 * Deliberately narrow. A fence is absent because `rehype-code` rebuilds the `<pre>` from
 * Shiki's own tree and drops the position with it; a `<ul>` is absent because its children
 * are the editable unit. Anything not listed here — and anything a remark plugin
 * synthesised, which has no position at all — simply renders without the attribute and is
 * not offered for editing. That is the intended failure mode: no pointer, no edit, never a
 * wrong write.
 */
const EDITABLE = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'td', 'th']);

/**
 * Stamp each editable block with its `start:end` offsets into the original file.
 *
 * The offsets are **JavaScript string indices**, not byte offsets — `Café — naïve 😀` is 22
 * of these and 27 UTF-8 bytes — so every consumer has to stay in string space. See
 * `spliceSource`, which is the only thing that writes them back.
 *
 * Dev-only: a static build has no server to write to, so the attributes would be dead weight
 * in the output.
 */
export function rehypeSeemorePositions(): Transformer<Root, Root> {
  return (tree) => {
    visit(tree, 'element', (node: Element) => {
      if (!EDITABLE.has(node.tagName)) return;

      const { start, end } = node.position ?? {};
      // A synthesised node has no position; a partially-positioned one is not trustworthy.
      if (start?.offset === undefined || end?.offset === undefined) return;

      node.properties ??= {};
      node.properties[POSITION_ATTRIBUTE] = `${start.offset}:${end.offset}`;
    });
  };
}

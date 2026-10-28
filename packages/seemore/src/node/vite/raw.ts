import rehypeRaw from 'rehype-raw';
import type { Root } from 'hast';
import type { Transformer } from 'unified';
import { visit } from 'unist-util-visit';
import type { VFile } from 'vfile';

/**
 * The node types `mdast-util-mdx` produces, which must survive the hast round trip untouched.
 *
 * `@mdx-js/mdx` keeps the same list in `lib/node-types.js` and passes it to `remark-rehype`,
 * but its `exports` map does not expose that module, so it is repeated here. Keeping the two
 * in sync matters only for `.mdx`, and the guard below means we never hand an `.mdx` tree to
 * `rehype-raw` in the first place.
 */
const MDX_NODE_TYPES = [
  'mdxFlowExpression',
  'mdxJsxFlowElement',
  'mdxJsxTextElement',
  'mdxTextExpression',
  'mdxjsEsm',
] as const;

/**
 * Renders the HTML an author wrote in a plain `.md` file.
 *
 * `@mdx-js/mdx` always sets `allowDangerousHtml`, so the markdown parser does carry HTML into
 * the hast tree — as `raw` nodes holding an unparsed string. Nothing downstream knows what to
 * do with one, so the JSX stage drops it, taking its text with it. A README's centred
 * `<p align="center">` header is the common casualty: the logo, the badges and the tagline all
 * vanish at once, because CommonMark treats the whole run of tags as a single raw block.
 *
 * `rehype-raw` reparses those strings into real elements. It runs first in the rehype chain so
 * every plugin after it sees elements rather than opaque strings.
 *
 * `.mdx` is skipped. There, HTML *is* JSX: the parser produces `mdxJsxFlowElement` nodes and
 * there are no `raw` nodes to reparse, so running `rehype-raw` would be a no-op that risks
 * mangling the MDX nodes if the list above ever falls behind upstream.
 *
 * Note that this renders whatever the author wrote, `<script>` included. That is the same
 * trust model as the rest of the folder: seemore renders files you already have on disk, and
 * a build publishes what you tell it to.
 */
export function rehypeSeemoreRawHtml(): Transformer<Root, Root> {
  const transform = rehypeRaw({ passThrough: [...MDX_NODE_TYPES] });

  return (tree, file: VFile) => {
    if (!isMarkdown(file)) return tree;

    return transform(tree, file);
  };
}

/**
 * Renders the HTML inside headings, ahead of `rehype-toc`.
 *
 * The table of contents serialises each heading to JSX with `hast-util-to-estree`, which
 * throws on a `raw` node. A heading like `### Never a browser <input type="date">` carries
 * one, and the throw fails the whole page. The full reparse in `rehypeSeemoreRawHtml` has to
 * run last (see `createRehypePlugins`), so this reparses the headings alone, early.
 */
export function rehypeSeemoreHeadingHtml(): Transformer<Root, Root> {
  const transform = rehypeRaw({ passThrough: [...MDX_NODE_TYPES] });

  return (tree, file: VFile) => {
    if (!isMarkdown(file)) return tree;

    visit(tree, 'element', (heading, index, parent) => {
      if (!/^h[1-6]$/.test(heading.tagName) || parent === undefined || index === undefined) {
        return;
      }

      let hasRaw = false;
      visit(heading, 'raw', () => {
        hasRaw = true;
        return false;
      });
      if (!hasRaw) return 'skip';

      const fragment = transform({ type: 'root', children: [heading] }, file) as Root;
      parent.children.splice(index, 1, ...fragment.children);
      return 'skip';
    });

    return tree;
  };
}

// Vite ids arrive with a query string (`?import`, an HMR timestamp), so match the extension
// inside the path rather than trusting `file.extname` to have been parsed off.
function isMarkdown(file: VFile): boolean {
  return /\.(?:md|markdown)(?:$|\?)/.test(file.path ?? '');
}

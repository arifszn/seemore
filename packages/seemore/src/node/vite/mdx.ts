import type { Root } from 'mdast';
import type { PluggableList, Processor, Transformer } from 'unified';
import type { VFile } from 'vfile';
import remarkFrontmatter from 'remark-frontmatter';
import { remarkLLMs } from 'fumadocs-core/mdx-plugins/remark-llms';
import {
  rehypeCode,
  rehypeToc,
  remarkAdmonition,
  remarkDirectiveAdmonition,
  remarkGfm,
  remarkHeading,
  remarkImage,
  remarkMdxMermaid,
  remarkSteps,
} from 'fumadocs-core/mdx-plugins';
import {
  remarkSeemoreAlerts,
  remarkSeemoreAssets,
  remarkSeemoreD2,
  remarkSeemoreLinks,
  remarkSeemoreMarkdownSource,
  remarkSeemoreWikilinks,
  type SeemoreRemarkOptions,
} from './remark.js';
import { rehypeSeemorePositions } from './positions.js';
import { rehypeSeemoreRawHtml } from './raw.js';
import { rehypeSeemoreMedia, type SeemoreMediaOptions } from './media.js';

/** The named export `remark-llms` writes the page's Markdown to, read by the copy action. */
export const MARKDOWN_EXPORT = '_markdown';

/**
 * The remark/rehype chain. Order matters:
 *
 * - headings get their ids before `rehype-toc` reads them;
 * - our link rewriting runs after the fumadocs transforms that can create links;
 * - Shiki runs at build time in `rehype-code`, so no highlighter ships to the browser.
 *
 * `remark-structure` is deliberately absent: search indexing runs node-side over the raw
 * markdown, where it works identically in dev and build without depending on a
 * browser module having been evaluated.
 */
export function createRemarkPlugins(options: SeemoreRemarkOptions): PluggableList {
  return [
    // Strips the `---` block so it never renders. Its data already came from the scan.
    [remarkFrontmatter, ['yaml']],
    remarkGfm,
    // Early, and deliberately: this snapshots the page as Markdown for the copy action, and
    // the further down the chain it sits the less the copy resembles what the author wrote.
    // Here, a GitHub alert is still `> [!NOTE]` and a diagram is still a ```mermaid fence,
    // rather than the `<Callout>`/`<Mermaid>` JSX the plugins below turn them into. The
    // frontmatter strip is the one thing that must come first — its keys are metadata, not
    // content. Heading ids stay off: `## Title [#title]` is noise in a paste.
    remarkSeemoreMarkdownSource,
    function (this: Processor) {
      return remarkSeemoreLLMs.call(this, options);
    },
    remarkHeading,
    remarkAdmonition,
    remarkDirectiveAdmonition,
    // After the fumadocs admonition plugins, which handle `:::note`, and before anything that
    // rewrites link or text nodes inside the quote.
    remarkSeemoreAlerts,
    remarkSteps,
    // Before `remark-image`: a reference to a file that is not there becomes a warning and a
    // visibly broken image, rather than a failed build.
    () => remarkSeemoreAssets(options),
    [
      remarkImage,
      {
        onError: (error: Error) => {
          options.onWarning(error.message);
        },
      },
    ],
    // Rewrites ```mermaid fences to <Mermaid chart="…" />. We supply the component.
    remarkMdxMermaid,
    // Rewrites ```d2 fences to <D2 chart="…" />, mermaid's sibling for D2 diagrams.
    remarkSeemoreD2,
    () => remarkSeemoreWikilinks(options),
    () => remarkSeemoreLinks(options),
  ];
}

/**
 * `remark-llms`, made non-fatal. Its stringifier recurses once per nesting level, and a deep
 * enough tree (a few hundred levels of emphasis, from a long run of `*`) overflows the stack
 * well before the renderer would. The snapshot only feeds the copy action, so losing it must
 * not lose the page: the file's own source, frontmatter dropped, is copied instead.
 */
function remarkSeemoreLLMs(this: Processor, options: SeemoreRemarkOptions): Transformer<Root, Root> {
  const snapshot = remarkLLMs.call(this, { as: MARKDOWN_EXPORT, headingIds: false }) as (
    tree: Root,
    file: VFile,
  ) => void;

  return (tree, file) => {
    try {
      snapshot(tree, file);
    } catch (error) {
      options.onWarning(
        `Could not convert ${file.path} back to Markdown for copying (${(error as Error).message}); the raw file is copied instead.`,
      );
      // An `html` node stringifies verbatim, so the export carries the source as written.
      const fallback: Root = { type: 'root', children: [{ type: 'html', value: sourceOf(tree, file) }] };
      snapshot(fallback, file);
      tree.children.unshift(...fallback.children.slice(0, -1));
    }
  };
}

/** The file's text after its frontmatter block, which is metadata, not content. */
function sourceOf(tree: Root, file: VFile): string {
  const source = String(file.value);
  const yaml = tree.children[0]?.type === 'yaml' ? tree.children[0] : undefined;
  const end = yaml?.position?.end.offset;
  return end === undefined ? source : source.slice(end).trimStart();
}

export interface SeemoreRehypeOptions extends SeemoreMediaOptions {
  /**
   * Stamp each editable block with its source range, for the browser's inline editor.
   * Dev only: a static build has no server to write an edit back to.
   */
  positions?: boolean;
}

export function createRehypePlugins(options: SeemoreRehypeOptions): PluggableList {
  return [
    // A fence in a language Shiki has no grammar for (anything an AI dreamt up) is plain code
    // on the page, not a dead one: `plaintext` is special-cased by Shiki and never needs
    // loading.
    [rehypeCode, { fallbackLanguage: 'plaintext' }],
    rehypeToc,
    // After `rehype-code`, so a fence Shiki rebuilt is passed over rather than stamped with
    // the position of whatever it replaced.
    ...(options.positions === true ? [rehypeSeemorePositions] : []),
    // Last, and deliberately. `rehype-raw` reparses the whole document to stitch raw HTML
    // back together, which costs every node its `data` — including the fence meta
    // `rehype-code` reads `noCopy` from. Running it here means each plugin above has already
    // taken what it needs, and the elements it creates are not stamped as editable, which is
    // right: they have no source range a text editor could be handed.
    rehypeSeemoreRawHtml,
    // After `rehype-raw`, the first point where a `.md` file's hand-written `<video>` is an
    // element rather than a string.
    () => rehypeSeemoreMedia(options),
  ];
}

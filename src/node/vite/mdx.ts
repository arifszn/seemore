import type { PluggableList } from 'unified';
import remarkFrontmatter from 'remark-frontmatter';
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
  remarkOpenmdAlerts,
  remarkOpenmdAssets,
  remarkOpenmdLinks,
  remarkOpenmdWikilinks,
  type OpenmdRemarkOptions,
} from './remark.js';

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
export function createRemarkPlugins(options: OpenmdRemarkOptions): PluggableList {
  return [
    // Strips the `---` block so it never renders. Its data already came from the scan.
    [remarkFrontmatter, ['yaml']],
    remarkGfm,
    remarkHeading,
    remarkAdmonition,
    remarkDirectiveAdmonition,
    // After the fumadocs admonition plugins, which handle `:::note`, and before anything that
    // rewrites link or text nodes inside the quote.
    remarkOpenmdAlerts,
    remarkSteps,
    // Before `remark-image`: a reference to a file that is not there becomes a warning and a
    // visibly broken image, rather than a failed build.
    () => remarkOpenmdAssets(options),
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
    () => remarkOpenmdWikilinks(options),
    () => remarkOpenmdLinks(options),
  ];
}

export function createRehypePlugins(): PluggableList {
  return [rehypeCode, rehypeToc];
}

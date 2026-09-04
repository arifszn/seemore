import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { visit } from 'unist-util-visit';
import type { Blockquote, Code, Image, Paragraph, PhrasingContent, Root, Text } from 'mdast';
import type { Transformer } from 'unified';
import type { VFile } from 'vfile';
import type { LinkResolver } from '../content/links.js';
import { toPosix } from '../content/slug.js';

export interface SeemoreRemarkOptions {
  contentRoot: string;
  /** Read late: the resolver is replaced on every rescan. */
  getResolver: () => LinkResolver;
  onWarning: (message: string) => void;
}

const WIKILINK = /\[\[([^\]\n]+)\]\]/g;

/** GitHub's alert syntax, and the fumadocs callout each kind maps onto. */
const ALERTS: Record<string, { type: string; title: string }> = {
  NOTE: { type: 'info', title: 'Note' },
  TIP: { type: 'idea', title: 'Tip' },
  IMPORTANT: { type: 'info', title: 'Important' },
  WARNING: { type: 'warn', title: 'Warning' },
  CAUTION: { type: 'error', title: 'Caution' },
};

const ALERT_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/;

/**
 * GitHub alerts — `> [!NOTE]` — become fumadocs callouts.
 *
 * fumadocs ships `:::note` and directive admonitions, neither of which is what people
 * actually have in their repositories. seemore points at folders that already exist, so the
 * syntax GitHub renders is the syntax that has to work.
 */
export function remarkSeemoreAlerts(): Transformer<Root, Root> {
  return (tree) => {
    visit(tree, 'blockquote', (node: Blockquote, index, parent) => {
      if (parent === undefined || index === undefined) return;

      const first = node.children[0];
      if (first === undefined || first.type !== 'paragraph') return;

      const marker = ALERT_MARKER.exec(textOf(first));
      const alert = marker === null ? undefined : ALERTS[marker[1] ?? ''];
      if (marker === undefined || marker === null || alert === undefined) return;

      stripMarker(first, marker[0]);

      parent.children[index] = {
        type: 'mdxJsxFlowElement',
        name: 'Callout',
        attributes: [
          { type: 'mdxJsxAttribute', name: 'type', value: alert.type },
          { type: 'mdxJsxAttribute', name: 'title', value: alert.title },
        ],
        children: node.children,
      } as unknown as Blockquote;
    });
  };
}

/** The paragraph's leading text, which is where the marker lives. */
function textOf(paragraph: Paragraph): string {
  const first = paragraph.children[0];
  return first !== undefined && first.type === 'text' ? first.value.trimStart() : '';
}

/** Remove the `[!NOTE]` marker, and the line break that followed it. */
function stripMarker(paragraph: Paragraph, marker: string): void {
  const first = paragraph.children[0];
  if (first === undefined || first.type !== 'text') return;

  first.value = first.value.trimStart().slice(marker.length).replace(/^\n/, '');
  if (first.value === '') paragraph.children.shift();
  if (paragraph.children[0]?.type === 'break') paragraph.children.shift();
}

/**
 * `[[Page]]`, `[[Page|label]]`, `[[Page#Heading]]`. fumadocs has no equivalent.
 *
 * Unresolved targets become styled plain text rather than dead links, because a link that
 * goes nowhere is worse than visibly missing text.
 */
export function remarkSeemoreWikilinks(options: SeemoreRemarkOptions): Transformer<Root, Root> {
  return (tree, file) => {
    const from = virtualPath(options.contentRoot, file);
    const resolver = options.getResolver();

    visit(tree, 'text', (node: Text, index, parent) => {
      if (parent === undefined || index === undefined) return;
      if (!node.value.includes('[[')) return;

      const replacement: PhrasingContent[] = [];
      let cursor = 0;
      WIKILINK.lastIndex = 0;

      for (let match = WIKILINK.exec(node.value); match !== null; match = WIKILINK.exec(node.value)) {
        const target = match[1] ?? '';
        if (match.index > cursor) {
          replacement.push({ type: 'text', value: node.value.slice(cursor, match.index) });
        }
        cursor = match.index + match[0].length;

        const resolved = resolver.resolveWikilink(target, from);
        if (resolved.warning !== undefined) options.onWarning(resolved.warning);

        if (resolved.href === undefined) {
          // An MDX JSX node, not raw HTML: `.md` files run through `rehypeRemoveRaw`, which
          // would silently drop an `html` node, whereas JSX nodes are passed through.
          replacement.push({
            type: 'mdxJsxTextElement',
            name: 'span',
            attributes: [
              { type: 'mdxJsxAttribute', name: 'className', value: 'seemore-broken-wikilink' },
              { type: 'mdxJsxAttribute', name: 'title', value: 'Unresolved link' },
            ],
            children: [{ type: 'text', value: resolved.label }],
          } as unknown as PhrasingContent);
        } else {
          replacement.push({
            type: 'link',
            url: resolved.href,
            children: [{ type: 'text', value: resolved.label }],
          });
        }
      }

      if (replacement.length === 0) return;
      if (cursor < node.value.length) replacement.push({ type: 'text', value: node.value.slice(cursor) });

      parent.children.splice(index, 1, ...replacement);
      return index + replacement.length;
    });
  };
}

/**
 * ```d2 fences become `<D2 chart="…" />` — the sibling of `remark-mdx-mermaid`'s rewrite for
 * ```mermaid, but D2 has no fumadocs-shipped equivalent, so this one is ours.
 */
export function remarkSeemoreD2(): Transformer<Root, Root> {
  return (tree) => {
    visit(tree, 'code', (node: Code, index, parent) => {
      if (node.lang !== 'd2' || index === undefined || parent === undefined) return;

      parent.children[index] = {
        type: 'mdxJsxFlowElement',
        name: 'D2',
        attributes: [{ type: 'mdxJsxAttribute', name: 'chart', value: node.value.trim() }],
        children: [],
      } as unknown as Code;
    });
  };
}

/**
 * A referenced asset that is not on disk is a warning, not a build failure: the page is
 * visibly wrong on its own, which is the point of the distinction.
 *
 * It has to run before fumadocs' `remark-image`, which turns every image into a bundler
 * import — and an import of a file that does not exist fails the build. Turning the node
 * into JSX first takes it out of that plugin's way, leaving the broken reference visible on
 * the page exactly as the author wrote it.
 */
export function remarkSeemoreAssets(options: SeemoreRemarkOptions): Transformer<Root, Root> {
  return (tree, file) => {
    if (typeof file.path !== 'string' || file.path === '') return;
    const dir = dirname(file.path);
    const from = virtualPath(options.contentRoot, file);

    visit(tree, 'image', (node: Image, index, parent) => {
      if (parent === undefined || index === undefined) return;
      if (isExternal(node.url) || node.url.startsWith('/')) return;

      const raw = node.url.split(/[?#]/)[0] ?? '';
      let decoded: string;
      try {
        decoded = decodeURIComponent(raw);
      } catch {
        // A raw `%` that is not a valid escape (e.g. `50%.png`) throws, and a throw from a
        // transformer fails the whole build. The literal spelling is still worth a check.
        decoded = raw;
      }
      const target = resolve(dir, decoded);
      if (existsSync(target)) return;

      options.onWarning(`Missing asset ${node.url} referenced by ${from}.`);

      parent.children.splice(index, 1, {
        type: 'mdxJsxTextElement',
        name: 'img',
        attributes: [
          { type: 'mdxJsxAttribute', name: 'src', value: node.url },
          { type: 'mdxJsxAttribute', name: 'alt', value: node.alt ?? '' },
          { type: 'mdxJsxAttribute', name: 'data-seemore-missing', value: 'true' },
        ],
        children: [],
      } as unknown as PhrasingContent);
    });
  };
}

function isExternal(url: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url);
}

/** Relative `.md`/`.mdx` links become routes, base included. */
export function remarkSeemoreLinks(options: SeemoreRemarkOptions): Transformer<Root, Root> {
  return (tree, file) => {
    const from = virtualPath(options.contentRoot, file);
    const resolver = options.getResolver();

    const rewrite = (node: { url: string }) => {
      const resolved = resolver.resolveHref(node.url, from);
      if (resolved.warning !== undefined) options.onWarning(resolved.warning);
      node.url = resolved.href;
    };

    visit(tree, 'link', rewrite);
    visit(tree, 'definition', rewrite);
  };
}

function virtualPath(contentRoot: string, file: VFile): string {
  if (typeof file.path !== 'string' || file.path === '') return '';
  return toPosix(relative(contentRoot, file.path));
}

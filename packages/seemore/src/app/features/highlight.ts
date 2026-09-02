import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { feature } from '../lib/features.js';

/**
 * `search.highlight`: mark every occurrence of the query on the page you landed on.
 *
 * The query rides in `?h=`, so a link copied from the address bar highlights for the next
 * reader too — which is why there is no separate `search.share` flag.
 */
export function useSearchHighlight(): void {
  const location = useLocation();

  useEffect(() => {
    if (!feature('search.highlight')) return;
    const query = new URLSearchParams(location.search).get('h');
    if (query === null || query.trim() === '') return;

    const article = document.querySelector('article');
    if (article === null) return;

    const ranges = findRanges(article, query.trim());
    if (ranges.length === 0) return;

    // CSS Custom Highlight API where available: no DOM mutation, so React never fights it.
    const highlightApi = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    const HighlightCtor = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;

    if (highlightApi !== undefined && HighlightCtor !== undefined) {
      ensureHighlightStyle();
      highlightApi.set('seemore-search', new HighlightCtor(...ranges));
      ranges[0]?.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return () => {
        highlightApi.delete('seemore-search');
      };
    }

    ranges[0]?.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return undefined;
  }, [location.key, location.search]);
}

/**
 * The `::highlight()` rule is installed here rather than in the stylesheet: CSS optimisers
 * do not yet recognise the selector and warn about it on every build, and the rule is only
 * meaningful where the Custom Highlight API exists anyway.
 */
function ensureHighlightStyle(): void {
  const id = 'seemore-highlight-style';
  if (document.getElementById(id) !== null) return;

  const style = document.createElement('style');
  style.id = id;
  style.textContent =
    '::highlight(seemore-search){background-color:color-mix(in oklab,var(--color-fd-primary) 30%,transparent)}';
  document.head.append(style);
}

function findRanges(root: Element, query: string): Range[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const needle = query.toLowerCase();
  const ranges: Range[] = [];

  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node.nodeValue?.toLowerCase() ?? '';
    let from = text.indexOf(needle);
    while (from !== -1) {
      const range = document.createRange();
      range.setStart(node, from);
      range.setEnd(node, from + needle.length);
      ranges.push(range);
      from = text.indexOf(needle, from + needle.length);
    }
  }

  return ranges;
}

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useDocsSearch } from 'fumadocs-core/search/client';
import {
  SearchDialog as Dialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogList,
  SearchDialogOverlay,
} from 'fumadocs-ui/components/dialog/search';
import type { SharedProps } from 'fumadocs-ui/contexts/search';
import { config } from 'virtual:seemore/config';
import { stripBase } from '../../shared/base.js';
import { feature } from '../lib/features.js';
import { createSearchClient } from './client.js';

/**
 * Our own dialog rather than fumadocs' `DefaultSearchDialog`, because the default one talks
 * to a search *route*; seemore has no server, so the client is a static index read in a
 * worker.
 */
/**
 * Add the highlight query to a result URL.
 *
 * A content match points at a heading, so the URL already has a fragment — and a query
 * appended after one is part of the fragment, not a search param.
 */
function withHighlight(url: string, query: string): string {
  if (!feature('search.highlight') || query === '') return url;

  const hashAt = url.indexOf('#');
  const path = hashAt === -1 ? url : url.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : url.slice(hashAt);
  return `${path}?h=${encodeURIComponent(query)}${hash}`;
}

export function SearchDialog(props: SharedProps) {
  const navigate = useNavigate();

  const client = useMemo(() => createSearchClient(config.search), []);
  const { search, setSearch, query } = useDocsSearch({ client });
  const results = query.data === 'empty' || query.data === undefined ? [] : query.data;

  /**
   * A long index is parsed on the first query, so the wait is seconds rather than
   * milliseconds — long enough that the list's "No results found" reads as an answer.
   *
   * `query.isLoading` alone is not the whole wait: fumadocs debounces the input before it
   * flips, so a keystroke's worth of that wrong answer shows first. A query is pending from
   * the keystroke until the search settles.
   */
  const [pending, setPending] = useState(false);
  useEffect(() => {
    setPending(search !== '');
  }, [search]);
  useEffect(() => {
    if (!query.isLoading) setPending(false);
  }, [query.isLoading]);

  // `search.suggest`: complete the last word inline from the best result's title.
  const completion = useMemo(() => {
    if (!feature('search.suggest') || search === '' || results.length === 0) return '';
    // A result's content arrives with the matched span wrapped in `<mark>` — and the match
    // is the query itself, so leaving the markup in place is a prefix test that can never
    // pass.
    const title = (results[0]?.content ?? '').replaceAll('<mark>', '').replaceAll('</mark>', '');
    return title.toLowerCase().startsWith(search.toLowerCase()) ? title.slice(search.length) : '';
  }, [results, search]);

  // An empty box has nothing to answer: `null` collapses the list, where an empty array
  // would answer "No results found".
  const items = search === '' ? null : results.map((result) => ({ ...result, external: false }));

  return (
    <Dialog
      {...props}
      search={search}
      onSearchChange={setSearch}
      isLoading={query.isLoading}
      onSelect={(item) => {
        if (item.type === 'action') return;
        props.onOpenChange(false);
        // `search.highlight`: the query travels with the link, so a shared result highlights
        // too — which is why there is no separate `search.share`.
        void navigate(withHighlight(stripBase(config.base, item.url), search), { viewTransition: true });
      }}
    >
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          {/*
            Our own input rather than fumadocs' `SearchDialogInput`: that one overwrites
            `placeholder` with its own translated "Search" after spreading props, so the
            wording here would never reach the box. The state is already ours.
          */}
          <input
            className="seemore-search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search documentation…"
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' || completion === '') return;
              event.preventDefault();
              setSearch(search + completion);
            }}
          />
          <SearchDialogClose />
        </SearchDialogHeader>
        {completion === '' ? undefined : (
          <p className="seemore-search-suggestion" aria-hidden="true">
            {search}
            <span>{completion}</span>
          </p>
        )}
        {query.error !== undefined ? (
          // A search box that silently finds nothing is worse than one that says why.
          <p className="seemore-search-error" role="alert">
            {query.error.message}
          </p>
        ) : pending && (items?.length ?? 0) === 0 ? (
          // Only with nothing to show: results already on screen stay put while the next
          // query runs, under the input icon's own pulse.
          <div className="seemore-search-loading" role="status">
            <span className="seemore-search-spinner" aria-hidden="true" />
            Searching…
          </div>
        ) : (
          <SearchDialogList items={items} />
        )}
      </SearchDialogContent>
    </Dialog>
  );
}

export default SearchDialog;

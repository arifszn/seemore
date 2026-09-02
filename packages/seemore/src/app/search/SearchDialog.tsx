import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useDocsSearch } from 'fumadocs-core/search/client';
import {
  SearchDialog as Dialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
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

  // `search.suggest`: complete the last word inline from the best result's title.
  const completion = useMemo(() => {
    if (!feature('search.suggest') || search === '' || results.length === 0) return '';
    const title = results[0]?.content ?? '';
    return title.toLowerCase().startsWith(search.toLowerCase()) ? title.slice(search.length) : '';
  }, [results, search]);

  const items = results.map((result) => ({ ...result, external: false }));

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
          <SearchDialogInput
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
        {query.error === undefined ? (
          <SearchDialogList items={items} />
        ) : (
          // A search box that silently finds nothing is worse than one that says why.
          <p className="seemore-search-error" role="alert">
            {query.error.message}
          </p>
        )}
      </SearchDialogContent>
    </Dialog>
  );
}

export default SearchDialog;

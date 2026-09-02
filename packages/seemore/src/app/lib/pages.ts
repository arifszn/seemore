import { useSyncExternalStore } from 'react';
import { getRoutes, subscribeRoutes } from 'virtual:seemore/routes';
import type { PageModule, RouteEntry } from '../../shared/types.js';

/**
 * One module cache shared by the router, the hover prefetch and the prerender driver.
 *
 * The promise is annotated with `status`/`value`, the convention React's `use()` reads, so a
 * module that is already loaded renders synchronously — which is what lets `renderToString`
 * produce a complete page with no Suspense fallback in the output.
 */
type Tracked = Promise<PageModule> & {
  status?: 'pending' | 'fulfilled' | 'rejected';
  value?: PageModule;
  reason?: unknown;
};

const cache = new Map<string, Tracked>();

let index = buildIndex();

// The route list is replaced whenever the corpus changes, so the lookup is rebuilt with it
// and pages that no longer exist stop holding on to their modules.
subscribeRoutes(() => {
  index = buildIndex();
  // Deleting the current entry while iterating a Map is well defined.
  for (const url of cache.keys()) {
    if (!index.has(url)) cache.delete(url);
  }
});

function buildIndex(): Map<string, RouteEntry> {
  return new Map(getRoutes().map((entry) => [entry.url, entry]));
}

export function routeEntries(): RouteEntry[] {
  return getRoutes();
}

export function findRoute(url: string): RouteEntry | undefined {
  return index.get(url);
}

/** Subscribe a component to corpus changes; re-renders on create, rename and delete. */
export function useRouteEntry(url: string): RouteEntry | undefined {
  const entries = useSyncExternalStore(subscribeRoutes, getRoutes, getRoutes);
  return entries.find((entry) => entry.url === url);
}

export function loadPage(entry: RouteEntry): Tracked {
  const existing = cache.get(entry.url);
  if (existing !== undefined) return existing;

  const promise = entry.load() as Tracked;
  promise.status = 'pending';
  promise.then(
    (value) => {
      promise.status = 'fulfilled';
      promise.value = value;
    },
    (reason: unknown) => {
      promise.status = 'rejected';
      promise.reason = reason;
    },
  );

  cache.set(entry.url, promise);
  return promise;
}

/** Load a page ahead of rendering it. Used by prerender and by the hover prefetch. */
export async function preloadPage(url: string): Promise<PageModule | undefined> {
  const entry = findRoute(url);
  if (entry === undefined) return undefined;
  return await loadPage(entry);
}

export function peekPage(url: string): PageModule | undefined {
  const tracked = cache.get(url);
  return tracked?.status === 'fulfilled' ? tracked.value : undefined;
}

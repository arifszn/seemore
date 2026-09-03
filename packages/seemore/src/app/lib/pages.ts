import { use, useSyncExternalStore } from 'react';
import { getRoutes, subscribeRoutes } from 'virtual:seemore/routes';
import type { PageModule, RouteEntry } from '../../shared/types.js';

/**
 * One module cache shared by the router, the hover prefetch and the prerender driver.
 *
 * The promise is annotated with `status`/`value`, the convention React's `use()` reads, so a
 * module that is already loaded renders synchronously — which is what lets `renderToString`
 * produce a complete page with no Suspense fallback in the output.
 *
 * Entries are keyed by URL and stamped with the route's content `version`. A URL can outlive
 * its module: in dev, a body edit keeps the address and replaces the file behind it, and the
 * cached promise would be the last thing still holding the old component. Fast Refresh does
 * not step in — MDX emits a named `toc` export beside the default one, so the React plugin
 * declines the module and invalidates it instead, and that invalidation is absorbed by the
 * route store's own `accept()`. The version is how the cache notices on its own.
 */
type Tracked = Promise<PageModule> & {
  status?: 'pending' | 'fulfilled' | 'rejected';
  value?: PageModule;
  reason?: unknown;
  version: string;
  /** A replacement already loading for a newer version, so an edit is fetched once. */
  next?: Tracked;
};

const cache = new Map<string, Tracked>();

let index = buildIndex();

// Bumped whenever a cached module is swapped for a newer version, so a page that is on
// screen re-renders onto the new one. Route changes have their own store; this one is only
// for replacements, which arrive later, once the new module has actually loaded.
let generation = 0;
const swapListeners = new Set<() => void>();

subscribeRoutes(() => onRoutesChanged());

/**
 * Rebuild the lookup and drop pages that no longer exist. A page that still exists keeps its
 * entry even if its content changed: the version check in `loadPage` handles that, and it
 * keeps the old module on screen until the new one is ready rather than dropping to a
 * loading fallback. Exported for the pages test.
 */
export function onRoutesChanged(): void {
  index = buildIndex();
  // Deleting the current entry while iterating a Map is well defined.
  for (const url of cache.keys()) {
    if (!index.has(url)) cache.delete(url);
  }
}

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

/** The page's module, re-rendering when an edit replaces it. Suspends until first loaded. */
export function usePageModule(entry: RouteEntry): PageModule {
  useSyncExternalStore(subscribeSwaps, getGeneration, getGeneration);
  return use(loadPage(entry) as Promise<PageModule>);
}

/** Exported for the pages test; components go through `usePageModule`. */
export function subscribeSwaps(listener: () => void): () => void {
  swapListeners.add(listener);
  return () => {
    swapListeners.delete(listener);
  };
}

function getGeneration(): number {
  return generation;
}

export function loadPage(entry: RouteEntry): Tracked {
  const existing = cache.get(entry.url);
  if (existing === undefined) {
    const fresh = track(entry);
    cache.set(entry.url, fresh);
    return fresh;
  }
  if (existing.version === entry.version) return existing;

  // Only a rendered module is worth keeping on screen while its replacement loads. A pending
  // or failed one is not: hand over immediately, so a fixed file suspends on the fix instead
  // of re-throwing the error it just corrected.
  if (existing.status !== 'fulfilled') {
    const fresh = track(entry);
    cache.set(entry.url, fresh);
    return fresh;
  }

  if (existing.next?.version !== entry.version) {
    const fresh = track(entry);
    existing.next = fresh;
    const settle = () => {
      // The page may have been deleted, or this URL may already be on a later version — the
      // next render compares versions again, so the only wrong move is resurrecting a URL.
      if (!index.has(entry.url)) return;
      cache.set(entry.url, fresh);
      generation += 1;
      for (const listener of swapListeners) listener();
    };
    fresh.then(settle, settle);
  }
  return existing;
}

function track(entry: RouteEntry): Tracked {
  const promise = entry.load() as Tracked;
  promise.version = entry.version;
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

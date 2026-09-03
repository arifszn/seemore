import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageModule, RouteEntry } from '../src/shared/types.js';
import { setRoutes } from './stubs/routes.js';
import { loadPage, onRoutesChanged, peekPage, subscribeSwaps } from '../src/app/lib/pages.js';

/** A route whose body is distinct per call, so a re-import is observable. */
function route(url: string, version: string, load?: () => Promise<PageModule>): RouteEntry {
  return {
    url,
    file: `${url.replace(/^\//, '')}.md`,
    absPath: `/content${url}.md`,
    title: url,
    description: null,
    version,
    load: load ?? (() => Promise.resolve({ default: () => `${url}@${version}` } as unknown as PageModule)),
  };
}

function body(url: string): string {
  const Content = peekPage(url)?.default as unknown as (() => string) | undefined;
  return Content === undefined ? '<none>' : Content();
}

/** A load the test releases by hand, to observe what is on screen in the meantime. */
function deferred(): { load: () => Promise<PageModule>; resolve: (m: PageModule) => void; reject: (e: unknown) => void } {
  let resolve!: (m: PageModule) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<PageModule>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { load: () => promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('page module cache', () => {
  beforeEach(() => {
    // Start from an empty cache: dropping every URL evicts whatever an earlier test loaded.
    setRoutes([]);
    onRoutesChanged();
    setRoutes([route('/alpha', 'v1'), route('/beta', 'v1')]);
    onRoutesChanged();
  });

  it('caches a loaded page: the same version is never re-imported', async () => {
    const first = loadPage(route('/alpha', 'v1'));
    await first;
    expect(loadPage(route('/alpha', 'v1'))).toBe(first);
    expect(body('/alpha')).toBe('/alpha@v1');
  });

  it('keeps the old module on screen while an edited one loads, then swaps and notifies', async () => {
    await loadPage(route('/alpha', 'v1'));
    const listener = vi.fn();
    subscribeSwaps(listener);

    // A body edit: same URL, new version. This is the regression that left the page stale
    // until a manual reload — and the old body must not drop to a loading state meanwhile.
    const next = deferred();
    setRoutes([route('/alpha', 'v2', next.load), route('/beta', 'v1')]);
    onRoutesChanged();

    const during = loadPage(route('/alpha', 'v2', next.load));
    expect(during.status).toBe('fulfilled');
    expect(body('/alpha')).toBe('/alpha@v1');
    expect(listener).not.toHaveBeenCalled();

    next.resolve({ default: () => '/alpha@v2' } as unknown as PageModule);
    await flush();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(body('/alpha')).toBe('/alpha@v2');
    expect(loadPage(route('/alpha', 'v2', next.load)).status).toBe('fulfilled');
  });

  it('fetches one edit once, however many renders ask for it', async () => {
    await loadPage(route('/alpha', 'v1'));
    const load = vi.fn(() => new Promise<PageModule>(() => {}));
    const edited = route('/alpha', 'v2', load);
    setRoutes([edited, route('/beta', 'v1')]);
    onRoutesChanged();

    loadPage(edited);
    loadPage(edited);
    loadPage(edited);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not keep a failed module around: a fixed file loads in its place', async () => {
    const broken = route('/alpha', 'v1', () => Promise.reject(new Error('compile failed')));
    setRoutes([broken, route('/beta', 'v1')]);
    onRoutesChanged();
    await loadPage(broken).catch(() => undefined);
    expect(loadPage(broken).status).toBe('rejected');

    const fixed = route('/alpha', 'v2');
    setRoutes([fixed, route('/beta', 'v1')]);
    onRoutesChanged();
    const replacement = loadPage(fixed);
    expect(replacement.status).toBe('pending');
    await replacement;
    expect(body('/alpha')).toBe('/alpha@v2');
  });

  it('drops only the pages that are gone, and leaves an unedited page alone', async () => {
    await loadPage(route('/alpha', 'v1'));
    const beta = loadPage(route('/beta', 'v1'));
    await beta;

    setRoutes([route('/beta', 'v1')]);
    onRoutesChanged();

    expect(peekPage('/alpha')).toBeUndefined();
    expect(loadPage(route('/beta', 'v1'))).toBe(beta);
  });

  it('discards a replacement for a page that was deleted while it loaded', async () => {
    await loadPage(route('/alpha', 'v1'));
    const next = deferred();
    setRoutes([route('/alpha', 'v2', next.load), route('/beta', 'v1')]);
    onRoutesChanged();
    loadPage(route('/alpha', 'v2', next.load));

    setRoutes([route('/beta', 'v1')]);
    onRoutesChanged();
    next.resolve({ default: () => '/alpha@v2' } as unknown as PageModule);
    await flush();

    expect(peekPage('/alpha')).toBeUndefined();
  });
});

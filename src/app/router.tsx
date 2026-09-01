import { Suspense } from 'react';
import { useLocation, type RouteObject } from 'react-router';
import { decodePath } from '../shared/base.js';
import { DocPage, DocsLayout, NotFound, Overview } from './layout/DocsLayout.js';
import { useRouteEntry } from './lib/pages.js';

/** The current route URL: React Router has already removed the basename. */
export function useRouteUrl(): string {
  const { pathname } = useLocation();
  const trimmed = decodePath(pathname).replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

function Page() {
  const url = useRouteUrl();
  const entry = useRouteEntry(url);
  if (entry !== undefined) return <DocPage entry={entry} />;
  // A folder with no `index.md` or root `README.md` still gets a home address: a generated
  // list of every page, not an apology.
  return url === '/' ? <Overview /> : <NotFound />;
}

/**
 * One catch-all route, matched against `virtual:seemore/routes` at render time.
 *
 * Our URLs are exact strings, so there is no pattern matching for a router to do — and a
 * route table that never changes shape means creating or deleting a page needs no new
 * router, which is what keeps the dev-mode sidebar refresh a re-render rather than a reload.
 *
 * A data router, because fumadocs' React Router integration uses its hooks — but **no route
 * carries a loader**, which is the actual guarantee. With nothing to fetch,
 * there is no code path in which server-side data can fail to prerender.
 */
export function createRouteObjects(): RouteObject[] {
  return [
    {
      path: '*',
      element: (
        <DocsLayout>
          <Suspense fallback={<div className="seemore-loading" aria-busy="true" />}>
            <Page />
          </Suspense>
        </DocsLayout>
      ),
    },
  ];
}

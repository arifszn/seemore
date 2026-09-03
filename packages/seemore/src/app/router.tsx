import { Component, Suspense, type ReactNode } from 'react';
import { useLocation, type RouteObject } from 'react-router';
import { decodePath } from '../shared/base.js';
import { DocPage, DocsLayout, NotFound, Overview, PageError } from './layout/DocsLayout.js';
import { useRouteEntry } from './lib/pages.js';

/** The current route URL: React Router has already removed the basename. */
export function useRouteUrl(): string {
  const { pathname } = useLocation();
  const trimmed = decodePath(pathname).replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

function Page() {
  const url = useRouteUrl();
  // Keyed by address, so navigating away from a page that threw starts clean rather than
  // carrying its error to every page after it.
  return (
    <PageErrorBoundary key={url}>
      <PageContent url={url} />
    </PageErrorBoundary>
  );
}

function PageContent({ url }: { url: string }) {
  const entry = useRouteEntry(url);
  if (entry !== undefined) return <DocPage entry={entry} />;
  // A folder with no `index.md` or root `README.md` still gets a home address: a generated
  // list of every page, not an apology.
  return url === '/' ? <Overview /> : <NotFound />;
}

/**
 * The only error boundary in the app. Render errors come from page content — the rest of the
 * tree is seemore's own — so this sits around the page and nothing else.
 */
class PageErrorBoundary extends Component<{ children: ReactNode }, { message: string | undefined }> {
  override state: { message: string | undefined } = { message: undefined };

  static getDerivedStateFromError(error: unknown): { message: string } {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  override render() {
    if (this.state.message !== undefined) return <PageError message={this.state.message} />;
    return this.props.children;
  }
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

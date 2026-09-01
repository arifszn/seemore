import { use } from 'react';
import { TreeContextProvider } from 'fumadocs-ui/contexts/tree';
import { SidebarProvider } from 'fumadocs-ui/components/sidebar/base';
import { Pencil } from 'lucide-react';
import { config } from 'virtual:openmd/config';
import type { PageModule, RouteEntry } from '../../shared/types.js';
import { loadPage } from '../lib/pages.js';
import { useRouteUrl } from '../router.js';
import { feature } from '../lib/features.js';
import { pruneTree, usePageTree } from '../lib/tree.js';
import { mdxComponents } from '../mdx/components.js';
import { usePrefetch } from '../features/prefetch.js';
import { PagePreview } from '../features/preview.js';
import { useSearchHighlight } from '../features/highlight.js';
import { useHashScroll } from '../features/anchors.js';
import { OpenmdProvider } from './Provider.js';
import { Header } from './Header.js';
import { Sidebar } from './Sidebar.js';
import { Breadcrumb } from './Breadcrumb.js';
import { BackToTop, PageFooter, SiteFooter } from './Footer.js';
import { IntegratedToc, Toc, TocProvider } from './Toc.js';

/**
 * The shell openmd owns. fumadocs-ui supplies the primitives — sidebar,
 * TOC, search dialog, MDX components — and one layout, tuned by feature flags, arranges them.
 */
export function DocsLayout({ children }: { children: React.ReactNode }) {
  const tree = usePageTree();

  return (
    <OpenmdProvider>
      <TreeContextProvider tree={tree}>
        <SidebarProvider>{children}</SidebarProvider>
      </TreeContextProvider>
    </OpenmdProvider>
  );
}

export function DocPage({ entry }: { entry: RouteEntry }) {
  const full = usePageTree();
  const url = useRouteUrl();
  const tree = feature('navigation.prune') ? pruneTree(full, url) : full;

  // `use()` on the cached module promise: already-loaded pages render synchronously, which
  // is what makes `renderToString` emit a complete page.
  const page = use(loadPage(entry) as Promise<PageModule>);
  const Content = page.default;

  usePrefetch();
  useSearchHighlight();
  useHashScroll();

  const integrated = feature('toc.integrate');

  return (
    <TocProvider toc={page.toc ?? []}>
      <div className="openmd-shell">
        <Header />
        <div className="openmd-body">
          <Sidebar>{integrated ? <IntegratedToc /> : undefined}</Sidebar>

          <main className="openmd-main">
            {feature('navigation.path') ? <Breadcrumb /> : undefined}
            <article className="openmd-article prose">
              <Content components={mdxComponents} />
            </article>

            {config.editLink !== undefined && feature('content.action.edit') ? (
              <a className="openmd-edit-link" href={joinUrl(config.editLink.base, entry.file)}>
                <Pencil aria-hidden="true" />
                {config.editLink.text}
              </a>
            ) : undefined}

            {feature('navigation.footer') ? <PageFooter tree={tree} url={url} /> : undefined}
            <SiteFooter />
          </main>

          {integrated ? undefined : <Toc />}
        </div>

        {feature('navigation.top') ? <BackToTop /> : undefined}
        <PagePreview />
      </div>
    </TocProvider>
  );
}

export function NotFound() {
  return (
    <div className="openmd-shell">
      <Header />
      <main className="openmd-main">
        <h1>Page not found</h1>
        <p>There is no page at this address.</p>
      </main>
    </div>
  );
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

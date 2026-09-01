import { use } from 'react';
import type * as PageTree from 'fumadocs-core/page-tree';
import { TreeContextProvider } from 'fumadocs-ui/contexts/tree';
import { SidebarProvider } from 'fumadocs-ui/components/sidebar/base';
import { Pencil } from 'lucide-react';
import { config } from 'virtual:seemore/config';
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
import { SeemoreProvider } from './Provider.js';
import { Header } from './Header.js';
import { Sidebar } from './Sidebar.js';
import { Breadcrumb } from './Breadcrumb.js';
import { BackToTop, PageFooter, SiteFooter } from './Footer.js';
import { IntegratedToc, Toc, TocProvider } from './Toc.js';

/**
 * The shell seemore owns. fumadocs-ui supplies the primitives — sidebar,
 * TOC, search dialog, MDX components — and one layout, tuned by feature flags, arranges them.
 */
export function DocsLayout({ children }: { children: React.ReactNode }) {
  const tree = usePageTree();

  return (
    <SeemoreProvider>
      <TreeContextProvider tree={tree}>
        <SidebarProvider>{children}</SidebarProvider>
      </TreeContextProvider>
    </SeemoreProvider>
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
      <div className="seemore-shell">
        <Header />
        <div className="seemore-body">
          <Sidebar>{integrated ? <IntegratedToc /> : undefined}</Sidebar>

          <main className="seemore-main">
            {feature('navigation.path') ? <Breadcrumb /> : undefined}
            <article className="seemore-article prose">
              <Content components={mdxComponents} />
            </article>

            {config.editLink !== undefined && feature('content.action.edit') ? (
              <a className="seemore-edit-link" href={joinUrl(config.editLink.base, entry.file)}>
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
    <div className="seemore-shell">
      <Header />
      <main className="seemore-main">
        <h1>Page not found</h1>
        <p>There is no page at this address.</p>
      </main>
    </div>
  );
}

/**
 * The generated index: when no `index.md` or root `README.md` claims `/`, the home address
 * lists every page instead of apologising.
 *
 * Rendered from the same page tree the sidebar reads, so the order — `meta.json`, frontmatter
 * `order`, then title — is the order a reader would click through.
 */
export function Overview() {
  const tree = usePageTree();

  return (
    <div className="seemore-shell">
      <Header />
      <main className="seemore-main">
        <article className="seemore-article prose">
          <h1>{config.title}</h1>
          {config.description !== undefined ? <p>{config.description}</p> : undefined}
          <OverviewList nodes={tree.children} />
        </article>
        <SiteFooter />
      </main>
    </div>
  );
}

function OverviewList({ nodes }: { nodes: PageTree.Node[] }) {
  return (
    <ul>
      {nodes.map((node) => {
        if (node.type === 'page') {
          return (
            <li key={node.url}>
              <a href={node.url}>{node.name}</a>
              {typeof node.description === 'string' && node.description !== '' ? (
                <small> — {node.description}</small>
              ) : undefined}
            </li>
          );
        }
        if (node.type === 'folder') {
          // A folder stands for its index page when it has one, and lists the rest under it.
          const children = node.index === undefined ? node.children : [node.index, ...node.children];
          return (
            <li key={String(node.name)}>
              <h2>{node.name}</h2>
              <OverviewList nodes={children} />
            </li>
          );
        }
        return undefined;
      })}
    </ul>
  );
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

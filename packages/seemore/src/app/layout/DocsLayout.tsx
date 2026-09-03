import type * as PageTree from 'fumadocs-core/page-tree';
import { TreeContextProvider } from 'fumadocs-ui/contexts/tree';
import { SidebarProvider } from 'fumadocs-ui/components/sidebar/base';
import { ArrowRight, Pencil } from 'lucide-react';
import { config } from 'virtual:seemore/config';
import type { RouteEntry } from '../../shared/types.js';
import { usePageModule } from '../lib/pages.js';
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
import { SelectionCopyButton } from './SelectionCopyButton.js';
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

  // `use()` on the cached module promise, inside the hook: already-loaded pages render
  // synchronously, which is what makes `renderToString` emit a complete page.
  const page = usePageModule(entry);
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
        <SelectionCopyButton />
      </div>
    </TocProvider>
  );
}

export function NotFound() {
  return (
    <div className="seemore-shell">
      <Header />
      <div className="seemore-body">
        <Sidebar />

        <main className="seemore-main">
          <article className="seemore-article prose">
            <h1>Page not found</h1>
            <p>There is no page at this address.</p>
          </article>

          <SiteFooter />
        </main>
      </div>
    </div>
  );
}

/**
 * A page whose own markup threw — an `.mdx` file reaching for a component seemore does not
 * provide, most often. `seemore build` refuses to write such a page at all; here, in the dev
 * server and on client-side navigation, the reason replaces the article, because React
 * unmounts the whole app when nothing catches the error and a blank screen says nothing.
 */
export function PageError({ message }: { message: string }) {
  return (
    <div className="seemore-shell">
      <Header />
      <div className="seemore-body">
        <Sidebar />

        <main className="seemore-main">
          <article className="seemore-article prose">
            <h1>This page failed to render</h1>
            <pre>
              <code>{message}</code>
            </pre>
          </article>

          <SiteFooter />
        </main>
      </div>
    </div>
  );
}

/**
 * The generated index: when no `index.md` or root `README.md` claims `/`, the home address
 * lists every page instead of apologising.
 *
 * Rendered from the same page tree the sidebar reads, so the order — `meta.json`, frontmatter
 * `order`, then title — is the order a reader would click through. Same shell as a page:
 * header, sidebar, footer — only the article is generated.
 */
export function Overview() {
  const tree = usePageTree();

  return (
    <div className="seemore-shell">
      <Header />
      <div className="seemore-body">
        <Sidebar />

        <main className="seemore-main">
          <article className="seemore-article prose">
            <h1>{config.title}</h1>
            {config.description !== undefined ? <p>{config.description}</p> : undefined}
            <OverviewSections nodes={tree.children} />
          </article>

          <SiteFooter />
        </main>
      </div>

      {feature('navigation.top') ? <BackToTop /> : undefined}
      <PagePreview />
    </div>
  );
}

/** Pages render as card grids; a folder opens a titled section holding its own cards. */
type Segment = { pages: PageTree.Item[] } | { folder: PageTree.Folder };

function OverviewSections({ nodes }: { nodes: PageTree.Node[] }) {
  const segments: Segment[] = [];
  for (const node of nodes) {
    if (node.type === 'page') {
      const last = segments.at(-1);
      if (last !== undefined && 'pages' in last) last.pages.push(node);
      else segments.push({ pages: [node] });
    } else if (node.type === 'folder') {
      segments.push({ folder: node });
    }
  }

  return (
    <>
      {segments.map((segment, index) =>
        'pages' in segment ? (
          <OverviewGrid key={index} pages={segment.pages} />
        ) : (
          <section key={index} className="seemore-overview-section">
            <h2 className="seemore-overview-section-title">{segment.folder.name}</h2>
            {typeof segment.folder.description === 'string' && segment.folder.description !== '' ? (
              <p className="seemore-overview-section-description">{segment.folder.description}</p>
            ) : undefined}
            {/* A folder stands for its index page when it has one, and lists the rest under it. */}
            <OverviewSections
              nodes={
                segment.folder.index === undefined
                  ? segment.folder.children
                  : [segment.folder.index, ...segment.folder.children]
              }
            />
          </section>
        ),
      )}
    </>
  );
}

function OverviewGrid({ pages }: { pages: PageTree.Item[] }) {
  if (pages.length === 0) return undefined;

  return (
    <div className="seemore-overview-grid">
      {pages.map((page) => (
        <a key={page.url} href={page.url} className="seemore-overview-card group">
          <span className="seemore-overview-card-row">
            <span className="seemore-overview-card-title">{page.name}</span>
            <ArrowRight className="seemore-overview-card-icon" aria-hidden="true" />
          </span>
          {typeof page.description === 'string' && page.description !== '' ? (
            <span className="seemore-overview-card-description">{page.description}</span>
          ) : undefined}
        </a>
      ))}
    </div>
  );
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

import type * as PageTree from 'fumadocs-core/page-tree';
import { TreeContextProvider } from 'fumadocs-ui/contexts/tree';
import { SidebarProvider } from 'fumadocs-ui/components/sidebar/base';
import { isValidElement } from 'react';
import { ArrowRight, Pencil } from 'lucide-react';
import { config } from 'virtual:seemore/config';
import type { RouteEntry } from '../../shared/types.js';
import { usePageModule } from '../lib/pages.js';
import { useRouteUrl } from '../router.js';
import { feature } from '../lib/features.js';
import { pruneTree, usePageTree } from '../lib/tree.js';
import { dateTitle } from '../lib/date-title.js';
import { mdxComponents } from '../mdx/components.js';
import { usePrefetch } from '../features/prefetch.js';
import { PagePreview } from '../features/preview.js';
import { useSearchHighlight } from '../features/highlight.js';
import { useHashScroll } from '../features/anchors.js';
import { InlineEditor } from '../features/edit.js';
import { SeemoreProvider } from './Provider.js';
import { useExternalLinkBridge } from './ExternalLinkBridge.js';
import { Header } from './Header.js';
import { Sidebar } from './Sidebar.js';
import { Breadcrumb } from './Breadcrumb.js';
import { PageActions } from './PageActions.js';
import { BackToTop, PageFooter, SiteFooter } from './Footer.js';
import { SelectionCopyButton } from './SelectionCopyButton.js';
import { IntegratedToc, Toc, TocProvider } from './Toc.js';

/**
 * The shell seemore owns. fumadocs-ui supplies the primitives — sidebar,
 * TOC, search dialog, MDX components — and one layout, tuned by feature flags, arranges them.
 */
export function DocsLayout({ children }: { children: React.ReactNode }) {
  const tree = usePageTree();
  useExternalLinkBridge();

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
  // Dev only, and off unless asked for: the editor writes to the user's files, and a static
  // build has no server to write through. `import.meta.env.DEV` also keeps it out of the bundle.
  const editable = import.meta.env.DEV && feature('content.edit');

  return (
    <TocProvider toc={page.toc ?? []}>
      <div className="seemore-shell">
        <Header />
        <div className="seemore-body">
          <Sidebar>{integrated ? <IntegratedToc /> : undefined}</Sidebar>

          <main className="seemore-main">
            {feature('navigation.path') ? <Breadcrumb /> : undefined}
            <PageActions />
            <article className={editable ? 'seemore-article prose seemore-editable' : 'seemore-article prose'}>
              <Content components={mdxComponents} />
              {editable ? <InlineEditor key={entry.url} entry={entry} /> : undefined}
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
            <header className="seemore-overview-header">
              <h1>{config.title}</h1>
              {config.description !== undefined ? <p>{config.description}</p> : undefined}
            </header>
            <div className="seemore-overview not-prose">
              <OverviewSections nodes={tree.children} />
            </div>
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

/** h2 at the top level, one step smaller per nesting level, capped at h6. */
const SECTION_HEADING_TAGS = ['h2', 'h3', 'h4', 'h5', 'h6'] as const;

function OverviewSections({
  nodes,
  depth = 0,
  trail = [],
}: {
  nodes: PageTree.Node[];
  depth?: number;
  /** Names of the folders folded into this level's headings, outermost first. */
  trail?: React.ReactNode[];
}) {
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

  const Heading = SECTION_HEADING_TAGS[Math.min(depth, SECTION_HEADING_TAGS.length - 1)] ?? 'h6';

  return (
    <>
      {segments.map((segment, index) => {
        if ('pages' in segment) {
          // Pages after a folder are set apart, so they do not read as that folder's last pages.
          return <OverviewGrid key={index} pages={segment.pages} separated={index > 0} />;
        }

        const { folder } = segment;
        const indexPage = folderIndex(folder);
        const children = folder.children.filter((child) => child !== indexPage);
        const description = folder.description ?? indexPage?.description;
        // A nested folder holding only folders adds nothing but a heading: its name moves into
        // its children's headings instead ("2025 / Q4"). One with a description keeps its section.
        if (
          depth > 0 &&
          indexPage === undefined &&
          !hasText(description) &&
          children.every((child) => child.type === 'folder')
        ) {
          return (
            <OverviewSections key={index} nodes={children} depth={depth} trail={[...trail, folder.name]} />
          );
        }

        return (
          <section key={index} className="seemore-overview-section">
            <Heading className="seemore-overview-section-title">
              {trail.map((name, i) => (
                <span key={i} className="seemore-overview-section-trail">
                  {name} /
                </span>
              ))}
              {/* A folder with an index page links to it here, instead of listing it as a card. */}
              {indexPage === undefined ? (
                folder.name
              ) : (
                <a href={indexPage.url} className="seemore-overview-section-link">
                  {folder.name}
                  <ArrowRight aria-hidden="true" />
                </a>
              )}
            </Heading>
            {hasText(description) ? (
              <p className="seemore-overview-section-description">{description}</p>
            ) : undefined}
            <OverviewSections nodes={children} depth={depth + 1} />
          </section>
        );
      })}
    </>
  );
}

function OverviewGrid({ pages, separated }: { pages: PageTree.Item[]; separated: boolean }) {
  if (pages.length === 0) return undefined;

  return (
    <div className={separated ? 'seemore-overview-grid seemore-overview-grid-separated' : 'seemore-overview-grid'}>
      {pages.map((page) => (
        <a key={page.url} href={page.url} className="seemore-overview-card">
          <span className="seemore-overview-card-title">
            {page.icon}
            {dateTitle(page.url, nameText(page.name)) ?? page.name}
          </span>
          {hasText(page.description) ? (
            <span className="seemore-overview-card-description">{page.description}</span>
          ) : (
            <span className="seemore-overview-card-url">{page.url}</span>
          )}
        </a>
      ))}
    </div>
  );
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

/** `index.md` or `README.md` (any content extension), as the tree's `$id` names the file. */
const INDEX_FILE = /(?:^|\/)(?:index|readme)\.(?:mdx?|markdown)$/i;

/**
 * A folder's index page. The `meta.json` seemore writes to lead a directory with its index
 * lists that page by name, so fumadocs keeps it as an ordinary child rather than setting
 * `folder.index`; the file name is what marks it.
 */
function folderIndex(folder: PageTree.Folder): PageTree.Item | undefined {
  if (folder.index !== undefined) return folder.index;
  return folder.children.find(
    (child): child is PageTree.Item => child.type === 'page' && INDEX_FILE.test(child.$id ?? ''),
  );
}

/**
 * The plain text of a tree name. On the client, fumadocs turns each name into a span that
 * carries it as HTML; elsewhere it is still the string.
 */
function nameText(name: React.ReactNode): string | undefined {
  if (typeof name === 'string') return name;
  if (isValidElement<{ dangerouslySetInnerHTML?: { __html?: unknown } }>(name)) {
    const html = name.props.dangerouslySetInnerHTML?.__html;
    if (typeof html === 'string') return html;
  }
  return undefined;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

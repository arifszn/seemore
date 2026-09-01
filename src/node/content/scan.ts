import { readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { globSync } from 'tinyglobby';
import { z } from 'zod';
import type { VirtualFile } from 'fumadocs-core/source';
import { parseFrontmatter, type FrontmatterData } from './frontmatter.js';
import { resolveRoutes, toPosix, type RouteInfo } from './slug.js';

/** Appended to, never replaced by, `config.exclude`. */
export const DEFAULT_EXCLUDES = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/.seemore/**',
  '**/.*/**',
  '**/.*',
  '**/CHANGELOG.md',
];

/** fumadocs' `meta.json` shape, validated so a typo reports a file rather than a blank folder. */
const metaSchema = z
  .object({
    title: z.string().optional(),
    icon: z.string().optional(),
    root: z.boolean().optional(),
    pages: z.array(z.string()).optional(),
    pagesIndex: z.string().optional(),
    defaultOpen: z.boolean().optional(),
    collapsible: z.boolean().optional(),
    description: z.string().optional(),
  })
  .loose();

export interface ContentPage extends RouteInfo {
  /** Absolute path on disk — what the generated import map imports. */
  absPath: string;
  data: FrontmatterData & { title: string };
}

export interface ScanResult {
  /** What fumadocs' loader consumes. */
  files: VirtualFile[];
  /** What the router, prefetch map and prerender driver consume. */
  pages: ContentPage[];
  errors: string[];
  warnings: string[];
}

export interface ScanOptions {
  contentRoot: string;
  exclude?: string[];
  /** Used as the title of a root index page that has no frontmatter title. */
  siteTitle?: string;
  /** Dev keeps drafts so they can be written; the build drops them. */
  includeDrafts?: boolean;
}

export function scan(options: ScanOptions): ScanResult {
  const contentRoot = resolve(options.contentRoot);
  const ignore = [...DEFAULT_EXCLUDES, ...(options.exclude ?? [])];

  const contentFiles = globSync(['**/*.md', '**/*.mdx'], {
    cwd: contentRoot,
    ignore,
    dot: false,
    absolute: false,
  }).map(toPosix);

  const metaFiles = globSync(['**/meta.json'], { cwd: contentRoot, ignore, dot: false, absolute: false }).map(toPosix);

  const { routes, errors, warnings } = resolveRoutes(contentFiles);

  const pages: ContentPage[] = [];
  for (const route of routes) {
    const absPath = join(contentRoot, route.file);
    let data: FrontmatterData;
    try {
      data = parseFrontmatter(readFileSync(absPath, 'utf8'), route.file).data;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      continue;
    }

    if (data.draft === true && options.includeDrafts !== true) continue;

    pages.push({ ...route, absPath, data: { ...data, title: titleFor(route, data, options.siteTitle) } });
  }

  const files: VirtualFile[] = pages.map((page) => ({
    type: 'page',
    path: page.file,
    absolutePath: page.absPath,
    // Our slugs, not fumadocs' — one algorithm decides URLs, anchors and the index.
    slugs: page.slugs,
    data: page.data,
  }));

  const metaDirs = new Set<string>();
  for (const file of metaFiles) {
    const absPath = join(contentRoot, file);
    try {
      const parsed = metaSchema.safeParse(JSON.parse(readFileSync(absPath, 'utf8')));
      if (!parsed.success) {
        errors.push(
          `Invalid ${file}:\n${parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')}`,
        );
        continue;
      }
      metaDirs.add(dirname(file));
      files.push({ type: 'meta', path: file, absolutePath: absPath, data: parsed.data });
    } catch (error) {
      errors.push(`Invalid ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  files.push(...synthesiseOrderMeta(pages, metaDirs));

  return { files, pages, errors, warnings };
}

/**
 * Ordering: a real `meta.json` wins; otherwise frontmatter `order` decides, then
 * title. fumadocs has no native `order`, so we express the intent in the mechanism it does
 * have — a synthetic `meta.json` whose `pages` list ends in the `...` rest marker, leaving
 * anything we did not mention in fumadocs' own alphabetical order.
 */
function synthesiseOrderMeta(pages: ContentPage[], metaDirs: Set<string>): VirtualFile[] {
  const byDir = new Map<string, ContentPage[]>();
  for (const page of pages) {
    const dir = dirname(page.file);
    const bucket = byDir.get(dir);
    if (bucket) bucket.push(page);
    else byDir.set(dir, [page]);
  }

  const out: VirtualFile[] = [];
  for (const [dir, dirPages] of byDir) {
    if (metaDirs.has(dir)) continue;
    // Nothing to express unless something wants to move: an explicit `order`, or an index
    // page that would otherwise sort alphabetically into the middle of its own directory.
    if (!dirPages.some((p) => typeof p.data.order === 'number' || p.isIndex)) continue;

    const ordered = [...dirPages].sort(compareForOrder).map((p) => basename(p.file).replace(/\.mdx?$/i, ''));

    out.push({
      type: 'meta',
      path: dir === '.' ? 'meta.json' : `${dir}/meta.json`,
      data: { pages: [...ordered, '...'] },
    });
  }
  return out;
}

function compareForOrder(a: ContentPage, b: ContentPage): number {
  // An index page stands for its directory, so it leads unless it asks not to.
  const ao = orderOf(a);
  const bo = orderOf(b);
  if (ao !== bo) return ao - bo;
  return a.data.title.localeCompare(b.data.title);
}

function orderOf(page: ContentPage): number {
  if (typeof page.data.order === 'number') return page.data.order;
  return page.isIndex ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
}

function titleFor(route: RouteInfo, data: FrontmatterData, siteTitle: string | undefined): string {
  if (typeof data.title === 'string' && data.title !== '') return data.title;
  if (route.url === '/') return siteTitle ?? 'Home';
  return humanise(route.slugs[route.slugs.length - 1] ?? 'Untitled');
}

/** `getting-started` → `Getting Started`. Good enough to never show a raw slug in a sidebar. */
function humanise(slug: string): string {
  return slug
    .split('-')
    .filter((word) => word !== '')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

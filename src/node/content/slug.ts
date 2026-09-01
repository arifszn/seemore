/**
 * Path → URL resolution.
 *
 * One slug algorithm, `github-slugger`, is used for URLs, heading anchors and the search
 * index alike — it is already a fumadocs dependency, so agreeing with it is free.
 */
import { slug as slugify } from 'github-slugger';

const INDEX_NAMES = new Set(['index', 'readme']);
const CONTENT_EXT = /\.mdx?$/i;

export interface RouteInfo {
  /** Virtual path relative to the content root, posix separators. */
  file: string;
  /** Route URL: leading slash, never a trailing slash. The site root is `/`. */
  url: string;
  /** Slug segments; the site root is the empty array. */
  slugs: string[];
  /** Path of the emitted HTML relative to `dist/`. */
  output: string;
  /** Whether this file stands for its directory rather than for itself. */
  isIndex: boolean;
}

/** Normalise a possibly-Windows path to a posix virtual path. */
export function toPosix(file: string): string {
  return file.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

/**
 * Slugify a single path segment. Segments that slugify to nothing (`...`, emoji-only) fall
 * back to a lowercased, punctuation-stripped form so that a URL is never empty.
 */
export function slugifySegment(segment: string): string {
  const slugged = slugify(segment);
  if (slugged !== '') return slugged;
  const fallback = segment.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return fallback === '' ? 'untitled' : fallback;
}

export function toRoute(file: string): RouteInfo {
  const posix = toPosix(file);
  const segments = posix.split('/');
  const basename = segments.pop() ?? '';
  const stem = basename.replace(CONTENT_EXT, '');
  const isIndex = INDEX_NAMES.has(stem.toLowerCase());

  const slugs = segments.map(slugifySegment);
  if (!isIndex) slugs.push(slugifySegment(stem));

  return {
    file: posix,
    url: slugs.length === 0 ? '/' : `/${slugs.join('/')}`,
    slugs,
    output: [...slugs, 'index.html'].join('/'),
    isIndex,
  };
}

export interface ResolvedRoutes {
  routes: RouteInfo[];
  /** Conditions that make the site silently wrong — a build error. */
  errors: string[];
  /** Conditions that are visible on the page itself — a warning. */
  warnings: string[];
}

/**
 * Resolve a whole corpus at once, because the interesting failures are corpus-level:
 * `index.md` vs `README.md` in one directory, and two different files slugifying alike.
 */
export function resolveRoutes(files: string[]): ResolvedRoutes {
  const sorted = [...files].map(toPosix).sort();
  const byUrl = new Map<string, RouteInfo[]>();
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const file of sorted) {
    const route = toRoute(file);
    const bucket = byUrl.get(route.url);
    if (bucket) bucket.push(route);
    else byUrl.set(route.url, [route]);
  }

  const routes: RouteInfo[] = [];
  for (const [url, candidates] of [...byUrl.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (candidates.length === 1) {
      routes.push(candidates[0]!);
      continue;
    }

    // `index.md` beating `README.md` is a documented preference, not a collision.
    const indexes = candidates.filter((c) => c.isIndex);
    if (indexes.length === candidates.length) {
      const winner =
        indexes.find((c) => c.file.split('/').pop()?.toLowerCase().startsWith('index')) ?? indexes[0]!;
      const losers = indexes.filter((c) => c !== winner);
      warnings.push(
        `${url} has more than one index file: using ${winner.file}, ignoring ${losers
          .map((l) => l.file)
          .join(', ')}.`,
      );
      routes.push(winner);
      continue;
    }

    errors.push(
      `Duplicate route ${url} produced by ${candidates.length} files:\n` +
        candidates.map((c) => `  - ${c.file}`).join('\n') +
        `\nRename one of them, or exclude it with \`exclude\` in openmd.config.ts.`,
    );
  }

  return { routes, errors, warnings };
}

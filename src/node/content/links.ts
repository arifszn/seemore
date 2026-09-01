import { slug as slugify } from 'github-slugger';
import { isExternalHref, withBase } from '../base.js';
import type { ContentPage } from './scan.js';
import { slugifySegment, toPosix } from './slug.js';

const CONTENT_EXT = /\.mdx?$/i;

export interface ResolvedLink {
  /** The href to emit. Unchanged from the input when nothing needed resolving. */
  href: string;
  warning?: string;
}

export interface ResolvedWikilink {
  /** `undefined` when the target does not exist — render the label as plain text. */
  href?: string;
  label: string;
  warning?: string;
}

export interface LinkResolver {
  /** Relative `.md`/`.mdx` links → routes. Everything else passes through untouched. */
  resolveHref(href: string, fromFile: string): ResolvedLink;
  /** The inside of a `[[…]]`, i.e. `Target`, `Target|label`, `Target#Heading`, or both. */
  resolveWikilink(target: string, fromFile: string): ResolvedWikilink;
}

export function createLinkResolver(pages: readonly ContentPage[], base: string): LinkResolver {
  /** `guide/deep-dive` (extension stripped, original casing) → page. */
  const byPath = new Map<string, ContentPage>();
  /** Lowercased basename, and its slugified form → every page that answers to it. */
  const byName = new Map<string, ContentPage[]>();

  const add = (map: Map<string, ContentPage[]>, key: string, page: ContentPage) => {
    const bucket = map.get(key);
    if (bucket) bucket.push(page);
    else map.set(key, [page]);
  };

  for (const page of pages) {
    const withoutExt = page.file.replace(CONTENT_EXT, '');
    byPath.set(withoutExt.toLowerCase(), page);
    byPath.set(page.file.toLowerCase(), page);
    // A directory index answers to its directory, so `[[guide]]` finds `guide/index.md`.
    if (page.isIndex) {
      const dir = withoutExt.split('/').slice(0, -1).join('/');
      if (dir !== '') byPath.set(dir.toLowerCase(), page);
    }

    const basename = withoutExt.split('/').pop() ?? '';
    add(byName, basename.toLowerCase(), page);
    const slugged = slugifySegment(basename);
    if (slugged !== basename.toLowerCase()) add(byName, slugged, page);
  }

  /** Shallowest path first, then alphabetically — stable regardless of scan order. */
  const pick = (candidates: ContentPage[]): ContentPage =>
    [...candidates].sort((a, b) => {
      const depth = a.file.split('/').length - b.file.split('/').length;
      return depth !== 0 ? depth : a.file.localeCompare(b.file);
    })[0]!;

  function lookup(target: string): { page?: ContentPage; ambiguous?: ContentPage[] } {
    const cleaned = toPosix(target).replace(/^\/+/, '').replace(CONTENT_EXT, '');
    const key = cleaned.toLowerCase();

    // 1. Exact path match relative to the content root.
    const exact = byPath.get(key);
    if (exact) return { page: exact };

    // 2 and 3. Basename match, then slugified basename match.
    const named = byName.get(key) ?? byName.get(slugifySegment(cleaned));
    if (named === undefined || named.length === 0) return {};
    if (named.length === 1) return { page: named[0]! };
    return { page: pick(named), ambiguous: named };
  }

  function href(page: ContentPage, hash: string | undefined): string {
    const url = withBase(base, page.url);
    return hash === undefined ? url : `${url}#${slugify(hash)}`;
  }

  return {
    resolveHref(raw, fromFile) {
      if (isExternalHref(raw) && !raw.startsWith('.') && !CONTENT_EXT.test(raw.split('#')[0] ?? '')) {
        return { href: raw };
      }
      const [pathPart = '', hashPart] = splitHash(raw);
      if (!CONTENT_EXT.test(pathPart)) return { href: raw };

      // A leading slash means "from the content root", so the linking file's directory is
      // not the starting point.
      const fromDir = pathPart.startsWith('/') ? [] : toPosix(fromFile).split('/').slice(0, -1);
      const resolved = joinPosix(fromDir, pathPart);
      const page = byPath.get(resolved.toLowerCase());

      if (page === undefined) {
        return {
          href: raw,
          warning: `Broken link ${raw} in ${toPosix(fromFile)}: no page at ${resolved}.`,
        };
      }
      return { href: href(page, hashPart) };
    },

    resolveWikilink(target, fromFile) {
      const pipe = target.indexOf('|');
      const linkPart = (pipe === -1 ? target : target.slice(0, pipe)).trim();
      const label = (pipe === -1 ? target : target.slice(pipe + 1)).trim();
      const [pathPart = '', hashPart] = splitHash(linkPart);

      const { page, ambiguous } = lookup(pathPart);
      if (page === undefined) {
        return {
          label,
          warning: `Dead wikilink [[${target}]] in ${toPosix(fromFile)}: no page matches "${pathPart}".`,
        };
      }

      const warning =
        ambiguous === undefined
          ? undefined
          : `Ambiguous wikilink [[${target}]] in ${toPosix(fromFile)}: matches ${ambiguous
              .map((c) => c.file)
              .sort()
              .join(', ')}. Using ${page.file}.`;

      return { href: href(page, hashPart), label, warning };
    },
  };
}

function splitHash(value: string): [string, string | undefined] {
  const index = value.indexOf('#');
  if (index === -1) return [value, undefined];
  return [value.slice(0, index), value.slice(index + 1)];
}

/** Resolve `./a`, `../a`, `a` against a directory, without touching the real filesystem. */
function joinPosix(fromDir: readonly string[], relative: string): string {
  const segments = [...fromDir];
  for (const part of toPosix(relative).split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') segments.pop();
    else segments.push(part);
  }
  return segments.join('/').replace(CONTENT_EXT, '');
}

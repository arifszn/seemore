/**
 * Base-path handling.
 *
 * Internally a base is always normalised to leading + trailing slash (`/sub/`), because a
 * single canonical shape is what makes the "no absolute-root URL leaks" test possible. The
 * trailing slash is stripped again only at the point of output.
 */

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/** `undefined` | `sub` | `/sub` | `/sub/` → `/sub/`. The root base is `/`. */
export function normaliseBase(base: string | undefined): string {
  if (base === undefined || base === '') return '/';
  if (EXTERNAL.test(base)) {
    throw new Error(
      `Invalid \`base\`: ${JSON.stringify(base)}. \`base\` is a path on the host, not a URL — use "/${base.replace(/^.*?:\/\/[^/]*/, '').replace(/^\/+/, '')}".`,
    );
  }
  const trimmed = base.replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed === '' ? '/' : `/${trimmed}/`;
}

/** True for hrefs that a base must never touch: external, protocol-relative, hash, or relative. */
export function isExternalHref(href: string): boolean {
  return EXTERNAL.test(href) || href.startsWith('#') || !href.startsWith('/');
}

/** Prefix a root-relative path with the base. Idempotent; leaves external hrefs alone. */
export function withBase(base: string, href: string): string {
  const b = normaliseBase(base);
  if (b === '/' || isExternalHref(href)) return href;
  if (href === '/') return b;
  if (href === b.slice(0, -1) || href.startsWith(b)) return href;
  return b + href.replace(/^\/+/, '');
}

/** Inverse of {@link withBase}: turn a browser pathname back into an internal route URL. */
export function stripBase(base: string, pathname: string): string {
  const b = normaliseBase(base);
  if (b === '/') return pathname;
  if (pathname === b || pathname === b.slice(0, -1)) return '/';
  if (!pathname.startsWith(b)) return pathname;
  return `/${pathname.slice(b.length)}`;
}

/** The form React Router wants for `basename`: leading slash, no trailing slash, `/` at root. */
export function toBasename(base: string): string {
  const b = normaliseBase(base);
  return b === '/' ? '/' : b.slice(0, -1);
}

/**
 * Browser pathnames are percent-encoded; route URLs are not.
 *
 * `/guía/página-uno` arrives from `location.pathname` as `/gu%C3%ADa/p%C3%A1gina-uno`, and a
 * lookup against the route map misses — so a correctly prerendered page hydrates into "Page
 * not found". `decodeURI`, not `decodeURIComponent`: a literal `%2F` in a filename must stay
 * encoded or it would split into two path segments.
 */
export function decodePath(pathname: string): string {
  try {
    return decodeURI(pathname);
  } catch {
    // Malformed escapes are the browser's problem, not ours; match on what we were given.
    return pathname;
  }
}

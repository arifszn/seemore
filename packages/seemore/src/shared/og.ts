import { withBase } from './base.js';

/**
 * Where a page's social card lives.
 *
 * Shared, because the build writes the file and the prerendered `<head>` points at it — and
 * a card nothing references is a card nobody sees.
 */
export function ogImagePath(url: string): string {
  const clean = url.replace(/^\/+|\/+$/g, '');
  // A path per route, rather than a flattened filename: `/a/b` and `/a-b` are different
  // routes and must not write to the same file.
  return clean === '' ? '/api/og/card.png' : `/api/og/${clean}/card.png`;
}

/**
 * The address the `og:image` and `twitter:image` tags carry. Open Graph wants an absolute
 * URL, so it is prefixed with `origin` (the config's `url`) when set. Without `url`, the
 * build warns and the tags keep the root-relative path.
 */
export function ogImageUrl(origin: string | undefined, base: string, url: string): string {
  const path = withBase(base, ogImagePath(url));
  return origin === undefined ? path : `${origin}${path}`;
}

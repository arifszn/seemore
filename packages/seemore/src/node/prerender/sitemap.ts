/**
 * The sitemap for a built site: one `<loc>` per route, in the trailing-slash form each page
 * is written to (`dir/index.html`). No `lastmod`: a build machine's file times say when the
 * checkout happened, not when the page changed, and a wrong date is worse than none.
 */
export function buildSitemap(origin: string, base: string, routes: string[]): string {
  // String joins, never `path.join`: this is a URL, and Windows would put backslashes in it.
  const prefix = base === '/' ? '' : base.replace(/\/+$/, '');
  const locs = routes.map((route) => {
    const path = route.replace(/^\/+|\/+$/g, '');
    return `${origin}${prefix}/${path === '' ? '' : `${encodeURI(path)}/`}`;
  });

  const entries = locs.map((loc) => `  <url><loc>${escapeXml(loc)}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}

function escapeXml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

/**
 * `site` → the origin sitemap URLs hang off, or `undefined` when unset.
 *
 * `base` is a path and a sitemap needs absolute URLs, so the origin is a separate key.
 * Setting it is what turns the sitemap on; a folder without it builds exactly as before.
 */
export function normaliseSite(site: string | undefined): string | undefined {
  if (site === undefined || site === '') return undefined;

  let url: URL;
  try {
    url = new URL(site);
  } catch {
    throw new Error(`Invalid \`site\`: ${JSON.stringify(site)}. \`site\` is the address the site is served from, like "https://example.com".`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Invalid \`site\`: ${JSON.stringify(site)}. Use an http:// or https:// address.`);
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error(
      `Invalid \`site\`: ${JSON.stringify(site)}. \`site\` is the origin only; put the subpath in \`base\` (for example \`base: '${url.pathname}'\`).`,
    );
  }
  return url.origin;
}

/**
 * The sitemap for a built site: one `<loc>` per route, in the trailing-slash form each page
 * is written to (`dir/index.html`). No `lastmod`: a build machine's file times say when the
 * checkout happened, not when the page changed, and a wrong date is worse than none.
 */
export function buildSitemap(site: string, base: string, routes: string[]): string {
  // String joins, never `path.join`: this is a URL, and Windows would put backslashes in it.
  const prefix = base === '/' ? '' : base.replace(/\/+$/, '');
  const locs = routes.map((route) => {
    const path = route.replace(/^\/+|\/+$/g, '');
    return `${site}${prefix}/${path === '' ? '' : `${encodeURI(path)}/`}`;
  });

  const entries = locs.map((loc) => `  <url><loc>${escapeXml(loc)}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}

function escapeXml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

/**
 * `url` → the origin the site is served from, or `undefined` when unset.
 *
 * `base` is a path and some output needs absolute URLs, so the origin is a separate key.
 * Today that is `sitemap.xml`, written only when `url` is set; a folder without it builds
 * exactly as before.
 */
export function normaliseUrl(input: string | undefined): string | undefined {
  if (input === undefined || input === '') return undefined;

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`Invalid \`url\`: ${JSON.stringify(input)}. \`url\` is the address the site is served from, like "https://example.com".`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid \`url\`: ${JSON.stringify(input)}. Use an http:// or https:// address.`);
  }
  if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') {
    throw new Error(
      `Invalid \`url\`: ${JSON.stringify(input)}. \`url\` is the origin only; put the subpath in \`base\` (for example \`base: '${parsed.pathname}'\`).`,
    );
  }
  return parsed.origin;
}

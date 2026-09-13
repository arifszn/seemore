import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Host conventions.
 *
 * The portable output is everything else: one real `index.html` per route, plus `404.html`,
 * which every static host honours. These files are additive — small, named conventions that
 * particular hosts look for — not a list of hosts seemore supports.
 */
export function writeDeployArtifacts(outDir: string, base: string, shell: string, options: { auth?: boolean } = {}): void {
  const prefix = base === '/' ? '' : base.replace(/\/+$/, '');

  // Netlify and Cloudflare Pages share this format. It applies after the real files they
  // already serve, so it only catches addresses that do not exist.
  writeFileSync(join(outDir, '_redirects'), `${prefix}/*    ${prefix}/index.html    200\n`, 'utf8');

  // Surge looks for `200.html` as its SPA fallback.
  writeFileSync(join(outDir, '200.html'), shell, 'utf8');

  // GitHub Pages runs the output through Jekyll unless this file exists, and Jekyll drops
  // every file and directory whose name starts with `_`. A `docs/_internal/` folder would
  // build correctly and then 404 once deployed — the exact failure seemore exists to prevent.
  writeFileSync(join(outDir, '.nojekyll'), '', 'utf8');

  // Netlify and Cloudflare Pages read this: keep search engines off a password-protected
  // site. The lock shell carries the same rule as a meta tag for every other host. There is
  // deliberately no `robots.txt` — a `Disallow` would stop crawlers from ever seeing the
  // `noindex`, and they would still list the bare URL from inbound links.
  if (options.auth === true) {
    writeFileSync(join(outDir, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n', 'utf8');
  }
}

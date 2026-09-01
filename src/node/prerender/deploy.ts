import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Host conventions.
 *
 * The portable output is everything else: one real `index.html` per route, plus `404.html`,
 * which every static host honours. These files are additive — small, named conventions that
 * particular hosts look for — not a list of hosts openmd supports.
 */
export function writeDeployArtifacts(outDir: string, base: string, shell: string): void {
  const prefix = base === '/' ? '' : base.replace(/\/+$/, '');

  // Netlify and Cloudflare Pages share this format. It applies after the real files they
  // already serve, so it only catches addresses that do not exist.
  writeFileSync(join(outDir, '_redirects'), `${prefix}/*    ${prefix}/index.html    200\n`, 'utf8');

  // Surge looks for `200.html` as its SPA fallback.
  writeFileSync(join(outDir, '200.html'), shell, 'utf8');

  // GitHub Pages runs the output through Jekyll unless this file exists, and Jekyll drops
  // every file and directory whose name starts with `_`. A `docs/_internal/` folder would
  // build correctly and then 404 once deployed — the exact failure openmd exists to prevent.
  writeFileSync(join(outDir, '.nojekyll'), '', 'utf8');
}

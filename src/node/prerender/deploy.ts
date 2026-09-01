import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Host fallbacks.
 *
 * Every route is already a real file, so these only matter for addresses that do not exist —
 * and for reloading after a client-side navigation on a host that does not fall back on its
 * own. Getting them wrong is exactly the "deployed, then navigation broke" failure openmd
 * exists to prevent, so both are written unconditionally.
 */
export function writeDeployArtifacts(outDir: string, base: string, shell: string): void {
  const prefix = base === '/' ? '' : base.replace(/\/+$/, '');

  // Netlify: SPA fallback, after the real files it already serves.
  writeFileSync(join(outDir, '_redirects'), `${prefix}/*    ${prefix}/index.html    200\n`, 'utf8');

  // Surge: `200.html` is its SPA fallback by convention.
  writeFileSync(join(outDir, '200.html'), shell, 'utf8');
}

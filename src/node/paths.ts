import { existsSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The installed openmd package directory.
 *
 * Works from the bundled CLI (`dist/cli/index.js`) and from the sources during tests, which
 * is why it walks for `package.json` rather than assuming a depth.
 */
export function packageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 10; depth++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('openmd: could not locate its own package root.');
}

/** The browser layer, which ships as source and is compiled in-process. */
export function appRoot(): string {
  return join(packageRoot(), 'src', 'app');
}

/**
 * Vite's caches go to the OS temp directory, keyed by content root.
 *
 * Dev writes nothing into the user's folder, and that has to include the
 * dependency-optimiser cache Vite would otherwise put in `node_modules/.vite`.
 */
export function cacheDir(contentRoot: string): string {
  const key = createHash('sha256').update(resolve(contentRoot)).digest('hex').slice(0, 12);
  return join(tmpdir(), 'openmd', key);
}

/**
 * `openmd [dir]`, else probe `docs/` → `content/` → cwd.
 *
 * The result is canonicalised through the filesystem. Every module id openmd derives from
 * the root — import specifiers, watcher lookups — must use the real spelling, because Vite
 * refuses to *load* a path containing a Windows 8.3 short-name segment (`RUNNER~1`) no
 * matter what the fs allow list says. Real users hit this too: `C:\Users\<long name>\`
 * carries a short alias on any drive with 8.3 names enabled.
 */
export function resolveContentRoot(cwd: string, explicit?: string): string {
  if (explicit !== undefined) return canonicalise(resolve(cwd, explicit));
  for (const candidate of ['docs', 'content']) {
    const dir = resolve(cwd, candidate);
    if (existsSync(dir)) return canonicalise(dir);
  }
  return canonicalise(resolve(cwd));
}

function canonicalise(dir: string): string {
  try {
    return realpathSync.native(dir);
  } catch {
    // A root that does not exist yet keeps its literal spelling; dev reports the empty corpus.
    return dir;
  }
}

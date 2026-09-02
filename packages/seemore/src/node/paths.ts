import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The installed seemore package directory.
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
  throw new Error('seemore: could not locate its own package root.');
}

/** The browser layer, which ships as source and is compiled in-process. */
export function appRoot(): string {
  return join(packageRoot(), 'src', 'app');
}

/**
 * Walks up from a resolved file to the `package.json` that names it.
 *
 * For a dependency subpath its own `exports` map doesn't list — `dist/browser/index.js`
 * inside `@terrastruct/d2`, say — there's no portable `require.resolve` for it; only the
 * package's declared entry point is guaranteed reachable. This finds the package's own
 * directory from that entry point, so a caller can build the rest of the path itself.
 */
export function packageDirOf(name: string, fromFile: string): string {
  let dir = dirname(fromFile);
  for (let depth = 0; depth < 10; depth++) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest) && (JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string }).name === name) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`seemore: could not locate the "${name}" package directory.`);
}

/**
 * Vite's caches go to the OS temp directory, keyed by content root.
 *
 * Dev writes nothing into the user's folder, and that has to include the
 * dependency-optimiser cache Vite would otherwise put in `node_modules/.vite`.
 */
export function cacheDir(contentRoot: string): string {
  const key = createHash('sha256').update(resolve(contentRoot)).digest('hex').slice(0, 12);
  return join(tmpdir(), 'seemore', key);
}

/**
 * `seemore [dir]`, else the folder the command runs in. Nothing is probed: which Markdown
 * becomes the site is decided by where the user stands, never by what happens to exist.
 *
 * The result is canonicalised through the filesystem. Every module id seemore derives from
 * the root — import specifiers, watcher lookups — must use the real spelling, because Vite
 * refuses to *load* a path containing a Windows 8.3 short-name segment (`RUNNER~1`) no
 * matter what the fs allow list says. Real users hit this too: `C:\Users\<long name>\`
 * carries a short alias on any drive with 8.3 names enabled.
 */
export function resolveContentRoot(cwd: string, explicit?: string): string {
  return explicit !== undefined ? canonicalise(resolve(cwd, explicit)) : canonicalise(cwd);
}

/**
 * Resolve a path through the filesystem to its real spelling — the same treatment
 * {@link resolveContentRoot} gives the content root, needed anywhere else a path arriving
 * from outside seemore (an editor's `document.uri.fsPath`, say) has to be compared against
 * one of its own, which are already canonicalised. A symlinked ancestor (`/tmp` on macOS)
 * or a Windows 8.3 short name would otherwise make the same file compare unequal to itself.
 */
export function canonicalise(dir: string): string {
  try {
    return realpathSync.native(dir);
  } catch {
    // Does not exist, or not readable: keep the literal spelling rather than throw.
    return dir;
  }
}

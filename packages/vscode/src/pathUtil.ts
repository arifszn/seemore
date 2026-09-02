/**
 * Filesystem path helpers behind root resolution (see `root.ts`). Pure and platform-safe:
 * every comparison goes through `node:path`, never a hand-rolled separator.
 */
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Resolve through the filesystem, the same way `seemore`'s own `resolveContentRoot` does —
 * so a root the extension hands the CLI, and the root the CLI reports back in its ready
 * line, are always the same spelling (matters for Windows 8.3 short names and symlinked
 * checkouts).
 */
export function canonicalise(dir: string): string {
  try {
    return realpathSync.native(dir);
  } catch {
    // Does not exist yet, or not readable: keep the literal spelling rather than throw.
    return dir;
  }
}

/**
 * Nearest ancestor of `startDir` (inclusive) for which `hasConfig` is true, stopping at
 * `boundary` (inclusive) without going further up. `undefined` means none was found.
 */
export function findConfigAncestor(
  startDir: string,
  hasConfig: (dir: string) => boolean,
  boundary?: string,
): string | undefined {
  let dir = resolve(startDir);
  const stop = boundary === undefined ? undefined : resolve(boundary);

  for (;;) {
    if (hasConfig(dir)) return dir;
    if (stop !== undefined && dir === stop) return undefined;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** The default `hasConfig` seam: does `<dir>/seemore.config.ts` exist? */
export function hasSeemoreConfig(dir: string): boolean {
  return existsSync(resolve(dir, 'seemore.config.ts'));
}

/**
 * A `ContentPage.file`-shaped path — posix separators, relative to the content root — onto
 * a platform-native absolute path under `root`. Used for "open this page's source file".
 */
export function resolveRelativePosix(root: string, posixRelative: string): string {
  const segments = posixRelative.split('/').filter((segment) => segment !== '');
  return join(root, ...segments);
}

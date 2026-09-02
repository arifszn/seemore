/**
 * Filesystem path helpers behind root resolution (see `root.ts`). Pure and platform-safe:
 * every comparison goes through `node:path`, never a hand-rolled separator.
 */
import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

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

/** Is `child` `parent` itself, or nested inside it? Both are resolved before comparing. */
export function isInside(parent: string, child: string): boolean {
  const p = resolve(parent);
  const c = resolve(child);
  if (p === c) return true;
  const rel = relative(p, c);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * The deepest directory that contains both `a` and `b`.
 *
 * Walks up from `a` rather than splitting and comparing path segments — segment-splitting
 * has to special-case POSIX's empty root segment and Windows drive letters; walking with
 * {@link isInside} does not, because it is built on the same primitive this module already
 * has to get right.
 */
export function commonAncestor(a: string, b: string): string {
  let current = resolve(a);
  const target = resolve(b);
  while (!isInside(current, target)) {
    const parent = dirname(current);
    if (parent === current) return current; // filesystem root, or unrelated drives on Windows
    current = parent;
  }
  return current;
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

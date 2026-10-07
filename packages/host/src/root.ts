/**
 * Root resolution.
 *
 * seemore's CLI deliberately never probes for `docs/` or `content/` — see
 * `packages/seemore/src/node/paths.ts`. A host has no cwd to stand the user in, so this
 * module supplies explicit signals instead of weakening that rule: a pinned folder, then the
 * deepest of an already-open root and a seemore config ancestor, then the file's own
 * directory.
 */
import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { CONFIG_NAMES } from 'seemore';

export interface ResolveInitialRootParams {
  /** Absolute path of the file being opened. */
  file: string;
  /** A root pinned by the user (the extension's per-workspace pin), if any — checked first. */
  pinned?: string;
  /**
   * Roots the host already serves (the desktop app's open windows). One that contains the
   * file wins over the file's own directory, unless a config ancestor is deeper: that marks a
   * separate site. Compared as given, so pass canonical spellings on both sides.
   */
  openRoots?: readonly string[];
  /** Does `dir` hold a seemore config? Injected so this stays a pure function. */
  hasConfig: (dir: string) => boolean;
  /** The config search does not go above this — the workspace folder, or the home directory. */
  searchBoundary?: string;
}

export function resolveInitialRoot(params: ResolveInitialRootParams): string {
  if (params.pinned !== undefined) return params.pinned;

  const fileDir = dirname(params.file);
  const candidates = [
    findConfigAncestor(fileDir, params.hasConfig, params.searchBoundary),
    ...(params.openRoots ?? []).filter((root) => contains(root, params.file)),
  ].filter((dir): dir is string => dir !== undefined);
  if (candidates.length === 0) return fileDir;

  // Every candidate is an ancestor of the file, so the longest path is the deepest.
  return candidates.reduce((deepest, dir) => (resolve(dir).length > resolve(deepest).length ? dir : deepest));
}

function contains(dir: string, file: string): boolean {
  const path = relative(dir, file);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
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

/** The default `hasConfig` seam: does `dir` hold any config file seemore's loader accepts? */
export function hasSeemoreConfig(dir: string): boolean {
  return CONFIG_NAMES.some((name) => existsSync(resolve(dir, name)));
}

/**
 * Resolve through the filesystem, the same way seemore's own `resolveContentRoot` does —
 * so a root a host hands the CLI, and the root the CLI reports back in its ready line, are
 * always the same spelling (matters for Windows 8.3 short names and symlinked checkouts).
 */
export function canonicalise(dir: string): string {
  try {
    return realpathSync.native(dir);
  } catch {
    // Does not exist yet, or not readable: keep the literal spelling rather than throw.
    return dir;
  }
}

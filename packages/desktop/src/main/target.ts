/**
 * What `open(path)` should show: a folder is its own root; a file is shown inside the site
 * it belongs to (DESKTOP-SPEC §4.1).
 */
import { isAbsolute, relative, sep } from 'node:path';
import { resolveInitialRoot } from '@seemore/host';

export type OpenTarget = { kind: 'folder'; root: string } | { kind: 'file'; root: string; file: string };

export interface ResolveTargetContext {
  /** Roots with an open window, canonical. */
  openRoots: readonly string[];
  /** The config search stops here: the user's home directory. */
  home: string;
  isDirectory: (path: string) => boolean;
  hasConfig: (dir: string) => boolean;
}

/** `path` must already be canonical, the spelling the server registry is keyed by (§6). */
export function resolveTarget(path: string, context: ResolveTargetContext): OpenTarget {
  if (context.isDirectory(path)) return { kind: 'folder', root: path };

  const root = resolveInitialRoot({
    file: path,
    openRoots: context.openRoots,
    hasConfig: context.hasConfig,
    // Outside the home directory (a mounted volume, /tmp) there is no boundary to stop at
    // short of the filesystem root, which `findConfigAncestor` stops at by itself.
    searchBoundary: isInside(path, context.home) ? context.home : undefined,
  });
  return { kind: 'file', root, file: path };
}

function isInside(path: string, dir: string): boolean {
  const rel = relative(dir, path);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

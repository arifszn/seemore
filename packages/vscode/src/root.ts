/**
 * Root resolution, and sticky-root navigation once a root is live.
 *
 * seemore's CLI deliberately never probes for `docs/` or `content/` — see
 * `packages/seemore/src/node/paths.ts`. An editor has no cwd to stand the user in, so this
 * module supplies a different explicit signal instead of weakening that rule: a pinned
 * folder, then a `seemore.config.ts` ancestor, then the clicked file's own directory.
 */
import { dirname } from 'node:path';
import { commonAncestor, findConfigAncestor, isInside } from './pathUtil.js';

export interface ResolveInitialRootParams {
  /** Absolute path of the clicked file. */
  file: string;
  /** A root pinned for this workspace via `workspaceState`, if any — checked first. */
  pinned?: string;
  /** Does `<dir>/seemore.config.ts` exist? Injected so this stays a pure function. */
  hasConfig: (dir: string) => boolean;
  /** The config search does not go above this — normally the containing workspace folder. */
  searchBoundary?: string;
}

/** Resolution order applied once, on the first click with no live root yet. */
export function resolveInitialRoot(params: ResolveInitialRootParams): string {
  if (params.pinned !== undefined) return params.pinned;

  const fileDir = dirname(params.file);
  const configAncestor = findConfigAncestor(fileDir, params.hasConfig, params.searchBoundary);
  return configAncestor ?? fileDir;
}

export type NavigationDecision =
  | { action: 'navigate' }
  | { action: 'widen'; root: string };

export interface DecideNavigationParams {
  /** The root the live server is currently running against. */
  liveRoot: string;
  /** Absolute path of the newly clicked file. */
  file: string;
  /** The workspace folder containing `file`. A widen is capped here — it never escapes it. */
  workspaceFolder?: string;
}

/**
 * Every click after the first asks one question: is this file inside the live root?
 *
 * Inside → pure navigate, no re-resolution — the common case, and free. Outside → widen to
 * the common ancestor of the live root and the new file, capped at the workspace folder so
 * a jump never escapes it. With no workspace folder open there is no cap to widen within,
 * so the click starts fresh at its own directory rather than accumulating.
 */
export function decideNavigation(params: DecideNavigationParams): NavigationDecision {
  if (isInside(params.liveRoot, params.file)) return { action: 'navigate' };

  if (params.workspaceFolder === undefined) {
    return { action: 'widen', root: dirname(params.file) };
  }

  const ancestor = commonAncestor(params.liveRoot, dirname(params.file));
  const root = isInside(params.workspaceFolder, ancestor) ? ancestor : params.workspaceFolder;
  return { action: 'widen', root };
}

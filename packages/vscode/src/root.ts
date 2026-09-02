/**
 * Root resolution.
 *
 * seemore's CLI deliberately never probes for `docs/` or `content/` — see
 * `packages/seemore/src/node/paths.ts`. An editor has no cwd to stand the user in, so this
 * module supplies a different explicit signal instead of weakening that rule: a pinned
 * folder, then a `seemore.config.ts` ancestor, then the clicked file's own directory.
 *
 * Resolved fresh on every click — see `session.ts` — rather than kept sticky across clicks:
 * a sticky root needed a navigate-vs-widen decision with its own state and its own bugs, for
 * a benefit (skipping a respawn on same-folder clicks) not worth that.
 */
import { dirname } from 'node:path';
import { findConfigAncestor } from './pathUtil.js';

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

export function resolveInitialRoot(params: ResolveInitialRootParams): string {
  if (params.pinned !== undefined) return params.pinned;

  const fileDir = dirname(params.file);
  const configAncestor = findConfigAncestor(fileDir, params.hasConfig, params.searchBoundary);
  return configAncestor ?? fileDir;
}

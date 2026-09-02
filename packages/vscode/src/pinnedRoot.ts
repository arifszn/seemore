/**
 * The pinned root: `workspaceState` set by the explorer folder entry, or by the status
 * bar's "pin this folder instead" action after a widen.
 *
 * It is the explicit signal root resolution checks first — the thing that lets this
 * extension supply a root without ever probing for a folder named `docs/` or `content/`.
 *
 * Only the `Memento` shape is imported as a type, so this module has no runtime dependency
 * on the `vscode` module and can be unit tested with a plain fake.
 */
import type { Memento } from 'vscode';

const PINNED_ROOT_KEY = 'seemore.pinnedRoot';

export interface PinnedRootStore {
  get(): string | undefined;
  set(root: string | undefined): void | Thenable<void>;
}

export function createPinnedRootStore(memento: Pick<Memento, 'get' | 'update'>): PinnedRootStore {
  return {
    get: () => memento.get<string>(PINNED_ROOT_KEY),
    set: (root) => memento.update(PINNED_ROOT_KEY, root),
  };
}

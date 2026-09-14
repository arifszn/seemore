/**
 * Stand-in for `virtual:seemore/tree`, aliased in `vitest.config.ts`.
 *
 * The app code under test takes the payload as an argument; this only has to exist so the
 * import resolves without a running server.
 */
import type { SerializedPageTree } from 'fumadocs-core/source/client';

let tree = { $fumadocs_loader: 'page-tree', data: { type: 'root', name: '', children: [] } } as SerializedPageTree;
const listeners = new Set<() => void>();

export function getTree(): SerializedPageTree {
  return tree;
}

export function subscribeTree(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Replace the tree the way a rebuilt virtual module does. Does not notify. */
export function setTree(next: SerializedPageTree): void {
  tree = next;
}

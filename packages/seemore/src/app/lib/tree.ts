import { useSyncExternalStore } from 'react';
import { deserializePageTree, type SerializedPageTree } from 'fumadocs-core/source/client';
import type * as PageTree from 'fumadocs-core/page-tree';
import { getTree, subscribeTree } from 'virtual:seemore/tree';

/**
 * The page tree, kept current across content edits.
 *
 * `virtual:seemore/tree` is a self-accepting module, so a create, rename, retitle or delete
 * replaces its value and notifies here — the sidebar re-renders in place, with no reload and
 * no lost scroll position.
 */
export function usePageTree(): PageTree.Root {
  const serialized = useSyncExternalStore(subscribeTree, getTree, getTree);
  return resolveTree(serialized);
}

let current: { serialized: SerializedPageTree; content: string; tree: PageTree.Root } | undefined;
let revision = 0;

/**
 * The deserialized tree for a payload, with a root `$id` that moves whenever the tree does.
 *
 * fumadocs' `TreeContextProvider` memoises its tree on `root.$id`, and the loader always calls
 * the root "root" — so without a fresh id a created, renamed or retitled page reaches the
 * store and never the sidebar. The id only moves when the content differs: the store is
 * replaced on body edits too, and the sidebar list is keyed on that id, so bumping it for
 * nothing would remount the list and close every folder the reader opened, on every save.
 * The first tree keeps its id, so prerendered HTML and hydration agree. Exported for the
 * tree store test.
 */
export function resolveTree(serialized: SerializedPageTree): PageTree.Root {
  if (current?.serialized === serialized) return current.tree;

  // Measured before deserialising: fumadocs rewrites names and icons into elements in place.
  const content = JSON.stringify(serialized);
  if (current?.content === content) {
    current = { ...current, serialized };
    return current.tree;
  }

  const tree = deserializePageTree(serialized);
  if (current !== undefined) tree.$id = `${tree.$id ?? 'root'}:${++revision}`;
  current = { serialized, content, tree };
  return tree;
}

/**
 * `navigation.prune`: render only the subtree around the current page.
 *
 * Large sites pay for a sidebar that renders every page on every navigation; pruning keeps
 * the active branch and collapses the rest.
 */
export function pruneTree(root: PageTree.Root, url: string): PageTree.Root {
  return { ...root, children: keep(root.children, url) };
}

function keep(nodes: PageTree.Node[], url: string): PageTree.Node[] {
  return nodes.map((node): PageTree.Node => {
    if (node.type !== 'folder') return node;
    const children = containsUrl(node, url) ? keep(node.children, url) : [];
    return { ...node, children };
  });
}

function containsUrl(node: PageTree.Node, url: string): boolean {
  if (node.type === 'page') return node.url === url;
  if (node.type !== 'folder') return false;
  if (node.index?.url === url) return true;
  return node.children.some((child) => containsUrl(child, url));
}

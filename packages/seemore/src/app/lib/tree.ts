import { useSyncExternalStore } from 'react';
import { deserializePageTree } from 'fumadocs-core/source/client';
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
  return deserializePageTree(serialized);
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

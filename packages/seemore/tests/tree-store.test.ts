import { describe, expect, it } from 'vitest';
import type { SerializedPageTree } from 'fumadocs-core/source/client';
import { resolveTree } from '../src/app/lib/tree.js';

/** A fresh payload per call, as each replacement of `virtual:seemore/tree` produces. */
function payload(...titles: string[]): SerializedPageTree {
  return {
    $fumadocs_loader: 'page-tree',
    data: {
      type: 'root',
      $id: 'root',
      name: 'Docs',
      children: titles.map((title) => ({ $id: `${title}.md`, type: 'page', name: title, url: `/${title}` })),
    },
  } as SerializedPageTree;
}

// Module state carries from one case to the next, the way it does across HMR updates.
describe('page tree store', () => {
  let first: ReturnType<typeof resolveTree>;

  it('keeps the first tree’s root id, so hydration matches the prerendered HTML', () => {
    const serialized = payload('alpha', 'beta');
    first = resolveTree(serialized);
    expect(first.$id).toBe('root');
    expect(resolveTree(serialized)).toBe(first);
  });

  it('keeps the tree and its id when a replaced store carries the same content', () => {
    // A body edit reloads the store too; the sidebar must not remount for it.
    expect(resolveTree(payload('alpha', 'beta'))).toBe(first);
  });

  it('gives a changed tree a new root id, which is what lets it past fumadocs’ memo', () => {
    // `TreeContextProvider` memoises on `root.$id`: a created page with the old id never renders.
    const next = resolveTree(payload('alpha', 'beta', 'gamma'));
    expect(next.$id).not.toBe(first.$id);
    expect(next.children.map((child) => child.$id)).toEqual(['alpha.md', 'beta.md', 'gamma.md']);

    const after = resolveTree(payload('alpha', 'gamma'));
    expect(after.$id).not.toBe(next.$id);
  });
});

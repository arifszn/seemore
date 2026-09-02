import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveInitialRoot } from '../src/root.js';

const repo = resolve('repo');
const docs = join(repo, 'docs');
const guide = join(docs, 'guide');

describe('resolveInitialRoot', () => {
  it('prefers a pinned root over anything else', () => {
    const root = resolveInitialRoot({
      file: join(guide, 'a.md'),
      pinned: docs,
      hasConfig: () => true, // would win on its own — pin must beat it
    });
    expect(root).toBe(docs);
  });

  it('falls back to the nearest seemore.config.ts ancestor when nothing is pinned', () => {
    const root = resolveInitialRoot({
      file: join(guide, 'a.md'),
      hasConfig: (dir) => dir === docs,
    });
    expect(root).toBe(docs);
  });

  it('falls back to the clicked file\'s own directory when no config is found', () => {
    const root = resolveInitialRoot({
      file: join(guide, 'a.md'),
      hasConfig: () => false,
    });
    expect(root).toBe(guide);
  });

  it('never treats a docs/ or content/ folder name as a signal by itself', () => {
    // Same shape as packages/seemore/tests/paths.test.ts's "does not probe" case: a folder
    // that merely happens to be named `docs` is not a reason to root there.
    const root = resolveInitialRoot({
      file: join(repo, 'docs', 'a.md'),
      hasConfig: () => false,
    });
    expect(root).toBe(docs);
    expect(root).not.toBe(repo);
  });
});

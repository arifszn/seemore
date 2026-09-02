import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideNavigation, resolveInitialRoot } from '../src/root.js';

const repo = resolve('repo');
const docs = join(repo, 'docs');
const guide = join(docs, 'guide');
const src = join(repo, 'src');

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

describe('decideNavigation', () => {
  it('navigates, not widens, when the file is inside the live root', () => {
    expect(decideNavigation({ liveRoot: docs, file: join(guide, 'a.md'), workspaceFolder: repo })).toEqual({
      action: 'navigate',
    });
  });

  it('navigates for the live root\'s own index file', () => {
    expect(decideNavigation({ liveRoot: docs, file: join(docs, 'index.md'), workspaceFolder: repo })).toEqual({
      action: 'navigate',
    });
  });

  it('widens to the common ancestor when the file is outside the live root', () => {
    const decision = decideNavigation({ liveRoot: guide, file: join(src, 'notes.md'), workspaceFolder: repo });
    expect(decision).toEqual({ action: 'widen', root: repo });
  });

  it('caps the widen at the workspace folder even if the common ancestor would go higher', () => {
    // The live root and the new file share nothing under `repo` in this contrived case —
    // the true common ancestor is above the workspace folder, so it must clamp.
    const outsideWorkspace = resolve('elsewhere', 'notes.md');
    const decision = decideNavigation({ liveRoot: docs, file: outsideWorkspace, workspaceFolder: repo });
    expect(decision).toEqual({ action: 'widen', root: repo });
  });

  it('widens to the clicked file\'s own directory, with no accumulation, when there is no workspace folder', () => {
    const decision = decideNavigation({ liveRoot: guide, file: join(src, 'notes.md'), workspaceFolder: undefined });
    expect(decision).toEqual({ action: 'widen', root: src });
  });
});

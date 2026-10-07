import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findConfigAncestor, hasSeemoreConfig, resolveInitialRoot } from '../src/root.js';

// Paths are built with `resolve`/`join`, never hardcoded as POSIX literals, so these pass on
// Windows CI too (see paths.test.ts in packages/seemore for the same convention).
const repo = resolve('repo');
const docs = join(repo, 'docs');
const guide = join(docs, 'guide');

describe('resolveInitialRoot', () => {
  it('prefers a pinned root over anything else', () => {
    const root = resolveInitialRoot({
      file: join(guide, 'a.md'),
      pinned: docs,
      openRoots: [guide],
      hasConfig: () => true, // would win on its own — pin must beat it
    });
    expect(root).toBe(docs);
  });

  it('falls back to the nearest config ancestor when nothing is pinned', () => {
    const root = resolveInitialRoot({
      file: join(guide, 'a.md'),
      hasConfig: (dir) => dir === docs,
    });
    expect(root).toBe(docs);
  });

  it("falls back to the file's own directory when no config is found", () => {
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

  it("prefers an open root that contains the file over the file's own directory", () => {
    const root = resolveInitialRoot({ file: join(guide, 'a.md'), openRoots: [repo], hasConfig: () => false });
    expect(root).toBe(repo);
  });

  it('prefers a config ancestor deeper than the open root: it marks a separate site', () => {
    const root = resolveInitialRoot({
      file: join(guide, 'a.md'),
      openRoots: [repo],
      hasConfig: (dir) => dir === docs,
    });
    expect(root).toBe(docs);
  });

  it('prefers an open root deeper than the config ancestor', () => {
    const root = resolveInitialRoot({
      file: join(guide, 'a.md'),
      openRoots: [docs],
      hasConfig: (dir) => dir === repo,
    });
    expect(root).toBe(docs);
  });

  it('picks the deepest of several open roots that contain the file', () => {
    const root = resolveInitialRoot({
      file: join(guide, 'a.md'),
      openRoots: [repo, docs, join(repo, 'other')],
      hasConfig: () => false,
    });
    expect(root).toBe(docs);
  });

  it("ignores open roots that don't contain the file, including a sibling with a shared prefix", () => {
    const root = resolveInitialRoot({
      file: join(guide, 'a.md'),
      openRoots: [join(repo, 'doc'), join(docs, 'guide-old')],
      hasConfig: () => false,
    });
    expect(root).toBe(guide);
  });
});

describe('findConfigAncestor', () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('finds a config file in the starting directory itself', () => {
    root = mkdtempSync(join(tmpdir(), 'seemore-host-cfg-'));
    writeFileSync(join(root, 'seemore.config.ts'), 'export default {};');
    expect(findConfigAncestor(root, hasSeemoreConfig)).toBe(root);
  });

  it('finds a config file in an ancestor directory', () => {
    root = mkdtempSync(join(tmpdir(), 'seemore-host-cfg-'));
    writeFileSync(join(root, 'seemore.config.ts'), 'export default {};');
    const nested = join(root, 'guide', 'deep');
    mkdirSync(nested, { recursive: true });
    expect(findConfigAncestor(nested, hasSeemoreConfig)).toBe(root);
  });

  it('returns undefined when no ancestor up to the boundary has one', () => {
    root = mkdtempSync(join(tmpdir(), 'seemore-host-cfg-'));
    const nested = join(root, 'guide', 'deep');
    mkdirSync(nested, { recursive: true });
    expect(findConfigAncestor(nested, hasSeemoreConfig, root)).toBeUndefined();
  });

  it('does not search past the boundary', () => {
    root = mkdtempSync(join(tmpdir(), 'seemore-host-cfg-'));
    writeFileSync(join(root, 'seemore.config.ts'), 'export default {};');
    const nested = join(root, 'guide', 'deep');
    mkdirSync(nested, { recursive: true });
    // The boundary sits between `nested` and `root`, so the config at `root` is invisible.
    expect(findConfigAncestor(nested, hasSeemoreConfig, join(root, 'guide'))).toBeUndefined();
  });
});

describe('hasSeemoreConfig', () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it.each(['seemore.config.ts', 'seemore.config.mts', 'seemore.config.js', 'seemore.config.mjs'])(
    'accepts %s, as seemore’s loader does',
    (name) => {
      root = mkdtempSync(join(tmpdir(), 'seemore-host-names-'));
      writeFileSync(join(root, name), 'export default {};');
      expect(hasSeemoreConfig(root)).toBe(true);
    },
  );

  it('rejects a folder with none of them', () => {
    root = mkdtempSync(join(tmpdir(), 'seemore-host-names-'));
    writeFileSync(join(root, 'seemore.config.json'), '{}');
    expect(hasSeemoreConfig(root)).toBe(false);
  });
});

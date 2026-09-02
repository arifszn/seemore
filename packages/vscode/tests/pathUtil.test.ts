import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { commonAncestor, findConfigAncestor, hasSeemoreConfig, isInside, resolveRelativePosix } from '../src/pathUtil.js';

// Paths are built with `resolve`/`join`, never hardcoded as POSIX literals, so these pass on
// Windows CI too (see paths.test.ts in packages/seemore for the same convention).
const repo = resolve('repo');
const docs = join(repo, 'docs');

describe('isInside', () => {
  it('is true for the parent itself', () => {
    expect(isInside(docs, docs)).toBe(true);
  });

  it('is true for a nested file', () => {
    expect(isInside(docs, join(docs, 'guide', 'a.md'))).toBe(true);
  });

  it('is false for a sibling', () => {
    expect(isInside(docs, join(repo, 'src', 'notes.md'))).toBe(false);
  });

  it('is false for an ancestor of the parent', () => {
    expect(isInside(join(docs, 'guide'), docs)).toBe(false);
  });
});

describe('commonAncestor', () => {
  it('finds the shared directory of two nested paths', () => {
    expect(commonAncestor(join(docs, 'guide'), join(docs, 'api'))).toBe(docs);
  });

  it('returns one path when it contains the other', () => {
    expect(commonAncestor(docs, join(docs, 'guide', 'a.md'))).toBe(docs);
  });

  it('walks all the way to the filesystem root for unrelated paths', () => {
    // `repo` and `other` must diverge at the very first segment after the root, or they'd
    // share whatever ancestor this test happened to run under (e.g. the checkout itself).
    const root = parse(docs).root;
    const other = join(root, 'seemore-vscode-unrelated-branch', 'place');
    expect(commonAncestor(docs, other)).toBe(root);
  });

  it('lands on the shared ancestor regardless of which side is deeper', () => {
    expect(commonAncestor(join(repo, 'a', 'b'), join(repo, 'a', 'c', 'd'))).toBe(join(repo, 'a'));
  });
});

describe('findConfigAncestor', () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('finds a config file in the starting directory itself', () => {
    root = mkdtempSync(join(tmpdir(), 'seemore-vscode-cfg-'));
    writeFileSync(join(root, 'seemore.config.ts'), 'export default {};');
    expect(findConfigAncestor(root, hasSeemoreConfig)).toBe(root);
  });

  it('finds a config file in an ancestor directory', () => {
    root = mkdtempSync(join(tmpdir(), 'seemore-vscode-cfg-'));
    writeFileSync(join(root, 'seemore.config.ts'), 'export default {};');
    const nested = join(root, 'guide', 'deep');
    mkdirSync(nested, { recursive: true });
    expect(findConfigAncestor(nested, hasSeemoreConfig)).toBe(root);
  });

  it('returns undefined when no ancestor up to the boundary has one', () => {
    root = mkdtempSync(join(tmpdir(), 'seemore-vscode-cfg-'));
    const nested = join(root, 'guide', 'deep');
    mkdirSync(nested, { recursive: true });
    expect(findConfigAncestor(nested, hasSeemoreConfig, root)).toBeUndefined();
  });

  it('does not search past the boundary', () => {
    root = mkdtempSync(join(tmpdir(), 'seemore-vscode-cfg-'));
    writeFileSync(join(root, 'seemore.config.ts'), 'export default {};');
    const nested = join(root, 'guide', 'deep');
    mkdirSync(nested, { recursive: true });
    // The boundary sits between `nested` and `root`, so the config at `root` is invisible.
    expect(findConfigAncestor(nested, hasSeemoreConfig, join(root, 'guide'))).toBeUndefined();
  });
});

describe('resolveRelativePosix', () => {
  it('joins a posix-style relative path onto a platform-native root', () => {
    expect(resolveRelativePosix(docs, 'guide/intro.md')).toBe(join(docs, 'guide', 'intro.md'));
  });

  it('handles a root-level file with no directory segments', () => {
    expect(resolveRelativePosix(docs, 'readme.md')).toBe(join(docs, 'readme.md'));
  });
});

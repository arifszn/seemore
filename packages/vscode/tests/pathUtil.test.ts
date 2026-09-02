import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findConfigAncestor, hasSeemoreConfig, resolveRelativePosix } from '../src/pathUtil.js';

// Paths are built with `resolve`/`join`, never hardcoded as POSIX literals, so these pass on
// Windows CI too (see paths.test.ts in packages/seemore for the same convention).
const repo = resolve('repo');
const docs = join(repo, 'docs');

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

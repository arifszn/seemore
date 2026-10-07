import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveRelativePosix } from '../src/pathUtil.js';

// Paths are built with `resolve`/`join`, never hardcoded as POSIX literals, so these pass on
// Windows CI too (see paths.test.ts in packages/seemore for the same convention).
const repo = resolve('repo');
const docs = join(repo, 'docs');

describe('resolveRelativePosix', () => {
  it('joins a posix-style relative path onto a platform-native root', () => {
    expect(resolveRelativePosix(docs, 'guide/intro.md')).toBe(join(docs, 'guide', 'intro.md'));
  });

  it('handles a root-level file with no directory segments', () => {
    expect(resolveRelativePosix(docs, 'readme.md')).toBe(join(docs, 'readme.md'));
  });
});

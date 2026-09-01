import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveContentRoot } from '../src/node/paths.js';

function tmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'seemore-paths-')));
}

describe('resolveContentRoot', () => {
  it('uses the folder the command runs in when no dir is given', () => {
    const cwd = tmp();
    expect(resolveContentRoot(cwd)).toBe(realpathSync(cwd));
  });

  it('does not probe docs/ or content/ — standing in a repo root means serving the repo root', () => {
    const cwd = tmp();
    mkdirSync(join(cwd, 'docs'));
    writeFileSync(join(cwd, 'docs', 'readme.md'), '# docs');
    expect(resolveContentRoot(cwd)).toBe(realpathSync(cwd));
  });

  it('resolves an explicit dir against the cwd', () => {
    const cwd = tmp();
    mkdirSync(join(cwd, 'docs'));
    mkdirSync(join(cwd, 'nested/dir'), { recursive: true });
    expect(resolveContentRoot(cwd, 'docs')).toBe(join(realpathSync(cwd), 'docs'));
    expect(resolveContentRoot(cwd, './nested/dir')).toBe(join(realpathSync(cwd), 'nested/dir'));
  });

  it('canonicalises the result through the filesystem', () => {
    // tmpdir() is a symlink on macOS; the resolved root is the real spelling.
    const dir = tmp();
    expect(resolveContentRoot('/tmp', dir)).toBe(realpathSync(dir));
  });
});

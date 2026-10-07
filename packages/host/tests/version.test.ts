import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkCliVersion, compareVersions, readCliVersion } from '../src/version.js';

describe('compareVersions', () => {
  it.each([
    ['1.12.16', '1.12.16', 0],
    ['1.12.16', '1.12.9', 1],
    ['1.9.0', '1.12.0', -1],
    ['2.0.0', '1.99.99', 1],
    ['1.2.0-beta.1', '1.2.0', -1],
    ['1.2.0', '1.2.0-beta.1', 1],
    ['1.2.0-beta.2', '1.2.0-beta.10', -1],
    ['1.2.0-alpha', '1.2.0-beta', -1],
    ['1.2.0-beta', '1.2.0-beta.1', -1],
    ['1.2.0+build.5', '1.2.0', 0],
  ])('%s vs %s → %d', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });
});

describe('checkCliVersion', () => {
  it('passes a version at or above the minimum', () => {
    expect(checkCliVersion('1.13.0', '1.13.0')).toEqual({ ok: true, found: '1.13.0' });
    expect(checkCliVersion('1.14.2', '1.13.0').ok).toBe(true);
  });

  it('fails an older version, naming both', () => {
    const result = checkCliVersion('1.12.16', '1.13.0');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/1\.12\.16.*1\.13\.0/);
  });

  it('fails when the version could not be read', () => {
    expect(checkCliVersion(undefined, '1.13.0').ok).toBe(false);
  });
});

describe('readCliVersion', () => {
  it('reads the version field, and gives undefined for a missing or broken file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'seemore-host-version-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'seemore', version: '1.13.0' }));
      writeFileSync(join(dir, 'broken.json'), '{');
      expect(readCliVersion(join(dir, 'package.json'))).toBe('1.13.0');
      expect(readCliVersion(join(dir, 'broken.json'))).toBeUndefined();
      expect(readCliVersion(join(dir, 'missing.json'))).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

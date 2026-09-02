import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CliEntryNotFoundError, resolveCliEntry } from '../src/cliEntry.js';

describe('resolveCliEntry', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('finds the bundled CLI under node_modules/seemore/dist/cli/index.js', () => {
    dir = mkdtempSync(join(tmpdir(), 'seemore-vscode-ext-'));
    const entry = join(dir, 'node_modules', 'seemore', 'dist', 'cli', 'index.js');
    mkdirSync(join(dir, 'node_modules', 'seemore', 'dist', 'cli'), { recursive: true });
    writeFileSync(entry, '// stub');

    expect(resolveCliEntry({ extensionPath: dir })).toBe(entry);
  });

  it('throws a real error, not undefined, when the bundled CLI is missing', () => {
    dir = mkdtempSync(join(tmpdir(), 'seemore-vscode-ext-'));
    expect(() => resolveCliEntry({ extensionPath: dir })).toThrow(CliEntryNotFoundError);
  });

  it('prefers an explicit override over the bundled copy', () => {
    dir = mkdtempSync(join(tmpdir(), 'seemore-vscode-ext-'));
    const bundled = join(dir, 'node_modules', 'seemore', 'dist', 'cli', 'index.js');
    mkdirSync(join(dir, 'node_modules', 'seemore', 'dist', 'cli'), { recursive: true });
    writeFileSync(bundled, '// stub');

    const override = join(dir, 'dev-cli.js');
    writeFileSync(override, '// dev stub');

    expect(resolveCliEntry({ extensionPath: dir, override })).toBe(override);
  });

  it('reports the override path in the error when it does not exist', () => {
    dir = mkdtempSync(join(tmpdir(), 'seemore-vscode-ext-'));
    const missing = join(dir, 'nope.js');
    expect(() => resolveCliEntry({ extensionPath: dir, override: missing })).toThrow(/seemore\.path/);
  });

  it('ignores a blank override and falls back to the bundled copy', () => {
    dir = mkdtempSync(join(tmpdir(), 'seemore-vscode-ext-'));
    const entry = join(dir, 'node_modules', 'seemore', 'dist', 'cli', 'index.js');
    mkdirSync(join(dir, 'node_modules', 'seemore', 'dist', 'cli'), { recursive: true });
    writeFileSync(entry, '// stub');

    expect(resolveCliEntry({ extensionPath: dir, override: '  ' })).toBe(entry);
  });
});

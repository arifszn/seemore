import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const CLI = join(import.meta.dirname, '..', 'src', 'cli', 'index.ts');
const KEEP_ALIVE = pathToFileURL(join(import.meta.dirname, 'stubs', 'keep-alive.mjs')).href;
// Resolved here, not by name: the child runs in a temp directory, where `jiti` isn't installed.
const JITI_REGISTER = pathToFileURL(
  join(dirname(createRequire(import.meta.url).resolve('jiti/package.json')), 'lib', 'jiti-register.mjs'),
).href;

/** Runs the CLI from source with the event loop held open; resolves with the exit code. */
function run(args: string[], cwd: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', JITI_REGISTER, '--import', KEEP_ALIVE, CLI, ...args], {
      cwd,
      stdio: 'ignore',
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`seemore ${args.join(' ')} did not exit on its own`));
    }, 50_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

describe('one-shot commands exit when they finish', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('exits 0 after a successful build, even with the event loop held open', async () => {
    dir = mkdtempSync(join(tmpdir(), 'seemore-exit-ok-'));
    const site = join(dir, 'site');
    mkdirSync(site);
    writeFileSync(join(site, 'index.md'), '# Home\n');

    expect(await run(['build', 'site', '--out', 'dist'], dir)).toBe(0);
  });

  it('exits 1 after a failed build', async () => {
    dir = mkdtempSync(join(tmpdir(), 'seemore-exit-fail-'));
    // Two files, one route: a build error.
    writeFileSync(join(dir, 'Page.md'), '# One\n');
    writeFileSync(join(dir, 'page.mdx'), '# Two\n');

    expect(await run(['build', '.', '--out', join(dir, 'dist')], dir)).toBe(1);
  });

  it('exits after --version', async () => {
    dir = mkdtempSync(join(tmpdir(), 'seemore-exit-version-'));
    expect(await run(['--version'], dir)).toBe(0);
  });
});

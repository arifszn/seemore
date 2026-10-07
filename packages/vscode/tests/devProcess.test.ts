import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { spawnDevServer } from '../src/devProcess.js';

describe('spawnDevServer', () => {
  let scriptDir: string;

  afterEach(async () => {
    if (scriptDir) await removeWhenFree(scriptDir);
  });

  /**
   * Deletes a test folder. On Windows a server killed by spawnDevServer itself (the timeout
   * case, which hands the test no process to wait for) can hold the folder as its cwd for a
   * while, so this waits without blocking, and leaves the temp folder behind rather than
   * failing a test over cleanup.
   */
  async function removeWhenFree(dir: string): Promise<void> {
    for (let waited = 0; ; waited += 200) {
      try {
        rmSync(dir, { recursive: true, force: true });
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EBUSY' && code !== 'EPERM') throw error;
        if (waited >= 10_000) return;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }

  /** Kills the server and waits for it to exit: on Windows its cwd can't be deleted before. */
  function stop(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      child.once('exit', () => resolve());
      child.kill();
    });
  }

  function script(body: string): string {
    scriptDir = mkdtempSync(join(tmpdir(), 'seemore-vscode-devproc-'));
    const file = join(scriptDir, 'fake-cli.js');
    writeFileSync(file, body);
    return file;
  }

  it('resolves once a valid ready line is printed, ignoring noise around it', async () => {
    const cliEntry = script(`
      console.log('seemore  starting…');
      console.log(JSON.stringify({ url: 'http://localhost:9999/', port: 9999, contentRoot: process.argv[2], pageCount: 2 }));
    `);

    const result = await spawnDevServer({ cliEntry, root: scriptDir });
    try {
      expect(result.ready).toEqual({ url: 'http://localhost:9999/', port: 9999, contentRoot: scriptDir, pageCount: 2 });
    } finally {
      await stop(result.process);
    }
  });

  it('runs the server with its cwd set to the root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'seemore-vscode-cwd-'));
    const cliEntry = script(`
      console.log(JSON.stringify({ url: 'http://localhost:9999/', port: 9999, contentRoot: process.cwd(), pageCount: 0 }));
    `);

    try {
      const result = await spawnDevServer({ cliEntry, root });
      await stop(result.process);
      expect(realpathSync(result.ready.contentRoot)).toBe(realpathSync(root));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('drains the server output after readiness instead of buffering it', async () => {
    const cliEntry = script(`
      console.log(JSON.stringify({ url: 'http://localhost:9999/', port: 9999, contentRoot: '/repo/docs', pageCount: 2 }));
      setInterval(() => { console.log('post-ready log line'); }, 10);
    `);

    const result = await spawnDevServer({ cliEntry, root: scriptDir });
    try {
      // Settle detaches readline, which leaves stdout paused; a paused pipe fills until
      // the child blocks on write, so both streams have to be draining afterwards.
      expect(result.process.stdout.readableFlowing).toBe(true);
      expect(result.process.stderr.listenerCount('data')).toBe(0);
    } finally {
      await stop(result.process);
    }
  });

  it('rejects when the process exits before printing a ready line', async () => {
    const cliEntry = script(`
      console.error('fatal: something went wrong');
      process.exit(1);
    `);

    await expect(spawnDevServer({ cliEntry, root: scriptDir })).rejects.toThrow(/exited before it was ready/);
  });

  it('rejects with a clear message when the root does not exist', async () => {
    const cliEntry = script(`console.log('unreachable');`);

    await expect(spawnDevServer({ cliEntry, root: join(scriptDir, 'gone') })).rejects.toThrow(/no longer exists/);
  });

  it('rejects on a timeout when nothing readable ever arrives', async () => {
    const cliEntry = script(`setInterval(() => {}, 1000);`);

    await expect(spawnDevServer({ cliEntry, root: scriptDir, timeoutMs: 200 })).rejects.toThrow(
      /did not report readiness/,
    );
  });
});

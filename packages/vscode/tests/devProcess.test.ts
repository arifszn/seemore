import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildDevArgs, parseReadyLine, spawnDevServer } from '../src/devProcess.js';

describe('parseReadyLine', () => {
  it('parses a well-formed ready line', () => {
    const line = JSON.stringify({ url: 'http://localhost:5173/', port: 5173, contentRoot: '/repo/docs', pageCount: 3 });
    expect(parseReadyLine(line)).toEqual({
      url: 'http://localhost:5173/',
      port: 5173,
      contentRoot: '/repo/docs',
      pageCount: 3,
    });
  });

  it('rejects a line that is not JSON', () => {
    expect(parseReadyLine('  seemore  http://localhost:4040/')).toBeUndefined();
  });

  it('rejects JSON missing a required field', () => {
    expect(parseReadyLine(JSON.stringify({ url: 'http://localhost:4040/', port: 4040 }))).toBeUndefined();
  });

  it('rejects JSON with a field of the wrong type', () => {
    const line = JSON.stringify({ url: 'http://localhost:4040/', port: '4040', contentRoot: '/repo', pageCount: 1 });
    expect(parseReadyLine(line)).toBeUndefined();
  });

  it('rejects a bare JSON value that is not an object', () => {
    expect(parseReadyLine('42')).toBeUndefined();
    expect(parseReadyLine('null')).toBeUndefined();
  });
});

describe('buildDevArgs', () => {
  it('always requests an ephemeral port, no open, and JSON output', () => {
    expect(buildDevArgs('/repo/docs')).toEqual(['/repo/docs', '--port', '0', '--no-open', '--json']);
  });
});

describe('spawnDevServer', () => {
  let scriptDir: string;

  afterEach(() => {
    if (scriptDir) rmSync(scriptDir, { recursive: true, force: true });
  });

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

    const result = await spawnDevServer({ cliEntry, root: '/repo/docs' });
    try {
      expect(result.ready).toEqual({ url: 'http://localhost:9999/', port: 9999, contentRoot: '/repo/docs', pageCount: 2 });
    } finally {
      result.process.kill();
    }
  });

  it('drains the server output after readiness instead of buffering it', async () => {
    const cliEntry = script(`
      console.log(JSON.stringify({ url: 'http://localhost:9999/', port: 9999, contentRoot: '/repo/docs', pageCount: 2 }));
      setInterval(() => { console.log('post-ready log line'); }, 10);
    `);

    const result = await spawnDevServer({ cliEntry, root: '/repo/docs' });
    try {
      // Settle detaches readline, which leaves stdout paused; a paused pipe fills until
      // the child blocks on write, so both streams have to be draining afterwards.
      expect(result.process.stdout.readableFlowing).toBe(true);
      expect(result.process.stderr.listenerCount('data')).toBe(0);
    } finally {
      result.process.kill();
    }
  });

  it('rejects when the process exits before printing a ready line', async () => {
    const cliEntry = script(`
      console.error('fatal: something went wrong');
      process.exit(1);
    `);

    await expect(spawnDevServer({ cliEntry, root: '/repo/docs' })).rejects.toThrow(/exited before it was ready/);
  });

  it('rejects on a timeout when nothing readable ever arrives', async () => {
    const cliEntry = script(`setInterval(() => {}, 1000);`);

    await expect(spawnDevServer({ cliEntry, root: '/repo/docs', timeoutMs: 200 })).rejects.toThrow(
      /did not report readiness/,
    );
  });
});

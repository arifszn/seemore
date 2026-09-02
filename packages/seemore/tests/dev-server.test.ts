import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDev, type DevReady, type DevServer } from '../src/cli/dev.js';

describe('dev server machine-readable ready line', () => {
  let contentRoot: string;
  let dev: DevServer | undefined;

  afterEach(async () => {
    await dev?.close();
    dev = undefined;
    if (contentRoot) rmSync(contentRoot, { recursive: true, force: true });
  });

  it('prints exactly one JSON line describing the running server', async () => {
    contentRoot = mkdtempSync(join(tmpdir(), 'seemore-json-'));
    writeFileSync(join(contentRoot, 'a.md'), '# A\n');
    writeFileSync(join(contentRoot, 'b.md'), '# B\n');

    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((line: string) => {
      lines.push(line);
    });

    dev = await runDev({ cwd: contentRoot, port: 0, json: true });
    spy.mockRestore();

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!) as DevReady;
    expect(parsed).toEqual({
      url: dev.url,
      port: expect.any(Number),
      contentRoot: dev.ctx.contentRoot,
      pageCount: 2,
    });
    expect(parsed.port).toBeGreaterThan(0);
  });

  it('prints the human summary, not JSON, when json is not requested', async () => {
    contentRoot = mkdtempSync(join(tmpdir(), 'seemore-human-'));
    writeFileSync(join(contentRoot, 'a.md'), '# A\n');

    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((line: string) => {
      lines.push(line);
    });

    dev = await runDev({ cwd: contentRoot, port: 0 });
    spy.mockRestore();

    expect(lines.some((line) => line.includes('seemore'))).toBe(true);
    expect(() => JSON.parse(lines.join(''))).toThrow();
  });
});

describe('dev-only route endpoint', () => {
  let contentRoot: string;
  let dev: DevServer | undefined;

  afterEach(async () => {
    await dev?.close();
    dev = undefined;
    if (contentRoot) rmSync(contentRoot, { recursive: true, force: true });
  });

  it('resolves an absolute file path to its site URL', async () => {
    contentRoot = mkdtempSync(join(tmpdir(), 'seemore-route-'));
    mkdirSync(join(contentRoot, 'guide'));
    writeFileSync(join(contentRoot, 'guide', 'intro.md'), '# Intro\n');

    dev = await runDev({ cwd: contentRoot, port: 0 });
    // The server canonicalises the root through the filesystem; address files by the
    // spelling it uses (see watcher.test.ts for the same pattern).
    contentRoot = dev.ctx.contentRoot;

    const absFile = join(contentRoot, 'guide', 'intro.md');
    const res = await fetch(`${new URL(dev.url).origin}/__seemore/route?file=${encodeURIComponent(absFile)}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: '/guide/intro' });
  });

  it('404s for a file that is not part of the corpus', async () => {
    contentRoot = mkdtempSync(join(tmpdir(), 'seemore-route-404-'));
    writeFileSync(join(contentRoot, 'a.md'), '# A\n');

    dev = await runDev({ cwd: contentRoot, port: 0 });
    contentRoot = dev.ctx.contentRoot;

    const missing = join(contentRoot, 'missing.md');
    const res = await fetch(`${new URL(dev.url).origin}/__seemore/route?file=${encodeURIComponent(missing)}`);

    expect(res.status).toBe(404);
    expect((await res.json()) as { error: string }).toMatchObject({ error: expect.any(String) });
  });

  it('resolves a file addressed through a symlinked, non-canonical spelling of the same path', async () => {
    // The real bug this guards: an editor hands over `document.uri.fsPath`, which has no
    // reason to be the canonical spelling (macOS's /tmp -> /private/tmp is the everyday
    // case). `resolve()` alone doesn't fix that; only a real filesystem lookup does.
    const real = mkdtempSync(join(tmpdir(), 'seemore-route-real-'));
    writeFileSync(join(real, 'a.md'), '# A\n');
    const aliasParent = mkdtempSync(join(tmpdir(), 'seemore-route-alias-'));
    const alias = join(aliasParent, 'alias');
    symlinkSync(real, alias, 'dir');

    try {
      dev = await runDev({ cwd: alias, port: 0 });
      contentRoot = dev.ctx.contentRoot;

      const res = await fetch(
        `${new URL(dev.url).origin}/__seemore/route?file=${encodeURIComponent(join(alias, 'a.md'))}`,
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ url: '/a' });
    } finally {
      rmSync(aliasParent, { recursive: true, force: true });
      rmSync(real, { recursive: true, force: true });
    }
  });

  it('400s when the file query parameter is missing', async () => {
    contentRoot = mkdtempSync(join(tmpdir(), 'seemore-route-400-'));
    writeFileSync(join(contentRoot, 'a.md'), '# A\n');

    dev = await runDev({ cwd: contentRoot, port: 0 });

    const res = await fetch(`${new URL(dev.url).origin}/__seemore/route`);
    expect(res.status).toBe(400);
  });
});

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compile } from '@mdx-js/mdx';
import { runDev, type DevReady, type DevServer } from '../src/cli/dev.js';
import { rehypeSeemoreRawHtml } from '../src/node/vite/raw.js';

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

  it('stays open with `auth` set, needing no password, and says so once', async () => {
    contentRoot = mkdtempSync(join(tmpdir(), 'seemore-auth-dev-'));
    writeFileSync(join(contentRoot, 'a.md'), '# A\n');
    writeFileSync(join(contentRoot, 'seemore.config.ts'), "export default { title: 'Vault', auth: true };");

    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((line: string) => {
      lines.push(line);
    });

    dev = await runDev({ cwd: contentRoot, port: 0 });
    spy.mockRestore();

    expect(lines.filter((line) => line.includes('auth is build-only'))).toHaveLength(1);
    const html = await (await fetch(dev.url)).text();
    expect(html).toContain('<div id="root">');
    expect(html).not.toContain('seemore-auth');
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

describe('config discovery when a directory is given', () => {
  let workspace: string;
  let dev: DevServer | undefined;

  afterEach(async () => {
    await dev?.close();
    dev = undefined;
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  });

  /**
   * An editor extension spawns `seemore <dir>` from whatever cwd the host happens to have,
   * which is never the documented folder. Discovering the config from the cwd meant that
   * config was silently ignored and every such site fell back to the untitled defaults.
   */
  it('reads the config from the directory argument, not the cwd', async () => {
    workspace = mkdtempSync(join(tmpdir(), 'seemore-cwd-'));
    const site = join(workspace, 'site');
    mkdirSync(site);
    writeFileSync(join(site, 'index.md'), '# Home\n');
    writeFileSync(
      join(site, 'seemore.config.ts'),
      "export default { title: 'From The Content Root', theme: 'vitepress' };\n",
    );

    dev = await runDev({ cwd: workspace, dir: 'site', port: 0 });

    expect(dev.ctx.config.title).toBe('From The Content Root');
    expect(dev.ctx.config.theme).toBe('vitepress');
  });

  it('still resolves an explicit --config relative to the cwd', async () => {
    workspace = mkdtempSync(join(tmpdir(), 'seemore-explicit-'));
    const site = join(workspace, 'site');
    mkdirSync(site);
    writeFileSync(join(site, 'index.md'), '# Home\n');
    writeFileSync(join(workspace, 'custom.config.ts'), "export default { title: 'Named By Flag' };\n");

    dev = await runDev({ cwd: workspace, dir: 'site', configPath: 'custom.config.ts', port: 0 });

    expect(dev.ctx.config.title).toBe('Named By Flag');
  });
});

describe('dev-only page and site endpoints', () => {
  let contentRoot: string;
  let dev: DevServer | undefined;

  afterEach(async () => {
    await dev?.close();
    dev = undefined;
    if (contentRoot) rmSync(contentRoot, { recursive: true, force: true });
  });

  const start = async (config: string) => {
    contentRoot = mkdtempSync(join(tmpdir(), 'seemore-page-'));
    mkdirSync(join(contentRoot, 'guide'));
    writeFileSync(join(contentRoot, 'index.md'), '# Home\n');
    writeFileSync(join(contentRoot, 'guide', 'intro.md'), '# Intro\n');
    writeFileSync(join(contentRoot, 'seemore.config.ts'), config);
    dev = await runDev({ cwd: contentRoot, port: 0 });
    contentRoot = dev.ctx.contentRoot;
    return new URL(dev.url).origin;
  };

  const page = (origin: string, url: string) =>
    fetch(`${origin}/__seemore/page?url=${encodeURIComponent(url)}`);

  it('maps a URL, base included, back to its source file', async () => {
    const origin = await start("export default { title: 'Docs', base: '/docs/' };");

    for (const url of ['/docs/guide/intro', '/docs/guide/intro/', '/docs/guide/intro?x=1#top']) {
      const res = await page(origin, url);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ file: join(contentRoot, 'guide', 'intro.md') });
    }
    for (const url of ['/docs/', '/docs']) {
      expect(await (await page(origin, url)).json()).toEqual({ file: join(contentRoot, 'index.md') });
    }
  });

  it('404s for a URL no page is served at, and 400s without one', async () => {
    const origin = await start("export default { title: 'Docs' };");

    expect((await page(origin, '/nope')).status).toBe(404);
    expect((await fetch(`${origin}/__seemore/page`)).status).toBe(400);
  });

  it('reports base, pageActions and whether auth is set, never its settings', async () => {
    const origin = await start(
      "export default { title: 'Docs', base: '/docs/', pageActions: ['copy-markdown'], auth: { id: 'vault' } };",
    );

    const res = await fetch(`${origin}/__seemore/site`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ base: '/docs/', pageActions: ['copy-markdown'], auth: true });
  });

  it('reads the config afresh, so an edit during the session shows up', async () => {
    const origin = await start("export default { title: 'Docs' };");
    expect(((await (await fetch(`${origin}/__seemore/site`)).json()) as { auth: boolean }).auth).toBe(false);

    writeFileSync(join(contentRoot, 'seemore.config.ts'), "export default { title: 'Docs', pageActions: [] };");
    expect(await (await fetch(`${origin}/__seemore/site`)).json()).toMatchObject({ pageActions: [] });
  });
});

describe('.markdown pages', () => {
  let contentRoot: string;
  let dev: DevServer | undefined;

  afterEach(async () => {
    await dev?.close();
    dev = undefined;
    if (contentRoot) rmSync(contentRoot, { recursive: true, force: true });
  });

  it('are scanned and routed like .md', async () => {
    contentRoot = mkdtempSync(join(tmpdir(), 'seemore-markdown-ext-'));
    writeFileSync(join(contentRoot, 'index.md'), '# Home\n');
    writeFileSync(join(contentRoot, 'notes.markdown'), '# Notes\n\nPress <kbd>K</kbd>.\n');

    dev = await runDev({ cwd: contentRoot, port: 0 });
    contentRoot = dev.ctx.contentRoot;
    const file = join(contentRoot, 'notes.markdown');

    const res = await fetch(`${new URL(dev.url).origin}/__seemore/route?file=${encodeURIComponent(file)}`);
    expect(await res.json()).toEqual({ url: '/notes' });
  });

  it('get their raw HTML rendered, as .md does and .mdx does not', async () => {
    const render = async (path: string) =>
      String(
        await compile(
          { value: 'Press <kbd>K</kbd>.\n', path },
          { format: 'md', rehypePlugins: [rehypeSeemoreRawHtml], jsx: true },
        ),
      );

    expect(await render('/site/notes.markdown')).toContain('<_components.kbd>');
    expect(await render('/site/notes.md')).toContain('<_components.kbd>');
    expect(await render('/site/notes.mdx')).not.toContain('<_components.kbd>');
  });
});

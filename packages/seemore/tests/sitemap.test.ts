import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runBuild } from '../src/cli/build.js';
import { buildSitemap, normaliseSite } from '../src/node/prerender/sitemap.js';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'site');

describe('normaliseSite', () => {
  it('leaves the sitemap off when unset', () => {
    expect(normaliseSite(undefined)).toBeUndefined();
    expect(normaliseSite('')).toBeUndefined();
  });

  it('keeps the origin and drops a trailing slash', () => {
    expect(normaliseSite('https://example.com/')).toBe('https://example.com');
    expect(normaliseSite('http://localhost:4040')).toBe('http://localhost:4040');
  });

  it('rejects anything that is not an http(s) origin', () => {
    expect(() => normaliseSite('example.com')).toThrow(/Invalid `site`/);
    expect(() => normaliseSite('ftp://example.com')).toThrow(/http/);
    expect(() => normaliseSite('https://example.com/docs')).toThrow(/base: '\/docs'/);
    expect(() => normaliseSite('https://example.com/?a=1')).toThrow(/origin only/);
  });
});

describe('buildSitemap', () => {
  it('lists each route in its trailing-slash form, under the base', () => {
    const xml = buildSitemap('https://example.com', '/my-repo/', ['/', '/guide', '/guide/deep-dive/']);
    expect(xml).toContain('<loc>https://example.com/my-repo/</loc>');
    expect(xml).toContain('<loc>https://example.com/my-repo/guide/</loc>');
    expect(xml).toContain('<loc>https://example.com/my-repo/guide/deep-dive/</loc>');
  });

  it('uses the root when there is no base', () => {
    const xml = buildSitemap('https://example.com', '/', ['/', '/guide']);
    expect(xml).toContain('<loc>https://example.com/</loc>');
    expect(xml).toContain('<loc>https://example.com/guide/</loc>');
  });

  it('percent-encodes unicode slugs and escapes XML', () => {
    const xml = buildSitemap('https://example.com', '/', ['/guía', '/a&b']);
    expect(xml).toContain('<loc>https://example.com/gu%C3%ADa/</loc>');
    expect(xml).toContain('<loc>https://example.com/a&amp;b/</loc>');
  });

  it('carries no lastmod', () => {
    expect(buildSitemap('https://example.com', '/', ['/'])).not.toContain('lastmod');
  });
});

describe('seemore build with site', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'seemore-sitemap-'));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  async function build(name: string, config: string): Promise<string> {
    const outDir = join(root, name);
    writeFileSync(join(root, `${name}.config.ts`), config);
    await runBuild({ cwd: FIXTURE, configPath: join(root, `${name}.config.ts`), outDir });
    return outDir;
  }

  it('writes sitemap.xml with one URL per page', async () => {
    const outDir = await build('on', "export default { title: 'Fixture', site: 'https://example.com', base: '/docs/' };");
    const xml = readFileSync(join(outDir, 'sitemap.xml'), 'utf8');
    expect(xml).toContain('<loc>https://example.com/docs/</loc>');
    expect(xml).toContain('<loc>https://example.com/docs/getting-started/</loc>');
    expect(xml).not.toContain('404');
    expect(xml).not.toContain('200.html');
  }, 300_000);

  it('writes nothing under `auth`, which publishes no route slugs', async () => {
    process.env.SEEMORE_PASSWORD = 'correct horse battery staple';
    try {
      const outDir = await build('auth', "export default { title: 'Fixture', site: 'https://example.com', auth: true };");
      expect(existsSync(join(outDir, 'sitemap.xml'))).toBe(false);
    } finally {
      delete process.env.SEEMORE_PASSWORD;
    }
  }, 300_000);

  it('writes nothing without `site`', async () => {
    const outDir = await build('off', "export default { title: 'Fixture' };");
    expect(existsSync(join(outDir, 'sitemap.xml'))).toBe(false);
  }, 300_000);
});

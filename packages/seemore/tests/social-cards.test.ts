import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { globSync } from 'tinyglobby';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runBuild } from '../src/cli/build.js';
import { ogImageUrl } from '../src/shared/og.js';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'site');

describe('ogImageUrl', () => {
  it('is absolute under the base when the origin is set', () => {
    expect(ogImageUrl('https://example.com', '/my-repo/', '/guide')).toBe('https://example.com/my-repo/api/og/guide/card.png');
    expect(ogImageUrl('https://example.com', '/', '/')).toBe('https://example.com/api/og/card.png');
  });

  it('stays root-relative without an origin', () => {
    expect(ogImageUrl(undefined, '/my-repo/', '/guide')).toBe('/my-repo/api/og/guide/card.png');
  });
});

describe('seemore build with social.cards', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'seemore-social-'));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  async function build(name: string, config: string, cwd = FIXTURE): Promise<{ outDir: string; warnings: string }> {
    const outDir = join(root, name);
    writeFileSync(join(root, `${name}.config.ts`), config);
    const warn = vi.spyOn(console, 'warn');
    try {
      await runBuild({ cwd, configPath: join(root, `${name}.config.ts`), outDir });
      return { outDir, warnings: warn.mock.calls.flat().join('\n') };
    } finally {
      warn.mockRestore();
    }
  }

  function meta(html: string, attr: 'property' | 'name', key: string): string | undefined {
    return new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`).exec(html)?.[1];
  }

  it('points og:image and twitter:image at the card by absolute URL', async () => {
    const { outDir, warnings } = await build(
      'on',
      "export default { title: 'Fixture', url: 'https://example.com', base: '/my-repo/', features: { 'social.cards': true } };",
    );

    const pages = globSync('**/index.html', { cwd: outDir });
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      const slug = dirname(page);
      const card = slug === '.' ? 'api/og/card.png' : `api/og/${slug}/card.png`;
      const html = readFileSync(join(outDir, page), 'utf8');
      const expected = `https://example.com/my-repo/${card}`;
      expect(meta(html, 'property', 'og:image')).toBe(expected);
      expect(meta(html, 'name', 'twitter:image')).toBe(expected);
      expect(existsSync(join(outDir, card))).toBe(true);
    }
    const notFound = readFileSync(join(outDir, '404.html'), 'utf8');
    expect(meta(notFound, 'property', 'og:image')).toBeUndefined();
    expect(meta(notFound, 'name', 'twitter:image')).toBeUndefined();
    expect(warnings).not.toContain('`social.cards` needs `url`');
  }, 300_000);

  it('warns without `url`', async () => {
    const { outDir, warnings } = await build('no-url', "export default { title: 'Fixture', features: { 'social.cards': true } };");
    const html = readFileSync(join(outDir, 'getting-started', 'index.html'), 'utf8');
    expect(meta(html, 'property', 'og:image')).toBe('/api/og/getting-started/card.png');
    expect(warnings).toContain('`social.cards` needs `url`');
  }, 300_000);

  it('adds no image tags to a generated index, which has no card', async () => {
    const content = join(root, 'no-index');
    mkdirSync(content);
    writeFileSync(join(content, 'guide.md'), '---\ntitle: Guide\n---\n\nText.\n');
    const { outDir } = await build(
      'no-index-out',
      "export default { title: 'Fixture', url: 'https://example.com', features: { 'social.cards': true } };",
      content,
    );
    const home = readFileSync(join(outDir, 'index.html'), 'utf8');
    expect(meta(home, 'property', 'og:image')).toBeUndefined();
    expect(meta(home, 'name', 'twitter:image')).toBeUndefined();
    expect(meta(readFileSync(join(outDir, 'guide', 'index.html'), 'utf8'), 'property', 'og:image')).toBe(
      'https://example.com/api/og/guide/card.png',
    );
  }, 300_000);
});

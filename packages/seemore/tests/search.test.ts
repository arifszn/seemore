import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/node/config/load.js';
import { createContext } from '../src/node/context.js';
import { SIZE_WARNING_BYTES, buildSearchIndex, formatBytes, measureIndex, toSearchableText } from '../src/node/search/build.js';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'seemore-search-'));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

describe('search index', () => {
  it('indexes every page, with its heading structure', async () => {
    const contentRoot = fixture({
      'index.md': '---\ntitle: Home\n---\n\n# Home\n\nAn opening paragraph.\n',
      'guide/deep.md': '---\ntitle: Deep\n---\n\n# Deep\n\n## A section\n\nSomething findable.\n',
    });
    const ctx = createContext({ config: resolveConfig({}, { root: contentRoot }), contentRoot });

    const index = await buildSearchIndex(ctx);
    expect(index).toContain('/guide/deep');
    expect(index).toContain('A section');
    expect(index).toContain('Something findable');
  });

  it('indexes the body only, never the frontmatter block', async () => {
    const contentRoot = fixture({
      'a.md': '---\ntitle: A\nsecretkey: notsearchable\n---\n\n# A\n\nReal body text.\n',
    });
    const ctx = createContext({ config: resolveConfig({}, { root: contentRoot }), contentRoot });

    const index = await buildSearchIndex(ctx);
    expect(index).toContain('Real body text');
    expect(index).not.toContain('secretkey');
  });

  it('points index entries at based URLs', async () => {
    const contentRoot = fixture({ 'a.md': '---\ntitle: A\n---\n\n# A\n' });
    const ctx = createContext({ config: resolveConfig({ base: '/sub/' }, { root: contentRoot }), contentRoot });

    expect(await buildSearchIndex(ctx)).toContain('/sub/a');
  });
});

describe('index size warning', () => {
  it('stays quiet for an index that costs little to download', () => {
    const size = measureIndex(JSON.stringify({ records: 'small' }));
    expect(size.warning).toBeUndefined();
    expect(size.bytes).toBeGreaterThan(0);
    expect(size.gzipped).toBeGreaterThan(0);
  });

  it('warns past the threshold, naming the size and the escape hatch', () => {
    // Random text, because gzip would collapse anything repetitive and never reach the
    // threshold — which is also what a real index of prose looks like to a compressor.
    const chunks: string[] = [];
    let length = 0;
    while (length < SIZE_WARNING_BYTES * 3) {
      const chunk = Math.random().toString(36).slice(2);
      chunks.push(chunk);
      length += chunk.length;
    }

    const size = measureIndex(JSON.stringify({ payload: chunks.join('') }));
    expect(size.gzipped).toBeGreaterThan(SIZE_WARNING_BYTES);
    expect(size.warning).toContain('orama-cloud');
    expect(size.warning).toContain('algolia');
    expect(size.warning).toContain(formatBytes(size.gzipped));
  });
});

describe('formatBytes', () => {
  it.each([
    [512, '512 B'],
    [2048, '2.0 kB'],
    [1_572_864, '1.50 MB'],
  ])('%i → %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe('toSearchableText', () => {
  it('collapses wikilinks to their label, or the linked file name', () => {
    expect(toSearchableText('See [[specs/auth-spec|the auth spec]] first.')).toBe('See the auth spec first.');
    expect(toSearchableText('What changed in [[adr/0001-static-export]]?')).toBe('What changed in 0001-static-export?');
    expect(toSearchableText('Anchor target [[Page#Heading]] here.')).toBe('Anchor target Page here.');
  });

  it('drops admonition markers but keeps the quoted content', () => {
    const body = '> [!WARNING]\n> The old cookie pair stays alive.';
    expect(toSearchableText(body)).toBe('>\n> The old cookie pair stays alive.');
  });

  it('leaves ordinary markdown alone', () => {
    const body = '# Title\n\nA [link](https://example.com) and `code`.';
    expect(toSearchableText(body)).toBe(body);
  });
});

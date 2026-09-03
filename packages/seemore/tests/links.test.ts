import { describe, expect, it } from 'vitest';
import { createLinkResolver } from '../src/node/content/links.js';
import type { ContentPage } from '../src/node/content/scan.js';
import { toRoute } from '../src/node/content/slug.js';

function pages(...files: string[]): ContentPage[] {
  return files.map((file) => ({
    ...toRoute(file),
    absPath: `/content/${file}`,
    version: 'v1',
    data: { title: file.replace(/\.mdx?$/, '') },
  }));
}

const corpus = pages(
  'index.md',
  'getting-started.md',
  'guide/index.md',
  'guide/Deep Dive.md',
  'guide/nested/page.md',
  'reference/page.md',
);

describe('relative markdown links', () => {
  const resolve = (href: string, from: string) => createLinkResolver(corpus, '/').resolveHref(href, from);

  it('resolves a sibling .md file to its route', () => {
    expect(resolve('./Deep Dive.md', 'guide/index.md').href).toBe('/guide/deep-dive');
  });

  it('resolves a bare sibling filename', () => {
    expect(resolve('Deep Dive.md', 'guide/index.md').href).toBe('/guide/deep-dive');
  });

  it('resolves a parent-relative link', () => {
    expect(resolve('../getting-started.md', 'guide/index.md').href).toBe('/getting-started');
  });

  it('resolves a link into a nested directory', () => {
    expect(resolve('./nested/page.md', 'guide/index.md').href).toBe('/guide/nested/page');
  });

  it('keeps the hash', () => {
    expect(resolve('./Deep Dive.md#Some Heading', 'guide/index.md').href).toBe('/guide/deep-dive#some-heading');
  });

  it('resolves .mdx as well as .md', () => {
    const local = createLinkResolver(pages('a.md', 'b.mdx'), '/');
    expect(local.resolveHref('./b.mdx', 'a.md').href).toBe('/b');
  });

  it('resolves a content-root-absolute link from the root, not from the linking file', () => {
    expect(resolve('/guide/Deep Dive.md', 'guide/index.md').href).toBe('/guide/deep-dive');
    expect(resolve('/getting-started.md', 'guide/nested/page.md').href).toBe('/getting-started');
  });

  it('warns on a broken relative link and leaves the href alone', () => {
    const result = resolve('./nope.md', 'guide/index.md');
    expect(result.href).toBe('./nope.md');
    expect(result.warning).toContain('nope.md');
    expect(result.warning).toContain('guide/index.md');
  });

  it('leaves external, absolute, hash-only and non-markdown links untouched', () => {
    for (const href of ['https://example.com', 'mailto:a@b.c', '/already//absolute', '#heading', './diagram.png']) {
      const result = resolve(href, 'guide/index.md');
      expect(result.href).toBe(href);
      expect(result.warning).toBeUndefined();
    }
  });

  it('applies the base path', () => {
    const based = createLinkResolver(corpus, '/sub/');
    expect(based.resolveHref('./Deep Dive.md', 'guide/index.md').href).toBe('/sub/guide/deep-dive');
  });
});

describe('wikilinks', () => {
  const resolve = (target: string, from = 'index.md') => createLinkResolver(corpus, '/').resolveWikilink(target, from);

  it('resolves [[Page Name]] by basename', () => {
    const result = resolve('Deep Dive');
    expect(result.href).toBe('/guide/deep-dive');
    expect(result.label).toBe('Deep Dive');
  });

  it('resolves [[Page Name|label]]', () => {
    const result = resolve('Deep Dive|the deep one');
    expect(result.href).toBe('/guide/deep-dive');
    expect(result.label).toBe('the deep one');
  });

  it('resolves [[Page Name#Heading]]', () => {
    const result = resolve('Deep Dive#Some Heading');
    expect(result.href).toBe('/guide/deep-dive#some-heading');
    expect(result.label).toBe('Deep Dive#Some Heading');
  });

  it('resolves [[Page#Heading|label]]', () => {
    const result = resolve('Deep Dive#Some Heading|look here');
    expect(result.href).toBe('/guide/deep-dive#some-heading');
    expect(result.label).toBe('look here');
  });

  it('prefers an exact path match over a basename match', () => {
    const local = createLinkResolver(pages('page.md', 'guide/page.md'), '/');
    expect(local.resolveWikilink('guide/page', 'index.md').href).toBe('/guide/page');
  });

  it('resolves a slugified basename', () => {
    expect(resolve('deep-dive').href).toBe('/guide/deep-dive');
  });

  it('warns and picks the shallowest path when a basename is ambiguous', () => {
    const local = createLinkResolver(pages('deep/nested/page.md', 'reference/page.md'), '/');
    const result = local.resolveWikilink('page', 'index.md');
    expect(result.href).toBe('/reference/page');
    expect(result.warning).toMatch(/ambiguous/i);
    expect(result.warning).toContain('deep/nested/page.md');
  });

  it('is deterministic when two ambiguous candidates sit at the same depth', () => {
    const local = createLinkResolver(pages('b/page.md', 'a/page.md'), '/');
    expect(local.resolveWikilink('page', 'index.md').href).toBe('/a/page');
  });

  it('reports an unresolved wikilink with no href, so it renders as plain text', () => {
    const result = resolve('No Such Page');
    expect(result.href).toBeUndefined();
    expect(result.label).toBe('No Such Page');
    expect(result.warning).toContain('No Such Page');
    expect(result.warning).toContain('index.md');
  });

  it('applies the base path', () => {
    const based = createLinkResolver(corpus, '/sub/');
    expect(based.resolveWikilink('Deep Dive', 'index.md').href).toBe('/sub/guide/deep-dive');
  });
});

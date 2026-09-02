import { describe, expect, it } from 'vitest';
import { resolveRoutes, slugifySegment, toRoute } from '../src/node/content/slug.js';
import { ogImagePath } from '../src/shared/og.js';

describe('toRoute: path → URL', () => {
  it.each([
    ['index.md', '/', [] as string[], 'index.html'],
    ['README.md', '/', [] as string[], 'index.html'],
    ['getting-started.md', '/getting-started', ['getting-started'], 'getting-started/index.html'],
    ['guide/index.md', '/guide', ['guide'], 'guide/index.html'],
    ['guide/Deep Dive.md', '/guide/deep-dive', ['guide', 'deep-dive'], 'guide/deep-dive/index.html'],
  ])('%s → %s', (file, url, slugs, output) => {
    const route = toRoute(file);
    expect(route.url).toBe(url);
    expect(route.slugs).toEqual(slugs);
    expect(route.output).toBe(output);
  });

  it('treats .mdx the same as .md', () => {
    expect(toRoute('guide/api.mdx').url).toBe('/guide/api');
  });

  it('slugifies every directory segment, not only the basename', () => {
    expect(toRoute('Getting Started/First Steps.md').url).toBe('/getting-started/first-steps');
  });

  it('preserves unicode letters', () => {
    expect(toRoute('guía/Página Uno.md').url).toBe('/guía/página-uno');
  });

  it('normalises windows separators', () => {
    expect(toRoute('guide\\deep\\page.md').url).toBe('/guide/deep/page');
  });

  it('marks index and README files as directory indexes', () => {
    expect(toRoute('guide/index.md').isIndex).toBe(true);
    expect(toRoute('guide/README.md').isIndex).toBe(true);
    expect(toRoute('guide/readme.md').isIndex).toBe(true);
    expect(toRoute('guide/other.md').isIndex).toBe(false);
  });

  it('never emits a trailing slash', () => {
    for (const file of ['a.md', 'a/b.md', 'a/index.md']) {
      expect(toRoute(file).url.endsWith('/')).toBe(false);
    }
  });
});

describe('slugifySegment', () => {
  it('lowercases and dashes', () => {
    expect(slugifySegment('Deep Dive')).toBe('deep-dive');
  });
  it('falls back to a stable value for segments that slugify to nothing', () => {
    expect(slugifySegment('...')).not.toBe('');
  });
});

describe('resolveRoutes', () => {
  it('returns one route per file', () => {
    const { routes, errors } = resolveRoutes(['index.md', 'a.md', 'b/c.md']);
    expect(routes.map((r) => r.url).sort()).toEqual(['/', '/a', '/b/c']);
    expect(errors).toEqual([]);
  });

  it('prefers index.md over README.md in the same directory, and warns', () => {
    const { routes, warnings, errors } = resolveRoutes(['guide/index.md', 'guide/README.md']);
    expect(errors).toEqual([]);
    expect(routes).toHaveLength(1);
    expect(routes[0]!.file).toBe('guide/index.md');
    expect(warnings.join('\n')).toContain('guide/README.md');
  });

  it('reports duplicate resolved slugs as errors listing every colliding file', () => {
    const { errors } = resolveRoutes(['Deep Dive.md', 'deep-dive.md']);
    expect(errors).toHaveLength(1);
    expect(errors[0]!).toContain('Deep Dive.md');
    expect(errors[0]!).toContain('deep-dive.md');
    expect(errors[0]!).toContain('/deep-dive');
  });

  it('is deterministic regardless of input order', () => {
    const a = resolveRoutes(['b.md', 'a.md', 'c/d.md']).routes.map((r) => r.url);
    const b = resolveRoutes(['c/d.md', 'a.md', 'b.md']).routes.map((r) => r.url);
    expect(a).toEqual(b);
  });
});

describe('ogImagePath', () => {
  it('gives every route its own directory, so no two routes collide', () => {
    expect(ogImagePath('/')).toBe('/api/og/card.png');
    expect(ogImagePath('/a/b')).toBe('/api/og/a/b/card.png');
    // Flattening `/a/b` to a filename would collide with this one.
    expect(ogImagePath('/a-b')).toBe('/api/og/a-b/card.png');
  });
});

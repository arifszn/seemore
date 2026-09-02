import { describe, expect, it } from 'vitest';
import { decodePath, normaliseBase, stripBase, withBase } from '../src/node/base.js';

describe('normaliseBase', () => {
  it.each([
    [undefined, '/'],
    ['', '/'],
    ['/', '/'],
    ['sub', '/sub/'],
    ['/sub', '/sub/'],
    ['sub/', '/sub/'],
    ['/sub/', '/sub/'],
    ['/a/b', '/a/b/'],
  ])('%s → %s', (input, expected) => {
    expect(normaliseBase(input)).toBe(expected);
  });

  it('rejects absolute URLs', () => {
    expect(() => normaliseBase('https://example.com/docs')).toThrow(/base/i);
  });
});

describe('withBase', () => {
  it('is the identity at the root base', () => {
    expect(withBase('/', '/guide/a')).toBe('/guide/a');
    expect(withBase('/', '/')).toBe('/');
  });

  it('prefixes under a subpath base', () => {
    expect(withBase('/sub/', '/guide/a')).toBe('/sub/guide/a');
    expect(withBase('/sub/', '/')).toBe('/sub/');
  });

  it('never doubles the base', () => {
    expect(withBase('/sub/', '/sub/guide')).toBe('/sub/guide');
  });

  it('leaves external and hash hrefs alone', () => {
    expect(withBase('/sub/', 'https://example.com')).toBe('https://example.com');
    expect(withBase('/sub/', 'mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(withBase('/sub/', '#heading')).toBe('#heading');
    expect(withBase('/sub/', 'relative/thing')).toBe('relative/thing');
  });
});

describe('stripBase', () => {
  it('removes the base prefix, keeping a leading slash', () => {
    expect(stripBase('/sub/', '/sub/guide/a')).toBe('/guide/a');
    expect(stripBase('/sub/', '/sub/')).toBe('/');
    expect(stripBase('/', '/guide/a')).toBe('/guide/a');
  });

  it('leaves unrelated paths alone', () => {
    expect(stripBase('/sub/', '/other')).toBe('/other');
  });
});

describe('decodePath', () => {
  it('decodes a percent-encoded pathname back to its route URL', () => {
    // What `location.pathname` reports for `/guía/página-uno`.
    expect(decodePath('/gu%C3%ADa/p%C3%A1gina-uno')).toBe('/guía/página-uno');
  });

  it('leaves an already-decoded path alone', () => {
    expect(decodePath('/guide/deep-dive')).toBe('/guide/deep-dive');
  });

  it('keeps an encoded slash encoded, so a path never gains a segment', () => {
    expect(decodePath('/a%2Fb')).toBe('/a%2Fb');
  });

  it('returns malformed input unchanged rather than throwing', () => {
    expect(decodePath('/%E0%A4%A')).toBe('/%E0%A4%A');
  });
});

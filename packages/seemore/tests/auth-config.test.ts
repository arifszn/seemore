import { describe, expect, it } from 'vitest';
import { readPassword } from '../src/node/auth/password.js';
import { resolveConfig } from '../src/node/config/load.js';
import type { SeemoreConfig } from '../src/node/config/schema.js';
import type { SeemoreContext } from '../src/node/context.js';
import { clientConfig } from '../src/node/vite/plugin.js';

const resolve = (input: SeemoreConfig) => resolveConfig(input, { root: '/tmp/x' });

describe('auth config', () => {
  it('turns `true` into one day, keyed by the site title', () => {
    expect(resolve({ title: 'Handbook', auth: true }).auth).toEqual({ id: 'Handbook', remember: 86_400 });
  });

  it('is off when false or absent', () => {
    expect(resolve({ title: 'Handbook', auth: false }).auth).toBeUndefined();
    expect(resolve({ title: 'Handbook' }).auth).toBeUndefined();
  });

  it('resolves `remember` to seconds', () => {
    expect(resolve({ auth: { remember: '12h' } }).auth?.remember).toBe(43_200);
    expect(resolve({ auth: { remember: '7d' } }).auth?.remember).toBe(604_800);
  });

  it('trims `id`, and uses it in place of the title', () => {
    expect(resolve({ title: 'Handbook', auth: { id: '  acme-handbook ' } }).auth?.id).toBe('acme-handbook');
  });

  it.each([['1w'], ['0d'], ['12'], ['1.5h'], [0], [-1], [3600]])('rejects `remember: %j`, naming the accepted forms', (remember) => {
    expect(() => resolve({ auth: { remember: remember as never } })).toThrow(/auth\.remember[\s\S]*'12h' or '7d'/);
  });

  it.each([[''], ['   ']])('rejects an empty `id` (%j)', (id) => {
    expect(() => resolve({ auth: { id } })).toThrow(/auth\.id[\s\S]*must not be empty/);
  });

  it('rejects fields it does not know, rather than ignoring a typo', () => {
    expect(() => resolve({ auth: { enabled: false } as never })).toThrow(/auth[\s\S]*enabled/);
  });

  it('never reaches the browser', () => {
    const config = resolve({ title: 'Handbook', auth: { id: 'acme-handbook', remember: '7d' } });
    const client = clientConfig({ config } as SeemoreContext);
    expect(Object.keys(client)).not.toContain('auth');
    expect(JSON.stringify(client)).not.toContain('acme-handbook');
    expect(JSON.stringify(client)).not.toContain('604800');
  });
});

describe('auth conflicts', () => {
  it('refuses `social.cards`, which would publish page titles as public images', () => {
    expect(() => resolve({ auth: true, features: { 'social.cards': true } })).toThrow(
      /`auth` cannot be combined with `social.cards`: the cards would publish page titles as public images\. Remove one of them\./,
    );
  });

  it('refuses Algolia, which would receive the index in plaintext', () => {
    expect(() =>
      resolve({ auth: true, search: { provider: 'algolia', appId: 'a', apiKey: 'k', indexName: 'i' } }),
    ).toThrow(/`auth` cannot be combined with `search.provider: 'algolia'`: the search index would go to a third party in plaintext/);
  });

  it('refuses Orama Cloud for the same reason', () => {
    expect(() => resolve({ auth: true, search: { provider: 'orama-cloud', endpoint: 'e', apiKey: 'k' } })).toThrow(
      /`auth` cannot be combined with `search.provider: 'orama-cloud'`/,
    );
  });

  it('allows the static index, which is encrypted with everything else', () => {
    expect(resolve({ auth: true, search: 'static' }).auth).toBeDefined();
  });
});

describe('SEEMORE_PASSWORD', () => {
  const read = (value: string | undefined) => readPassword('npx seemore build', { SEEMORE_PASSWORD: value });

  it('is required, and the message names the variable', () => {
    expect(() => read(undefined)).toThrow(/`auth` is on, but SEEMORE_PASSWORD is not set/);
    expect(() => read('')).toThrow(/SEEMORE_PASSWORD is not set/);
  });

  it('accepts a password of any length', () => {
    expect(read('a')).toBe('a');
    expect(read('🔒')).toBe('🔒');
  });

  it('returns the password NFC-normalised, as the lock screen derives it', () => {
    expect(read('e\u0301')).toBe('\u00e9');
  });
});

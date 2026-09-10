import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig, resolveConfig } from '../src/node/config/load.js';
import { isFeatureEnabled } from '../src/node/config/features.js';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'seemore-config-'));
}

describe('resolveConfig defaults', () => {
  it('produces a usable config from nothing at all', () => {
    const config = resolveConfig({}, { root: '/tmp/x' });
    expect(config.title).toBe('Docs');
    expect(config.base).toBe('/');
    expect(config.theme).toBe('neutral');
    expect(config.search).toEqual({ provider: 'static' });
    expect(config.exclude).toEqual([]);
  });

  it('normalises base to leading and trailing slashes', () => {
    expect(resolveConfig({ base: 'my-repo' }, { root: '/tmp/x' }).base).toBe('/my-repo/');
  });

  it('accepts the shorthand search string', () => {
    expect(resolveConfig({ search: 'static' }, { root: '/tmp/x' }).search).toEqual({ provider: 'static' });
  });

  it('rejects an unknown theme, naming the valid ones', () => {
    expect(() => resolveConfig({ theme: 'nope' as never }, { root: '/tmp/x' })).toThrow(/vitepress/);
  });

  it('rejects an unknown feature flag, naming it and the valid ones', () => {
    expect(() => resolveConfig({ features: { 'navigation.instant.turbo': true } as never }, { root: '/tmp/x' })).toThrow(
      /navigation\.instant\.turbo.*navigation\.instant\.prefetch/s,
    );
  });

  it('rejects an unknown flag in the array form too, after folding off the ! prefix', () => {
    expect(() => resolveConfig({ features: ['!navigation.instant.turbo' as never] }, { root: '/tmp/x' })).toThrow(
      /navigation\.instant\.turbo/,
    );
  });

  it('rejects a non-boolean flag value, naming the flag', () => {
    expect(() => resolveConfig({ features: { 'navigation.path': 'yes' } as never }, { root: '/tmp/x' })).toThrow(
      /features\.navigation\.path.*boolean/s,
    );
  });
});

describe('pageActions', () => {
  it('defaults to the HTML export', () => {
    expect(resolveConfig({}, { root: '/tmp/x' }).pageActions).toEqual(['export-html']);
  });

  it('accepts any subset, in the order given', () => {
    expect(resolveConfig({ pageActions: ['export-html'] }, { root: '/tmp/x' }).pageActions).toEqual(['export-html']);
    expect(resolveConfig({ pageActions: [] }, { root: '/tmp/x' }).pageActions).toEqual([]);
  });

  it('rejects unknown action ids', () => {
    expect(() => resolveConfig({ pageActions: ['copy-markdown'] as never }, { root: '/tmp/x' })).toThrow(
      /copy-markdown|export-html/,
    );
  });
});

describe('feature flags', () => {
  it('applies documented defaults when no flags are given', () => {
    const { features } = resolveConfig({}, { root: '/tmp/x' });
    expect(isFeatureEnabled(features, 'navigation.instant.prefetch')).toBe(true);
    expect(isFeatureEnabled(features, 'toc.follow')).toBe(true);
    expect(isFeatureEnabled(features, 'content.code.copy')).toBe(true);
    expect(isFeatureEnabled(features, 'navigation.instant.preview')).toBe(false);
    expect(isFeatureEnabled(features, 'social.cards')).toBe(false);
  });

  it('enables an opt-in flag and disables a default-on one', () => {
    const { features } = resolveConfig(
      { features: { 'navigation.path': true, 'content.code.copy': false } },
      { root: '/tmp/x' },
    );
    expect(isFeatureEnabled(features, 'navigation.path')).toBe(true);
    expect(isFeatureEnabled(features, 'content.code.copy')).toBe(false);
  });

  it('leaves unmentioned flags at their defaults', () => {
    const { features } = resolveConfig({ features: { 'navigation.path': true } }, { root: '/tmp/x' });
    expect(isFeatureEnabled(features, 'toc.follow')).toBe(true);
    expect(isFeatureEnabled(features, 'social.cards')).toBe(false);
  });

  it('reads the superseded array form as the same map', () => {
    const viaArray = resolveConfig({ features: ['navigation.path', '!content.code.copy'] }, { root: '/tmp/x' });
    const viaMap = resolveConfig(
      { features: { 'navigation.path': true, 'content.code.copy': false } },
      { root: '/tmp/x' },
    );
    expect(viaArray.features).toEqual(viaMap.features);
  });

  it('turns on content.action.edit implicitly when editLink is set', () => {
    const { features } = resolveConfig({ editLink: { base: 'https://example.com/edit' } }, { root: '/tmp/x' });
    expect(isFeatureEnabled(features, 'content.action.edit')).toBe(true);
  });

  it('rejects toc.integrate together with toc.follow, naming both flags and the fix', () => {
    expect(() => resolveConfig({ features: { 'toc.integrate': true } }, { root: '/tmp/x' })).toThrow(
      /toc\.integrate.*'toc\.follow': false/s,
    );
  });

  it('accepts toc.integrate when toc.follow is explicitly disabled', () => {
    const { features } = resolveConfig(
      { features: { 'toc.integrate': true, 'toc.follow': false } },
      { root: '/tmp/x' },
    );
    expect(isFeatureEnabled(features, 'toc.integrate')).toBe(true);
    expect(isFeatureEnabled(features, 'toc.follow')).toBe(false);
  });

  it('rejects instant previews without the prefetch they are built on', () => {
    expect(() =>
      resolveConfig(
        { features: { 'navigation.instant.preview': true, 'navigation.instant.prefetch': false } },
        { root: '/tmp/x' },
      ),
    ).toThrow(/navigation\.instant\.preview/);
  });

  it('lets an explicit flag override the one editLink turns on implicitly', () => {
    const { features } = resolveConfig(
      { editLink: { base: 'https://example.com/edit' }, features: { 'content.action.edit': false } },
      { root: '/tmp/x' },
    );
    expect(isFeatureEnabled(features, 'content.action.edit')).toBe(false);
  });
});

describe('loadConfig', () => {
  it('returns defaults when no config file exists', async () => {
    const dir = tmp();
    const { config, file } = await loadConfig({ root: dir });
    expect(file).toBeUndefined();
    expect(config.title).toBe('Docs');
  });

  it('loads a TypeScript config through jiti', async () => {
    const dir = tmp();
    writeFileSync(
      join(dir, 'seemore.config.ts'),
      `type Extra = { n: number };
       const extra: Extra = { n: 1 };
       export default { title: 'Typed' + String(extra.n), base: '/sub' };`,
    );
    const { config, file } = await loadConfig({ root: dir });
    expect(file).toBe(join(dir, 'seemore.config.ts'));
    expect(config.title).toBe('Typed1');
    expect(config.base).toBe('/sub/');
  });

  it('loads an explicit config path', async () => {
    const dir = tmp();
    const path = join(dir, 'custom.config.ts');
    writeFileSync(path, `export default { title: 'Custom' };`);
    const { config } = await loadConfig({ root: dir, configPath: path });
    expect(config.title).toBe('Custom');
  });

  it('fails loudly when an explicit config path does not exist', async () => {
    const dir = tmp();
    await expect(loadConfig({ root: dir, configPath: join(dir, 'missing.ts') })).rejects.toThrow(/missing\.ts/);
  });

  it('names the config file in a validation error', async () => {
    const dir = tmp();
    writeFileSync(join(dir, 'seemore.config.ts'), `export default { theme: 'not-a-theme' };`);
    await expect(loadConfig({ root: dir })).rejects.toThrow(/seemore\.config\.ts/);
  });

  it('requires a title when a config file exists, but defaults one when it does not', async () => {
    const dir = tmp();
    writeFileSync(join(dir, 'seemore.config.ts'), `export default { base: '/sub' };`);
    await expect(loadConfig({ root: dir })).rejects.toThrow(/title.*required/s);

    const empty = tmp();
    const { config } = await loadConfig({ root: empty });
    expect(config.title).toBe('Docs');
  });
});

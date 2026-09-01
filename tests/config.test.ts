import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig, resolveConfig } from '../src/node/config/load.js';
import { isFeatureEnabled } from '../src/node/config/features.js';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'openmd-config-'));
}

describe('resolveConfig defaults', () => {
  it('produces a usable config from nothing at all', () => {
    const config = resolveConfig({}, { root: '/tmp/x' });
    expect(config.title).toBe('Documentation');
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

  it('rejects an unknown feature flag, naming the field', () => {
    expect(() => resolveConfig({ features: ['navigation.instant.turbo' as never] }, { root: '/tmp/x' })).toThrow(
      /features/,
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

  it('enables an opt-in flag', () => {
    const { features } = resolveConfig({ features: ['navigation.path'] }, { root: '/tmp/x' });
    expect(isFeatureEnabled(features, 'navigation.path')).toBe(true);
  });

  it('disables a default-on flag with the ! prefix', () => {
    const { features } = resolveConfig({ features: ['!content.code.copy'] }, { root: '/tmp/x' });
    expect(isFeatureEnabled(features, 'content.code.copy')).toBe(false);
  });

  it('turns on content.action.edit implicitly when editLink is set', () => {
    const { features } = resolveConfig({ editLink: { base: 'https://example.com/edit' } }, { root: '/tmp/x' });
    expect(isFeatureEnabled(features, 'content.action.edit')).toBe(true);
  });

  it('rejects toc.integrate together with toc.follow, naming both flags', () => {
    expect(() => resolveConfig({ features: ['toc.integrate'] }, { root: '/tmp/x' })).toThrow(
      /toc\.integrate.*toc\.follow|toc\.follow.*toc\.integrate/s,
    );
  });

  it('accepts toc.integrate when toc.follow is explicitly disabled', () => {
    const { features } = resolveConfig({ features: ['toc.integrate', '!toc.follow'] }, { root: '/tmp/x' });
    expect(isFeatureEnabled(features, 'toc.integrate')).toBe(true);
    expect(isFeatureEnabled(features, 'toc.follow')).toBe(false);
  });

  it('rejects instant previews without the prefetch they are built on', () => {
    expect(() =>
      resolveConfig({ features: ['navigation.instant.preview', '!navigation.instant.prefetch'] }, { root: '/tmp/x' }),
    ).toThrow(/navigation\.instant\.preview/);
  });
});

describe('loadConfig', () => {
  it('returns defaults when no config file exists', async () => {
    const dir = tmp();
    const { config, file } = await loadConfig({ root: dir });
    expect(file).toBeUndefined();
    expect(config.title).toBe('Documentation');
  });

  it('loads a TypeScript config through jiti', async () => {
    const dir = tmp();
    writeFileSync(
      join(dir, 'openmd.config.ts'),
      `import { defineConfig } from ${JSON.stringify(new URL('../src/index.ts', import.meta.url).pathname)};
       type Extra = { n: number };
       const extra: Extra = { n: 1 };
       export default defineConfig({ title: 'Typed' + String(extra.n), base: '/sub' });`,
    );
    const { config, file } = await loadConfig({ root: dir });
    expect(file).toBe(join(dir, 'openmd.config.ts'));
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
    writeFileSync(join(dir, 'openmd.config.ts'), `export default { theme: 'not-a-theme' };`);
    await expect(loadConfig({ root: dir })).rejects.toThrow(/openmd\.config\.ts/);
  });
});

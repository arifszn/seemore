import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { extension: 'src/extension.ts' },
  format: ['cjs'],
  target: 'node20',
  platform: 'node',
  // The extension host provides `vscode` at runtime; bundling it would fail (there is
  // nothing on disk to resolve it to) and is unnecessary.
  external: ['vscode'],
  // `@seemore/host` is workspace source, never published. Through it the extension imports
  // one thing from `seemore` (`CONFIG_NAMES`); bundled rather than required, because the
  // package is ESM-only and this bundle is CJS. The CLI itself is still spawned by path.
  noExternal: ['@seemore/host', 'seemore'],
  clean: true,
  sourcemap: true,
  splitting: false,
});

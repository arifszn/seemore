import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { extension: 'src/extension.ts' },
  format: ['cjs'],
  target: 'node20',
  platform: 'node',
  // The extension host provides `vscode` at runtime; bundling it would fail (there is
  // nothing on disk to resolve it to) and is unnecessary. `seemore` is never imported as a
  // module — only spawned by path — so nothing else needs to stay external.
  external: ['vscode'],
  clean: true,
  sourcemap: true,
  splitting: false,
});

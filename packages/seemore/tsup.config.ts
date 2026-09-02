import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'cli/index': 'src/cli/index.ts',
  },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  dts: { entry: { index: 'src/index.ts' } },
  clean: true,
  sourcemap: true,
  splitting: false,
  // src/app/** ships as TSX source (SPEC §4, §15) and is compiled by openmd's own
  // Vite run, so it must never be bundled here.
  external: [/^virtual:openmd\//],
});

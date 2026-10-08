import { defineConfig } from 'tsup';

/**
 * The main process and its preloads, bundled with everything they import, so the packaged
 * app has no runtime `dependencies` for electron-builder to collect from pnpm's
 * `node_modules` (DESKTOP-SPEC §9). CJS throughout: a sandboxed preload can't be an ES
 * module, and one format keeps the two alike.
 */
export default defineConfig({
  entry: {
    main: 'src/main/index.ts',
    'preload-start': 'src/preload/start.ts',
    'preload-build': 'src/preload/build.ts',
    'preload-terminal': 'src/preload/terminal.ts',
  },
  format: ['cjs'],
  target: 'node22',
  platform: 'node',
  // Electron provides `electron` at runtime; there is nothing on disk to bundle.
  external: ['electron'],
  noExternal: ['@seemore/host', 'seemore'],
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  // The start screen is a static page loaded from inside the asar, not a dev server (§5).
  publicDir: 'src/start',
});

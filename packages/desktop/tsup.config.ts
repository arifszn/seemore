import { defineConfig } from 'tsup';

/**
 * The main process and its preloads, bundled with everything they import, so the packaged
 * app has no runtime `dependencies` for electron-builder to collect from pnpm's
 * `node_modules` (DESKTOP-SPEC §9). CJS throughout: a sandboxed preload can't be an ES
 * module, and one format keeps the two alike.
 */
export default defineConfig([
  {
    entry: {
      main: 'src/main/index.ts',
      'preload-start': 'src/preload/start.ts',
      'preload-build': 'src/preload/build.ts',
      'preload-terminal': 'src/preload/terminal.ts',
    },
    format: ['cjs'],
    target: 'node22',
    platform: 'node',
    // Electron provides `electron` at runtime; there is nothing on disk to bundle. `node-pty`
    // is native and ships as files of its own (§9).
    external: ['electron', 'node-pty'],
    noExternal: ['@seemore/host', 'seemore'],
    outDir: 'dist',
    // Everything but the terminal page's bundle, which the second config builds alongside.
    clean: ['!terminal.js', '!terminal.js.map', '!terminal.css', '!terminal.css.map'],
    sourcemap: true,
    splitting: false,
    // The start screen is a static page loaded from inside the asar, not a dev server (§5).
    publicDir: 'src/start',
  },
  {
    // The terminal panel's page (§7.4): xterm and its addons for a sandboxed page with no
    // Node, as one script and one stylesheet.
    entry: { terminal: 'src/terminal/index.ts' },
    format: ['iife'],
    outExtension: () => ({ js: '.js' }),
    target: 'chrome140',
    platform: 'browser',
    outDir: 'dist',
    clean: false,
    sourcemap: true,
    minify: true,
    splitting: false,
  },
]);

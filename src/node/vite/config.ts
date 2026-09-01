import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { InlineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@mdx-js/rollup';
import type { OpenmdContext } from '../context.js';
import { appRoot, cacheDir, packageRoot } from '../paths.js';
import { createRehypePlugins, createRemarkPlugins } from './mdx.js';
import { openmdPlugin } from './plugin.js';
import { openmdWatcherPlugin } from './watcher.js';

export interface ViteConfigOptions {
  ctx: OpenmdContext;
  mode: 'dev' | 'build';
  /** Absolute output directory. Ignored in dev. */
  outDir?: string;
  /** When set, build the prerender entry for node instead of the client bundle. */
  ssrOutDir?: string;
}

export function createViteConfig({ ctx, mode, outDir, ssrOutDir }: ViteConfigOptions): InlineConfig {
  const root = appRoot();
  const isSsr = ssrOutDir !== undefined;

  const mdxOptions = {
    // `format` is inferred per file, so a plain `.md` never needs MDX syntax.
    remarkPlugins: createRemarkPlugins({
      contentRoot: ctx.contentRoot,
      getResolver: () => ctx.resolver(),
      onWarning: (message) => ctx.warnings.add(message),
    }),
    rehypePlugins: createRehypePlugins(),
    // MDX compiles its own JSX. Vite's builtin transform infers a file's language from its
    // extension and does not know `.md`/`.mdx`, so leaving JSX in the output would fail to
    // parse. Fast Refresh is unaffected: it is a separate transform, applied to these files
    // through the React plugin's `include` below, which is what turns a content edit into an
    // in-place component swap rather than a reload.
    jsx: false,
  };

  return {
    root,
    base: ctx.config.base,
    cacheDir: cacheDir(ctx.contentRoot),
    configFile: false,
    envDir: false,
    clearScreen: false,
    logLevel: mode === 'build' ? 'warn' : 'info',

    plugins: [
      // Order matters: MDX first, then React, so JSX from MDX is transformed and refreshed.
      { ...mdx(mdxOptions), enforce: 'pre' },
      react({ include: /\.(?:mdx?|jsx?|tsx?)$/ }),
      // Before Tailwind: our plugin injects the theme preset into the root stylesheet, and
      // Tailwind must see the injected version.
      openmdPlugin({ ctx, serveSearch: mode === 'dev' }),
      tailwindcss(),
      ...(mode === 'dev' ? [openmdWatcherPlugin(ctx)] : []),
    ],

    resolve: {
      // The app is compiled from openmd's own sources, so its dependencies must resolve
      // from openmd's directory rather than from the user's project.
      dedupe: ['react', 'react-dom', 'react-router', 'fumadocs-core', 'fumadocs-ui'],
    },

    server: {
      fs: {
        // The content root is normally *outside* the Vite root, and files outside `allow`
        // 404 silently — the single most likely cause of "the watcher does nothing".
        allow: withRealPaths([root, packageRoot(), ctx.contentRoot, ctx.config.root, process.cwd()]),
      },
      watch: {
        // Only real exclusions here. Vite merges these into chokidar's ignore *list*, where a
        // leading `!` is a negated matcher that matches everything it is not — so the obvious
        // `!<contentRoot>/**` "re-include" would silently ignore the entire project instead.
        // Content outside the Vite root is watched by openmd's own chokidar instance.
        ignored: ['**/node_modules/**', '**/.git/**'],
      },
    },

    build: isSsr
      ? {
          ssr: join(root, 'entry.prerender.tsx'),
          outDir: ssrOutDir,
          emptyOutDir: true,
          copyPublicDir: false,
          minify: false,
          rollupOptions: { output: { entryFileNames: 'entry.prerender.js' } },
        }
      : {
          outDir,
          emptyOutDir: true,
          rollupOptions: { input: join(root, 'index.html') },
          // The app bundle is openmd's own, not the user's; warning them about a size they
          // cannot act on is noise.
          chunkSizeWarningLimit: 2_000,
        },

    // The prerender bundle is written to a scratch directory outside any `node_modules`, so
    // it has to be self-contained: an externalised `react` there resolves against the scratch
    // directory and is simply not found.
    ssr: isSsr ? { noExternal: true } : undefined,
  };
}

/**
 * Every path, plus where it actually points.
 *
 * Vite resolves a module to its real path before checking `fs.allow`, so a content root
 * reached through a symlink — `/var` on macOS, or anything under a linked directory — is
 * denied unless both spellings are listed. The failure is a silent 404, so it is worth the
 * two extra entries.
 */
function withRealPaths(paths: string[]): string[] {
  const out = new Set<string>();
  for (const path of paths) {
    out.add(path);
    try {
      out.add(realpathSync.native(path));
    } catch {
      // A path that does not exist yet cannot be resolved, and does not need to be.
    }
  }
  return [...out];
}

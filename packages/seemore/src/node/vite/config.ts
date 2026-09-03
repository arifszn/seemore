import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { InlineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@mdx-js/rollup';
import type { SeemoreContext } from '../context.js';
import { appRoot, cacheDir, packageDirOf, packageRoot } from '../paths.js';
import { createRehypePlugins, createRemarkPlugins } from './mdx.js';
import { seemorePlugin } from './plugin.js';
import { seemoreWatcherPlugin } from './watcher.js';

const require_ = createRequire(import.meta.url);

/**
 * `@terrastruct/d2`'s `exports` map only picks its browser bundle when a `browser`
 * condition is present. Dev's `worker`-only condition set below deliberately excludes it
 * (see the comment there), and even build's own defaults are one more custom `conditions`
 * tweak away from excluding it by accident again — so this resolves it directly rather than
 * leaning on whatever the shared condition set happens to be.
 */
function d2BrowserEntry(): string {
  const entry = require_.resolve('@terrastruct/d2');
  return join(packageDirOf('@terrastruct/d2', entry), 'dist', 'browser', 'index.js');
}

export interface ViteConfigOptions {
  ctx: SeemoreContext;
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
    rehypePlugins: createRehypePlugins({ positions: mode === 'dev' && ctx.config.features['content.edit'] }),
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
      seemorePlugin({ ctx, serveSearch: mode === 'dev' }),
      tailwindcss(),
      ...(mode === 'dev' ? [seemoreWatcherPlugin(ctx)] : []),
    ],

    // Vite bundles workers with the browser export condition, but a worker has no `document`.
    // `decode-named-character-reference` — pulled in through fumadocs' search client, via
    // remark — calls `document.createElement` at module scope in its browser build, so the
    // search worker threw on load. The package ships a DOM-free `worker` entry; use it.
    worker: { plugins: () => [workerConditionPlugin()] },

    resolve: {
      // The app is compiled from seemore's own sources, so its dependencies must resolve
      // from seemore's directory rather than from the user's project.
      dedupe: ['react', 'react-dom', 'react-router', 'fumadocs-core', 'fumadocs-ui'],
      // Not needed for the SSR bundle: the dynamic `import('@terrastruct/d2')` inside `D2`'s
      // effect never actually runs there (effects don't run during prerendering), but Rollup
      // still bundles it as a reachable chunk, and Vite's own server conditions already point
      // that at the Node build — which is what actually running in Node would want anyway.
      alias: isSsr ? undefined : [{ find: '@terrastruct/d2', replacement: d2BrowserEntry() }],
      // In dev the module worker is served through the shared module graph and its fumadocs
      // chunk comes from the dep optimizer, where `worker.plugins` never runs — the browser
      // build of `decode-named-character-reference` is inlined into the prebundle and the
      // worker throws on load. Adding the package's own `worker` condition graph-wide flips
      // the whole dev graph (main thread included) to its DOM-free build, which behaves the
      // same; production doesn't need it — its worker chunk is a real Rollup build of its own,
      // where the targeted swap above runs. Leaving this unset in production keeps Vite's own
      // default conditions.
      conditions: mode === 'dev' ? ['worker'] : undefined,
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
        // Content outside the Vite root is watched by seemore's own chokidar instance.
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
          // The app bundle is seemore's own, not the user's; warning them about a size they
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

/**
 * Point worker bundles at the DOM-free build of packages that ship two.
 *
 * Resolution goes through Vite so pnpm's layout is respected — these packages are deep
 * transitive dependencies and are not resolvable from seemore's own directory — and only the
 * final `index.dom.js` is swapped for its sibling.
 */
function workerConditionPlugin(): Plugin {
  return {
    name: 'seemore:worker-conditions',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!WORKER_SAFE_ENTRIES.has(source)) return undefined;

      const resolved = await this.resolve(source, importer, options);
      if (resolved === null) return undefined;

      const domFree = resolved.id.replace(/index\.dom\.js$/, 'index.js');
      return domFree === resolved.id ? resolved : { ...resolved, id: domFree };
    },
  };
}

/**
 * Packages whose browser build touches the DOM at module scope and whose default build does
 * not. `decode-named-character-reference` reaches the worker through remark, by way of
 * fumadocs' search client.
 */
const WORKER_SAFE_ENTRIES = new Set(['decode-named-character-reference']);

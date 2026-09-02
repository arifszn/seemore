import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { withBase } from '../base.js';
import type { SeemoreContext } from '../context.js';
import { buildSearchIndex } from '../search/build.js';
import { toPosix } from '../content/slug.js';
import { canonicalise } from '../paths.js';

export const VIRTUAL = {
  tree: 'virtual:seemore/tree',
  routes: 'virtual:seemore/routes',
  config: 'virtual:seemore/config',
} as const;

/**
 * Prefix for content-body imports emitted into `virtual:seemore/routes`.
 *
 * A bare absolute path would be read as *root*-relative by Vite, and the content root is
 * normally outside the Vite root. Resolving our own prefix to the real file id keeps dev and
 * build identical, and lets `@mdx-js/rollup` transform the file as it normally would.
 */
const PAGE_PREFIX = 'seemore-page:';

const resolvedId = (id: string) => `\0${id}`;

/**
 * Two markers, deliberately: see the comments in `src/app/styles/globals.css`.
 *
 * `@import` is only valid before the first style rule, so the theme has to go at the top —
 * and the user's own stylesheet has to go at the bottom, or it loses to the rules it is
 * meant to override and, worse, invalidates the imports it was inlined above.
 */
const IMPORTS_MARKER = /\/\* seemore:imports[\s\S]*?\*\//;
const USER_CSS_MARKER = /\/\* seemore:user-css[\s\S]*?\*\//;

const require_ = createRequire(import.meta.url);

function styleImports(ctx: SeemoreContext): string {
  const lines: string[] = [`@import 'fumadocs-ui/css/${ctx.config.theme}.css';`];

  // Tailwind cannot scan class names it never sees, and fumadocs-ui ships compiled JS.
  try {
    lines.push(`@source '${dirname(require_.resolve('fumadocs-ui/package.json'))}/dist';`);
  } catch {
    // A layout without the package resolvable is already broken elsewhere; do not add noise.
  }

  return lines.join('\n');
}

function userCss(ctx: SeemoreContext): string {
  if (ctx.config.css === undefined) return '';

  const css = readIfExists(ctx.config.css);
  if (css === undefined) {
    ctx.warnings.add(`The stylesheet named by \`css\` was not found: ${ctx.config.css}`);
    return '';
  }

  // Inlined rather than imported: an `@import` this far down the file is not valid CSS.
  return `/* ${ctx.config.css} */\n${css}`;
}

export interface SeemorePluginOptions {
  ctx: SeemoreContext;
  /** Dev serves the index from memory; build writes it to `dist/api/search.json`. */
  serveSearch?: boolean;
}

export function seemorePlugin({ ctx, serveSearch = false }: SeemorePluginOptions): Plugin {
  let server: ViteDevServer | undefined;

  return {
    name: 'seemore',
    enforce: 'pre',

    resolveId(id) {
      // Native separators from `page.absPath` would key a second, unloadable module in
      // Vite's URL-addressed graph — canonical ids are always forward slashes.
      if (id.startsWith(PAGE_PREFIX)) return id.slice(PAGE_PREFIX.length).replace(/\\/g, '/');
      for (const virtualId of Object.values(VIRTUAL)) {
        if (id === virtualId) return resolvedId(virtualId);
      }
      return undefined;
    },

    /**
     * The theme preset, the paths Tailwind must scan, and the user's own stylesheet are
     * injected into our root stylesheet rather than imported from it.
     *
     * Tailwind v4 only processes the file that contains `@import "tailwindcss"`, and bare
     * specifiers in a virtual stylesheet have no directory to resolve from — injecting into
     * the real `globals.css` keeps both working.
     */
    transform(code, id) {
      const path = id.replace(/\\/g, '/').split('?')[0] ?? '';
      if (!path.endsWith('/src/app/styles/globals.css')) return undefined;
      const transformed = code
        .replace(IMPORTS_MARKER, () => styleImports(ctx))
        .replace(USER_CSS_MARKER, () => userCss(ctx));
      return { code: transformed, map: null };
    },

    async load(id) {
      if (id === resolvedId(VIRTUAL.tree)) {
        return hotStoreModule('Tree', json(await ctx.source.serializeTree()));
      }
      if (id === resolvedId(VIRTUAL.routes)) {
        return hotStoreModule('Routes', renderRoutesValue(ctx));
      }
      // Config is not a store: a change to it can alter `base`, which reconfigures Vite, so
      // the page reloads rather than patching itself.
      if (id === resolvedId(VIRTUAL.config)) return `export const config = ${json(clientConfig(ctx))};`;
      return undefined;
    },

    configureServer(devServer) {
      server = devServer;
      if (!serveSearch) return;

      // The same JSON the build emits, at the same path, so the client has one code path.
      devServer.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0] ?? '';
        if (path !== withBase(ctx.config.base, '/api/search.json') && path !== '/api/search.json') return next();
        try {
          const index = await buildSearchIndex(ctx);
          res.setHeader('Content-Type', 'application/json');
          res.end(index);
        } catch (error) {
          next(error);
        }
      });

      // Lets a caller that only knows an absolute file path — an editor extension, say —
      // ask the running server what URL that file resolved to, rather than reimplementing
      // `resolveRoutes`. Dev-only: the answer depends on a live corpus scan.
      devServer.middlewares.use((req, res, next) => {
        const [path = '', query = ''] = (req.url ?? '').split('?');
        if (path !== '/__seemore/route') return next();

        const file = new URLSearchParams(query).get('file');
        if (file === null) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing "file" query parameter.' }));
          return;
        }

        // `page.absPath` is built on the canonicalised content root; a caller outside
        // seemore (an editor's `document.uri.fsPath`) has no reason to have canonicalised
        // its side, so the comparison must go through the filesystem, not just `resolve`.
        const absFile = canonicalise(file);
        const page = ctx.pages().find((p) => p.absPath === absFile);
        if (page === undefined) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: `${file} is not part of this site — excluded, or lost a duplicate slug.` }));
          return;
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ url: withBase(ctx.config.base, page.url) }));
      });
    },

    /** Called by the watcher after a rescan. */
    api: {
      invalidate() {
        if (server === undefined) return;
        for (const virtualId of [VIRTUAL.tree, VIRTUAL.routes]) {
          const mod = server.moduleGraph.getModuleById(resolvedId(virtualId));
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: 'update', updates: [] });
      },
    },
  };
}

/**
 * A self-accepting module holding one value, with subscribers that survive replacement.
 *
 * State lives on `import.meta.hot.data`, so when the module re-executes after an edit the
 * new copy still has the listeners the old one handed to React. `accept()` stops the update
 * propagating to importers, which is the difference between the sidebar re-rendering in
 * place and the page reloading.
 */
function hotStoreModule(suffix: string, value: string): string {
  // `import.meta.hot.accept()` is written out in full because Vite detects self-accepting
  // modules syntactically — through an alias it sees an ordinary module and reloads the page.
  return `const state = import.meta.hot
  ? (import.meta.hot.data.seemore${suffix} ||= { listeners: new Set() })
  : { listeners: new Set() };

state.value = ${value};

export function get${suffix}() {
  return state.value;
}

export function subscribe${suffix}(listener) {
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

if (import.meta.hot) {
  import.meta.hot.accept();
  for (const listener of state.listeners) listener();
}
`;
}

/**
 * `virtual:seemore/routes`: one entry per page, with the body behind a dynamic
 * import so the router, the hover prefetch and the prerender driver all read one map.
 *
 * `import.meta.glob` is deliberately not used: glob patterns that escape the Vite root fail
 * silently, which is the exact failure class seemore exists to prevent.
 */
function renderRoutesValue(ctx: SeemoreContext): string {
  const entries = ctx.pages().map((page) => {
    // Backslashes are legal in a Windows path and fatal in an import specifier.
    const specifier = `${PAGE_PREFIX}${page.absPath.replace(/\\/g, '/')}`;
    return [
      '  {',
      `    url: ${json(page.url)},`,
      `    file: ${json(page.file)},`,
      `    absPath: ${json(page.absPath)},`,
      `    title: ${json(page.data.title)},`,
      `    description: ${json(page.data.description ?? null)},`,
      `    load: () => import(${json(specifier)}),`,
      '  },',
    ].join('\n');
  });

  return `[\n${entries.join('\n')}\n]`;
}

/** The serialisable slice of the config the browser needs. */
function clientConfig(ctx: SeemoreContext) {
  const { config } = ctx;
  return {
    title: config.title,
    description: config.description,
    base: config.base,
    theme: config.theme,
    features: config.features,
    nav: config.nav,
    footer: config.footer,
    editLink: config.editLink,
    favicon: config.favicon === undefined ? undefined : withBase(config.base, `/${toPosix(config.favicon)}`),
    search:
      config.search.provider === 'static'
        ? { provider: 'static' as const, from: withBase(config.base, '/api/search.json') }
        : config.search,
    contentRoot: config.root,
  };
}

/** JSON that is always safe to paste into a module body. */
function json(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function readIfExists(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

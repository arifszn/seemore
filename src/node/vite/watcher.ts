import chokidar, { type FSWatcher } from 'chokidar';
import type { Plugin, ViteDevServer } from 'vite';
import type { SeemoreContext } from '../context.js';
import { VIRTUAL } from './plugin.js';

const CONTENT_FILE = /\.(?:mdx?|json)$/i;

/**
 * The watcher/sidebar-refresh cycle.
 *
 * The page tree, sidebar and search index are not in the module graph, so nothing invalidates
 * them on its own. chokidar watches the content root; every event rescans, and the two
 * virtual modules that depend on the corpus are reloaded through Vite's own HMR machinery so
 * the sidebar re-renders in place instead of reloading the page.
 */
export function seemoreWatcherPlugin(ctx: SeemoreContext): Plugin {
  let watcher: FSWatcher | undefined;

  return {
    name: 'seemore:watcher',
    apply: 'serve',

    configureServer(server) {
      watcher = chokidar.watch(ctx.contentRoot, {
        ignoreInitial: true,
        ignored: (path: string, stats?: { isFile(): boolean }) => {
          // `ignored` applies to explicitly added paths too, so the config file — which is
          // neither Markdown nor JSON — has to be let through by name.
          if (path === ctx.config.configFile) return false;
          // chokidar reports native separators, so compare against a normalised path.
          const posix = path.replace(/\\/g, '/');
          if (/(?:^|\/)(?:node_modules|\.git|dist|\.seemore)(?:$|\/)/.test(posix)) return true;
          if (/(?:^|\/)\.[^/]+/.test(posix)) return true;
          return stats?.isFile() === true && !CONTENT_FILE.test(posix);
        },
      });

      const onEvent = (event: string, path: string) => {
        void handleContentChange(server, ctx, event, path);
      };

      watcher.on('add', (p) => onEvent('add', p));
      watcher.on('change', (p) => onEvent('change', p));
      watcher.on('unlink', (p) => onEvent('unlink', p));
      watcher.on('addDir', (p) => onEvent('addDir', p));
      watcher.on('unlinkDir', (p) => onEvent('unlinkDir', p));

      // A config edit can change `base`, which reconfigures Vite itself, so the page reloads
      // rather than patching itself.
      if (ctx.config.configFile !== undefined) {
        watcher.add(ctx.config.configFile);
        watcher.on('change', (path) => {
          if (path !== ctx.config.configFile) return;
          server.environments.client.hot.send({ type: 'full-reload', path: '*' });
          server.config.logger.info(
            'seemore  config changed — reloading. Changes to `base` need a restart to take effect.',
          );
        });
      }

      server.httpServer?.once('close', () => void watcher?.close());
    },

    async closeBundle() {
      await watcher?.close();
      watcher = undefined;
    },
  };
}

/** Exported for the watcher test, which drives it without going through chokidar's timing. */
export async function handleContentChange(
  server: ViteDevServer,
  ctx: SeemoreContext,
  event: string,
  path: string,
): Promise<void> {
  const scan = ctx.refresh();

  // Dev never exits on a content error, but it must not swallow one either: editing a file
  // back to valid has to recover without a restart, so problems are reported each time.
  for (const message of [...scan.errors, ...scan.warnings]) ctx.warnings.add(message);
  ctx.warnings.flush((line) => server.config.logger.warn(line));

  // Order matters: the tree must be current before anything re-renders against it.
  await reloadVirtual(server, VIRTUAL.tree);
  await reloadVirtual(server, VIRTUAL.routes);

  // A body edit is a plain MDX swap; the component is replaced and scroll position kept.
  if (event === 'change' && /\.mdx?$/i.test(path)) {
    await reloadFile(server, path);
  }
}

async function reloadVirtual(server: ViteDevServer, id: string): Promise<void> {
  await reloadById(server, `\0${id}`);
}

async function reloadFile(server: ViteDevServer, absolutePath: string): Promise<void> {
  // chokidar reports native separators; the module graph is addressed in forward slashes.
  await reloadById(server, absolutePath.replace(/\\/g, '/'));
}

/**
 * Reload a module in every environment that has it. `server.reloadModule` handles
 * invalidation and the HMR message together, which keeps us out of the business of
 * constructing update payloads by hand.
 */
async function reloadById(server: ViteDevServer, id: string): Promise<void> {
  const environments = Object.values(server.environments ?? {});

  if (environments.length === 0) {
    const legacy = server.moduleGraph.getModuleById(id);
    if (legacy) await server.reloadModule(legacy);
    return;
  }

  for (const environment of environments) {
    const mod = environment.moduleGraph?.getModuleById(id);
    if (mod === undefined || mod === null) continue;
    if (typeof environment.reloadModule === 'function') await environment.reloadModule(mod);
    else environment.moduleGraph.invalidateModule(mod);
  }
}

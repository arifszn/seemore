import { createServer, type ViteDevServer } from 'vite';
import pc from 'picocolors';
import { loadConfig } from '../node/config/load.js';
import { createContext, type SeemoreContext } from '../node/context.js';
import { normaliseBase } from '../shared/base.js';
import { resolveContentRoot } from '../node/paths.js';
import { createViteConfig } from '../node/vite/config.js';

const DEFAULT_PORT = 4040;

export interface DevOptions {
  cwd: string;
  dir?: string;
  configPath?: string;
  base?: string;
  port?: number;
  host?: string | boolean;
  open?: boolean;
}

export interface DevServer {
  server: ViteDevServer;
  ctx: SeemoreContext;
  url: string;
  close(): Promise<void>;
}

/**
 * The dev server. Nothing is written into the user's folder: the Vite root is
 * seemore's own `src/app`, and caches go to the OS temp directory.
 */
export async function runDev(options: DevOptions): Promise<DevServer> {
  const contentRoot = resolveContentRoot(options.cwd, options.dir);
  const loaded = await loadConfig({ root: options.cwd, configPath: options.configPath });
  const config = {
    ...loaded.config,
    base: options.base === undefined ? loaded.config.base : normaliseBase(options.base),
  };

  // Dev never exits on a content error: editing a file back to valid must recover without a
  // restart, so problems that fail the build are warnings here.
  const ctx = createContext({ config, contentRoot, includeDrafts: true });
  const scan = ctx.source.current();
  for (const message of [...scan.errors, ...scan.warnings]) ctx.warnings.add(message);
  if (scan.pages.length === 0) {
    ctx.warnings.add(`No Markdown files found under ${contentRoot}. seemore will serve an empty site until there are.`);
  }

  const base = createViteConfig({ ctx, mode: 'dev' });
  const server = await createServer({
    ...base,
    server: {
      ...base.server,
      port: options.port ?? DEFAULT_PORT,
      host: options.host,
      open: options.open === true ? config.base : false,
    },
  });

  await server.listen();

  const resolvedPort = server.config.server.port ?? DEFAULT_PORT;
  const url = `http://localhost:${resolvedPort}${config.base}`;

  ctx.warnings.flush();
  console.log(`\n  ${pc.green('seemore')}  ${pc.bold(url)}`);
  console.log(`  ${pc.dim(`${scan.pages.length} pages from ${contentRoot}`)}\n`);

  return {
    server,
    ctx,
    url,
    close: async () => {
      await server.close();
    },
  };
}

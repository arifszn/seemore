import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { build } from 'vite';
import type { OpenmdContext } from '../context.js';
import { createViteConfig } from '../vite/config.js';

export interface RenderResult {
  html: string;
  head: string;
}

export interface PrerenderModule {
  render(url: string): Promise<RenderResult>;
  listRoutes(): string[];
}

/**
 * Build the prerender entry for node and load it.
 *
 * This is a second Vite build rather than a reuse of the client bundle because the client
 * bundle is compiled for the browser; the driver needs the same module graph evaluated in
 * node, with the same virtual modules, so the two can never describe different sites.
 */
export async function loadPrerenderModule(ctx: OpenmdContext, ssrOutDir: string): Promise<PrerenderModule> {
  await build(createViteConfig({ ctx, mode: 'build', ssrOutDir }));

  const entry = join(ssrOutDir, 'entry.prerender.js');
  const loaded = (await import(pathToFileURL(entry).href)) as Partial<PrerenderModule>;

  if (typeof loaded.render !== 'function' || typeof loaded.listRoutes !== 'function') {
    throw new Error(`openmd: the prerender build at ${entry} did not export \`render\` and \`listRoutes\`.`);
  }

  return { render: loaded.render, listRoutes: loaded.listRoutes };
}

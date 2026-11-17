import { dynamicLoader } from 'fumadocs-core/source';
import { visit, type Root } from 'fumadocs-core/page-tree';
import { renderToString } from 'react-dom/server';
import { iconsPlugin } from './icons.js';
import { scan, type ContentPage, type ScanOptions, type ScanResult } from './scan.js';

export interface SeemoreSource {
  /** The most recent scan. Never triggers filesystem work. */
  current(): ScanResult;
  /** Re-read the corpus and let fumadocs decide what changed. */
  refresh(): ScanResult;
  getPageTree(): Promise<Root>;
  /** Serialized for the browser — the payload of `virtual:seemore/tree`. */
  serializeTree(): Promise<unknown>;
  pages(): ContentPage[];
  loader: ReturnType<typeof dynamicLoader>;
}

/**
 * Wire the scanner to fumadocs' dynamic loader.
 *
 * `cache: 'custom'` puts us in charge of when a scan happens: the watcher calls
 * {@link SeemoreSource.refresh}, and fumadocs recomputes the page tree because the array
 * identity changed. Between refreshes `files()` hands back the same array, so reading the
 * tree is free.
 */
export function createSource(options: ScanOptions): SeemoreSource {
  let cached: ScanResult | undefined;

  const read = (): ScanResult => (cached ??= scan(options));

  const loader = dynamicLoader(
    {
      cache: 'custom',
      files: () => read().files,
      invalidate: () => {
        cached = undefined;
      },
    },
    { baseUrl: '/', plugins: [iconsPlugin()] },
  );

  return {
    loader,
    current: read,
    pages: () => read().pages,
    refresh() {
      loader.invalidate();
      return read();
    },
    async getPageTree() {
      const output = await loader.get();
      return output.getPageTree();
    },
    async serializeTree() {
      const output = await loader.get();
      return serializePageTree(output.getPageTree());
    },
  };
}

/**
 * fumadocs' `serializePageTree`, with `react-dom/server` imported here rather than on first
 * call. React picks its development or production build from `NODE_ENV` when it first loads;
 * `vite build` sets `NODE_ENV=production` after `react` has already loaded, so fumadocs' lazy
 * import got the production renderer for development React, and any icon crashed the build.
 * Imported together, the two always match. The output is what `deserializePageTree` reads.
 */
function serializePageTree(tree: Root): { $fumadocs_loader: 'page-tree'; data: Root } {
  return {
    $fumadocs_loader: 'page-tree',
    data: visit(tree, (node) => {
      const copy = { ...node };
      if ('icon' in copy && copy.icon !== undefined && copy.icon !== null) copy.icon = renderToString(copy.icon);
      if ('name' in copy && copy.name !== undefined && copy.name !== null) copy.name = renderToString(copy.name);
      if ('children' in copy) copy.children = [...copy.children];
      return copy;
    }),
  };
}

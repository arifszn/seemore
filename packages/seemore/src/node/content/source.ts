import { dynamicLoader } from 'fumadocs-core/source';
import type { Root } from 'fumadocs-core/page-tree';
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
    { baseUrl: '/' },
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
      return output.serializePageTree(output.getPageTree());
    },
  };
}

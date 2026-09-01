import { staticClient } from 'fumadocs-core/search/client/orama-static';
import type { SortedResult } from 'fumadocs-core/search';
import type { ClientSearchConfig } from '../../shared/types.js';

export interface SearchClientLike {
  search: (query: string) => Promise<SortedResult[]>;
}

/** Build the client the configured provider calls for. */
export function createSearchClient(config: ClientSearchConfig): SearchClientLike {
  if (config.provider === 'static') return createStaticClient(config.from);
  if (config.provider === 'algolia') return createAlgoliaClient(config);
  return createOramaCloudClient(config);
}

/**
 * The static index is parsed and queried off the main thread, falling back to the main
 * thread where workers are unavailable.
 *
 * On any real corpus, parsing the index on the main thread is a visible stall — MkDocs
 * Material moved theirs into a worker for the same reason.
 */
function createStaticClient(from: string): SearchClientLike {
  if (typeof Worker === 'undefined') {
    const direct = staticClient({ from });
    return { search: async (query) => await direct.search(query) };
  }

  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.postMessage({ type: 'init', from });

  const pending = new Map<number, { resolve: (r: SortedResult[]) => void; reject: (e: Error) => void }>();
  let nextId = 0;

  worker.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type: string; id?: number; results?: SortedResult[]; message?: string };
    if (data.id === undefined) return;
    const handlers = pending.get(data.id);
    if (handlers === undefined) return;
    pending.delete(data.id);
    if (data.type === 'result') handlers.resolve(data.results ?? []);
    else handlers.reject(new Error(data.message ?? 'Search failed.'));
  });

  return {
    search: (query) =>
      new Promise<SortedResult[]>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        worker.postMessage({ type: 'query', id, query });
      }),
  };
}

/**
 * The hosted providers are the escape hatch for a corpus whose static index has grown too
 * large to download. Their SDKs are optional peers of fumadocs, so they are imported only
 * when configured — and a missing one raises rather than returning nothing, because a search
 * box that silently finds no results is the worst of the available failures.
 */
function createAlgoliaClient(config: Extract<ClientSearchConfig, { provider: 'algolia' }>): SearchClientLike {
  const ready = (async () => {
    const [lite, { algoliaClient }] = await Promise.all([
      importOrExplain<AlgoliaLite>('algoliasearch/lite', 'algoliasearch'),
      import('fumadocs-core/search/client/algolia'),
    ]);

    return algoliaClient({
      client: lite.liteClient(config.appId, config.apiKey),
      indexName: config.indexName,
    });
  })();

  return { search: async (query) => await (await ready).search(query) };
}

function createOramaCloudClient(config: Extract<ClientSearchConfig, { provider: 'orama-cloud' }>): SearchClientLike {
  const ready = (async () => {
    const [orama, { oramaCloudClient }] = await Promise.all([
      importOrExplain<OramaCore>('@orama/core', '@orama/core'),
      import('fumadocs-core/search/client/orama-cloud'),
    ]);

    return oramaCloudClient({
      client: new orama.OramaCloud({ projectId: config.endpoint, apiKey: config.apiKey }),
    });
  })();

  return { search: async (query) => await (await ready).search(query) };
}

// Structural shapes for the two optional peers: they are not installed, so their own types
// are not available to reference.
interface AlgoliaLite {
  liteClient: (appId: string, apiKey: string) => never;
}

interface OramaCore {
  OramaCloud: new (options: { projectId: string; apiKey: string }) => never;
}

async function importOrExplain<T>(specifier: string, packageName: string): Promise<T> {
  try {
    return (await import(/* @vite-ignore */ specifier)) as T;
  } catch (cause) {
    throw new Error(`Search is configured to use ${packageName}, which is not installed. Run \`npm install ${packageName}\`.`, {
      cause,
    });
  }
}

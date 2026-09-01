/// <reference lib="webworker" />
import { staticClient } from 'fumadocs-core/search/client/orama-static';
import type { SortedResult } from 'fumadocs-core/search';

/**
 * The static index is parsed and queried off the main thread.
 *
 * On any real corpus, parsing the index on the main thread is a visible stall — MkDocs
 * Material moved theirs into a worker for the same reason.
 */
type Incoming = { type: 'init'; from: string } | { type: 'query'; id: number; query: string };
type Outgoing =
  | { type: 'ready' }
  | { type: 'result'; id: number; results: SortedResult[] }
  | { type: 'error'; id: number; message: string };

let client: ReturnType<typeof staticClient> | undefined;

const post = (message: Outgoing) => {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);
};

self.onmessage = async (event: MessageEvent<Incoming>) => {
  const data = event.data;

  if (data.type === 'init') {
    client = staticClient({ from: data.from });
    post({ type: 'ready' });
    return;
  }

  if (client === undefined) {
    post({ type: 'error', id: data.id, message: 'Search worker received a query before it was initialised.' });
    return;
  }

  try {
    post({ type: 'result', id: data.id, results: await client.search(data.query) });
  } catch (error) {
    post({ type: 'error', id: data.id, message: error instanceof Error ? error.message : String(error) });
  }
};

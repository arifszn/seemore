/// <reference lib="webworker" />
/**
 * `sw.js`: the thin wrapper that wires {@link createAuthWorker} to real service worker events.
 * Bundled by the build, which writes `SEEMORE_AUTH` in front of it.
 */
import { LOCK_MESSAGE } from './files.js';
import { indexedDbStore } from './store.js';
import { createAuthWorker } from './worker.js';

declare const SEEMORE_AUTH: { publicFiles: string[] };

const sw = self as unknown as ServiceWorkerGlobalScope;

const worker = createAuthWorker({
  scope: sw.registration.scope,
  store: indexedDbStore(),
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
  publicFiles: SEEMORE_AUTH.publicFiles,
  // Redeployed without `auth`: remove this worker, so the next visit is an ordinary one.
  retire: async () => {
    await sw.registration.unregister();
  },
});

sw.addEventListener('install', () => {
  void sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(sw.clients.claim());
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  const described = {
    url: request.url,
    method: request.method,
    navigate: request.mode === 'navigate',
    range: request.headers.get('Range'),
    send: () => fetch(request),
  };
  if (!worker.intercepts(described)) return;
  // Anything unexpected falls back to the network, which only ever holds ciphertext.
  event.respondWith(worker.handle(described).catch(() => fetch(request)));
});

sw.addEventListener('message', (event) => {
  const data = event.data as { type?: unknown } | null;
  if (data?.type !== LOCK_MESSAGE) return;
  event.waitUntil(
    worker
      .lock()
      .catch(() => undefined)
      .then(() => event.ports[0]?.postMessage('locked')),
  );
});

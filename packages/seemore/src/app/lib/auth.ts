import { config } from 'virtual:seemore/config';
import { parseManifest } from '../../shared/auth/crypto.js';
import { LOCK_MESSAGE, MANIFEST_FILE, recordId } from '../../shared/auth/files.js';
import { indexedDbStore } from '../../shared/auth/store.js';

/**
 * The Lock button: forget the key now rather than when `remember` runs out. The stored key is
 * deleted, the worker drops the content key it holds in memory, and the reload lands on the
 * lock shell.
 */
export async function lockSite(): Promise<void> {
  try {
    const response = await fetch(config.base + MANIFEST_FILE, { cache: 'no-store' });
    const { salt } = parseManifest(await response.json()).kdf;
    await indexedDbStore().delete(recordId(new URL(config.base, window.location.origin).href, salt));
  } catch {
    // The worker forgets it below as well.
  }

  const worker = navigator.serviceWorker?.controller;
  if (worker) {
    await new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve();
      worker.postMessage({ type: LOCK_MESSAGE }, [channel.port2]);
      setTimeout(resolve, 3000);
    });
  }

  window.location.reload();
}

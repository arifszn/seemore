/**
 * The stored key: one IndexedDB record per site, keyed by its scope and salt ({@link recordId}).
 *
 * IndexedDB rather than `localStorage` because it is the one store a page and a service
 * worker share, and because it holds a `CryptoKey` as the object itself — non-extractable,
 * so page code can use it but never read its bytes. Keyed by salt, so a renamed site (or a
 * changed `auth.id`) finds no record and shows the lock screen.
 */

export interface KeyRecord {
  kek: CryptoKey;
  /** Milliseconds since the epoch of the last navigation. */
  lastSeen: number;
}

export interface KeyStore {
  get(id: string): Promise<KeyRecord | undefined>;
  put(id: string, record: KeyRecord): Promise<void>;
  delete(id: string): Promise<void>;
}

const DATABASE = 'seemore-auth';
const STORE = 'keys';

export function indexedDbStore(factory: IDBFactory = indexedDB): KeyStore {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB is unavailable.'));
    });

  const run = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> => {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = action(transaction.objectStore(STORE));
        transaction.oncomplete = () => resolve(request.result as T);
        transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
        transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
      });
    } finally {
      db.close();
    }
  };

  return {
    get: (id) => run<KeyRecord | undefined>('readonly', (store) => store.get(id)),
    put: (id, record) => run<void>('readwrite', (store) => store.put(record, id)),
    delete: (id) => run<void>('readwrite', (store) => store.delete(id)),
  };
}

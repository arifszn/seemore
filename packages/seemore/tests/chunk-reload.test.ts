import { describe, expect, it } from 'vitest';
import {
  CHUNK_RELOAD_KEY,
  onVitePreloadError,
} from '../src/app/lib/chunkReload.js';

/** Storage in memory, so the guard runs in the Node test. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: () => null,
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  } satisfies Storage;
}

describe('chunk reload guard', () => {
  it('reloads once per window: a second failure is left to the error boundary, a later one recovers', () => {
    const storage = memoryStorage();
    let reloads = 0;
    const fail = (now: number) =>
      onVitePreloadError(storage, now, () => {
        reloads += 1;
      });

    fail(1_000);
    expect(reloads).toBe(1);
    expect(Number(storage.getItem(CHUNK_RELOAD_KEY))).toBe(1_000);

    // The reload landed on the same broken chunk: no second reload, the error renders.
    fail(3_000);
    expect(reloads).toBe(1);

    // The window passed, so a genuinely later failure — a second deploy, days into this
    // tab — gets its one reload.
    fail(60_000);
    expect(reloads).toBe(2);
  });
});

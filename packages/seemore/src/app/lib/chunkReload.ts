/** sessionStorage key holding the time of the last chunk-failure reload. */
export const CHUNK_RELOAD_KEY = 'seemore:chunk-reload';

/** How long one reload blocks the next: a second failure inside the window renders the error instead of looping. */
export const CHUNK_RELOAD_WINDOW_MS = 5_000;

/**
 * One reload for a chunk that vanished under the open tab — a deploy renamed the hashed
 * files, and the fresh HTML names the new ones. The timestamp guard allows one reload per
 * window: a reload that lands on the same failure falls through to the error boundary
 * instead of looping, and once the window passes, a later deploy recovers normally.
 */
export function onVitePreloadError(storage: Storage, now: number, reload: () => void): void {
  const last = storage.getItem(CHUNK_RELOAD_KEY);
  if (last !== null && now - Number(last) < CHUNK_RELOAD_WINDOW_MS) return;
  try {
    storage.setItem(CHUNK_RELOAD_KEY, String(now));
  } catch {
    // Storage blocked means no guard, and an unguarded reload could loop forever.
    return;
  }
  reload();
}

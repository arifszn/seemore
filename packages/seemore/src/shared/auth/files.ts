/**
 * Names shared by the build, the lock shell, the service worker and the app.
 */

/**
 * Files a protected build writes unencrypted, relative to the base. Everything else in the
 * output must be encrypted or the build fails; the configured favicon is added at build time.
 */
export const PUBLIC_FILES = [
  'index.html',
  '404.html',
  '200.html',
  '_redirects',
  '.nojekyll',
  '_headers',
  'sw.js',
  'auth.json',
] as const;

export const MANIFEST_FILE = 'auth.json';
export const WORKER_FILE = 'sw.js';
/** The app's HTML template: encrypted, and served by the worker for every navigation. */
export const APP_FILE = 'app.html';

/** Posted to the service worker to forget the key: the Lock button, and a `remember: 0` mismatch. */
export const LOCK_MESSAGE = 'seemore-auth:lock';

/** The `sessionStorage` key holding a `remember: 0` tab's session id. */
export function sessionStorageKey(salt: string): string {
  return `seemore-auth:session:${salt}`;
}

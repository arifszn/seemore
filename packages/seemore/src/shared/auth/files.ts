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

/** Posted to the service worker by the Lock button, to forget the key. */
export const LOCK_MESSAGE = 'seemore-auth:lock';

/** The id of the lock shell's config element; the worker recognises the lock shell by it. */
export const SHELL_CONFIG_ID = 'seemore-auth-config';

/**
 * The stored key's record id: the site's scope and salt, so two protected sites on one origin
 * never read or delete each other's key.
 */
export function recordId(scope: string, salt: string): string {
  return `${scope} ${salt}`;
}

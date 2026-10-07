/**
 * Path helpers for the extension. Root resolution and canonicalisation are shared with the
 * desktop app and live in `@seemore/host`.
 */
import { join } from 'node:path';

/**
 * A `ContentPage.file`-shaped path — posix separators, relative to the content root — onto
 * a platform-native absolute path under `root`. Used for "open this page's source file".
 */
export function resolveRelativePosix(root: string, posixRelative: string): string {
  const segments = posixRelative.split('/').filter((segment) => segment !== '');
  return join(root, ...segments);
}

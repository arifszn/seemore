import { existsSync, statSync } from 'node:fs';
import { basename, isAbsolute, relative } from 'node:path';
import { isRemoteHref, withBase } from './base.js';
import type { ResolvedSeemoreConfig } from './config/schema.js';
import { toPosix } from './content/slug.js';
import type { WarningCollector } from './report.js';

/**
 * True for a favicon given as a remote or `data:` URL. A Windows drive path (`D:\icon.svg`)
 * also starts with a letter and a colon, so it would pass for a URL scheme without the check.
 */
export function isRemoteFavicon(favicon: string): boolean {
  return isRemoteHref(favicon) && !/^[a-z]:[\\/]/i.test(favicon);
}

export type Favicon =
  /** A remote or `data:` URL, linked as written. */
  | { href: string; file?: undefined; path?: undefined }
  /** A local file, published at `path` (relative to the output directory) and linked at `href`. */
  | { href: string; file: string; path: string };

/**
 * The configured favicon, or `undefined` when none is configured or its file is missing;
 * then the template's default icon stays. A missing file is a warning.
 *
 * A file inside the config's folder keeps its relative path; one outside it is published
 * at the root under its own name.
 */
export function resolveFavicon(config: ResolvedSeemoreConfig, warnings?: WarningCollector): Favicon | undefined {
  const favicon = config.favicon;
  if (favicon === undefined) return undefined;
  if (isRemoteFavicon(favicon)) return { href: favicon };

  if (!existsSync(favicon) || !statSync(favicon).isFile()) {
    warnings?.add(`The favicon named by \`favicon\` was not found: ${favicon}`);
    return undefined;
  }

  const rel = toPosix(relative(config.root, favicon));
  const path = rel === '' || rel.startsWith('../') || rel === '..' || isAbsolute(rel) ? basename(favicon) : rel;
  return { href: withBase(config.base, `/${encodeURI(path)}`), file: favicon, path };
}

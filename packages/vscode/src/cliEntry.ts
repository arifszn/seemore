/**
 * Locates the `seemore` CLI to spawn.
 *
 * In development the workspace symlink puts `packages/seemore` at
 * `<extension>/node_modules/seemore`; packaging stages a real resolved copy at the same
 * path (see scripts/package.mjs), so this one path works unchanged either way.
 * `seemore.path` is an undocumented escape hatch for pointing the extension at a different
 * checkout.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export class CliEntryNotFoundError extends Error {}

export interface ResolveCliEntryOptions {
  /** The extension's install directory (`ExtensionContext.extensionPath`). */
  extensionPath: string;
  /** `seemore.path` setting — an explicit override, for developing seemore itself. */
  override?: string;
}

export function resolveCliEntry(options: ResolveCliEntryOptions): string {
  const override = options.override?.trim();
  const candidate =
    override !== undefined && override !== ''
      ? override
      : join(options.extensionPath, 'node_modules', 'seemore', 'dist', 'cli', 'index.js');

  if (!existsSync(candidate)) {
    throw new CliEntryNotFoundError(
      override !== undefined && override !== ''
        ? `The "seemore.path" setting points at ${candidate}, which does not exist.`
        : `seemore's CLI was not found at ${candidate}. The extension may be installed incorrectly — try reinstalling it.`,
    );
  }

  return candidate;
}

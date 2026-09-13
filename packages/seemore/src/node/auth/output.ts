import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encryptFile, isEncrypted } from '../../shared/auth/crypto.js';
import { PUBLIC_FILES } from '../../shared/auth/files.js';
import { toPosix } from '../content/slug.js';

/** Every file a protected build may write unencrypted, relative to the output directory. */
export function publicFiles(favicon: string | undefined): string[] {
  return favicon === undefined ? [...PUBLIC_FILES] : [...PUBLIC_FILES, toPosix(favicon)];
}

/**
 * Encrypt, in place, every output file not on the public list. The published path is the
 * associated data, so it is the path relative to the output directory, as the worker sees it
 * relative to the base.
 */
export async function encryptOutput(outDir: string, contentKey: CryptoKey, open: readonly string[]): Promise<number> {
  const isPublic = new Set(open);
  let encrypted = 0;
  for (const path of listFiles(outDir)) {
    if (isPublic.has(path)) continue;
    const file = join(outDir, path);
    writeFileSync(file, await encryptFile(contentKey, path, new Uint8Array(readFileSync(file))));
    encrypted++;
  }
  return encrypted;
}

/**
 * The leak guard, an allowlist rather than a denylist: any file not on the public list that
 * is not ciphertext fails the build. A future output nobody remembered to handle cannot ship
 * as plaintext.
 */
export function assertOutputEncrypted(outDir: string, open: readonly string[]): void {
  const isPublic = new Set(open);
  const plaintext = listFiles(outDir).filter((path) => !isPublic.has(path) && !isEncrypted(readFileSync(join(outDir, path))));
  if (plaintext.length === 0) return;

  throw new Error(
    `seemore stopped the build: ${plaintext.length === 1 ? 'this file was' : 'these files were'} about to ship unencrypted, and \`auth\` only allows its public files in plain text:\n` +
      `${plaintext.map((path) => `  - ${path}`).join('\n')}\n\n` +
      `This is a bug in seemore. Please report it at https://github.com/arifszn/seemore/issues.`,
  );
}

/** Every file under `dir`, dotfiles included, as posix paths relative to it. */
export function listFiles(dir: string, prefix = ''): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...listFiles(dir, path));
    else files.push(path);
  }
  return files.sort();
}

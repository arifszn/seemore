/**
 * Small JSON files under `userData`. Reads never throw: a missing or corrupt file is the
 * fallback. Writes go through a temporary file and a rename, so a crash mid-write leaves the
 * previous version rather than half a file.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}

export function writeJson(file: string, value: unknown): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    renameSync(temp, file);
  } catch (error) {
    console.error(`seemore: could not write ${file}:`, error);
  }
}

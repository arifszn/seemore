/**
 * The bundled CLI's version against the minimum a host requires, read from its
 * `package.json` before the first start. A host that ships its own copy of seemore should
 * never see a mismatch; when it does, the install is broken, and saying so beats waiting out
 * the ready-line timeout.
 */
import { readFileSync } from 'node:fs';

export type CliVersionCheck =
  | { ok: true; found: string }
  | { ok: false; found: string | undefined; required: string; message: string };

/** The `version` field of the CLI's `package.json`, or `undefined` if it can't be read. */
export function readCliVersion(packageJsonPath: string): string | undefined {
  try {
    const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: unknown };
    return typeof version === 'string' ? version : undefined;
  } catch {
    return undefined;
  }
}

export function checkCliVersion(found: string | undefined, required: string): CliVersionCheck {
  if (found === undefined) {
    return { ok: false, found, required, message: `The bundled seemore CLI could not be read. Reinstall the app.` };
  }
  if (compareVersions(found, required) < 0) {
    return {
      ok: false,
      found,
      required,
      message: `The bundled seemore CLI is ${found}, older than the ${required} this app requires. Reinstall the app.`,
    };
  }
  return { ok: true, found };
}

/**
 * Semver precedence for `x.y.z[-prerelease]`, enough for comparing seemore's own releases:
 * a prerelease sorts below its release, and prerelease identifiers compare numerically when
 * both are numbers. Build metadata is ignored.
 */
export function compareVersions(a: string, b: string): number {
  const [coreA = '', preA] = a.split('+')[0]!.split(/-(.*)/s);
  const [coreB = '', preB] = b.split('+')[0]!.split(/-(.*)/s);

  const partsA = coreA.split('.').map(Number);
  const partsB = coreB.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }

  if (preA === undefined || preB === undefined) {
    return preA === preB ? 0 : preA === undefined ? 1 : -1;
  }
  const idsA = preA.split('.');
  const idsB = preB.split('.');
  for (let i = 0; i < Math.max(idsA.length, idsB.length); i++) {
    const x = idsA[i];
    const y = idsB[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const nx = /^\d+$/.test(x) ? Number(x) : undefined;
    const ny = /^\d+$/.test(y) ? Number(y) : undefined;
    if (nx !== undefined && ny !== undefined) return Math.sign(nx - ny);
    if (nx !== undefined) return -1;
    if (ny !== undefined) return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

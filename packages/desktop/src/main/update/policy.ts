/**
 * The update check policy and `update.json` (DESKTOP-SPEC §10.1). Pure: no Electron, so the
 * rules are unit-tested on their own.
 */
import { compareVersions } from '@seemore/host';

export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** After the first window finishes loading, so a check never delays startup. */
export const LAUNCH_DELAY_MS = 10_000;

export interface UpdateState {
  /** Check for Updates Automatically. */
  autoCheck: boolean;
  /** Time of the last successful check, for the 6 h skip on launch. */
  lastCheckedAt?: number;
  /** Skip This Version: automatic checks ignore it, a manual check still offers it. */
  skippedVersion?: string;
  /** A downloaded, verified update that hasn't been installed. */
  staged?: { version: string; path: string };
  /** Install paths where the user answered Not Now to moving into Applications (§10.3). */
  moveDeclined?: string[];
}

export function parseUpdateState(value: unknown): UpdateState {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const staged = raw.staged as Record<string, unknown> | undefined;
  return {
    autoCheck: raw.autoCheck !== false,
    lastCheckedAt: typeof raw.lastCheckedAt === 'number' ? raw.lastCheckedAt : undefined,
    skippedVersion: typeof raw.skippedVersion === 'string' ? raw.skippedVersion : undefined,
    staged:
      typeof staged?.version === 'string' && typeof staged.path === 'string'
        ? { version: staged.version, path: staged.path }
        : undefined,
    moveDeclined: Array.isArray(raw.moveDeclined) ? raw.moveDeclined.filter((p) => typeof p === 'string') : undefined,
  };
}

export type Trigger = 'launch' | 'timer' | 'manual';

/** Whether a trigger runs a check at all. Manual always does. */
export function shouldCheck(trigger: Trigger, state: UpdateState, now: number): boolean {
  if (trigger === 'manual') return true;
  if (!state.autoCheck) return false;
  if (trigger === 'timer') return true;
  return state.lastCheckedAt === undefined || now - state.lastCheckedAt >= CHECK_INTERVAL_MS;
}

/** Whether a version the feed reports is offered to the user. */
export function shouldOffer(version: string, current: string, state: UpdateState, trigger: Trigger): boolean {
  if (compareVersions(version, current) <= 0) return false;
  return trigger === 'manual' || version !== state.skippedVersion;
}

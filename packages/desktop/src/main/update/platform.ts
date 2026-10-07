/** What each platform's updater does for the shared check policy (DESKTOP-SPEC §10). */
export interface Staged {
  version: string;
  path: string;
}

export interface PlatformUpdater {
  /** The newest version the feed offers. Throws on network or feed errors. */
  latest(): Promise<string>;
  /** Whether this install can replace itself. If not, the user downloads by hand (§10.3 step 6). */
  installable(): boolean;
  /** Downloads and verifies the version `latest()` just returned; resolves to the staged path. */
  download(version: string): Promise<string>;
  /** Makes an update staged by an earlier session installable again; false if it is unusable. */
  restore(staged: Staged): Promise<boolean>;
  /** Deletes a staged update that has been skipped or overtaken. */
  discard(staged: Staged): void;
  /** Installs the staged update and quits; the new version starts in its place. */
  install(staged: Staged): Promise<void>;
}

/** A checksum or signature mismatch: never retried against the same version this session. */
export class VerificationError extends Error {}

/** Where to download a version by hand. */
export function releaseUrl(version: string): string {
  return `https://github.com/arifszn/seemore/releases/tag/desktop-v${version}`;
}

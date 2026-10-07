/**
 * macOS: the app's own updater (DESKTOP-SPEC §10.3). Squirrel.Mac rejects every update to an
 * ad-hoc signed app, so this fetches the signed feed, downloads the zip for this
 * architecture with Node's `fetch` (no quarantine attribute), checks its sha256, extracts it
 * next to the installed app, and swaps the bundles from a detached script once the app quits.
 */
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, constants, createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { FEED_URL, type MacManifest, verifyFeed } from './feed.js';
import { type PlatformUpdater, type Staged, VerificationError } from './platform.js';

const run = promisify(execFile);

export const BUNDLE_ID = 'dev.seemore.desktop';

export interface MacUpdaterOptions {
  /** The installed `seemore.app`. */
  bundlePath: string;
  arch: string;
  publicKey: string;
  pid: number;
  quit: () => void;
  feedUrl?: string;
  /** What reopens the app after the swap; `open` outside tests. */
  relaunch?: string;
}

/** The `.app` an executable belongs to: `<bundle>/Contents/MacOS/<name>`. */
export function bundleOf(execPath: string): string {
  return dirname(dirname(dirname(execPath)));
}

/**
 * Waits for the app to exit, puts the new bundle in place of the old one, and reopens it.
 * If the new bundle can't be moved in, the old one goes back. Arguments: pid, installed
 * bundle, staged bundle, relaunch command.
 */
export const INSTALL_SCRIPT = `#!/bin/sh
pid="$1"; old="$2"; new="$3"; relaunch="$4"
aside="$old.replaced-$$"
while kill -0 "$pid" 2>/dev/null; do sleep 0.2; done
if mv "$old" "$aside"; then
  if mv "$new" "$old"; then rm -rf "$aside"; else mv "$aside" "$old"; fi
fi
rm -rf "$(dirname "$new")"
"$relaunch" "$old"
`;

export function createMacUpdater(options: MacUpdaterOptions): PlatformUpdater {
  let manifest: MacManifest | undefined;
  const parent = dirname(options.bundlePath);
  const stagingDir = (version: string) => join(parent, `.seemore-update-${version}`);

  /** Checks the extracted bundle is a valid, signed seemore of the expected version. */
  const verifyBundle = async (app: string, version: string): Promise<void> => {
    const plist = join(app, 'Contents', 'Info.plist');
    try {
      await run('codesign', ['--verify', '--deep', '--strict', app]);
      const read = async (key: string) =>
        (await run('plutil', ['-extract', key, 'raw', '-o', '-', plist])).stdout.trim();
      if ((await read('CFBundleIdentifier')) !== BUNDLE_ID) throw new Error('wrong bundle identifier');
      if ((await read('CFBundleShortVersionString')) !== version) throw new Error('wrong version');
    } catch (error) {
      throw new VerificationError(`The downloaded update failed verification: ${(error as Error).message}`);
    }
  };

  return {
    async latest() {
      const res = await fetch(options.feedUrl ?? FEED_URL);
      if (!res.ok) throw new Error(`The update feed answered HTTP ${res.status}.`);
      manifest = verifyFeed(await res.json(), options.publicKey);
      return manifest.version;
    },

    installable() {
      try {
        accessSync(parent, constants.W_OK);
        accessSync(options.bundlePath, constants.W_OK);
        return true;
      } catch {
        // An admin-owned /Applications, the mounted DMG, or a translocated copy.
        return false;
      }
    },

    async download(version) {
      if (manifest?.version !== version) throw new Error(`No feed entry for ${version}.`);
      const asset = options.arch === 'arm64' ? manifest.arm64 : manifest.x64;
      const dir = stagingDir(version);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const zip = join(dir, 'update.zip');
      try {
        const res = await fetch(asset.url);
        if (!res.ok || res.body === null) throw new Error(`The update download answered HTTP ${res.status}.`);
        const hash = createHash('sha256');
        const hashing = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            hash.update(chunk);
            callback(null, chunk);
          },
        });
        await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), hashing, createWriteStream(zip));
        if (hash.digest('hex') !== asset.sha256) throw new VerificationError('The downloaded update has the wrong checksum.');

        await run('ditto', ['-x', '-k', zip, dir]);
        rmSync(zip);
        const app = join(dir, 'seemore.app');
        await verifyBundle(app, version);
        return app;
      } catch (error) {
        rmSync(dir, { recursive: true, force: true });
        throw error;
      }
    },

    async restore(staged) {
      return existsSync(staged.path);
    },

    discard(staged) {
      rmSync(dirname(staged.path), { recursive: true, force: true });
    },

    async install(staged: Staged) {
      // Checked again: the staged bundle sat on disk, maybe since an earlier session.
      try {
        await verifyBundle(staged.path, staged.version);
      } catch (error) {
        rmSync(dirname(staged.path), { recursive: true, force: true });
        throw error;
      }
      const script = join(dirname(staged.path), 'install.sh');
      writeFileSync(script, INSTALL_SCRIPT, { mode: 0o755 });
      const child = spawn(
        '/bin/sh',
        [script, String(options.pid), options.bundlePath, staged.path, options.relaunch ?? '/usr/bin/open'],
        { detached: true, stdio: 'ignore' },
      );
      child.unref();
      options.quit();
    },
  };
}

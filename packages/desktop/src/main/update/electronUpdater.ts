/**
 * Windows and Linux: electron-updater with the GitHub provider (DESKTOP-SPEC §10.2). It picks
 * `NsisUpdater`, `AppImageUpdater` or `DebUpdater` itself, reads `app-update.yml` from the
 * build, and keeps its own download cache, so a staged update is restored by checking and
 * downloading again without fetching the file.
 */
import electronUpdater from 'electron-updater';
import { type PlatformUpdater, type Staged, VerificationError } from './platform.js';

export function createElectronUpdater(): PlatformUpdater {
  const { autoUpdater } = electronUpdater;
  autoUpdater.autoDownload = false;
  // Quitting normally never installs (§10.1); only Restart to Update does.
  autoUpdater.autoInstallOnAppQuit = false;
  // Explicit: a prerelease build would otherwise turn on the path that parses tags with
  // `semver.valid`, which rejects `desktop-v…` (§10.2).
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = null;
  // Failures reach us as rejected promises; an unhandled 'error' event would throw.
  autoUpdater.on('error', () => undefined);

  const latest = async (): Promise<string> => {
    const result = await autoUpdater.checkForUpdates();
    if (result === null) throw new Error('Updates are not available for this install.');
    return result.updateInfo.version;
  };

  const download = async (): Promise<string> => {
    try {
      const [file] = await autoUpdater.downloadUpdate();
      return file ?? '';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw /sha512|checksum/i.test(message) ? new VerificationError(message) : error;
    }
  };

  return {
    latest,
    installable: () => true,
    download,
    async restore(staged: Staged) {
      if ((await latest()) !== staged.version) return false;
      await download();
      return true;
    },
    discard: () => undefined,
    async install() {
      // Silent, since the user already chose Restart to Update; then start the new version.
      autoUpdater.quitAndInstall(true, true);
    },
  };
}

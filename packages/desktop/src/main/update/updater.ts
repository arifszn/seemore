/**
 * The check policy shared by every platform (DESKTOP-SPEC §10.1): when to check, what to
 * offer, staging, and the update prompt. Electron-free; the dialogs come in through `ui`.
 *
 * The spec's banner is a dialog: site pages have no preload to send a click back (§4.2).
 * **Later** hides it until the next launch; the menu keeps **Restart to Update** meanwhile.
 */
import { compareVersions } from '@seemore/host';
import { readJson, writeJson } from '../jsonStore.js';
import { type PlatformUpdater, releaseUrl, type Staged, VerificationError } from './platform.js';
import { CHECK_INTERVAL_MS, LAUNCH_DELAY_MS, parseUpdateState, shouldCheck, shouldOffer, type Trigger, type UpdateState } from './policy.js';

export interface UpdaterUi {
  /** Resolves to the index of the chosen button. */
  ask(message: string, detail: string, buttons: string[], cancelId: number): Promise<number>;
  inform(message: string, detail?: string, isError?: boolean): void;
  openExternal(url: string): void;
}

export interface UpdaterOptions {
  platform: PlatformUpdater;
  currentVersion: string;
  /** `userData/update.json`. */
  statePath: string;
  jobsRunning: () => boolean;
  ui: UpdaterUi;
  /** The menu shows the ready version and the auto-check setting. */
  onChange: () => void;
  now?: () => number;
  log?: (message: string) => void;
}

export class Updater {
  private state: UpdateState;
  private busy = false;
  private prompting = false;
  /** Waiting for export and build jobs to finish before prompting (§16). */
  private promptPending = false;
  /** Versions answered with Later this session. */
  private readonly dismissed = new Set<string>();
  /** Versions that failed a checksum or signature check this session. */
  private readonly failed = new Set<string>();
  private ready: Staged | undefined;
  private timers: NodeJS.Timeout[] = [];
  private started = false;

  constructor(private readonly options: UpdaterOptions) {
    this.state = parseUpdateState(readJson(options.statePath));
  }

  get autoCheck(): boolean {
    return this.state.autoCheck;
  }

  /** The staged version Restart to Update would install. */
  get readyVersion(): string | undefined {
    return this.ready?.version;
  }

  setAutoCheck(on: boolean): void {
    this.state.autoCheck = on;
    this.save();
    this.options.onChange();
  }

  /** Once the first window has finished loading: restore a staged update, then schedule checks. */
  start(): void {
    if (this.started) return;
    this.started = true;
    void this.restore().finally(() => {
      this.timers.push(setTimeout(() => void this.check('launch'), LAUNCH_DELAY_MS));
      this.timers.push(setInterval(() => void this.check('timer'), CHECK_INTERVAL_MS));
    });
  }

  stop(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }

  /** Runs a check for `trigger`. A trigger that fires while one is in progress is dropped. */
  async check(trigger: Trigger): Promise<void> {
    if (this.busy || !shouldCheck(trigger, this.state, this.now())) return;
    this.busy = true;
    const manual = trigger === 'manual';
    let version: string | undefined;
    try {
      version = await this.options.platform.latest();
      this.state.lastCheckedAt = this.now();
      this.save();

      if (!shouldOffer(version, this.options.currentVersion, this.state, trigger)) {
        if (manual && compareVersions(version, this.options.currentVersion) <= 0) {
          this.options.ui.inform(`seemore ${this.options.currentVersion} is the latest version.`);
        }
        return;
      }
      if (manual) this.dismissed.delete(version);
      if (this.ready?.version === version) {
        void this.prompt();
        return;
      }
      this.dropStaged();

      if (!this.options.platform.installable()) {
        void this.offerDownload(version);
        return;
      }
      if (this.failed.has(version)) {
        if (manual) this.options.ui.inform(`seemore ${version} failed verification earlier and was not downloaded again.`, undefined, true);
        return;
      }
      if (manual) this.options.ui.inform(`Downloading seemore ${version}.`, 'You will be asked to restart once it is ready.');
      const path = await this.options.platform.download(version);
      this.ready = { version, path };
      this.state.staged = this.ready;
      this.save();
      this.options.onChange();
      void this.prompt();
    } catch (error) {
      if (error instanceof VerificationError && version !== undefined) this.failed.add(version);
      const message = error instanceof Error ? error.message : String(error);
      this.log(`update check failed: ${message}`);
      if (manual) this.options.ui.inform('Could not check for updates.', message, true);
    } finally {
      this.busy = false;
    }
  }

  /** Export and build jobs have all finished; show a prompt that was held back. */
  jobsIdle(): void {
    if (!this.promptPending) return;
    this.promptPending = false;
    void this.prompt();
  }

  /** Restart to Update, from the prompt or the menu. */
  async restart(): Promise<void> {
    const staged = this.ready;
    if (staged === undefined) return;
    if (this.options.jobsRunning()) {
      this.options.ui.inform('An export or build is still running.', 'Restart to update once it has finished.');
      return;
    }
    try {
      await this.options.platform.install(staged);
    } catch (error) {
      if (error instanceof VerificationError) this.failed.add(staged.version);
      this.ready = undefined;
      this.state.staged = undefined;
      this.save();
      this.options.onChange();
      this.options.ui.inform('Could not install the update.', error instanceof Error ? error.message : String(error), true);
    }
  }

  private async prompt(): Promise<void> {
    const staged = this.ready;
    if (staged === undefined || this.prompting || this.dismissed.has(staged.version)) return;
    if (this.options.jobsRunning()) {
      this.promptPending = true;
      return;
    }
    this.prompting = true;
    try {
      const choice = await this.options.ui.ask(
        `seemore ${staged.version} is ready to install.`,
        `You have ${this.options.currentVersion}.`,
        ['Restart to Update', 'Skip This Version', 'Later'],
        2,
      );
      if (choice === 0) await this.restart();
      else if (choice === 1) this.skip(staged.version);
      else this.dismissed.add(staged.version);
    } finally {
      this.prompting = false;
    }
  }

  /** §10.3 step 6: this copy can't replace itself, so link to the release instead. */
  private async offerDownload(version: string): Promise<void> {
    if (this.prompting || this.dismissed.has(version)) return;
    this.prompting = true;
    try {
      const choice = await this.options.ui.ask(
        `seemore ${version} is available.`,
        `This copy can't update itself where it is. Download the new version and replace it.`,
        ['Download the Update', 'Skip This Version', 'Later'],
        2,
      );
      if (choice === 0) this.options.ui.openExternal(releaseUrl(version));
      else if (choice === 1) this.skip(version);
      this.dismissed.add(version);
    } finally {
      this.prompting = false;
    }
  }

  private skip(version: string): void {
    this.state.skippedVersion = version;
    this.dropStaged();
    this.save();
  }

  /** A staged update from an earlier session comes back without a new download (§10.1). */
  private async restore(): Promise<void> {
    const staged = this.state.staged;
    if (staged === undefined) return;
    if (compareVersions(staged.version, this.options.currentVersion) <= 0 || staged.version === this.state.skippedVersion) {
      this.dropStaged();
      this.save();
      return;
    }
    this.busy = true;
    try {
      if (await this.options.platform.restore(staged)) {
        this.ready = staged;
        this.options.onChange();
        void this.prompt();
      } else {
        this.dropStaged();
        this.save();
      }
    } catch (error) {
      this.log(`could not restore the staged update: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.busy = false;
    }
  }

  /** Deletes the staged update, if any: skipped, installed, or overtaken by a newer one. */
  private dropStaged(): void {
    const staged = this.state.staged;
    if (staged === undefined) return;
    try {
      this.options.platform.discard(staged);
    } catch (error) {
      this.log(`could not delete the staged update: ${String(error)}`);
    }
    this.state.staged = undefined;
    if (this.ready !== undefined) {
      this.ready = undefined;
      this.options.onChange();
    }
  }

  private save(): void {
    writeJson(this.options.statePath, this.state);
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  private log(message: string): void {
    (this.options.log ?? console.warn)(`seemore: ${message}`);
  }
}

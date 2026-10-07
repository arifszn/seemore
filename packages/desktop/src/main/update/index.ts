/** Wires the updater into Electron (DESKTOP-SPEC §10). Packaged builds only. */
import { join } from 'node:path';
import { app, dialog, shell } from 'electron';
import { readJson, writeJson } from '../jsonStore.js';
import { createElectronUpdater } from './electronUpdater.js';
import { FEED_PUBLIC_KEY } from './feedKey.js';
import { bundleOf, createMacUpdater } from './macUpdater.js';
import { parseUpdateState } from './policy.js';
import { Updater } from './updater.js';

const statePath = () => join(app.getPath('userData'), 'update.json');

export function createUpdater(hooks: { jobsRunning: () => boolean; onChange: () => void }): Updater | undefined {
  if (!app.isPackaged) return undefined;
  const platform =
    process.platform === 'darwin'
      ? createMacUpdater({
          bundlePath: bundleOf(process.execPath),
          arch: process.arch,
          publicKey: FEED_PUBLIC_KEY,
          pid: process.pid,
          quit: () => app.quit(),
        })
      : createElectronUpdater();
  return new Updater({
    platform,
    currentVersion: app.getVersion(),
    statePath: statePath(),
    jobsRunning: hooks.jobsRunning,
    onChange: hooks.onChange,
    ui: {
      ask: async (message, detail, buttons, cancelId) =>
        (await dialog.showMessageBox({ type: 'info', message, detail, buttons, defaultId: 0, cancelId })).response,
      inform: (message, detail, isError) => {
        const controller = new AbortController();
        void dialog.showMessageBox({ type: isError ? 'error' : 'info', message, detail, signal: controller.signal });
        return () => controller.abort();
      },
      openExternal: (url) => void shell.openExternal(url),
    },
  });
}

/**
 * §10.3: run from outside Applications (the mounted DMG, Downloads), offer once to move.
 * **Not Now** is remembered per install path. Resolves to true when the app is moving, in
 * which case it relaunches from Applications and this instance quits.
 */
export async function offerMoveToApplications(): Promise<boolean> {
  if (process.platform !== 'darwin' || !app.isPackaged || app.isInApplicationsFolder()) return false;
  const here = bundleOf(process.execPath);
  const state = parseUpdateState(readJson(statePath()));
  if (state.moveDeclined?.includes(here)) return false;

  const { response } = await dialog.showMessageBox({
    type: 'question',
    message: 'Move seemore to the Applications folder?',
    detail: 'From there it can update itself.',
    buttons: ['Move to Applications', 'Not Now'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 1) {
    writeJson(statePath(), { ...state, moveDeclined: [...(state.moveDeclined ?? []), here] });
    return false;
  }
  try {
    return app.moveToApplicationsFolder();
  } catch (error) {
    await dialog.showMessageBox({ type: 'error', message: 'Could not move seemore to Applications.', detail: String(error) });
    return false;
  }
}

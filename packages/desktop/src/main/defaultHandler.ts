/**
 * Becoming the default app for Markdown (DESKTOP-SPEC §13). The install registers seemore
 * for Open With; becoming the default is a separate step on each OS, offered once on first
 * launch and always available from the menu.
 */
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { app, dialog, shell } from 'electron';
import { readJson, writeJson } from './jsonStore.js';
import { bundleOf } from './update/macUpdater.js';

export type DefaultHandlerPlatform = 'darwin' | 'win32' | 'linux';

/**
 * Where **Make Default** can work. Never from source: the running app is Electron itself.
 * Not from an AppImage: nothing installs its desktop file for `xdg-mime` to name.
 */
export function defaultHandlerPlatform(
  platform: NodeJS.Platform,
  isPackaged: boolean,
  appImage: string | undefined,
): DefaultHandlerPlatform | undefined {
  if (!isPackaged) return undefined;
  if (platform === 'darwin' || platform === 'win32') return platform;
  if (platform === 'linux' && appImage === undefined) return 'linux';
  return undefined;
}

/** Asked once, and not on a launch that came from opening a path. */
export function shouldOfferDefault(state: unknown, launchedWithPath: boolean): boolean {
  const asked = typeof state === 'object' && state !== null && (state as { asked?: unknown }).asked === true;
  return !asked && !launchedWithPath;
}

const statePath = () => join(app.getPath('userData'), 'default-handler.json');

export const currentDefaultHandlerPlatform = () =>
  defaultHandlerPlatform(process.platform, app.isPackaged, process.env.APPIMAGE);

/**
 * The first-run prompt. `launchedWithPath` is read when the prompt would show, so a file
 * opened while the app starts still counts (§16).
 */
export async function offerDefaultHandler(launchedWithPath: () => boolean): Promise<void> {
  if (currentDefaultHandlerPlatform() === undefined) return;
  if (!shouldOfferDefault(readJson(statePath()), launchedWithPath())) return;
  writeJson(statePath(), { asked: true });
  const { response } = await dialog.showMessageBox({
    type: 'question',
    message: 'Open Markdown files with seemore by default?',
    detail: `You can do this later from the ${process.platform === 'darwin' ? 'seemore' : 'Help'} menu.`,
    buttons: ['Make Default', 'Not Now'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) await makeDefaultHandler();
}

export async function makeDefaultHandler(): Promise<void> {
  switch (currentDefaultHandlerPlatform()) {
    case 'darwin': {
      // macOS asks the user to confirm; keeping the other app is exit 1, not an error.
      const helper = join(process.resourcesPath, 'default-handler');
      const result = await run(helper, [bundleOf(process.execPath)]);
      if (result.code === 2 || result.error) failed(result.stderr || String(result.error));
      return;
    }
    case 'win32':
      // No API on Windows: Settings, at seemore's own page on Windows 11 (the installer's
      // RegisteredApplications entry, build/installer.nsh), the Default apps page elsewhere.
      await shell.openExternal('ms-settings:defaultapps?registeredAppUser=seemore');
      return;
    case 'linux': {
      const result = await run('xdg-mime', ['default', 'seemore-desktop.desktop', 'text/markdown']);
      if (result.code !== 0) failed(result.stderr || String(result.error));
      else void dialog.showMessageBox({ type: 'info', message: 'seemore now opens Markdown files.' });
      return;
    }
    default:
  }
}

function failed(detail: string): void {
  void dialog.showMessageBox({ type: 'error', message: 'seemore could not become the default for Markdown files.', detail });
}

function run(file: string, args: string[]): Promise<{ code: number | null; stderr: string; error?: Error }> {
  return new Promise((resolve) => {
    execFile(file, args, (error, _stdout, stderr) => {
      const code = error === null ? 0 : typeof error.code === 'number' ? error.code : null;
      resolve({ code, stderr: stderr.trim(), error: code === null ? (error ?? undefined) : undefined });
    });
  });
}

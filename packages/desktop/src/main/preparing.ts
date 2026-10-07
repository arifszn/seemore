/**
 * Windows' first launch after an install or update: unpack the CLI (DESKTOP-SPEC §9) behind a
 * small window, with progress on the taskbar button. Nothing shows when it is already unpacked.
 */
import { join } from 'node:path';
import { BrowserWindow, dialog, nativeTheme } from 'electron';
import { cliNeedsUnpack, prepareCli } from './cli.js';

/** Resolves to false when the CLI couldn't be unpacked; the user has been told. */
export async function prepareCliWithProgress(): Promise<boolean> {
  let window: BrowserWindow | undefined;
  try {
    if (cliNeedsUnpack()) {
      window = new BrowserWindow({
        width: 320,
        height: 96,
        // The page's size, not the frame's, so it never scrolls.
        useContentSize: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        title: 'seemore',
        // Shown once painted, on the page's own background: no white flash in dark mode.
        show: false,
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#ffffff',
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      // No File/Edit/View on Windows and Linux; nothing in it applies here.
      window.removeMenu();
      window.once('ready-to-show', () => window?.show());
      void window.loadFile(join(__dirname, 'preparing.html'));
    }
    await prepareCli((fraction) => {
      if (window !== undefined && !window.isDestroyed()) window.setProgressBar(fraction);
    });
    return true;
  } catch (error) {
    await dialog.showMessageBox({
      type: 'error',
      message: 'seemore could not unpack its files.',
      detail: `${error instanceof Error ? error.message : String(error)}\n\nCheck there is free disk space, then open seemore again. If it keeps failing, reinstall it.`,
    });
    return false;
  } finally {
    if (window !== undefined && !window.isDestroyed()) window.destroy();
  }
}

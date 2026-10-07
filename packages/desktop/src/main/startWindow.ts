/**
 * The start screen (DESKTOP-SPEC §5): a local page in the asar with Open Folder, Open File
 * and Recents. Its preload exposes three calls, and the main process answers them only for
 * a start window's own `webContents`.
 */
import { join } from 'node:path';
import { BrowserWindow, ipcMain } from 'electron';
import { decideNavigation } from './policy.js';
import type { RecentEntry } from './recents.js';

export interface StartActions {
  openFile: (parent: BrowserWindow) => Promise<boolean>;
  openFolder: (parent: BrowserWindow) => Promise<boolean>;
  openRecent: (path: string) => Promise<boolean>;
  recents: () => readonly RecentEntry[];
  onOpenPath: (path: string) => void;
}

const startWindows = new Set<number>();

export function registerStartHandlers(actions: StartActions): void {
  const fromStart = (event: Electron.IpcMainInvokeEvent) => {
    if (!startWindows.has(event.sender.id)) return undefined;
    return BrowserWindow.fromWebContents(event.sender) ?? undefined;
  };
  // A successful open closes the start screen it came from.
  const thenClose = (window: BrowserWindow) => (opened: boolean) => {
    if (opened && !window.isDestroyed()) window.close();
  };

  ipcMain.handle('start:openFile', async (event) => {
    const window = fromStart(event);
    if (window !== undefined) thenClose(window)(await actions.openFile(window));
  });
  ipcMain.handle('start:openFolder', async (event) => {
    const window = fromStart(event);
    if (window !== undefined) thenClose(window)(await actions.openFolder(window));
  });
  ipcMain.handle('start:openRecent', async (event, path: unknown) => {
    const window = fromStart(event);
    // Only a path the list actually holds: the page names one, the main process decides.
    if (window === undefined || typeof path !== 'string') return;
    if (!actions.recents().some((entry) => entry.path === path)) return;
    thenClose(window)(await actions.openRecent(path));
  });
}

export function createStartWindow(actions: Pick<StartActions, 'recents' | 'onOpenPath'>): BrowserWindow {
  const window = new BrowserWindow({
    width: 720,
    height: 520,
    title: 'seemore',
    webPreferences: {
      preload: join(__dirname, 'preload-start.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      navigateOnDragDrop: true,
    },
  });
  const id = window.webContents.id;
  startWindows.add(id);
  window.once('closed', () => startWindows.delete(id));

  window.webContents.on('will-navigate', (details) => {
    details.preventDefault();
    const decision = decideNavigation(details.url, '');
    if (decision.action === 'open-path') {
      actions.onOpenPath(decision.path);
      window.close();
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  void window.loadFile(join(__dirname, 'index.html'), {
    query: { recents: JSON.stringify(actions.recents()) },
  });
  return window;
}

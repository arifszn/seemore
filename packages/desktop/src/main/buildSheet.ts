/**
 * File > Build Site… (DESKTOP-SPEC §7.3): a sheet over the site window with the output folder,
 * an optional base path and, for a password-protected site, the password; then the CLI's log
 * and the result. Its preload's calls are answered only for a build sheet's own `webContents`,
 * and the output folder only ever comes from the main process's own dialog.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { type Job, stripAnsi } from './jobs.js';

export interface BuildRequest {
  root: string;
  outDir: string;
  base: string;
  auth: boolean;
}

export interface BuildHooks {
  /** Starts `seemore build`; output is streamed to `onOutput`. */
  run: (root: string, outDir: string, base: string | undefined, password: string | undefined, onOutput: (text: string) => void) => Job;
  /** The chosen output folder, remembered per root. */
  remember: (root: string, outDir: string) => void;
}

interface Session extends BuildRequest {
  window: BrowserWindow;
  job?: Job;
}

const sessions = new Map<number, Session>();

export function registerBuildHandlers(hooks: BuildHooks): void {
  const session = (event: Electron.IpcMainInvokeEvent) => sessions.get(event.sender.id);

  ipcMain.handle('build:init', (event) => {
    const s = session(event);
    return s === undefined ? undefined : { root: s.root, outDir: s.outDir, base: s.base, auth: s.auth };
  });

  ipcMain.handle('build:chooseFolder', async (event) => {
    const s = session(event);
    if (s === undefined) return undefined;
    const result = await dialog.showOpenDialog(s.window, {
      defaultPath: s.outDir,
      properties: ['openDirectory', 'createDirectory'],
    });
    const [chosen] = result.filePaths;
    if (chosen !== undefined) s.outDir = chosen;
    return s.outDir;
  });

  ipcMain.handle('build:start', async (event, options: unknown) => {
    const s = session(event);
    if (s === undefined || s.job !== undefined) return undefined;
    const { base, password } = (typeof options === 'object' && options !== null ? options : {}) as {
      base?: unknown;
      password?: unknown;
    };
    const baseArg = typeof base === 'string' && base.trim() !== '' ? base.trim() : undefined;
    // Passed to this job only, as `SEEMORE_PASSWORD`; never stored (§7.3).
    const passwordArg = s.auth && typeof password === 'string' ? password : undefined;

    hooks.remember(s.root, s.outDir);
    s.job = hooks.run(s.root, s.outDir, baseArg, passwordArg, (text) => {
      if (!s.window.isDestroyed()) s.window.webContents.send('build:log', stripAnsi(text));
    });
    const code = await s.job.done;
    return { code, outDir: s.outDir, hasIndex: existsSync(join(s.outDir, 'index.html')) };
  });

  ipcMain.handle('build:reveal', (event) => {
    const s = session(event);
    if (s !== undefined) shell.showItemInFolder(join(s.outDir, 'index.html'));
  });

  ipcMain.handle('build:openIndex', async (event) => {
    const s = session(event);
    if (s !== undefined) await shell.openPath(join(s.outDir, 'index.html'));
  });
}

export function openBuildSheet(parent: BrowserWindow, request: BuildRequest): BrowserWindow {
  const window = new BrowserWindow({
    parent,
    modal: true,
    width: 600,
    height: 520,
    title: 'Build Site',
    resizable: true,
    webPreferences: {
      preload: join(__dirname, 'preload-build.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  const id = window.webContents.id;
  const s: Session = { ...request, window };
  sessions.set(id, s);

  window.webContents.on('will-navigate', (details) => details.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Closing the sheet is the only cancel in v1, and it kills the job (§7.3).
  window.once('closed', () => {
    s.job?.kill();
    sessions.delete(id);
  });

  void window.loadFile(join(__dirname, 'build.html'));
  return window;
}

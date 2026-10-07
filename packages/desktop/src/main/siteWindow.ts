/**
 * A window showing one site: the dev server's page loaded directly, sandboxed, with no preload
 * (DESKTOP-SPEC §8). Navigation, new windows and permissions follow `policy.ts`.
 */
import { basename } from 'node:path';
import { BrowserWindow, type Rectangle, shell } from 'electron';
import { allowPermission, decideNavigation, decideNewWindow } from './policy.js';

export interface SavedBounds extends Partial<Rectangle> {
  maximized?: boolean;
}

export interface SiteWindowOptions {
  root: string;
  bounds?: SavedBounds;
  /** The window's server origin, read on every decision: a restart changes the port. */
  origin: () => string | undefined;
  /** A file dropped on the window (§4.4). */
  onOpenPath: (path: string) => void;
}

/** Origin each site window's `webContents` may use, for the session-wide permission handlers. */
const origins = new Map<number, () => string | undefined>();

export function createSiteWindow(options: SiteWindowOptions): BrowserWindow {
  const { root, bounds } = options;
  const window = new BrowserWindow({
    width: bounds?.width ?? 1200,
    height: bounds?.height ?? 840,
    x: bounds?.x,
    y: bounds?.y,
    title: basename(root),
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      navigateOnDragDrop: true,
    },
  });
  if (bounds?.maximized === true) window.maximize();
  if (process.platform === 'darwin') window.setRepresentedFilename(root);
  window.once('ready-to-show', () => window.show());

  const { webContents } = window;
  const id = webContents.id;
  origins.set(id, options.origin);
  window.once('closed', () => origins.delete(id));

  window.on('page-title-updated', (event, title) => {
    event.preventDefault();
    window.setTitle(title === '' ? basename(root) : `${basename(root)} - ${title}`);
  });

  webContents.on('will-navigate', (details) => {
    const decision = decideNavigation(details.url, options.origin() ?? '');
    if (decision.action === 'allow') return;
    details.preventDefault();
    if (decision.action === 'open-path') options.onOpenPath(decision.path);
    if (decision.action === 'external') void shell.openExternal(decision.url);
  });

  webContents.setWindowOpenHandler(({ url }) => {
    const decision = decideNewWindow(url);
    if (decision.action === 'external') void shell.openExternal(decision.url);
    return { action: 'deny' };
  });

  return window;
}

/**
 * The permission handlers are per session, and every site window shares the default one, so
 * they are installed once and look the asking window's origin up.
 */
export function installPermissionHandlers(session: Electron.Session): void {
  session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(allowPermission(permission, details.requestingUrl, origins.get(webContents.id)?.()));
  });
  session.setPermissionCheckHandler((webContents, permission, requestingOrigin) =>
    webContents === null ? false : allowPermission(permission, requestingOrigin, origins.get(webContents.id)?.()),
  );
}

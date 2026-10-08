/**
 * A window showing one site: the dev server's page in a child `WebContentsView` filling the
 * window, sandboxed, with no preload (DESKTOP-SPEC §7.4, §8). The window's own `webContents`
 * loads nothing; the view is what a terminal panel will share the window with. Navigation, new
 * windows and permissions follow `policy.ts`.
 */
import { basename, join } from 'node:path';
import { BrowserWindow, nativeTheme, type Rectangle, shell, type WebContents, WebContentsView } from 'electron';
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

/** Each site window's site view, the page every caller means by the window's page. */
const sites = new WeakMap<BrowserWindow, WebContents>();

/** The site page of a window made by `createSiteWindow`. */
export function siteContents(window: BrowserWindow): WebContents {
  const contents = sites.get(window);
  if (contents === undefined) throw new Error('not a site window');
  return contents;
}

export function createSiteWindow(options: SiteWindowOptions): BrowserWindow {
  const { root, bounds } = options;
  // The loading page's background (start.css), so the window never flashes white.
  const background = nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#ffffff';
  const window = new BrowserWindow({
    width: bounds?.width ?? 1200,
    height: bounds?.height ?? 840,
    x: bounds?.x,
    y: bounds?.y,
    title: basename(root),
    show: false,
    backgroundColor: background,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
  });
  if (bounds?.maximized === true) window.maximize();
  if (process.platform === 'darwin') window.setRepresentedFilename(root);

  const view = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      navigateOnDragDrop: true,
    },
  });
  view.setBackgroundColor(background);
  // Kept: `view.webContents` reads undefined once the window destroys the view.
  const webContents = view.webContents;
  sites.set(window, webContents);
  const fit = () => {
    const { width, height } = window.getContentBounds();
    view.setBounds({ x: 0, y: 0, width, height });
  };
  fit();
  window.on('resize', fit);
  window.contentView.addChildView(view);
  // Focus belongs to the site, never to the window's own empty page.
  window.on('focus', () => {
    if (window.webContents.isFocused()) webContents.focus();
  });
  window.once('closed', () => {
    if (!webContents.isDestroyed()) webContents.close();
  });

  const id = webContents.id;
  origins.set(id, options.origin);
  window.once('closed', () => origins.delete(id));

  webContents.on('page-title-updated', (event, title) => {
    event.preventDefault();
    // The loading and error pages are ours, not the site's: the folder name alone.
    const local = webContents.getURL().startsWith('file:');
    window.setTitle(title === '' || local ? basename(root) : `${basename(root)} - ${title}`);
  });

  webContents.on('will-navigate', (details) => {
    const decision = decideNavigation(details.url, options.origin() ?? '');
    if (decision.action === 'allow') return;
    details.preventDefault();
    if (decision.action === 'external') void shell.openExternal(decision.url);
  });

  webContents.setWindowOpenHandler(({ url }) => {
    const decision = decideNewWindow(url);
    if (decision.action === 'open-path') options.onOpenPath(decision.path);
    if (decision.action === 'external') void shell.openExternal(decision.url);
    return { action: 'deny' };
  });

  return window;
}

const openings = new WeakMap<BrowserWindow, () => void>();

/**
 * What a site window shows while its server starts and its first page loads (§5): a spinner
 * and "Opening <root>…", a local page in the asar. An overlay, not the window's own page:
 * navigating from that page to the server's origin blanks the window until the site paints,
 * which on a first run is Vite's whole first compile. The window shows once the overlay has
 * painted; the next load in the site view to finish or fail removes it.
 */
export function showOpening(window: BrowserWindow, root: string): void {
  if (openings.has(window)) return;
  const view = new WebContentsView({
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
  });
  // Kept: `view.webContents` reads undefined once the window destroys the view.
  const overlay = view.webContents;
  view.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#ffffff');
  overlay.on('will-navigate', (details) => details.preventDefault());
  overlay.setWindowOpenHandler(() => ({ action: 'deny' }));
  const fit = () => {
    const { width, height } = window.getContentBounds();
    view.setBounds({ x: 0, y: 0, width, height });
  };
  fit();
  window.on('resize', fit);
  window.contentView.addChildView(view);

  const webContents = siteContents(window);
  const hide = () => {
    if (openings.get(window) !== hide) return;
    openings.delete(window);
    webContents.off('did-finish-load', hide);
    webContents.off('did-fail-load', failed);
    if (window.isDestroyed()) return;
    window.off('resize', fit);
    window.contentView.removeChildView(view);
    if (!overlay.isDestroyed()) overlay.close();
    webContents.focus();
  };
  // -3 is ERR_ABORTED: a load replaced by the next one, not a failure. Subframes don't count.
  const failed = (_event: Electron.Event, code: number, _description: string, _url: string, isMainFrame: boolean) => {
    if (isMainFrame && code !== -3) hide();
  };
  openings.set(window, hide);
  webContents.on('did-finish-load', hide);
  webContents.on('did-fail-load', failed);
  window.once('closed', () => {
    if (!overlay.isDestroyed()) overlay.close();
  });

  overlay.once('did-finish-load', () => {
    if (!window.isDestroyed() && !window.isVisible()) window.show();
  });
  void overlay.loadFile(join(__dirname, 'opening.html'), { query: { name: basename(root) } }).catch(() => undefined);
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

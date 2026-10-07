/**
 * Main process entry: single-instance lock, every OS entry point, then hand-off to
 * `DesktopApp` (DESKTOP-SPEC §4.4).
 */
import { app, session } from 'electron';
import { pathsFromArgv } from './argv.js';
import { DesktopApp } from './desktopApp.js';
import { prepareCliWithProgress } from './preparing.js';
import { installPermissionHandlers } from './siteWindow.js';
import { offerMoveToApplications } from './update/index.js';

// A separate profile for tests and side-by-side runs; set before anything reads `userData`.
if (process.env.SEEMORE_USER_DATA !== undefined) app.setPath('userData', process.env.SEEMORE_USER_DATA);

let desktop: DesktopApp | undefined;
/** Paths that arrive before `ready`: Finder launches the app and then sends `open-file`. */
const pending: string[] = [];

const openPath = (path: string) => {
  if (desktop === undefined) pending.push(path);
  else void desktop.open(path);
};

// Registered before `ready`, or launch-time opens from Finder are lost.
app.on('open-file', (event, path) => {
  event.preventDefault();
  openPath(path);
});

if (!app.requestSingleInstanceLock()) {
  // The first instance gets this one's argv through `second-instance`.
  app.quit();
} else {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    const paths = pathsFromArgv(argv, workingDirectory, app.isPackaged);
    if (paths.length === 0) desktop?.focusOrStart();
    else for (const path of paths) openPath(path);
  });

  void app.whenReady().then(async () => {
    installPermissionHandlers(session.defaultSession);
    // Moving relaunches the app from Applications; this instance just quits (§10.3).
    if (await offerMoveToApplications()) return;
    // Windows unpacks the CLI on its first launch after an install or update (§9).
    if (!(await prepareCliWithProgress())) {
      app.quit();
      return;
    }
    desktop = new DesktopApp();
    // End-to-end tests drive `open()` directly instead of through OS dialogs.
    if (process.env.SEEMORE_E2E === '1') (globalThis as { seemoreDesktop?: DesktopApp }).seemoreDesktop = desktop;

    const paths = [...pathsFromArgv(process.argv, process.cwd(), app.isPackaged), ...pending.splice(0)];
    if (paths.length === 0) await desktop.restoreSession();
    else for (const path of paths) await desktop.open(path);

    // macOS keeps running with no windows; the dock icon brings back a start screen.
    app.on('activate', () => desktop?.focusOrStart());
  });

  app.on('window-all-closed', () => {
    // Not while starting: closing the window that shows the CLI unpacking is no reason to quit.
    if (process.platform !== 'darwin' && desktop !== undefined) app.quit();
  });
}

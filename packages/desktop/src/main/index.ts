/**
 * Main process entry. Scaffold: opens the start screen. Opening paths, the server and
 * window registries, menus and updates arrive in later phases (DESKTOP-SPEC tracker, P4+).
 */
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';

function createStartWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 720,
    height: 480,
    title: 'seemore',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  void window.loadFile(join(__dirname, 'index.html'));
  return window;
}

void app.whenReady().then(() => {
  createStartWindow();

  // macOS keeps the app running with no windows; clicking the dock icon reopens one.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createStartWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

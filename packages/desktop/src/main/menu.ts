/** The application menu (DESKTOP-SPEC §4.4, §5). Rebuilt when the recents change. */
import { basename } from 'node:path';
import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import type { DesktopApp } from './desktopApp.js';
import type { RecentEntry } from './recents.js';

export function buildMenu(desktop: DesktopApp, recents: readonly RecentEntry[]): void {
  const isMac = process.platform === 'darwin';
  const focused = () => BrowserWindow.getFocusedWindow() ?? undefined;

  const recentItems: MenuItemConstructorOptions[] =
    recents.length === 0
      ? [{ label: 'No Recent Items', enabled: false }]
      : recents.map((entry) => ({
          label: basename(entry.path) || entry.path,
          sublabel: entry.path,
          toolTip: entry.path,
          click: () => void desktop.open(entry.path),
        }));

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => desktop.newWindow() },
        { type: 'separator' },
        { label: 'Open File…', accelerator: 'CmdOrCtrl+O', click: () => void desktop.showOpenFile(focused()) },
        { label: 'Open Folder…', accelerator: 'CmdOrCtrl+Shift+O', click: () => void desktop.showOpenFolder(focused()) },
        {
          label: 'Open Recent',
          submenu: [
            ...recentItems,
            { type: 'separator' },
            { label: 'Clear Menu', enabled: recents.length > 0, click: () => desktop.clearRecents() },
          ],
        },
        { type: 'separator' },
        {
          label: 'Duplicate Window',
          click: () => {
            const window = focused();
            if (desktop.isSiteWindow(window)) void desktop.duplicate(window!);
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  // Keep the dock and taskbar recents in step with the menu's.
  if (recents.length === 0) app.clearRecentDocuments();
}

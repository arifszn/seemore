/** The application menu (DESKTOP-SPEC §4.4, §5). Rebuilt when the recents change. */
import { basename } from 'node:path';
import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import { currentDefaultHandlerPlatform, makeDefaultHandler } from './defaultHandler.js';
import type { DesktopApp } from './desktopApp.js';
import type { RecentEntry } from './recents.js';
import type { Updater } from './update/updater.js';

export const MENU_IDS = { export: 'export-page', build: 'build-site' } as const;

export function buildMenu(desktop: DesktopApp, recents: readonly RecentEntry[], updater: Updater | undefined): void {
  const isMac = process.platform === 'darwin';

  // In the app menu on macOS, under Help elsewhere (§10.1, §13). Disabled when running from source.
  const ready = updater?.readyVersion;
  const updateItems: MenuItemConstructorOptions[] = [
    ...(ready === undefined ? [] : [{ label: `Restart to Update to ${ready}`, click: () => void updater?.restart() }]),
    { label: 'Check for Updates…', enabled: updater !== undefined, click: () => void updater?.check('manual') },
    {
      label: 'Check for Updates Automatically',
      type: 'checkbox',
      enabled: updater !== undefined,
      checked: updater?.autoCheck ?? false,
      click: (item) => updater?.setAutoCheck(item.checked),
    },
    { type: 'separator' },
    // §13. Disabled when running from source, and in an AppImage.
    {
      label: 'Make seemore the Default for Markdown…',
      enabled: currentDefaultHandlerPlatform() !== undefined,
      click: () => void makeDefaultHandler(),
    },
  ];
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
    ...(isMac
      ? [
          {
            role: 'appMenu' as const,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              ...updateItems,
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ] satisfies MenuItemConstructorOptions[],
          },
        ]
      : []),
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
          id: MENU_IDS.export,
          label: 'Export Page as HTML…',
          accelerator: 'CmdOrCtrl+E',
          enabled: false,
          click: () => {
            const window = focused();
            if (desktop.isSiteWindow(window)) void desktop.exportPage(window!);
          },
        },
        {
          id: MENU_IDS.build,
          label: 'Build Site…',
          accelerator: 'CmdOrCtrl+B',
          enabled: false,
          click: () => {
            const window = focused();
            if (desktop.isSiteWindow(window)) void desktop.buildSite(window!);
          },
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
    ...(isMac ? [] : [{ role: 'help' as const, submenu: updateItems }]),
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  // Keep the dock and taskbar recents in step with the menu's.
  if (recents.length === 0) app.clearRecentDocuments();
}

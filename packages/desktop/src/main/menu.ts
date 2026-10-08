/** The application menu (DESKTOP-SPEC §4.4, §5). Rebuilt when the recents change. */
import { basename } from 'node:path';
import { app, BrowserWindow, Menu, type MenuItemConstructorOptions, webContents } from 'electron';
import { currentDefaultHandlerPlatform, makeDefaultHandler } from './defaultHandler.js';
import type { DesktopApp } from './desktopApp.js';
import type { RecentEntry } from './recents.js';
import type { Updater } from './update/updater.js';

export const MENU_IDS = { export: 'export-page', build: 'build-site', closeFolder: 'close-folder', terminal: 'toggle-terminal' } as const;

/** The Terminal menu's items that act on the panel's shells, by the page command they send (§7.4). */
export const TERMINAL_COMMANDS = {
  'terminal-kill': 'kill',
  'terminal-rename': 'rename',
  'terminal-clear': 'clear',
  'terminal-previous': 'previous',
  'terminal-next': 'next',
} as const;
export const TERMINAL_NEW = 'terminal-new';

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
  /** A site window's site view, else whatever page has focus (the start screen, a build sheet). */
  const reload = (ignoringCache: boolean) => {
    const window = focused();
    const page = desktop.isSiteWindow(window) ? desktop.sitePage(window!) : webContents.getFocusedWebContents();
    if (ignoringCache) page?.reloadIgnoringCache();
    else page?.reload();
  };
  const terminal = (command: string) => {
    const window = focused();
    if (desktop.isSiteWindow(window)) desktop.terminalCommand(window!, command);
  };

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
        {
          id: MENU_IDS.closeFolder,
          label: 'Close Folder',
          enabled: false,
          click: () => {
            const window = focused();
            if (desktop.isSiteWindow(window)) desktop.closeFolder(window!);
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
        // The site, even while the terminal has focus (S9): the roles act on the focused page.
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => reload(false) },
        { label: 'Force Reload', accelerator: 'Shift+CmdOrCtrl+R', click: () => reload(true) },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          id: MENU_IDS.terminal,
          label: 'Terminal',
          // VS Code's default on every platform, Ctrl even on macOS (§7.4).
          accelerator: 'Ctrl+`',
          enabled: false,
          click: () => {
            const window = focused();
            if (desktop.isSiteWindow(window)) desktop.toggleTerminal(window!);
          },
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      // VS Code's default shortcuts (§7.4).
      label: 'Terminal',
      submenu: [
        { id: TERMINAL_NEW, label: 'New Terminal', accelerator: 'Ctrl+Shift+`', enabled: false, click: () => terminal('new') },
        { type: 'separator' },
        { id: 'terminal-kill', label: 'Kill Terminal', enabled: false, click: () => terminal('kill') },
        { id: 'terminal-rename', label: 'Rename Terminal…', enabled: false, click: () => terminal('rename') },
        { id: 'terminal-clear', label: 'Clear Terminal', enabled: false, click: () => terminal('clear') },
        { type: 'separator' },
        {
          id: 'terminal-previous',
          label: 'Focus Previous Terminal',
          accelerator: isMac ? 'Cmd+Shift+[' : 'Ctrl+PageUp',
          enabled: false,
          click: () => terminal('previous'),
        },
        {
          id: 'terminal-next',
          label: 'Focus Next Terminal',
          accelerator: isMac ? 'Cmd+Shift+]' : 'Ctrl+PageDown',
          enabled: false,
          click: () => terminal('next'),
        },
      ],
    },
    { role: 'windowMenu' },
    ...(isMac ? [] : [{ role: 'help' as const, submenu: updateItems }]),
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  // Keep the dock and taskbar recents in step with the menu's.
  if (recents.length === 0) app.clearRecentDocuments();
}

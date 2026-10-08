/** The terminal view's calls (DESKTOP-SPEC §7.4, §8). Answered only for a terminal view. */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('seemore', {
  /** For the page's key table (§7.4), which differs per platform. */
  platform: process.platform,
  /** A splitter drag, in screen coordinates; the main process sets the panel's height. */
  drag: (phase: 'start' | 'move' | 'end', screenY: number) => ipcRenderer.send('terminal:drag', phase, screenY),
  /** A new shell at the site root: `{ id, name }`. */
  create: (cols: number, rows: number) => ipcRenderer.invoke('terminal:create', cols, rows),
  input: (id: number, data: string) => ipcRenderer.send('terminal:input', id, data),
  resize: (id: number, cols: number, rows: number) => ipcRenderer.send('terminal:resize', id, cols, rows),
  rename: (id: number, name: string) => ipcRenderer.send('terminal:rename', id, name),
  kill: (id: number) => ipcRenderer.send('terminal:kill', id),
  hide: () => ipcRenderer.send('terminal:hide'),
  /** The header's chevron: the panel fills the window until it is clicked again. */
  maximize: () => ipcRenderer.send('terminal:maximize'),
  /** The clipboard goes through the main process: the page has no clipboard permission. */
  copy: (text: string) => ipcRenderer.send('terminal:copy', text),
  paste: () => ipcRenderer.send('terminal:paste'),
  openLink: (url: string) => ipcRenderer.send('terminal:openLink', url),
  onData: (listener: (id: number, data: string) => void) => {
    ipcRenderer.on('terminal:data', (_event, id: number, data: string) => listener(id, data));
  },
  onExit: (listener: (id: number, exitCode: number) => void) => {
    ipcRenderer.on('terminal:exit', (_event, id: number, exitCode: number) => listener(id, exitCode));
  },
  /** The site's theme, which the terminal follows: `true` for dark. */
  onTheme: (listener: (dark: boolean) => void) => {
    ipcRenderer.on('terminal:theme', (_event, dark: boolean) => listener(dark));
  },
  /** From the main process: `opened`, `maximized`/`restored`, and the Terminal menu's items (13.5). */
  onCommand: (listener: (command: string) => void) => {
    ipcRenderer.on('terminal:command', (_event, command: string) => listener(command));
  },
});

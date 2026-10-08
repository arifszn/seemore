/** The terminal view's calls (DESKTOP-SPEC §7.4, §8). Answered only for a terminal view. */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('seemore', {
  /** A splitter drag, in screen coordinates; the main process sets the panel's height. */
  drag: (phase: 'start' | 'move' | 'end', screenY: number) => ipcRenderer.send('terminal:drag', phase, screenY),
  /** A new shell at the site root: `{ id, name }`. */
  create: (cols: number, rows: number) => ipcRenderer.invoke('terminal:create', cols, rows),
  input: (id: number, data: string) => ipcRenderer.send('terminal:input', id, data),
  resize: (id: number, cols: number, rows: number) => ipcRenderer.send('terminal:resize', id, cols, rows),
  rename: (id: number, name: string) => ipcRenderer.send('terminal:rename', id, name),
  kill: (id: number) => ipcRenderer.send('terminal:kill', id),
  onData: (listener: (id: number, data: string) => void) => {
    ipcRenderer.on('terminal:data', (_event, id: number, data: string) => listener(id, data));
  },
  onExit: (listener: (id: number, exitCode: number) => void) => {
    ipcRenderer.on('terminal:exit', (_event, id: number, exitCode: number) => listener(id, exitCode));
  },
});

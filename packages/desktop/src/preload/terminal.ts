/** The terminal view's calls (DESKTOP-SPEC §7.4, §8). Answered only for a terminal view. */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('seemore', {
  /** A splitter drag, in screen coordinates; the main process sets the panel's height. */
  drag: (phase: 'start' | 'move' | 'end', screenY: number) => ipcRenderer.send('terminal:drag', phase, screenY),
});

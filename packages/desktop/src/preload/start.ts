/** The start screen's three calls (DESKTOP-SPEC §8). Site pages get no preload at all. */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('seemore', {
  openFile: () => ipcRenderer.invoke('start:openFile'),
  openFolder: () => ipcRenderer.invoke('start:openFolder'),
  openRecent: (path: string) => ipcRenderer.invoke('start:openRecent', path),
});

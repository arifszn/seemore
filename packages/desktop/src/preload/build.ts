/** The build sheet's calls (DESKTOP-SPEC §7.3). Answered only for a build sheet. */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('seemoreBuild', {
  init: () => ipcRenderer.invoke('build:init'),
  chooseFolder: () => ipcRenderer.invoke('build:chooseFolder'),
  start: (options: { base: string; password?: string }) => ipcRenderer.invoke('build:start', options),
  reveal: () => ipcRenderer.invoke('build:reveal'),
  openIndex: () => ipcRenderer.invoke('build:openIndex'),
  onLog: (listener: (text: string) => void) => {
    ipcRenderer.on('build:log', (_event, text: string) => listener(text));
  },
});

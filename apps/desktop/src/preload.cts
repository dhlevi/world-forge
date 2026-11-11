/**
 * The bridge between the game page and the main process (main.ts): window.worldforge, a few
 * calls and nothing more. The page itself never gets Node or Electron. The shape is declared for
 * the game in apps/game/src/desktop.ts; keep the two in step.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('worldforge', {
  desktop: true,
  info: () => ipcRenderer.invoke('wf:info'),
  openWorldFile: () => ipcRenderer.invoke('wf:openWorldFile'),
  quit: () => ipcRenderer.invoke('wf:quit'),
  data: {
    read: (name: string) => ipcRenderer.invoke('wf:read', name),
    write: (name: string, text: string) => ipcRenderer.invoke('wf:write', name, text),
    list: (dir = '') => ipcRenderer.invoke('wf:list', dir),
    remove: (name: string) => ipcRenderer.invoke('wf:remove', name),
    show: () => ipcRenderer.invoke('wf:showData'),
  },
  /** Menu commands (such as "open-world"); returns a function that stops listening. */
  onMenu: (cb: (what: string) => void) => {
    const fn = (_e: IpcRendererEvent, what: string) => cb(what);
    ipcRenderer.on('wf:menu', fn);
    return () => ipcRenderer.removeListener('wf:menu', fn);
  },
});

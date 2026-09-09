const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

const api = {
  isDev: (): Promise<boolean> => ipcRenderer.invoke("app:is-dev"),

  openWorkspaceDialog: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:open-workspace"),

  onSave: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("menu:save", handler);
    return () => ipcRenderer.removeListener("menu:save", handler);
  },

  onWorkspaceOpened: (callback: (path: string) => void) => {
    const handler = (_event: unknown, workspacePath: string) => callback(workspacePath);
    ipcRenderer.on("workspace:opened", handler);
    return () => ipcRenderer.removeListener("workspace:opened", handler);
  },

  platform: process.platform as NodeJS.Platform,
};

export type CadanDesktopAPI = typeof api;

contextBridge.exposeInMainWorld("cadan", api);

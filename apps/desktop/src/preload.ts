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

  terminalSpawn: (opts?: { cwd?: string; cols?: number; rows?: number }) =>
    ipcRenderer.invoke("terminal:spawn", opts ?? {}),
  terminalInput: (id: string, data: string) =>
    ipcRenderer.send("terminal:input", id, data),
  terminalResize: (id: string, cols: number, rows: number) =>
    ipcRenderer.send("terminal:resize", id, cols, rows),
  terminalDispose: (id: string) => ipcRenderer.send("terminal:dispose", id),
  onTerminalData: (id: string, callback: (data: string) => void) => {
    const channel = `terminal:data:${id}`;
    const handler = (_event: unknown, data: string) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  onTerminalExit: (id: string, callback: (exitCode: number) => void) => {
    const channel = `terminal:exit:${id}`;
    const handler = (_event: unknown, exitCode: number) => callback(exitCode);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  platform: process.platform as NodeJS.Platform,
};

export type CadanDesktopAPI = typeof api;

contextBridge.exposeInMainWorld("cadan", api);

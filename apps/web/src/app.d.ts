/// <reference types="@sveltejs/kit" />

export interface CadanDesktopAPI {
  isDev: () => Promise<boolean>;
  openWorkspaceDialog: () => Promise<string | null>;
  onSave: (callback: () => void) => () => void;
  onWorkspaceOpened: (callback: (path: string) => void) => () => void;
  terminalSpawn: (opts?: { cwd?: string; cols?: number; rows?: number }) => Promise<string>;
  terminalInput: (id: string, data: string) => void;
  terminalResize: (id: string, cols: number, rows: number) => void;
  terminalDispose: (id: string) => void;
  onTerminalData: (id: string, callback: (data: string) => void) => () => void;
  onTerminalExit: (id: string, callback: (exitCode: number) => void) => () => void;
  platform: string;
}

declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  interface Window {
    cadan?: CadanDesktopAPI;
  }
}

export {};

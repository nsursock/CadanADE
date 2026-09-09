/// <reference types="@sveltejs/kit" />

export interface CadanDesktopAPI {
  isDev: () => Promise<boolean>;
  openWorkspaceDialog: () => Promise<string | null>;
  onSave: (callback: () => void) => () => void;
  onWorkspaceOpened: (callback: (path: string) => void) => () => void;
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

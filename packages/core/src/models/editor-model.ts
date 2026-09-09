import type { OpenTab } from "../types.js";

export class EditorModel {
  tabs: OpenTab[] = [];
  activePath: string | null = null;

  get active(): OpenTab | null {
    return this.tabs.find((t) => t.path === this.activePath) ?? null;
  }

  open(tab: OpenTab) {
    const existing = this.tabs.find((t) => t.path === tab.path);
    if (existing) {
      existing.content = tab.content;
      existing.hash = tab.hash;
      existing.dirty = false;
    } else {
      this.tabs = [...this.tabs, tab];
    }
    this.activePath = tab.path;
  }

  setActive(path: string) {
    if (this.tabs.some((t) => t.path === path)) this.activePath = path;
  }

  updateContent(path: string, content: string) {
    const tab = this.tabs.find((t) => t.path === path);
    if (!tab) return;
    tab.content = content;
    tab.dirty = true;
  }

  markSaved(path: string, hash: string, content: string) {
    const tab = this.tabs.find((t) => t.path === path);
    if (!tab) return;
    tab.hash = hash;
    tab.content = content;
    tab.dirty = false;
  }

  close(path: string) {
    this.tabs = this.tabs.filter((t) => t.path !== path);
    if (this.activePath === path) {
      this.activePath = this.tabs.at(-1)?.path ?? null;
    }
  }
}

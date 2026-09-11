import type { HistoryService } from "../services/history-service.js";
import type { PendingChangeStore } from "../services/pending-changes.js";
import type { EditorModel } from "../models/editor-model.js";
import type { WorkspaceService } from "../services/workspace-service.js";
import type { PendingChange } from "../types.js";

export class EditorController {
  constructor(
    private model: EditorModel,
    private service: WorkspaceService,
    private pendingChanges?: PendingChangeStore,
    private history?: HistoryService,
  ) {}

  async openFile(root: string, rel: string) {
    const file = await this.service.readFile(root, rel);
    this.model.open({ ...file, dirty: false, savedContent: file.content });
    return file;
  }

  edit(path: string, content: string) {
    this.model.updateContent(path, content);
  }

  async save(root: string, path: string) {
    const tab = this.model.tabs.find((t) => t.path === path);
    if (!tab) throw new Error("No open tab");
    const saved = await this.service.writeFile(root, path, tab.content, tab.hash);
    this.model.markSaved(path, saved.hash, saved.content);
    const snap = await this.history?.snapshot(root, {
      paths: [path],
      message: `save: ${path}`,
      reason: "save",
    });
    return { ...saved, history: snap ?? null };
  }

  listPending(sessionId?: string): PendingChange[] {
    return this.pendingChanges?.list(sessionId) ?? [];
  }

  async accept(root: string, path: string) {
    const change = this.pendingChanges?.get(path);
    if (!change) throw new Error("No pending change for path");
    this.pendingChanges?.remove(path);
    const snap = await this.history?.snapshot(root, {
      paths: [path],
      message: `accept: ${path}`,
      reason: "accept",
    });
    return { path, history: snap ?? null };
  }

  async reject(root: string, path: string) {
    const change = this.pendingChanges?.get(path);
    if (!change) throw new Error("No pending change for path");
    if (change.kind === "create") {
      try {
        await this.service.deleteFile(root, path);
      } catch {
        /* already gone */
      }
      this.model.close(path);
    } else {
      const saved = await this.service.writeFile(root, path, change.baseline);
      const tab = this.model.tabs.find((t) => t.path === path);
      if (tab) {
        this.model.markSaved(path, saved.hash, saved.content);
      }
    }
    this.pendingChanges?.remove(path);
    return { path, restored: change.kind === "edit", deleted: change.kind === "create" };
  }

  async acceptAll(root: string, sessionId?: string) {
    const pending = this.listPending(sessionId);
    const paths = pending.map((p) => p.path);
    for (const path of paths) this.pendingChanges?.remove(path);
    const snap =
      paths.length > 0
        ? await this.history?.snapshot(root, {
            paths,
            message: `accept: ${paths.length} file(s)`,
            reason: "accept",
          })
        : null;
    return { paths, history: snap ?? null };
  }

  async rejectAll(root: string, sessionId?: string) {
    const pending = this.listPending(sessionId);
    const paths: string[] = [];
    for (const change of pending) {
      await this.reject(root, change.path);
      paths.push(change.path);
    }
    return { paths };
  }

  close(path: string) {
    this.model.close(path);
  }

  activate(path: string) {
    this.model.setActive(path);
  }
}

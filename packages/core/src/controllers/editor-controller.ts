import type { EditorModel } from "../models/editor-model.js";
import type { WorkspaceService } from "../services/workspace-service.js";

export class EditorController {
  constructor(
    private model: EditorModel,
    private service: WorkspaceService,
  ) {}

  async openFile(root: string, rel: string) {
    const file = await this.service.readFile(root, rel);
    this.model.open({ ...file, dirty: false });
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
    return saved;
  }

  close(path: string) {
    this.model.close(path);
  }

  activate(path: string) {
    this.model.setActive(path);
  }
}

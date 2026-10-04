import type { WorkspaceModel } from "../models/workspace-model.js";
import type { WorkspaceService } from "../services/workspace-service.js";
import path from "node:path";

export class WorkspaceController {
  constructor(
    private model: WorkspaceModel,
    private service: WorkspaceService,
  ) {}

  async open(rootPath: string, showHidden = false) {
    const root = path.resolve(rootPath);
    this.model.setLoading(true);
    try {
      const ok = await this.service.pathExists(root);
      if (!ok) throw new Error("Not a directory");
      this.model.setRoot(root);
      const tree = await this.service.listTree(root, "", 0, 4, showHidden);
      this.model.setTree(tree);
      this.model.setLoading(false);
      return { root, tree };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to open workspace";
      this.model.setError(msg);
      throw e;
    }
  }

  async refresh(showHidden = false) {
    if (!this.model.root) return null;
    this.model.setLoading(true);
    const tree = await this.service.listTree(this.model.root, "", 0, 4, showHidden);
    this.model.setTree(tree);
    this.model.setLoading(false);
    return tree;
  }

  async delete(relPath: string) {
    if (!this.model.root) throw new Error("No workspace open");
    await this.service.deletePath(this.model.root, relPath);
    return this.refresh();
  }

  async reveal(relPath: string) {
    if (!this.model.root) throw new Error("No workspace open");
    await this.service.revealPath(this.model.root, relPath);
  }

  async openWith(relPath: string) {
    if (!this.model.root) throw new Error("No workspace open");
    await this.service.openWith(this.model.root, relPath);
  }

  async rename(relPath: string, newName: string) {
    if (!this.model.root) throw new Error("No workspace open");
    await this.service.renamePath(this.model.root, relPath, newName);
    return this.refresh();
  }

  async move(sourceRel: string, destRel: string) {
    if (!this.model.root) throw new Error("No workspace open");
    await this.service.movePath(this.model.root, sourceRel, destRel);
    return this.refresh();
  }

  async createDirectory(relPath: string) {
    if (!this.model.root) throw new Error("No workspace open");
    await this.service.createDirectory(this.model.root, relPath);
    return this.refresh();
  }

  async createFile(relPath: string, content = "") {
    if (!this.model.root) throw new Error("No workspace open");
    await this.service.createFile(this.model.root, relPath, content);
    return this.refresh();
  }

  close() {
    this.model.setRoot(null);
  }
}

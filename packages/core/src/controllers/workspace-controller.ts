import type { WorkspaceModel } from "../models/workspace-model.js";
import type { WorkspaceService } from "../services/workspace-service.js";
import path from "node:path";

export class WorkspaceController {
  constructor(
    private model: WorkspaceModel,
    private service: WorkspaceService,
  ) {}

  async open(rootPath: string) {
    const root = path.resolve(rootPath);
    this.model.setLoading(true);
    try {
      const ok = await this.service.pathExists(root);
      if (!ok) throw new Error("Not a directory");
      this.model.setRoot(root);
      const tree = await this.service.listTree(root);
      this.model.setTree(tree);
      this.model.setLoading(false);
      return { root, tree };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to open workspace";
      this.model.setError(msg);
      throw e;
    }
  }

  async refresh() {
    if (!this.model.root) return null;
    this.model.setLoading(true);
    const tree = await this.service.listTree(this.model.root);
    this.model.setTree(tree);
    this.model.setLoading(false);
    return tree;
  }

  close() {
    this.model.setRoot(null);
  }
}

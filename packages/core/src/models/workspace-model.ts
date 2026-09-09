import type { TreeNode } from "../types.js";

export class WorkspaceModel {
  root: string | null = null;
  tree: TreeNode[] = [];
  loading = false;
  error: string | null = null;

  setRoot(root: string | null) {
    this.root = root;
    if (!root) {
      this.tree = [];
      this.error = null;
    }
  }

  setTree(tree: TreeNode[]) {
    this.tree = tree;
    this.error = null;
  }

  setLoading(loading: boolean) {
    this.loading = loading;
  }

  setError(error: string | null) {
    this.error = error;
    this.loading = false;
  }
}

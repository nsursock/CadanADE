import type { PendingChange } from "../types.js";

function normalizePath(p: string): string {
  return p.replace(/^\.\//, "").replace(/\\/g, "/").replace(/\/+/g, "/");
}

/** In-memory pending agent edits for Accept / Reject review. */
export class PendingChangeStore {
  private byPath = new Map<string, PendingChange>();

  register(change: PendingChange): PendingChange {
    const path = normalizePath(change.path);
    const existing = this.byPath.get(path);
    if (existing) {
      const merged: PendingChange = {
        path,
        kind: existing.kind === "create" ? "create" : change.kind,
        baseline: existing.baseline,
        baselineHash: existing.baselineHash,
        afterHash: change.afterHash,
        sessionId: change.sessionId,
      };
      this.byPath.set(path, merged);
      return merged;
    }
    const next = { ...change, path };
    this.byPath.set(path, next);
    return next;
  }

  get(path: string): PendingChange | undefined {
    return this.byPath.get(normalizePath(path));
  }

  list(sessionId?: string): PendingChange[] {
    const all = [...this.byPath.values()];
    if (!sessionId) return all;
    return all.filter((c) => c.sessionId === sessionId);
  }

  meta(change: PendingChange): Omit<PendingChange, "baseline"> {
    return {
      path: change.path,
      kind: change.kind,
      baselineHash: change.baselineHash,
      afterHash: change.afterHash,
      sessionId: change.sessionId,
    };
  }

  remove(path: string): PendingChange | undefined {
    const key = normalizePath(path);
    const prev = this.byPath.get(key);
    this.byPath.delete(key);
    return prev;
  }

  removeMany(paths: string[]): PendingChange[] {
    const out: PendingChange[] = [];
    for (const p of paths) {
      const prev = this.remove(p);
      if (prev) out.push(prev);
    }
    return out;
  }

  clear(sessionId?: string): PendingChange[] {
    if (!sessionId) {
      const all = [...this.byPath.values()];
      this.byPath.clear();
      return all;
    }
    const removed: PendingChange[] = [];
    for (const [path, change] of this.byPath) {
      if (change.sessionId === sessionId) {
        removed.push(change);
        this.byPath.delete(path);
      }
    }
    return removed;
  }
}

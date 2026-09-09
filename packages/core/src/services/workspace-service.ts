import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { TreeNode } from "../types.js";

const SKIP = new Set([".git", "node_modules", ".DS_Store", "dist", ".svelte-kit", "build"]);
const DENY = [/rm\s+-rf\s+\//i, /sudo\b/i, /mkfs/i, /dd\s+if=/i, /:\(\)\s*\{/];

export class WorkspaceService {
  assertInside(root: string, target: string): string {
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(resolvedRoot, target);
    if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
      throw new Error("Path escapes workspace root");
    }
    return resolved;
  }

  private hash(content: string) {
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  async listTree(root: string, rel = "", depth = 0, maxDepth = 4): Promise<TreeNode[]> {
    const abs = this.assertInside(root, rel || ".");
    const entries = await fs.readdir(abs, { withFileTypes: true });
    const nodes: TreeNode[] = [];

    for (const entry of entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    })) {
      if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const children = depth < maxDepth ? await this.listTree(root, childRel, depth + 1, maxDepth) : [];
        nodes.push({ name: entry.name, path: childRel, kind: "dir", children });
      } else if (entry.isFile()) {
        nodes.push({ name: entry.name, path: childRel, kind: "file" });
      }
    }
    return nodes;
  }

  async listFlat(root: string, rel = ""): Promise<string[]> {
    const abs = this.assertInside(root, rel || ".");
    const out: string[] = [];
    const walk = async (dir: string, prefix: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
        const child = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          out.push(child + "/");
          await walk(path.join(dir, entry.name), child);
        } else if (entry.isFile()) {
          out.push(child);
        }
      }
    };
    await walk(abs, rel);
    return out;
  }

  async readFile(root: string, rel: string) {
    const abs = this.assertInside(root, rel);
    const content = await fs.readFile(abs, "utf8");
    return { path: rel, content, hash: this.hash(content) };
  }

  async writeFile(root: string, rel: string, content: string, expectedHash?: string) {
    const abs = this.assertInside(root, rel);
    try {
      const current = await fs.readFile(abs, "utf8");
      if (expectedHash) {
        const hash = this.hash(current);
        if (hash !== expectedHash) throw new Error("File changed on disk (hash mismatch)");
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      await fs.mkdir(path.dirname(abs), { recursive: true });
    }
    await fs.writeFile(abs, content, "utf8");
    return { path: rel, content, hash: this.hash(content) };
  }

  async createFile(root: string, rel: string, content = "") {
    const abs = this.assertInside(root, rel);
    try {
      await fs.access(abs);
      throw new Error("File already exists");
    } catch (e) {
      if ((e as Error).message === "File already exists") throw e;
    }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
    return { path: rel, content, hash: this.hash(content) };
  }

  async editFile(
    root: string,
    rel: string,
    oldString: string,
    newString: string,
    expectedHash?: string,
    replaceAll = false,
  ) {
    const abs = this.assertInside(root, rel);
    const current = await fs.readFile(abs, "utf8");
    if (expectedHash) {
      const hash = this.hash(current);
      if (hash !== expectedHash) throw new Error("File changed on disk (hash mismatch)");
    }
    if (oldString === newString) throw new Error("oldString and newString are identical");
    const occurrences = current.split(oldString).length - 1;
    if (occurrences === 0) throw new Error("oldString not found in file");
    if (occurrences > 1 && !replaceAll) {
      throw new Error(`oldString appears ${occurrences} times — set replaceAll to replace every occurrence, or make oldString more specific`);
    }
    const updated = replaceAll
      ? current.split(oldString).join(newString)
      : current.replace(oldString, newString);
    await fs.writeFile(abs, updated, "utf8");
    return { path: rel, hash: this.hash(updated), bytes: updated.length, replacements: occurrences };
  }

  async deleteFile(root: string, rel: string) {
    const abs = this.assertInside(root, rel);
    await fs.unlink(abs);
  }

  async search(root: string, query: string, glob?: string) {
    const re = new RegExp(query, "i");
    const globRe = glob
      ? new RegExp("^" + glob.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$")
      : null;
    const files = await this.listFlat(root, "");
    const hits: { path: string; line: number; text: string }[] = [];

    for (const file of files) {
      if (file.endsWith("/")) continue;
      if (globRe && !globRe.test(file)) continue;
      let content: string;
      try {
        content = await fs.readFile(this.assertInside(root, file), "utf8");
      } catch {
        continue;
      }
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i]!)) {
          hits.push({ path: file, line: i + 1, text: lines[i]!.slice(0, 200) });
          if (hits.length >= 80) return hits;
        }
      }
    }
    return hits;
  }

  async execute(root: string, command: string, timeoutMs = 30_000) {
    if (DENY.some((r) => r.test(command))) throw new Error("Command denied by policy");
    const cwd = path.resolve(root);
    return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
      const child = spawn(command, { cwd, shell: true });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Command timed out"));
      }, timeoutMs);
      child.stdout.on("data", (d) => {
        stdout += d.toString();
        if (stdout.length > 50_000) stdout = stdout.slice(0, 50_000) + "\n...(truncated)";
      });
      child.stderr.on("data", (d) => {
        stderr += d.toString();
        if (stderr.length > 20_000) stderr = stderr.slice(0, 20_000) + "\n...(truncated)";
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, code });
      });
    });
  }

  async pathExists(p: string) {
    try {
      const st = await fs.stat(p);
      return st.isDirectory();
    } catch {
      return false;
    }
  }

  async deletePath(root: string, rel: string) {
    const abs = this.assertInside(root, rel);
    const st = await fs.stat(abs);
    if (st.isDirectory()) {
      await fs.rm(abs, { recursive: true });
    } else {
      await fs.unlink(abs);
    }
    return { deleted: rel };
  }

  async revealPath(root: string, rel: string) {
    const abs = this.assertInside(root, rel);
    const platform = process.platform;
    if (platform === "darwin") {
      spawn("open", ["-R", abs], { detached: true, stdio: "ignore" }).unref();
    } else if (platform === "win32") {
      spawn("explorer", ["/select,", abs], { detached: true, shell: true, stdio: "ignore" }).unref();
    } else {
      const dir = (await fs.stat(abs)).isDirectory() ? abs : path.dirname(abs);
      spawn("xdg-open", [dir], { detached: true, stdio: "ignore" }).unref();
    }
    return { revealed: rel };
  }

  async openWith(root: string, rel: string) {
    const abs = this.assertInside(root, rel);
    const platform = process.platform;
    if (platform === "darwin") {
      spawn("open", [abs], { detached: true, stdio: "ignore" }).unref();
    } else if (platform === "win32") {
      spawn("start", ["", abs], { detached: true, shell: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [abs], { detached: true, stdio: "ignore" }).unref();
    }
    return { opened: rel };
  }

  async renamePath(root: string, oldRel: string, newName: string) {
    const resolvedRoot = path.resolve(root);
    const oldAbs = this.assertInside(root, oldRel);
    const dir = path.dirname(oldAbs);
    const newAbs = path.resolve(dir, newName);
    if (newAbs !== resolvedRoot && !newAbs.startsWith(resolvedRoot + path.sep)) {
      throw new Error("New path escapes workspace root");
    }
    if (oldAbs === newAbs) throw new Error("New name is the same");
    try {
      await fs.access(newAbs);
      throw new Error("A file with this name already exists");
    } catch (e) {
      if ((e as Error).message === "A file with this name already exists") throw e;
    }
    await fs.rename(oldAbs, newAbs);
    return { oldPath: oldRel, newPath: path.relative(resolvedRoot, newAbs) };
  }
}

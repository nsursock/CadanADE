import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export type HistoryReason = "save" | "accept";

export interface HistorySnapshotOpts {
  paths?: string[];
  message: string;
  reason: HistoryReason;
}

export interface HistorySnapshotResult {
  ok: boolean;
  committed: boolean;
  reason?: "no-git" | "noop" | "error";
  message?: string;
}

export interface HistoryEntry {
  hash: string;
  at: number;
  message: string;
  path?: string;
}

function runGit(
  gitDir: string,
  workTree: string,
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", [`--git-dir=${gitDir}`, `--work-tree=${workTree}`, ...args], {
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      resolve({ code: 127, stdout, stderr: err.message });
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

/** Read-only git commands against the bare object DB (no work-tree). */
function runGitDir(
  gitDir: string,
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", [`--git-dir=${gitDir}`, ...args], {
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      resolve({ code: 127, stdout, stderr: err.message });
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * Shadow git under `.cadan/history.git` — local versioning that never touches
 * the workspace’s real `.git`.
 */
export class HistoryService {
  private warnedNoGit = false;
  private gitAvailable: boolean | null = null;

  gitDir(root: string) {
    return path.join(path.resolve(root), ".cadan", "history.git");
  }

  private async probeGit(): Promise<boolean> {
    if (this.gitAvailable != null) return this.gitAvailable;
    const result = await new Promise<boolean>((resolve) => {
      const child = spawn("git", ["--version"], { stdio: "ignore" });
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    });
    this.gitAvailable = result;
    if (!result && !this.warnedNoGit) {
      this.warnedNoGit = true;
      console.warn("[cadan-history] git not found — local history disabled");
    }
    return result;
  }

  async ensureRepo(root: string): Promise<boolean> {
    if (!(await this.probeGit())) return false;
    const rootAbs = path.resolve(root);
    const gitDir = this.gitDir(rootAbs);
    try {
      await fs.access(path.join(gitDir, "HEAD"));
    } catch {
      await fs.mkdir(path.dirname(gitDir), { recursive: true });
      const init = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
        const child = spawn("git", ["init", "--bare", gitDir]);
        let stderr = "";
        child.stderr.on("data", (d) => {
          stderr += d.toString();
        });
        child.on("error", (err) => resolve({ code: 127, stderr: err.message }));
        child.on("close", (code) => resolve({ code, stderr }));
      });
      if (init.code !== 0) {
        console.warn("[cadan-history] init failed:", init.stderr);
        return false;
      }
    }
    await runGit(gitDir, rootAbs, ["config", "user.name", "cadan-history"]);
    await runGit(gitDir, rootAbs, ["config", "user.email", "cadan@local"]);
    return true;
  }

  async snapshot(root: string, opts: HistorySnapshotOpts): Promise<HistorySnapshotResult> {
    if (!(await this.probeGit())) {
      return {
        ok: false,
        committed: false,
        reason: "no-git",
        message: "Local history unavailable (git not found)",
      };
    }
    if (!(await this.ensureRepo(root))) {
      return {
        ok: false,
        committed: false,
        reason: "error",
        message: "Could not initialize local history repo",
      };
    }
    const rootAbs = path.resolve(root);
    const gitDir = this.gitDir(rootAbs);
    const paths = (opts.paths ?? []).map((p) => p.replace(/^\.\//, "").replace(/\\/g, "/")).filter(Boolean);
    if (paths.length === 0) {
      return { ok: true, committed: false, reason: "noop" };
    }

    const add = await runGit(gitDir, rootAbs, ["add", "--", ...paths]);
    if (add.code !== 0) {
      return {
        ok: false,
        committed: false,
        reason: "error",
        message: add.stderr.trim() || add.stdout.trim() || "git add failed",
      };
    }

    const status = await runGit(gitDir, rootAbs, ["status", "--porcelain", "--", ...paths]);
    if (status.code !== 0) {
      return { ok: false, committed: false, reason: "error", message: status.stderr.trim() };
    }
    if (!status.stdout.trim()) {
      return { ok: true, committed: false, reason: "noop" };
    }

    const msg = opts.message || `${opts.reason}: ${paths.join(", ")}`;
    const commit = await runGit(gitDir, rootAbs, [
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      msg,
    ]);
    if (commit.code !== 0) {
      return {
        ok: false,
        committed: false,
        reason: "error",
        message: commit.stderr.trim() || commit.stdout.trim() || "git commit failed",
      };
    }
    return { ok: true, committed: true };
  }

  async list(
    root: string,
    opts: { path?: string; limit?: number } = {},
  ): Promise<HistoryEntry[]> {
    if (!(await this.ensureRepo(root))) return [];
    const rootAbs = path.resolve(root);
    const gitDir = this.gitDir(rootAbs);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 40));
    const file = opts.path?.replace(/^\.\//, "").replace(/\\/g, "/");
    const args = ["log", `--max-count=${limit}`, "--pretty=format:%H\t%ct\t%s"];
    if (file) args.push("--", file);
    const log = await runGitDir(gitDir, args);
    if (log.code !== 0) return [];
    return log.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [hash, at, ...rest] = line.split("\t");
        return {
          hash: hash ?? "",
          at: Number(at) * 1000 || 0,
          message: rest.join("\t") || "(no message)",
          path: file,
        };
      })
      .filter((e) => e.hash.length > 0);
  }

  /** Read a file blob from a shadow-git commit (object DB only). */
  async readAt(root: string, hash: string, rel: string): Promise<{ content: string } | { error: string }> {
    if (!(await this.ensureRepo(root))) {
      return { error: "Local history unavailable" };
    }
    const gitDir = this.gitDir(root);
    const file = rel.replace(/^\.\//, "").replace(/\\/g, "/");
    const show = await runGitDir(gitDir, ["show", `${hash}:${file}`]);
    if (show.code !== 0) {
      const detail = (show.stderr || show.stdout || "git show failed").trim();
      return { error: detail.slice(0, 300) || `Revision not found for ${file}` };
    }
    return { content: show.stdout };
  }
}

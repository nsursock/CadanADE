import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/** First existing ~/projects|repos|code|dev|src, else home. */
export async function defaultProjectParent(): Promise<string> {
  const home = os.homedir();
  for (const dir of ["projects", "repos", "code", "dev", "src"]) {
    const candidate = path.join(home, dir);
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch {
      /* try next */
    }
  }
  return home;
}

/**
 * Discover project folders under common home subdirs (Adaan-style).
 * Uses the first parent that has child directories.
 */
export async function listCandidateRoots(): Promise<string[]> {
  const home = os.homedir();
  const parents = [
    ...["projects", "repos", "code", "dev", "src"].map((d) => path.join(home, d)),
    home,
  ];

  for (const parent of parents) {
    try {
      const stat = await fs.stat(parent);
      if (!stat.isDirectory()) continue;
      const entries = await fs.readdir(parent, { withFileTypes: true });
      const roots = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => path.join(parent, e.name))
        .sort((a, b) => a.localeCompare(b));
      if (roots.length > 0) return roots.slice(0, 40);
    } catch {
      /* try next */
    }
  }
  return [];
}

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export async function createProjectDir(
  name: string,
  parentPath?: string,
): Promise<{ rootPath: string; name: string }> {
  if (!NAME_RE.test(name) || name.length > 100) {
    throw new Error("Invalid project name. Use letters, numbers, dots, dashes and underscores.");
  }

  const parent = parentPath?.trim() || (await defaultProjectParent());
  try {
    const st = await fs.stat(parent);
    if (!st.isDirectory()) throw new Error("Parent path is not a directory");
  } catch (e) {
    if (e instanceof Error && e.message === "Parent path is not a directory") throw e;
    throw new Error("Parent path does not exist");
  }

  const rootPath = path.join(parent, name);
  try {
    const existing = await fs.stat(rootPath);
    if (!existing.isDirectory()) throw new Error(`Path exists and is not a directory: ${rootPath}`);
    const entries = await fs.readdir(rootPath);
    if (entries.length > 0) throw new Error(`Directory is not empty: ${rootPath}`);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      await fs.mkdir(rootPath, { recursive: true });
    } else {
      throw e;
    }
  }

  await fs.writeFile(path.join(rootPath, "README.md"), `# ${name}\n\nCreated with CadanADE.\n`, "utf8");
  await fs.writeFile(path.join(rootPath, ".gitignore"), "node_modules/\ndist/\n.env\n.DS_Store\n", "utf8");
  return { rootPath, name };
}

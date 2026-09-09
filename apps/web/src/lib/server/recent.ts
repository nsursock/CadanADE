import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const recentFile = path.join(os.homedir(), ".cadan", "recent-workspaces.json");

export async function loadRecent(): Promise<string[]> {
  try {
    const data = await fs.readFile(recentFile, "utf8");
    const parsed = JSON.parse(data) as unknown;
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

async function saveRecent(paths: string[]) {
  await fs.mkdir(path.dirname(recentFile), { recursive: true });
  await fs.writeFile(recentFile, JSON.stringify(paths.slice(0, 12), null, 0));
}

export async function addRecent(rootPath: string) {
  const recent = await loadRecent();
  const updated = [rootPath, ...recent.filter((p) => p !== rootPath)].slice(0, 12);
  await saveRecent(updated);
  return updated;
}

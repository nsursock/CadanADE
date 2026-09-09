const RECENT_KEY = "cadan.recentWorkspaces.v1";
const MAX_RECENT = 8;

export function loadRecentWorkspaces(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function rememberWorkspace(path: string) {
  if (typeof localStorage === "undefined" || !path) return;
  const next = [path, ...loadRecentWorkspaces().filter((p) => p !== path)].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

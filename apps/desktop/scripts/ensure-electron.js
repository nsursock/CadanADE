#!/usr/bin/env node
/**
 * Ensure Electron's platform binary is extracted.
 * pnpm sometimes leaves path.txt missing after a partial install.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function electronRoot() {
  return path.dirname(require.resolve("electron/package.json"));
}

function isReady(root) {
  try {
    const pathFile = path.join(root, "path.txt");
    const relative = fs.readFileSync(pathFile, "utf8").trim();
    return Boolean(relative) && fs.existsSync(path.join(root, "dist", relative));
  } catch {
    return false;
  }
}

const root = electronRoot();
if (isReady(root)) {
  process.exit(0);
}

console.log("[cadan/desktop] Electron binary missing — running install.js…");
const install = path.join(root, "install.js");
const result = spawnSync(process.execPath, [install], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: undefined },
});

if (result.status !== 0 || !isReady(root)) {
  // Fallback: system unzip from electron cache if install.js left path.txt missing
  const pathFile = path.join(root, "path.txt");
  const platformPath =
    process.platform === "darwin"
      ? "Electron.app/Contents/MacOS/Electron"
      : process.platform === "win32"
        ? "electron.exe"
        : "electron";
  if (fs.existsSync(path.join(root, "dist", platformPath)) && !fs.existsSync(pathFile)) {
    fs.writeFileSync(pathFile, platformPath);
  }
}

if (!isReady(root)) {
  console.error(
    "[cadan/desktop] Electron still incomplete. Try:\n" +
      "  rm -rf node_modules/.pnpm/electron@* && pnpm install\n" +
      "  or: pnpm --filter @cadan/desktop run electron:repair",
  );
  process.exit(1);
}

console.log("[cadan/desktop] Electron binary ready");

// Fix node-pty spawn-helper permissions (prebuild ships without +x)
try {
  require("./fix-pty-perms.js");
} catch {
  /* node-pty not installed yet — skip */
}

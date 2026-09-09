#!/usr/bin/env node
/**
 * node-pty's prebuild ships the spawn-helper binary without the execute bit
 * on macOS/Linux, causing posix_spawnp to fail at spawn time.
 * This chmod's every spawn-helper under prebuilds so pty.spawn works.
 */
const fs = require("node:fs");
const path = require("node:path");

if (process.platform === "win32") process.exit(0);

let ptyRoot;
try {
  ptyRoot = path.dirname(require.resolve("node-pty/package.json"));
} catch {
  process.exit(0);
}

const prebuildsDir = path.join(ptyRoot, "prebuilds");
if (!fs.existsSync(prebuildsDir)) process.exit(0);

for (const entry of fs.readdirSync(prebuildsDir)) {
  const helper = path.join(prebuildsDir, entry, "spawn-helper");
  try {
    if (fs.statSync(helper).isFile()) {
      fs.chmodSync(helper, 0o755);
      console.log(`[cadan/desktop] chmod +x ${path.join("prebuilds", entry, "spawn-helper")}`);
    }
  } catch {
    /* skip */
  }
}

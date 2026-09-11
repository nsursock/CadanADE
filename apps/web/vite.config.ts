import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webRoot, "../..");

/** Resolve a dependency to its package root under apps/web (or nested pnpm). */
function pkg(name: string): string {
  const direct = path.join(webRoot, "node_modules", ...name.split("/"));
  if (fs.existsSync(path.join(direct, "package.json"))) return direct;

  const pnpmRoot = path.join(webRoot, "node_modules/.pnpm");
  if (fs.existsSync(pnpmRoot)) {
    const needle = `${name.replace("/", "+")}@`;
    for (const entry of fs.readdirSync(pnpmRoot)) {
      if (!entry.startsWith(needle) && !entry.includes(name.replace("/", "+"))) continue;
      const candidate = path.join(pnpmRoot, entry, "node_modules", ...name.split("/"));
      if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    }
  }
  throw new Error(`Could not resolve package root for ${name}`);
}

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  envDir: repoRoot,
  resolve: {
    // Force a single @codemirror/state (etc.) instance — nested peers from
    // @replit/codemirror-minimap otherwise break Facet/Extension instanceof checks.
    alias: {
      "@codemirror/state": pkg("@codemirror/state"),
      "@codemirror/view": pkg("@codemirror/view"),
      "@codemirror/language": pkg("@codemirror/language"),
      "@codemirror/lint": pkg("@codemirror/lint"),
      "@codemirror/commands": pkg("@codemirror/commands"),
      "@lezer/common": pkg("@lezer/common"),
      "@lezer/highlight": pkg("@lezer/highlight"),
    },
    dedupe: [
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/language",
      "@codemirror/lint",
      "@codemirror/commands",
      "@lezer/common",
      "@lezer/highlight",
    ],
  },
  server: {
    fs: {
      allow: ["../..", "../../../ScifiUI"],
    },
  },
  optimizeDeps: {
    include: [
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/language",
      "@codemirror/lint",
      "@replit/codemirror-minimap",
      "@tabler/icons-svelte/icons/arrow-right",
      "@tabler/icons-svelte/icons/bolt",
      "@tabler/icons-svelte/icons/brain",
      "@tabler/icons-svelte/icons/chart-bar",
      "@tabler/icons-svelte/icons/check",
      "@tabler/icons-svelte/icons/bolt",
      "@tabler/icons-svelte/icons/blur",
      "@tabler/icons-svelte/icons/check",
      "@tabler/icons-svelte/icons/chevron-down",
      "@tabler/icons-svelte/icons/cpu",
      "@tabler/icons-svelte/icons/chevron-right",
      "@tabler/icons-svelte/icons/search",
      "@tabler/icons-svelte/icons/clock",
      "@tabler/icons-svelte/icons/code",
      "@tabler/icons-svelte/icons/cube",
      "@tabler/icons-svelte/icons/eye",
      "@tabler/icons-svelte/icons/eye-off",
      "@tabler/icons-svelte/icons/file",
      "@tabler/icons-svelte/icons/folder",
      "@tabler/icons-svelte/icons/folder-open",
      "@tabler/icons-svelte/icons/key",
      "@tabler/icons-svelte/icons/palette",
      "@tabler/icons-svelte/icons/player-play",
      "@tabler/icons-svelte/icons/plus",
      "@tabler/icons-svelte/icons/refresh",
      "@tabler/icons-svelte/icons/restore",
      "@tabler/icons-svelte/icons/robot",
      "@tabler/icons-svelte/icons/send",
      "@tabler/icons-svelte/icons/settings",
      "@tabler/icons-svelte/icons/sparkles",
      "@tabler/icons-svelte/icons/terminal-2",
      "@tabler/icons-svelte/icons/tool",
      "@tabler/icons-svelte/icons/user",
      "@tabler/icons-svelte/icons/x",
    ],
  },
});

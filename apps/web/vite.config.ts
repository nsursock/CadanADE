import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  envDir: repoRoot,
  server: {
    fs: {
      allow: ["../..", "../../../ScifiUI"],
    },
  },
  optimizeDeps: {
    include: [
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

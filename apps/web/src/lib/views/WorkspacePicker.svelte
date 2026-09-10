<script lang="ts">
  import { onMount } from "svelte";
  import IconArrowRight from "@tabler/icons-svelte/icons/arrow-right";
  import IconBolt from "@tabler/icons-svelte/icons/bolt";
  import IconBrain from "@tabler/icons-svelte/icons/brain";
  import IconFolder from "@tabler/icons-svelte/icons/folder";
  import IconClock from "@tabler/icons-svelte/icons/clock";
  import IconSparkles from "@tabler/icons-svelte/icons/sparkles";
  import IconTerminal2 from "@tabler/icons-svelte/icons/terminal-2";
  import IconCube from "@tabler/icons-svelte/icons/cube";
  import IconPlus from "@tabler/icons-svelte/icons/plus";
  import IconFolderOpen from "@tabler/icons-svelte/icons/folder-open";
  import { appState } from "$lib/state.svelte";
  import { rememberWorkspace } from "$lib/recent-workspaces";
  import { countUp, playLandingIntro, pulseConsole, typewriter } from "$lib/motion/landing";

  let path = $state("");
  let selected = $state("");
  let busy = $state(false);
  let loading = $state(true);
  let recent = $state<string[]>([]);
  let candidates = $state<string[]>([]);
  let defaultProjectDir = $state("");
  let showNew = $state(false);
  let newName = $state("");
  let newParent = $state("");
  let creating = $state(false);
  let consoleEl: HTMLElement | null = $state(null);
  let rootEl: HTMLElement | null = $state(null);
  let isDesktop = $state(false);

  const tagline = "Coding All Day and All Night.";
  let typed = $state("");
  let typingDone = $state(false);
  let stats = $state({ models: 0, themes: 0, tools: 0 });

  const features = [
    { icon: IconBrain, label: "Agentic engine" },
    { icon: IconBolt, label: "Streaming SSE" },
    { icon: IconCube, label: "ScifiUI chrome" },
    { icon: IconTerminal2, label: "Tool-calling FSM" },
    { icon: IconSparkles, label: "Nine live themes" },
  ];

  let hasExisting = $derived(candidates.length > 0 || recent.length > 0);

  function basename(p: string) {
    return p.split("/").filter(Boolean).at(-1) || p;
  }
  function dirname(p: string) {
    const parts = p.split("/").filter(Boolean);
    parts.pop();
    return parts.length ? "/" + parts.join("/") : "/";
  }

  onMount(() => {
    isDesktop = typeof window !== "undefined" && !!window.cadan;
    if (rootEl) playLandingIntro(rootEl);
    typewriter(tagline, (s) => (typed = s), () => (typingDone = true));
    countUp({ models: 50, themes: 9, tools: 7 }, (v) => {
      stats = { models: v.models, themes: v.themes, tools: v.tools };
    });
    void discover();

    const unsub = window.cadan?.onWorkspaceOpened((p) => {
      path = p;
      selected = p;
      void openPath(p);
    });
    return () => unsub?.();
  });

  async function discover() {
    loading = true;
    try {
      const res = await fetch("/api/workspace");
      const data = await res.json();
      candidates = data.candidates ?? [];
      recent = data.recent ?? [];
      defaultProjectDir = data.defaultProjectDir ?? "";
      newParent = defaultProjectDir;
      if (recent[0]) {
        selected = recent[0];
        path = recent[0];
      } else if (candidates[0]) {
        selected = candidates[0];
        path = candidates[0];
      }
      if (!recent.length && !candidates.length) showNew = true;
    } catch {
      appState.workspaceError = "Failed to discover workspaces";
    } finally {
      loading = false;
    }
  }

  async function openPath(value: string) {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    busy = true;
    appState.treeLoading = true;
    appState.workspaceError = null;
    await pulseConsole(consoleEl);
    try {
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open", path: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to open");
      rememberWorkspace(data.root);
      recent = [data.root, ...recent.filter((p) => p !== data.root)].slice(0, 12);
      appState.workspaceRoot = data.root;
      appState.tree = data.tree ?? [];
      appState.showToast("Workspace linked", "success");
    } catch (e) {
      appState.workspaceError = e instanceof Error ? e.message : "Open failed";
      appState.showToast(appState.workspaceError, "error");
    } finally {
      busy = false;
      appState.treeLoading = false;
    }
  }

  function handleOpen() {
    void openPath(path.trim() || selected);
  }

  async function browseNative() {
    const picked = await window.cadan?.openWorkspaceDialog();
    if (!picked) return;
    path = picked;
    selected = picked;
    void openPath(picked);
  }

  async function createProject() {
    const name = newName.trim();
    if (!name || creating) return;
    creating = true;
    appState.workspaceError = null;
    await pulseConsole(consoleEl);
    try {
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name,
          parentPath: newParent.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Create failed");
      rememberWorkspace(data.root);
      appState.workspaceRoot = data.root;
      appState.tree = data.tree ?? [];
      appState.showToast(`Created ${name}`, "success");
    } catch (e) {
      appState.workspaceError = e instanceof Error ? e.message : "Create failed";
      appState.showToast(appState.workspaceError, "error");
    } finally {
      creating = false;
    }
  }
</script>

<section
  bind:this={rootEl}
  class="relative h-full w-full flex items-center justify-center px-6 py-10 overflow-hidden"
>
  <div class="grid-floor"></div>
  <div class="vignette"></div>

  <div class="relative z-10 w-full max-w-5xl flex flex-col lg:flex-row items-center lg:items-stretch gap-8 lg:gap-10">
    <div class="flex-1 flex flex-col items-center lg:items-start text-center lg:text-left justify-center min-w-0">
      <div class="hero-kicker neon-flicker label-kicker text-scifi-primary mb-4">
        ⟨&nbsp; Cadan · Coding All Day and All Night &nbsp;⟩
      </div>
      <h1
        class="hero-title hero-title-glitch text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight mb-4"
        data-text="CadanADE"
      >
        CadanADE
      </h1>
      <p class="hero-tagline text-base sm:text-lg text-scifi-text/80 mb-7 h-7">
        <span class={!typingDone ? "caret-blink" : ""}>{typed}</span>
      </p>
      <div class="flex flex-wrap items-center justify-center lg:justify-start gap-2 mb-9 max-w-lg">
        {#each features as f (f.label)}
          <span class="feature-pill">
            <f.icon size={14} stroke={1.75} class="text-scifi-primary" />
            {f.label}
          </span>
        {/each}
      </div>
      <div class="grid grid-cols-3 gap-6 w-full max-w-xs">
        <div class="stat-tile">
          <div class="stat-value">{stats.models}+</div>
          <div class="stat-label">Models</div>
        </div>
        <div class="stat-tile">
          <div class="stat-value">{stats.themes}</div>
          <div class="stat-label">Themes</div>
        </div>
        <div class="stat-tile">
          <div class="stat-value">{stats.tools}</div>
          <div class="stat-label">Tools</div>
        </div>
      </div>
    </div>

    <div class="flex-1 flex flex-col justify-center w-full max-w-xl min-w-0">
      <div bind:this={consoleEl} class="console-panel w-full p-6 sm:p-7 text-left">
        <div class="scan-line"></div>

        <div class="flex items-center justify-between mb-5">
          <span class="status-chip">
            <span class="dot"></span>
            workspace · console
          </span>
          <button
            type="button"
            class="btn btn-ghost btn-xs inline-flex items-center gap-1"
            onclick={() => (showNew = !showNew)}
          >
            <IconPlus size={14} stroke={1.75} />
            {showNew ? "Open existing" : "New project"}
          </button>
        </div>

        {#if loading}
          <div class="py-10 text-center text-sm text-scifi-muted">
            <span class="caret-blink">scanning workspaces</span>
          </div>
        {:else if showNew || !hasExisting}
          <div class="flex flex-col gap-3">
            {#if !hasExisting}
              <p class="text-xs text-scifi-muted text-center py-1">
                No projects detected — initialize a new one to begin.
              </p>
            {/if}
            <label class="block">
              <span class="label-kicker block mb-1">Project name</span>
              <input
                class="input"
                placeholder="my-new-project"
                bind:value={newName}
                onkeydown={(e) => e.key === "Enter" && createProject()}
              />
            </label>
            <label class="block">
              <span class="label-kicker block mb-1">Create inside</span>
              <input class="input font-mono text-xs" bind:value={newParent} placeholder={defaultProjectDir || "~/projects"} />
            </label>
            {#if appState.workspaceError}
              <div class="alert alert-error text-xs">{appState.workspaceError}</div>
            {/if}
            <button
              type="button"
              class="btn-cta w-full inline-flex items-center justify-center gap-2"
              disabled={!newName.trim() || creating}
              onclick={createProject}
            >
              {creating ? "Initializing…" : "Initialize project"}
              <IconBolt size={18} stroke={1.75} />
            </button>
          </div>
        {:else}
          <div class="flex flex-col gap-4">
            {#if recent.length > 0}
              <div>
                <div class="flex items-center gap-2 text-xs font-semibold mb-2 tracking-wider uppercase text-scifi-muted">
                  <IconClock size={14} stroke={1.75} />
                  Recent
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {#each recent.slice(0, 4) as rp (rp)}
                    <button type="button" class="picker-card" onclick={() => openPath(rp)} title={rp}>
                      <IconFolder size={18} stroke={1.75} class="text-scifi-primary shrink-0" />
                      <span class="min-w-0 flex-1 truncate text-left">
                        <span class="picker-title block truncate">{basename(rp)}</span>
                        <span class="picker-meta block truncate">{dirname(rp)}</span>
                      </span>
                      <IconArrowRight size={14} stroke={1.75} class="text-scifi-muted shrink-0" />
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            {#if candidates.length > 0 || recent.length > 0}
              <label class="block">
                <span class="label-kicker block mb-1">Select workspace</span>
                <select
                  class="select"
                  bind:value={selected}
                  onchange={() => (path = selected)}
                >
                  {#if recent.length > 0}
                    <optgroup label="Recent">
                      {#each recent as rp (rp)}
                        <option value={rp}>{rp}</option>
                      {/each}
                    </optgroup>
                  {/if}
                  {#if candidates.length > 0}
                    <optgroup label="Detected">
                      {#each candidates as c (c)}
                        <option value={c}>{c}</option>
                      {/each}
                    </optgroup>
                  {/if}
                </select>
              </label>
            {/if}

            <label class="block">
              <span class="label-kicker block mb-1">Or enter path</span>
              <div class="flex gap-2">
                <input
                  class="input font-mono text-xs flex-1"
                  placeholder="/Users/you/project"
                  bind:value={path}
                  onkeydown={(e) => e.key === "Enter" && handleOpen()}
                />
                {#if isDesktop}
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm inline-flex items-center gap-1 shrink-0"
                    onclick={browseNative}
                    title="Browse…"
                  >
                    <IconFolderOpen size={15} stroke={1.75} />
                    Browse
                  </button>
                {/if}
              </div>
            </label>

            {#if appState.workspaceError}
              <div class="alert alert-error text-xs">{appState.workspaceError}</div>
            {/if}

            <button
              type="button"
              class="btn-cta w-full inline-flex items-center justify-center gap-2"
              disabled={busy || !(path.trim() || selected)}
              onclick={handleOpen}
            >
              {busy ? "Linking…" : "Open workspace"}
              <IconBolt size={18} stroke={1.75} />
            </button>
          </div>
        {/if}

        <p class="text-[0.65rem] text-scifi-muted mt-4 text-center tracking-wide">
          Scans ~/projects · ~/repos · ~/code · ~/dev · ~/src
        </p>
      </div>
    </div>
  </div>
</section>

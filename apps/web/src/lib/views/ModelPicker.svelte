<script lang="ts">
  import { onMount } from "svelte";
  import IconCpu from "@tabler/icons-svelte/icons/cpu";
  import IconCheck from "@tabler/icons-svelte/icons/check";
  import IconSearch from "@tabler/icons-svelte/icons/search";
  import { patchSettings } from "@cadan/core";
  import { appState } from "$lib/state.svelte";
  import Tooltip from "./Tooltip.svelte";

  type ModelEntry = { id: string; name: string };

  let open = $state(false);
  let query = $state("");
  let free = $state<ModelEntry[]>([]);
  let paid = $state<ModelEntry[]>([]);
  let loading = $state(false);
  let loaded = $state(false);
  let rootEl: HTMLDivElement | undefined = $state();
  let menuStyle = $state("");

  const filteredFree = $derived(
    free.filter(
      (m) =>
        !query ||
        m.id.toLowerCase().includes(query.toLowerCase()) ||
        m.name.toLowerCase().includes(query.toLowerCase()),
    ),
  );
  const filteredPaid = $derived(
    paid.filter(
      (m) =>
        !query ||
        m.id.toLowerCase().includes(query.toLowerCase()) ||
        m.name.toLowerCase().includes(query.toLowerCase()),
    ),
  );

  function placeMenu() {
    if (!rootEl) return;
    const rect = rootEl.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 16);
    const height = Math.min(360, Math.max(220, window.innerHeight - 24));
    let left = rect.right - width;
    if (left < 8) left = 8;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    let top = rect.bottom + 4;
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - height - 4);
    }
    menuStyle = [
      "position:fixed",
      `top:${top}px`,
      `left:${left}px`,
      `width:${width}px`,
      `height:${height}px`,
      "display:flex",
      "flex-direction:column",
      "overflow:hidden",
      "z-index:80",
    ].join(";");
  }

  async function ensureModels() {
    if (loaded || loading || !appState.hasProviderKey) return;
    loading = true;
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      free = data.free ?? [{ id: "openrouter/free", name: "OpenRouter Free (auto)" }];
      paid = data.paid ?? [];
      loaded = true;
    } catch {
      free = [{ id: "openrouter/free", name: "OpenRouter Free (auto)" }];
    } finally {
      loading = false;
    }
  }

  async function select(id: string) {
    appState.selectedModelId = id;
    patchSettings({ selectedModelId: id });
    open = false;
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: id }),
    });
  }

  function toggle() {
    if (!appState.hasProviderKey) {
      appState.settingsOpen = true;
      return;
    }
    open = !open;
    if (open) {
      placeMenu();
      void ensureModels();
    }
  }

  onMount(() => {
    if (appState.hasProviderKey) void ensureModels();
    const onResize = () => {
      if (open) placeMenu();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  });

  $effect(() => {
    if (appState.hasProviderKey && !loaded) void ensureModels();
  });
</script>

<div class="model-picker relative shrink-0" bind:this={rootEl}>
  <Tooltip
    tip={appState.hasProviderKey ? `Model · ${appState.selectedModelId}` : "Add API key to pick a model"}
    prefer="bottom"
    disabled={open}
  >
    <button
      type="button"
      class="icon-btn"
      class:active={open}
      class:opacity-60={!appState.hasProviderKey}
      aria-label="Model"
      aria-expanded={open}
      onclick={(e) => {
        e.stopPropagation();
        toggle();
      }}
    >
      <IconCpu size={16} stroke={1.75} />
    </button>
  </Tooltip>
  {#if open && appState.hasProviderKey}
    <div
      class="dropdown-menu open picker-panel"
      style={menuStyle}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      onwheel={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Model picker"
      tabindex="-1"
    >
      <div class="picker-head shrink-0">
        <IconSearch size={14} stroke={1.75} class="text-scifi-muted shrink-0" />
        <input class="input !py-1 text-xs flex-1 min-w-0" placeholder="Search models…" bind:value={query} />
      </div>
      <div class="picker-list">
        {#if loading}
          <div class="p-3 text-xs text-scifi-muted">Loading catalog…</div>
        {:else}
          {#if filteredFree.length}
            <div class="menu-label">Free</div>
            {#each filteredFree as m (m.id)}
              <button
                type="button"
                class="menu-item"
                class:active={m.id === appState.selectedModelId}
                onclick={() => select(m.id)}
              >
                <span class="truncate flex-1 text-left min-w-0">{m.name}</span>
                {#if m.id === appState.selectedModelId}
                  <IconCheck size={14} stroke={1.75} class="text-scifi-primary shrink-0" />
                {/if}
              </button>
            {/each}
          {/if}
          {#if filteredPaid.length}
            <div class="menu-label mt-1">Paid</div>
            {#each filteredPaid as m (m.id)}
              <button
                type="button"
                class="menu-item"
                class:active={m.id === appState.selectedModelId}
                onclick={() => select(m.id)}
              >
                <span class="truncate flex-1 text-left min-w-0">{m.name}</span>
                {#if m.id === appState.selectedModelId}
                  <IconCheck size={14} stroke={1.75} class="text-scifi-primary shrink-0" />
                {/if}
              </button>
            {/each}
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</div>

<svelte:window
  onclick={() => {
    if (open) open = false;
  }}
/>

<style>
  .picker-panel {
    padding: 0 !important;
    gap: 0 !important;
  }
  .picker-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border-bottom: 1px solid var(--scifi-border);
  }
  .picker-list {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    padding: 0.25rem;
    -webkit-overflow-scrolling: touch;
  }
</style>

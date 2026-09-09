<script lang="ts">
  import IconPalette from "@tabler/icons-svelte/icons/palette";
  import IconCheck from "@tabler/icons-svelte/icons/check";
  import { THEME_IDS, type ThemeId, patchSettings } from "@cadan/core";
  import { appState } from "$lib/state.svelte";
  import Tooltip from "./Tooltip.svelte";

  const palettes: Record<
    ThemeId,
    { label: string; primary: string; secondary: string; cyan: string }
  > = {
    retrowave: { label: "Retrowave", primary: "#ff2e9a", secondary: "#b46bff", cyan: "#2ee6ff" },
    ghibli: { label: "Ghibli", primary: "#4a8b6f", secondary: "#6ba3d6", cyan: "#d6a13a" },
    fiesta: { label: "Fiesta", primary: "#ff006e", secondary: "#fb5607", cyan: "#3a86ff" },
    dawn: { label: "Dawn", primary: "#ff7e6b", secondary: "#6b8fd6", cyan: "#d4a017" },
    synthwave84: { label: "Synthwave '84", primary: "#ff7edb", secondary: "#36f9f6", cyan: "#fede5d" },
    solarizedDark: { label: "Solarized Dark", primary: "#268bd2", secondary: "#2aa198", cyan: "#b58900" },
    cottonCandy: { label: "Cotton Candy", primary: "#ff9fb2", secondary: "#0acdff", cyan: "#60ab9a" },
    goldenTwilight: { label: "Golden Twilight", primary: "#ffd60a", secondary: "#003566", cyan: "#ffc300" },
    brightContrasts: { label: "Bright Contrasts", primary: "#ef476f", secondary: "#1b9aaa", cyan: "#06d6a0" },
  };

  let open = $state(false);
  let rootEl: HTMLDivElement | undefined = $state();
  let menuStyle = $state("");

  function placeMenu() {
    if (!rootEl) return;
    const rect = rootEl.getBoundingClientRect();
    const width = Math.min(240, window.innerWidth - 16);
    const height = Math.min(340, Math.max(200, window.innerHeight - 24));
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

  function toggle() {
    open = !open;
    if (open) placeMenu();
  }

  function apply(id: ThemeId) {
    appState.themeId = id;
    document.documentElement.dataset.theme = id;
    patchSettings({ themeId: id });
    open = false;
  }
</script>

<div class="theme-picker relative shrink-0" bind:this={rootEl}>
  <Tooltip tip={`Theme · ${palettes[appState.themeId]?.label ?? appState.themeId}`} prefer="bottom" disabled={open}>
    <button
      type="button"
      class="icon-btn"
      class:active={open}
      aria-label="Theme"
      aria-expanded={open}
      onclick={(e) => {
        e.stopPropagation();
        toggle();
      }}
    >
      <IconPalette size={16} stroke={1.75} />
    </button>
  </Tooltip>
  {#if open}
    <div
      class="dropdown-menu open picker-panel"
      style={menuStyle}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      onwheel={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Theme picker"
      tabindex="-1"
    >
      <div class="menu-label shrink-0 px-2 pt-2">Theme</div>
      <div class="picker-list">
        {#each THEME_IDS as id}
          {@const p = palettes[id]}
          {@const active = appState.themeId === id}
          <button type="button" class="menu-item theme-item" class:active onclick={() => apply(id)}>
            <svg width="40" height="12" viewBox="0 0 40 12" aria-hidden="true" class="shrink-0">
              <circle cx="6" cy="6" r="5" fill={p.primary} />
              <circle cx="20" cy="6" r="5" fill={p.secondary} />
              <circle cx="34" cy="6" r="5" fill={p.cyan} />
            </svg>
            <span class="truncate flex-1 text-left min-w-0">{p.label}</span>
            {#if active}
              <IconCheck size={14} stroke={1.75} class="text-scifi-primary shrink-0" />
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<svelte:window
  onclick={() => {
    if (open) open = false;
  }}
  onresize={() => {
    if (open) placeMenu();
  }}
/>

<style>
  .picker-panel {
    padding: 0 !important;
    gap: 0 !important;
  }
  .picker-list {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    padding: 0.25rem 0.35rem 0.45rem;
    -webkit-overflow-scrolling: touch;
  }
  .theme-item {
    gap: 0.55rem;
  }
</style>

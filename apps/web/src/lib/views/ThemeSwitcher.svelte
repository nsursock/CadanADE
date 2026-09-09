<script lang="ts">
  import IconCheck from "@tabler/icons-svelte/icons/check";
  import IconPalette from "@tabler/icons-svelte/icons/palette";
  import IconWaveSine from "@tabler/icons-svelte/icons/wave-sine";
  import IconLeaf from "@tabler/icons-svelte/icons/leaf";
  import IconConfetti from "@tabler/icons-svelte/icons/confetti";
  import IconSunrise from "@tabler/icons-svelte/icons/sunrise";
  import IconVinyl from "@tabler/icons-svelte/icons/vinyl";
  import IconSunHigh from "@tabler/icons-svelte/icons/sun-high";
  import IconCandy from "@tabler/icons-svelte/icons/candy";
  import IconSunset from "@tabler/icons-svelte/icons/sunset";
  import IconContrast from "@tabler/icons-svelte/icons/contrast";
  import { THEME_IDS, type ThemeId, patchSettings } from "@cadan/core";
  import { appState } from "$lib/state.svelte";
  import Tooltip from "./Tooltip.svelte";

  const themes: Record<
    ThemeId,
    { label: string; icon: typeof IconPalette }
  > = {
    retrowave: { label: "Retrowave", icon: IconWaveSine },
    ghibli: { label: "Ghibli", icon: IconLeaf },
    fiesta: { label: "Fiesta", icon: IconConfetti },
    dawn: { label: "Dawn", icon: IconSunrise },
    synthwave84: { label: "Synthwave '84", icon: IconVinyl },
    solarizedDark: { label: "Solarized Dark", icon: IconSunHigh },
    cottonCandy: { label: "Cotton Candy", icon: IconCandy },
    goldenTwilight: { label: "Golden Twilight", icon: IconSunset },
    brightContrasts: { label: "Bright Contrasts", icon: IconContrast },
  };

  let open = $state(false);
  let rootEl: HTMLDivElement | undefined = $state();
  let menuStyle = $state("");

  function placeMenu() {
    if (!rootEl) return;
    const rect = rootEl.getBoundingClientRect();
    const width = Math.min(220, window.innerWidth - 16);
    const maxHeight = Math.min(420, window.innerHeight - 24);
    let left = rect.right - width;
    if (left < 8) left = 8;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    let top = rect.bottom + 4;
    if (top + 160 > window.innerHeight - 8) {
      top = Math.max(8, rect.top - maxHeight - 4);
    }
    menuStyle = [
      "position:fixed",
      `top:${top}px`,
      `left:${left}px`,
      `width:${width}px`,
      `max-height:${maxHeight}px`,
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
  <Tooltip tip={`Theme · ${themes[appState.themeId]?.label ?? appState.themeId}`} prefer="bottom" disabled={open}>
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
      <div class="menu-label shrink-0 px-2 pt-2 pb-1">Theme</div>
      <div class="picker-list">
        {#each THEME_IDS as id}
          {@const t = themes[id]}
          {@const active = appState.themeId === id}
          {@const Icon = t.icon}
          <button type="button" class="menu-item theme-item" class:active onclick={() => apply(id)}>
            <Icon size={16} stroke={1.75} class="text-scifi-primary shrink-0" />
            <span class="truncate flex-1 text-left min-w-0">{t.label}</span>
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
    height: auto !important;
  }
  .picker-list {
    flex: 0 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    padding: 0 0.35rem 0.35rem;
    -webkit-overflow-scrolling: touch;
  }
  .theme-item {
    gap: 0.55rem;
  }
</style>

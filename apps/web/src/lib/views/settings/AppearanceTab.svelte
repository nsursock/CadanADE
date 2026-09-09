<script lang="ts">
  import IconPalette from "@tabler/icons-svelte/icons/palette";
  import IconSparkles from "@tabler/icons-svelte/icons/sparkles";
  import IconCheck from "@tabler/icons-svelte/icons/check";
  import { THEME_IDS, type ThemeId, patchSettings } from "@cadan/core";
  import { appState } from "$lib/state.svelte";

  /** Keep in sync with @scifiui/core themes.css */
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

  function setTheme(id: ThemeId) {
    appState.themeId = id;
    document.documentElement.dataset.theme = id;
    patchSettings({ themeId: id });
  }

  function setThree(on: boolean) {
    appState.threeBackground = on;
    patchSettings({ threeBackground: on });
  }
</script>

<section class="space-y-5">
  <div>
    <div class="flex items-center gap-2 mb-1">
      <IconPalette size={16} stroke={1.75} class="text-scifi-primary" />
      <h3 class="pane-title !normal-case !tracking-normal !text-sm"><span class="pane-title-bar"></span> Theme</h3>
    </div>
    <p class="text-xs text-scifi-muted mb-3">Applies instantly across the shell, editor chrome, and landing.</p>

    <div class="theme-grid" role="listbox" aria-label="Color theme">
      {#each THEME_IDS as id}
        {@const active = appState.themeId === id}
        {@const p = palettes[id]}
        <button
          type="button"
          class="theme-swatch"
          class:active
          role="option"
          aria-selected={active}
          title={p.label}
          onclick={() => setTheme(id)}
        >
          <span class="theme-swatch-meta">
            <span class="theme-swatch-name">{p.label}</span>
            {#if active}
              <IconCheck size={14} stroke={1.75} class="text-scifi-primary shrink-0" />
            {/if}
          </span>
          <svg class="theme-dots" width="52" height="16" viewBox="0 0 52 16" aria-hidden="true">
            <circle cx="8" cy="8" r="7" fill={p.primary} stroke="rgba(255,255,255,0.25)" stroke-width="1" />
            <circle cx="26" cy="8" r="7" fill={p.secondary} stroke="rgba(255,255,255,0.25)" stroke-width="1" />
            <circle cx="44" cy="8" r="7" fill={p.cyan} stroke="rgba(255,255,255,0.25)" stroke-width="1" />
          </svg>
        </button>
      {/each}
    </div>
  </div>

  <div>
    <div class="flex items-center gap-2 mb-1">
      <IconSparkles size={16} stroke={1.75} class="text-scifi-primary" />
      <h3 class="pane-title !normal-case !tracking-normal !text-sm"><span class="pane-title-bar"></span> Atmosphere</h3>
    </div>
    <p class="text-xs text-scifi-muted mb-3">Optional motion behind the UI. Turn off if the GPU feels busy.</p>

    <div class="list">
      <label class="list-row cursor-pointer">
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold leading-tight">Particle field</div>
          <div class="text-xs text-scifi-muted mt-0.5">Three.js backdrop on the landing and workspace shell</div>
        </div>
        <input
          type="checkbox"
          class="toggle shrink-0"
          checked={appState.threeBackground}
          onchange={(e) => setThree((e.currentTarget as HTMLInputElement).checked)}
        />
      </label>
    </div>
  </div>
</section>

<style>
  .theme-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }
  @media (min-width: 480px) {
    .theme-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  .theme-swatch {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.55rem;
    padding: 0.65rem 0.7rem;
    text-align: left;
    border-radius: var(--scifi-radius);
    border: 1px solid var(--scifi-border);
    background: color-mix(in srgb, var(--scifi-surface-solid) 88%, transparent);
    color: var(--scifi-text);
    cursor: pointer;
    transition:
      border-color 0.18s var(--scifi-ease),
      box-shadow 0.18s var(--scifi-ease);
  }
  .theme-swatch:hover {
    border-color: color-mix(in srgb, var(--scifi-primary) 45%, var(--scifi-border));
  }
  .theme-swatch.active {
    border-color: var(--scifi-primary);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--scifi-primary) 35%, transparent);
  }
  .theme-swatch-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.35rem;
    width: 100%;
    min-height: 1rem;
  }
  .theme-swatch-name {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .theme-dots {
    display: block;
    flex-shrink: 0;
  }
</style>

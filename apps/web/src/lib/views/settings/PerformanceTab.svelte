<script lang="ts">
  import IconBolt from "@tabler/icons-svelte/icons/bolt";
  import IconBlur from "@tabler/icons-svelte/icons/blur";
  import IconPlayerPlay from "@tabler/icons-svelte/icons/player-play";
  import IconSparkles from "@tabler/icons-svelte/icons/sparkles";
  import { patchSettings } from "@cadan/core";
  import { appState } from "$lib/state.svelte";

  function setPerf(on: boolean) {
    appState.perfLite = on;
    document.documentElement.classList.toggle("perf-lite", on);
    patchSettings({ perfLite: on });
  }
</script>

<section class="space-y-5">
  <div>
    <div class="flex items-center gap-2 mb-1">
      <IconBolt size={16} stroke={1.75} class="text-scifi-primary" />
      <h3 class="pane-title !normal-case !tracking-normal !text-sm"><span class="pane-title-bar"></span> Rendering</h3>
    </div>
    <p class="text-xs text-scifi-muted mb-3">
      Prefer responsiveness over chrome. Useful on low-power machines or long agent sessions.
    </p>

    <label class="setting-row">
      <div class="min-w-0">
        <div class="text-sm font-semibold leading-tight">Lite mode</div>
        <div class="text-xs text-scifi-muted mt-0.5">Strip decorative effects while keeping layout and contrast</div>
      </div>
      <input
        type="checkbox"
        class="toggle shrink-0"
        checked={appState.perfLite}
        onchange={(e) => setPerf((e.currentTarget as HTMLInputElement).checked)}
      />
    </label>
  </div>

  <div>
    <span class="label-kicker block mb-2">When lite is on</span>
    <ul class="effect-list" aria-label="Lite mode effects">
      <li class="effect-item">
        <IconBlur size={15} stroke={1.75} class="text-scifi-primary shrink-0" />
        <div class="min-w-0">
          <div class="text-xs font-semibold">Glass & blur</div>
          <div class="text-[0.65rem] text-scifi-muted">Panes and modals render opaque</div>
        </div>
        <span class="effect-state" class:on={appState.perfLite}>{appState.perfLite ? "Off" : "On"}</span>
      </li>
      <li class="effect-item">
        <IconSparkles size={15} stroke={1.75} class="text-scifi-primary shrink-0" />
        <div class="min-w-0">
          <div class="text-xs font-semibold">Glow & flicker</div>
          <div class="text-[0.65rem] text-scifi-muted">Neon accents and scan-line motion</div>
        </div>
        <span class="effect-state" class:on={appState.perfLite}>{appState.perfLite ? "Off" : "On"}</span>
      </li>
      <li class="effect-item">
        <IconPlayerPlay size={15} stroke={1.75} class="text-scifi-primary shrink-0" />
        <div class="min-w-0">
          <div class="text-xs font-semibold">Enter motion</div>
          <div class="text-[0.65rem] text-scifi-muted">Landing typewriter and staggered reveals</div>
        </div>
        <span class="effect-state" class:on={appState.perfLite}>{appState.perfLite ? "Off" : "On"}</span>
      </li>
    </ul>
    <p class="text-[0.65rem] text-scifi-muted mt-2">
      Particle field is controlled under Appearance and stays independent of lite mode.
    </p>
  </div>
</section>

<style>
  .effect-list {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--scifi-border);
    border-radius: var(--scifi-radius);
    overflow: hidden;
    background: color-mix(in srgb, var(--scifi-surface-solid) 70%, transparent);
  }
  .effect-item {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.65rem 0.85rem;
  }
  .effect-item + .effect-item {
    border-top: 1px solid var(--scifi-border);
  }
  .effect-state {
    margin-left: auto;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--scifi-muted);
  }
  .effect-state.on {
    color: var(--scifi-warning);
  }
</style>

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

    <div class="list">
      <label class="list-row cursor-pointer">
        <div class="min-w-0 flex-1">
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
  </div>

  <div>
    <span class="label-kicker block mb-2">When lite is on</span>
    <ul class="list" aria-label="Lite mode effects">
      <li class="list-row">
        <IconBlur size={15} stroke={1.75} class="text-scifi-primary shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="text-xs font-semibold">Glass & blur</div>
          <div class="text-[0.65rem] text-scifi-muted">Panes and modals render opaque</div>
        </div>
        <span class="badge {appState.perfLite ? 'badge-warning' : 'badge-success'}">
          {appState.perfLite ? "Off" : "On"}
        </span>
      </li>
      <li class="list-row">
        <IconSparkles size={15} stroke={1.75} class="text-scifi-primary shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="text-xs font-semibold">Glow & flicker</div>
          <div class="text-[0.65rem] text-scifi-muted">Neon accents and scan-line motion</div>
        </div>
        <span class="badge {appState.perfLite ? 'badge-warning' : 'badge-success'}">
          {appState.perfLite ? "Off" : "On"}
        </span>
      </li>
      <li class="list-row">
        <IconPlayerPlay size={15} stroke={1.75} class="text-scifi-primary shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="text-xs font-semibold">Enter motion</div>
          <div class="text-[0.65rem] text-scifi-muted">Landing typewriter and staggered reveals</div>
        </div>
        <span class="badge {appState.perfLite ? 'badge-warning' : 'badge-success'}">
          {appState.perfLite ? "Off" : "On"}
        </span>
      </li>
    </ul>
    <p class="text-[0.65rem] text-scifi-muted mt-2">
      Particle field is controlled under Appearance and stays independent of lite mode.
    </p>
  </div>
</section>

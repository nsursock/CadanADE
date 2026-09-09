<script lang="ts">
  import IconSettings from "@tabler/icons-svelte/icons/settings";
  import IconX from "@tabler/icons-svelte/icons/x";
  import ThemeSwitcher from "./ThemeSwitcher.svelte";
  import ModelPicker from "./ModelPicker.svelte";
  import Tooltip from "./Tooltip.svelte";
  import { appState } from "$lib/state.svelte";

  let {
    onCloseWorkspace,
    onOpenSettings,
  }: {
    onCloseWorkspace?: () => void;
    onOpenSettings?: () => void;
  } = $props();

  const isDesktop = typeof window !== "undefined" && !!window.cadan;
</script>

<header
  class="app-bar shrink-0 min-w-0 gap-2 overflow-visible"
  class:app-bar-desktop={isDesktop}
  data-enter
>
  <div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 overflow-hidden">
    <span class="brand-mark text-base shrink-0">Cadan</span>
    <span class="badge badge-primary shrink-0">ADE</span>
    {#if appState.workspaceRoot}
      <span
        class="status-bar-item text-xs text-scifi-muted truncate min-w-0 max-w-[8rem] sm:max-w-[14rem] lg:max-w-[20rem]"
        title={appState.workspaceRoot}
      >
        {appState.workspaceRoot}
      </span>
    {/if}
  </div>
  <div class="flex items-center gap-1 shrink-0">
    <ThemeSwitcher />
    <ModelPicker />
    <Tooltip tip="Settings" prefer="bottom">
      <button
        type="button"
        class="icon-btn shrink-0"
        aria-label="Settings"
        onclick={() => onOpenSettings?.()}
      >
        <IconSettings size={16} stroke={1.75} />
      </button>
    </Tooltip>
    {#if appState.workspaceRoot && onCloseWorkspace}
      <Tooltip tip="Close workspace" prefer="bottom">
        <button
          type="button"
          class="icon-btn shrink-0"
          aria-label="Close workspace"
          onclick={onCloseWorkspace}
        >
          <IconX size={16} stroke={1.75} />
        </button>
      </Tooltip>
    {/if}
  </div>
</header>

<style>
  :global(.app-bar.app-bar-desktop) {
    padding-left: 5.25rem;
    padding-right: 0.75rem;
    -webkit-app-region: drag;
  }
  :global(.app-bar.app-bar-desktop button),
  :global(.app-bar.app-bar-desktop select),
  :global(.app-bar.app-bar-desktop input),
  :global(.app-bar.app-bar-desktop .model-picker),
  :global(.app-bar.app-bar-desktop .theme-picker),
  :global(.app-bar.app-bar-desktop .smart-tip) {
    -webkit-app-region: no-drag;
  }
</style>

<script lang="ts">
  import { fly, fade } from "svelte/transition";
  import IconX from "@tabler/icons-svelte/icons/x";
  import IconKey from "@tabler/icons-svelte/icons/key";
  import IconPalette from "@tabler/icons-svelte/icons/palette";
  import IconBolt from "@tabler/icons-svelte/icons/bolt";
  import IconRestore from "@tabler/icons-svelte/icons/restore";
  import { DEFAULT_SETTINGS, saveSettings } from "@cadan/core";
  import { appState } from "$lib/state.svelte";
  import ProviderTab from "./ProviderTab.svelte";
  import AppearanceTab from "./AppearanceTab.svelte";
  import PerformanceTab from "./PerformanceTab.svelte";
  import Tooltip from "../Tooltip.svelte";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  type TabId = "provider" | "appearance" | "performance";
  let tab = $state<TabId>("provider");

  function close() {
    open = false;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  function restoreDefaults() {
    saveSettings({ ...DEFAULT_SETTINGS });
    appState.themeId = DEFAULT_SETTINGS.themeId;
    appState.threeBackground = DEFAULT_SETTINGS.threeBackground;
    appState.perfLite = DEFAULT_SETTINGS.perfLite;
    appState.selectedModelId = DEFAULT_SETTINGS.selectedModelId;
    document.documentElement.dataset.theme = DEFAULT_SETTINGS.themeId;
    document.documentElement.classList.toggle("perf-lite", DEFAULT_SETTINGS.perfLite);
    void fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: "",
        baseUrl: DEFAULT_SETTINGS.providerBaseUrl,
        model: DEFAULT_SETTINGS.selectedModelId,
      }),
    });
    appState.showToast("Defaults restored", "info");
  }
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="-1"
    transition:fade={{ duration: 160 }}
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") close();
    }}
  >
    <div
      class="modal max-w-2xl w-full max-h-[min(88vh,720px)] flex flex-col p-0 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      tabindex="-1"
      transition:fly={{ y: 16, duration: 220 }}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div class="pane-header !rounded-none">
        <span class="pane-title"><span class="pane-title-bar"></span> Settings Console</span>
        <Tooltip tip="Close" prefer="left">
          <button type="button" class="icon-btn" aria-label="Close" onclick={close}>
            <IconX size={16} stroke={1.75} />
          </button>
        </Tooltip>
      </div>

      <div class="tab-bar shrink-0">
        <button type="button" class="tab" class:active={tab === "provider"} onclick={() => (tab = "provider")}>
          <IconKey size={14} stroke={1.75} />
          Provider
        </button>
        <button type="button" class="tab" class:active={tab === "appearance"} onclick={() => (tab = "appearance")}>
          <IconPalette size={14} stroke={1.75} />
          Appearance
        </button>
        <button type="button" class="tab" class:active={tab === "performance"} onclick={() => (tab = "performance")}>
          <IconBolt size={14} stroke={1.75} />
          Performance
        </button>
      </div>

      <div class="flex-1 overflow-auto p-4 min-h-[18rem]">
        {#if tab === "provider"}
          <ProviderTab />
        {:else if tab === "appearance"}
          <AppearanceTab />
        {:else}
          <PerformanceTab />
        {/if}
      </div>

      <div class="modal-actions !justify-between px-4 py-3 border-t border-[var(--scifi-border)] !mb-0">
        <button type="button" class="btn btn-ghost btn-sm inline-flex items-center gap-1" onclick={restoreDefaults}>
          <IconRestore size={14} stroke={1.75} />
          Restore defaults
        </button>
        <button type="button" class="btn btn-primary btn-sm" onclick={close}>Done</button>
      </div>
    </div>
  </div>
{/if}

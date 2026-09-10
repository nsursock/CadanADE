<script lang="ts">
  import { onMount } from "svelte";
  import IconTerminal from "@tabler/icons-svelte/icons/terminal";
  import IconChevronDown from "@tabler/icons-svelte/icons/chevron-down";
  import IconChevronUp from "@tabler/icons-svelte/icons/chevron-up";
  import IconPlus from "@tabler/icons-svelte/icons/plus";
  import IconX from "@tabler/icons-svelte/icons/x";
  import { appState } from "$lib/state.svelte";
  import TerminalSession from "./TerminalSession.svelte";

  let { onClose = () => {} }: { onClose?: () => void } = $props();

  const isDesktop = typeof window !== "undefined" && !!window.cadan;

  let open = $state(true);

  onMount(() => {
    appState.ensureTerminalSession();
    return () => appState.clearTerminalSessions();
  });

  function addTab() {
    appState.addTerminalSession();
    open = true;
  }

  /** Same method as ChatView.closeChat → removeChatSession. */
  function closeTab(id: string, e?: Event) {
    e?.preventDefault();
    e?.stopPropagation();
    if (!appState.terminalSessions.some((t) => t.id === id)) return;
    if (appState.terminalSessions.length <= 1) {
      appState.clearTerminalSessions();
      onClose();
      return;
    }
    appState.removeTerminalSession(id);
  }

  function toggle() {
    open = !open;
  }

  const active = $derived(appState.activeTerminal);
</script>

{#if isDesktop}
  <div class="pane pane-bracketed h-full min-h-0 flex flex-col" class:collapsed={!open} data-enter>
    <div class="pane-header shrink-0 gap-1 !px-1">
      <div class="session-tabs flex-1 min-w-0">
        <div class="tab-bar tabs-scroll !border-0 !bg-transparent">
          {#each appState.terminalSessions as tab (tab.id)}
            <div class="tab" class:active={tab.id === appState.activeTerminalId}>
              <button type="button" class="tab-main" onclick={() => appState.setActiveTerminal(tab.id)}>
                {tab.label}
                {#if tab.alive}
                  <span class="alive-dot" title="live"></span>
                {/if}
              </button>
              <button
                type="button"
                class="tab-close"
                aria-label="Close {tab.label}"
                onpointerdown={(e) => closeTab(tab.id, e)}
              >×</button>
            </div>
          {/each}
        </div>
        <button type="button" class="icon-btn tab-add" aria-label="New terminal" onclick={addTab}>
          <IconPlus size={14} stroke={1.75} />
        </button>
      </div>
      <div class="flex items-center gap-1 shrink-0 pr-1">
        {#if active?.alive}
          <span class="status-chip"><span class="dot"></span> live</span>
        {:else}
          <span class="status-chip"><span class="dot"></span> idle</span>
        {/if}
        <button
          type="button"
          class="icon-btn"
          aria-label={open ? "Collapse terminal" : "Expand terminal"}
          onclick={toggle}
        >
          {#if open}
            <IconChevronDown size={14} stroke={1.75} />
          {:else}
            <IconChevronUp size={14} stroke={1.75} />
          {/if}
        </button>
        <button type="button" class="icon-btn" aria-label="Close terminal pane" onclick={() => {
          appState.clearTerminalSessions();
          onClose();
        }}>
          <IconX size={14} stroke={1.75} />
        </button>
      </div>
    </div>
    <div class="pane-scan"></div>
    <div class="sessions flex-1 min-h-0 relative" class:hidden={!open}>
      {#each appState.terminalSessions as tab (tab.id)}
        <TerminalSession
          id={tab.id}
          active={open && tab.id === appState.activeTerminalId}
        />
      {/each}
    </div>
  </div>
{:else}
  <div class="pane pane-bracketed h-full min-h-0 flex flex-col" data-enter>
    <div class="pane-header shrink-0">
      <span class="pane-title"><span class="pane-title-bar"></span> Terminal</span>
      <span class="text-xs text-scifi-muted ml-2">Available in the desktop app</span>
    </div>
    <div class="pane-scan"></div>
    <div class="terminal-host flex-1 flex items-center justify-center text-xs text-scifi-muted py-4">
      <IconTerminal size={16} stroke={1.75} class="mr-1.5" /> Launch CadanADE desktop to use the shell
    </div>
  </div>
{/if}

<style>
  .session-tabs {
    display: flex;
    align-items: stretch;
    min-width: 0;
    min-height: 2.35rem;
  }
  .tabs-scroll {
    flex: 1 1 auto;
    min-width: 0;
  }
  .tab-add {
    flex: 0 0 auto;
    align-self: center;
    margin-left: 0.125rem;
  }
  .tab {
    padding: 0;
    gap: 0;
  }
  .tab-main {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.45rem 0.35rem 0.45rem 0.9rem;
    background: transparent;
    border: none;
    color: inherit;
    font: inherit;
    font-weight: inherit;
    cursor: pointer;
    white-space: nowrap;
  }
  .tab-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    margin-right: 0.35rem;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    opacity: 0.55;
    cursor: pointer;
    font-size: 0.85rem;
    line-height: 1;
    flex-shrink: 0;
  }
  .tab-close:hover {
    opacity: 1;
  }
  .alive-dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--scifi-success);
    box-shadow: 0 0 4px var(--scifi-success);
  }
  .sessions {
    display: flex;
    flex-direction: column;
  }
  .terminal-host {
    padding: 4px 8px;
    overflow: hidden;
  }
</style>

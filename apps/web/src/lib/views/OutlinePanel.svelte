<script lang="ts">
  import { buildFileOutline, type OutlineBullet } from "@cadan/core";
  import IconChevronRight from "@tabler/icons-svelte/icons/chevron-right";
  import IconListTree from "@tabler/icons-svelte/icons/list-tree";
  import { appState } from "$lib/state.svelte";

  let open = $state(true);

  const outline = $derived.by((): OutlineBullet[] => {
    const tab = appState.activeTab;
    if (!tab) return [];
    return buildFileOutline(tab.content);
  });

  function jump(item: OutlineBullet) {
    appState.requestScrollToLine(item.line);
  }
</script>

<div class="pane pane-bracketed outline-pane flex flex-col min-h-0" class:collapsed={!open}>
  <button type="button" class="pane-header pane-header-btn" aria-expanded={open} onclick={() => (open = !open)}>
    <span class="pane-title">
      <span class="pane-title-bar"></span>
      <IconChevronRight size={14} stroke={1.75} class="chevron" />
      <IconListTree size={14} stroke={1.75} />
      Outline
    </span>
    <span class="badge badge-ghost text-[0.6rem]">{outline.length}</span>
  </button>
  {#if open}
    <div class="pane-scan"></div>
    <div class="panel-body flex-1 overflow-auto min-h-0">
      {#if !appState.activeTab}
        <p class="empty">Open a file to see its outline</p>
      {:else if outline.length === 0}
        <p class="empty">No symbols found</p>
      {:else}
        {#each outline as item (item.line + item.kind + item.text)}
          <button type="button" class="row" onclick={() => jump(item)} title={`Line ${item.line}`}>
            <span class="kind">{item.kind}</span>
            <span class="label truncate">{item.text}</span>
            <span class="meta">{item.line}</span>
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .outline-pane {
    flex: 1 1 0;
    min-height: 4.5rem;
  }
  .outline-pane.collapsed {
    flex: 0 0 auto;
    min-height: 0;
  }
  .pane-header-btn {
    width: 100%;
    border: none;
    cursor: pointer;
    text-align: left;
    background: transparent;
    color: inherit;
  }
  .pane-title {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .pane-header-btn :global(.chevron) {
    transition: transform 0.15s ease;
    opacity: 0.75;
  }
  .outline-pane:not(.collapsed) .pane-header-btn :global(.chevron) {
    transform: rotate(90deg);
  }
  .panel-body {
    max-height: 12rem;
  }
  .empty {
    margin: 0;
    padding: 0.55rem 0.65rem;
    font-size: 0.7rem;
    color: var(--scifi-muted);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    padding: 0.28rem 0.55rem;
    border: none;
    background: transparent;
    color: var(--scifi-text);
    font-size: 0.72rem;
    text-align: left;
    cursor: pointer;
  }
  .row:hover {
    background: rgba(var(--scifi-primary-rgb), 0.1);
  }
  .kind {
    flex: 0 0 auto;
    min-width: 3.2rem;
    font-size: 0.62rem;
    color: var(--scifi-cyan, var(--scifi-primary));
    opacity: 0.85;
  }
  .label {
    flex: 1 1 auto;
    min-width: 0;
  }
  .meta {
    flex: 0 0 auto;
    font-size: 0.62rem;
    color: var(--scifi-muted);
  }
</style>

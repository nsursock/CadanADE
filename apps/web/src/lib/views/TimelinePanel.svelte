<script lang="ts">
  import IconChevronRight from "@tabler/icons-svelte/icons/chevron-right";
  import IconHistory from "@tabler/icons-svelte/icons/history";
  import { appState } from "$lib/state.svelte";

  type HistoryEntry = { hash: string; at: number; message: string; path?: string };

  let open = $state(true);
  let entries = $state<HistoryEntry[]>([]);
  let loading = $state(false);

  $effect(() => {
    const path = appState.activePath;
    appState.historyEpoch;
    appState.workspaceRoot;
    void loadHistory(path);
  });

  async function loadHistory(path: string | null) {
    if (!appState.workspaceRoot || !path) {
      entries = [];
      return;
    }
    loading = true;
    try {
      const q = new URLSearchParams({ limit: "40", path });
      const res = await fetch(`/api/history?${q}`);
      const data = await res.json();
      entries = res.ok && Array.isArray(data.entries) ? data.entries : [];
    } catch {
      entries = [];
    } finally {
      loading = false;
    }
  }

  async function restoreEntry(entry: HistoryEntry) {
    const path = entry.path ?? appState.activePath;
    if (!path) {
      appState.showToast("Open a file to restore a revision", "warning");
      return;
    }
    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "readAt", hash: entry.hash, path }),
      });
      const data = await res.json();
      if (!res.ok) {
        appState.showToast(data.error ?? "Could not load revision", "error");
        return;
      }
      if (typeof data.content !== "string") {
        appState.showToast("Invalid revision payload", "error");
        return;
      }
      const before = appState.activeTab?.content ?? null;
      appState.applyTabContent(path, data.content, { dirty: true });
      if (before === data.content) {
        appState.showToast("Already at this revision", "info");
      } else {
        appState.showToast(`Loaded revision into editor`, "success");
      }
    } catch (e) {
      appState.showToast(e instanceof Error ? e.message : "Could not load revision", "error");
    }
  }

  function formatWhen(at: number) {
    if (!at) return "";
    try {
      return new Date(at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }
</script>

<div class="pane pane-bracketed timeline-pane flex flex-col min-h-0" class:collapsed={!open}>
  <button type="button" class="pane-header pane-header-btn" aria-expanded={open} onclick={() => (open = !open)}>
    <span class="pane-title">
      <span class="pane-title-bar"></span>
      <IconChevronRight size={14} stroke={1.75} class="chevron" />
      <IconHistory size={14} stroke={1.75} />
      Timeline
    </span>
    <span class="badge badge-ghost text-[0.6rem]">{entries.length}</span>
  </button>
  {#if open}
    <div class="pane-scan"></div>
    <div class="panel-body flex-1 overflow-auto min-h-0">
      {#if loading}
        <p class="empty">Loading…</p>
      {:else if entries.length === 0}
        <p class="empty">
          {#if !appState.activePath}
            Open a file to see its history
          {:else}
            No local history for this file yet
          {/if}
        </p>
      {:else}
        {#each entries as entry (entry.hash)}
          <button
            type="button"
            class="row stack"
            onclick={() => restoreEntry(entry)}
            title="Load this revision into the editor"
          >
            <span class="label truncate">{entry.message}</span>
            <span class="meta mono">{entry.hash.slice(0, 7)} · {formatWhen(entry.at)}</span>
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .timeline-pane {
    flex: 1 1 0;
    min-height: 4.5rem;
  }
  .timeline-pane.collapsed {
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
  .timeline-pane:not(.collapsed) .pane-header-btn :global(.chevron) {
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
  .row.stack {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
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
  .meta.mono {
    font-family: var(--scifi-font, ui-monospace, monospace);
  }
</style>

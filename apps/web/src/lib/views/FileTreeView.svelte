<script lang="ts">
  import type { TreeNode } from "@cadan/core";
  import IconChevronRight from "@tabler/icons-svelte/icons/chevron-right";
  import IconFolder from "@tabler/icons-svelte/icons/folder";
  import IconFile from "@tabler/icons-svelte/icons/file";
  import IconFocusCentered from "@tabler/icons-svelte/icons/focus-centered";
  import IconTrash from "@tabler/icons-svelte/icons/trash";
  import IconAlertTriangle from "@tabler/icons-svelte/icons/alert-triangle";
  import IconExternalLink from "@tabler/icons-svelte/icons/external-link";
  import IconCut from "@tabler/icons-svelte/icons/cut";
  import IconCopy from "@tabler/icons-svelte/icons/copy";
  import IconClipboard from "@tabler/icons-svelte/icons/clipboard";
  import IconRoute from "@tabler/icons-svelte/icons/route";
  import IconEdit from "@tabler/icons-svelte/icons/edit";
  import IconX from "@tabler/icons-svelte/icons/x";
  import { fly, fade } from "svelte/transition";
  import { appState } from "$lib/state.svelte";
  import Tooltip from "./Tooltip.svelte";
  import ContextMenu from "./ContextMenu.svelte";

  let { onOpenFile, onClose }: { onOpenFile: (path: string) => void; onClose?: () => void } = $props();

  let pendingDelete = $state<TreeNode | null>(null);
  let deleting = $state(false);

  let ctxMenu = $state<{ open: boolean; x: number; y: number; node: TreeNode | null }>({
    open: false,
    x: 0,
    y: 0,
    node: null,
  });

  let pendingRename = $state<TreeNode | null>(null);
  let renameName = $state("");
  let renaming = $state(false);
  let renameInput = $state<HTMLInputElement | undefined>();

  function toggle(e: MouseEvent, node: TreeNode) {
    const btn = e.currentTarget as HTMLElement;
    const item = btn.closest(".tree-item");
    if (!item || node.kind !== "dir") return;
    item.classList.toggle("open");
    const toggleEl = item.querySelector(".tree-toggle");
    toggleEl?.setAttribute("aria-expanded", item.classList.contains("open") ? "true" : "false");
  }

  function select(node: TreeNode) {
    if (node.kind === "file") onOpenFile(node.path);
  }

  function onContext(e: MouseEvent, node: TreeNode) {
    e.preventDefault();
    e.stopPropagation();
    ctxMenu = { open: true, x: e.clientX, y: e.clientY, node };
  }

  function closeContext() {
    ctxMenu = { ...ctxMenu, open: false };
  }

  async function postWorkspace(body: Record<string, unknown>) {
    const res = await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  async function reveal(node: TreeNode) {
    try {
      await postWorkspace({ action: "reveal", path: node.path });
    } catch (e) {
      appState.showToast(e instanceof Error ? e.message : "Reveal failed", "error");
    }
  }

  async function openWith(node: TreeNode) {
    try {
      await postWorkspace({ action: "openWith", path: node.path });
    } catch (e) {
      appState.showToast(e instanceof Error ? e.message : "Open with failed", "error");
    }
  }

  function cut(node: TreeNode) {
    appState.fileClipboard = { path: node.path, operation: "cut" };
    appState.showToast(`Cut ${node.name}`, "info");
  }

  function copy(node: TreeNode) {
    appState.fileClipboard = { path: node.path, operation: "copy" };
    appState.showToast(`Copied ${node.name}`, "info");
  }

  async function copyPath(node: TreeNode) {
    const abs = appState.workspaceRoot ? `${appState.workspaceRoot}/${node.path}` : node.path;
    try {
      await navigator.clipboard.writeText(abs);
      appState.showToast("Copied absolute path", "info");
    } catch {
      appState.showToast("Copy failed", "error");
    }
  }

  async function copyRelativePath(node: TreeNode) {
    try {
      await navigator.clipboard.writeText(node.path);
      appState.showToast("Copied relative path", "info");
    } catch {
      appState.showToast("Copy failed", "error");
    }
  }

  function startRename(node: TreeNode) {
    pendingRename = node;
    renameName = node.name;
    requestAnimationFrame(() => renameInput?.select());
  }

  function closeRename() {
    if (renaming) return;
    pendingRename = null;
  }

  async function confirmRename() {
    const node = pendingRename;
    if (!node || renaming) return;
    const name = renameName.trim();
    if (!name || name === node.name) {
      pendingRename = null;
      return;
    }
    renaming = true;
    try {
      const data = await postWorkspace({ action: "rename", path: node.path, name });
      if (data.tree) appState.tree = data.tree;
      appState.showToast(`Renamed to ${name}`, "info");
    } catch (e) {
      appState.showToast(e instanceof Error ? e.message : "Rename failed", "error");
    } finally {
      renaming = false;
      pendingRename = null;
    }
  }

  function del(node: TreeNode) {
    pendingDelete = node;
  }

  function closeConfirm() {
    if (deleting) return;
    pendingDelete = null;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      closeConfirm();
      closeRename();
    }
  }

  async function confirmDelete() {
    const node = pendingDelete;
    if (!node || deleting) return;
    deleting = true;
    try {
      const data = await postWorkspace({ action: "delete", path: node.path });
      if (data.tree) appState.tree = data.tree;
      appState.showToast(`Deleted ${node.name}`, "info");
    } catch (e) {
      appState.showToast(e instanceof Error ? e.message : "Delete failed", "error");
    } finally {
      deleting = false;
      pendingDelete = null;
    }
  }
</script>

{#snippet treeNodes(nodes: TreeNode[])}
  {#each nodes as node}
    <div class="tree-item">
      <button
        type="button"
        class="tree-row"
        class:selected={appState.activePath === node.path}
        onclick={(e) => {
          if (node.kind === "dir") toggle(e, node);
          else select(node);
        }}
        oncontextmenu={(e) => onContext(e, node)}
      >
        <span
          class="tree-toggle"
          class:is-leaf={node.kind === "file"}
          aria-expanded={node.kind === "dir" ? "false" : undefined}
        >
          <IconChevronRight size={14} stroke={1.75} />
        </span>
        <span class="tree-icon">
          {#if node.kind === "dir"}
            <IconFolder size={15} stroke={1.75} />
          {:else}
            <IconFile size={15} stroke={1.75} />
          {/if}
        </span>
        <span class="tree-label">{node.name}</span>
        <span class="tree-actions">
          <Tooltip tip="Reveal in file manager" prefer="bottom">
            <button
              type="button"
              class="btn btn-ghost btn-xs tree-action-btn"
              aria-label="Reveal in file manager"
              onclick={(e) => { e.stopPropagation(); reveal(node); }}
            >
              <IconFocusCentered size={13} stroke={1.75} />
            </button>
          </Tooltip>
          <Tooltip tip="Delete" prefer="bottom">
            <button
              type="button"
              class="btn btn-ghost btn-xs tree-action-btn tree-action-danger"
              aria-label="Delete"
              onclick={(e) => { e.stopPropagation(); del(node); }}
            >
              <IconTrash size={13} stroke={1.75} />
            </button>
          </Tooltip>
        </span>
      </button>
      {#if node.kind === "dir" && node.children?.length}
        <div class="tree-children" role="group">
          {@render treeNodes(node.children)}
        </div>
      {/if}
    </div>
  {/each}
{/snippet}

<div class="pane pane-bracketed h-full min-h-0" data-enter>
  <div class="pane-header">
    <span class="pane-title"><span class="pane-title-bar"></span> Files</span>
    {#if appState.treeLoading}
      <span class="loading loading-sm" aria-label="Loading"></span>
    {:else}
      <span class="badge badge-success">tree</span>
    {/if}
    {#if onClose}
      <Tooltip tip="Hide (⌘K → Toggle file browser)" prefer="bottom">
        <button
          type="button"
          class="icon-btn btn-xs ml-auto"
          aria-label="Hide file browser"
          onclick={onClose}
        >
          <IconX size={14} stroke={1.75} />
        </button>
      </Tooltip>
    {/if}
  </div>
  <div class="pane-scan"></div>
  <div class="tree-view flex-1 overflow-auto" role="tree">
    {#if appState.tree.length === 0}
      <div class="p-3 text-xs text-scifi-muted">Empty or still loading…</div>
    {:else}
      {@render treeNodes(appState.tree)}
    {/if}
  </div>
</div>

<svelte:window onkeydown={onKey} />

<ContextMenu open={ctxMenu.open} x={ctxMenu.x} y={ctxMenu.y} onClose={closeContext}>
  {#if ctxMenu.node}
    {@const node = ctxMenu.node}
    <div class="menu">
      <button type="button" class="menu-item" onclick={() => { openWith(node); closeContext(); }}>
        <IconExternalLink size={14} stroke={1.75} />
        Open with
      </button>
      <button type="button" class="menu-item" onclick={() => { reveal(node); closeContext(); }}>
        <IconFocusCentered size={14} stroke={1.75} />
        Reveal in finder
      </button>
      <div class="menu-divider"></div>
      <button type="button" class="menu-item" onclick={() => { cut(node); closeContext(); }}>
        <IconCut size={14} stroke={1.75} />
        Cut
      </button>
      <button type="button" class="menu-item" onclick={() => { copy(node); closeContext(); }}>
        <IconCopy size={14} stroke={1.75} />
        Copy
      </button>
      <div class="menu-divider"></div>
      <button type="button" class="menu-item" onclick={() => { copyPath(node); closeContext(); }}>
        <IconClipboard size={14} stroke={1.75} />
        Copy path
      </button>
      <button type="button" class="menu-item" onclick={() => { copyRelativePath(node); closeContext(); }}>
        <IconRoute size={14} stroke={1.75} />
        Copy relative path
      </button>
      <div class="menu-divider"></div>
      <button type="button" class="menu-item" onclick={() => { startRename(node); closeContext(); }}>
        <IconEdit size={14} stroke={1.75} />
        Rename
      </button>
      <button type="button" class="menu-item menu-item-danger" onclick={() => { del(node); closeContext(); }}>
        <IconTrash size={14} stroke={1.75} />
        Delete
      </button>
    </div>
  {/if}
</ContextMenu>

{#if pendingDelete}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="-1"
    transition:fade={{ duration: 160 }}
    onclick={(e) => {
      if (e.target === e.currentTarget) closeConfirm();
    }}
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") closeConfirm();
    }}
  >
    <div
      class="modal max-w-md w-full"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm delete"
      tabindex="-1"
      transition:fly={{ y: 16, duration: 220 }}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div class="flex items-start gap-3">
        <span class="shrink-0 text-[var(--scifi-error)] mt-0.5">
          <IconAlertTriangle size={20} stroke={1.75} />
        </span>
        <div class="min-w-0">
          <h3 class="modal-title">Delete {pendingDelete.kind === "dir" ? "folder" : "file"}</h3>
          <p class="modal-body">
            Delete <span class="font-semibold text-[var(--scifi-text)]">{pendingDelete.name}</span>?
            This cannot be undone.
          </p>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost btn-sm" onclick={closeConfirm} disabled={deleting}>
          Cancel
        </button>
        <button type="button" class="btn btn-sm" style="color: var(--scifi-error); border-color: rgba(var(--scifi-error-rgb), 0.4);" onclick={confirmDelete} disabled={deleting}>
          {#if deleting}
            <span class="loading loading-xs"></span>
          {:else}
            <IconTrash size={14} stroke={1.75} />
          {/if}
          Delete
        </button>
      </div>
    </div>
  </div>
{/if}

{#if pendingRename}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="-1"
    transition:fade={{ duration: 160 }}
    onclick={(e) => {
      if (e.target === e.currentTarget) closeRename();
    }}
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") closeRename();
    }}
  >
    <div
      class="modal max-w-md w-full"
      role="dialog"
      aria-modal="true"
      aria-label="Rename"
      tabindex="-1"
      transition:fly={{ y: 16, duration: 220 }}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div class="flex items-start gap-3">
        <span class="shrink-0 text-[var(--scifi-primary)] mt-0.5">
          <IconEdit size={20} stroke={1.75} />
        </span>
        <div class="min-w-0">
          <h3 class="modal-title">Rename {pendingRename.kind === "dir" ? "folder" : "file"}</h3>
          <p class="modal-body">Enter a new name for <span class="font-semibold text-[var(--scifi-text)]">{pendingRename.name}</span></p>
        </div>
      </div>
      <input
        bind:this={renameInput}
        bind:value={renameName}
        class="input w-full"
        style="margin: 0 0 1rem;"
        type="text"
        onkeydown={(e) => {
          if (e.key === "Enter") confirmRename();
          if (e.key === "Escape") closeRename();
        }}
      />
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost btn-sm" onclick={closeRename} disabled={renaming}>
          Cancel
        </button>
        <button type="button" class="btn btn-sm" style="color: var(--scifi-primary); border-color: rgba(var(--scifi-primary-rgb), 0.4);" onclick={confirmRename} disabled={renaming || !renameName.trim()}>
          {#if renaming}
            <span class="loading loading-xs"></span>
          {:else}
            <IconEdit size={14} stroke={1.75} />
          {/if}
          Rename
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .tree-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.1rem;
    flex-shrink: 0;
    margin-left: auto;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .tree-row:hover .tree-actions,
  .tree-row.selected .tree-actions {
    opacity: 1;
  }
  .tree-action-btn {
    padding: 0.15rem;
    border-radius: var(--scifi-radius);
    line-height: 0;
  }
  .tree-action-danger:hover {
    color: var(--scifi-error);
    border-color: rgba(var(--scifi-error-rgb), 0.4);
    box-shadow: 0 0 8px rgba(var(--scifi-error-rgb), 0.2);
  }
</style>

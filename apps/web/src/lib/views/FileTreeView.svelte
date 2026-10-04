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
  import IconLinkPlus from "@tabler/icons-svelte/icons/link-plus";
  import IconFolderPlus from "@tabler/icons-svelte/icons/folder-plus";
  import IconFilePlus from "@tabler/icons-svelte/icons/file-plus";
  import IconX from "@tabler/icons-svelte/icons/x";
  import IconArrowsMove from "@tabler/icons-svelte/icons/arrows-move";
import IconRefresh from "@tabler/icons-svelte/icons/refresh";
import IconEye from "@tabler/icons-svelte/icons/eye";
import IconEyeOff from "@tabler/icons-svelte/icons/eye-off";
import IconChevronUp from "@tabler/icons-svelte/icons/chevron-up";
import IconChevronDown from "@tabler/icons-svelte/icons/chevron-down";
import { fly, fade } from "svelte/transition";
  import { appState } from "$lib/state.svelte";
  import Tooltip from "./Tooltip.svelte";
  import ContextMenu from "./ContextMenu.svelte";

  let { onOpenFile, onClose }: { onOpenFile: (path: string) => void; onClose?: () => void } = $props();

let showHidden = $state(false);
let expandedAll = $state(false);

let pendingDelete = $state<TreeNode | null>(null);
  let deleting = $state(false);

  let ctxMenu = $state<{ open: boolean; x: number; y: number; node: TreeNode | null }>({
    open: false,
    x: 0,
    y: 0,
    node: null,
  });

  // Empty space context menu (for creating new folder)
  let emptyCtxMenu = $state<{ open: boolean; x: number; y: number; parentPath: string }>({
    open: false,
    x: 0,
    y: 0,
    parentPath: "",
  });

  function closeEmptyContext() {
    emptyCtxMenu = { open: false, x: 0, y: 0, parentPath: "" };
  }

  let pendingRename = $state<TreeNode | null>(null);
  let renameName = $state("");
  let renaming = $state(false);
  let renameInput = $state<HTMLInputElement | undefined>();

  let pendingMove = $state<TreeNode | null>(null);
  let moveDestPath = $state("");
  let moving = $state(false);
  let moveInput = $state<HTMLInputElement | undefined>();

  let pendingCreate = $state<{ kind: "dir" | "file"; parentPath: string } | null>(null);
  let createName = $state("");
  let creating = $state(false);
  let createInput = $state<HTMLInputElement | undefined>();

  // Drag and drop state
  let dragSource = $state<TreeNode | null>(null);
  let dragOverTarget = $state<string | null>(null);

  /** Root scroll container — scoped lookups for expand/collapse and reveal. */
  let treeViewEl = $state<HTMLDivElement | undefined>();

  /** Expanded directory paths. Held as state so it survives tree refreshes. */
  let expanded = $state<ReadonlySet<string>>(new Set());
  let refreshing = $state(false);
  /** Skip the next poll (a local mutation just refreshed the tree). */
  let skipPollAt = 0;

  function toggle(node: TreeNode) {
    if (node.kind !== "dir") return;
    const next = new Set(expanded);
    if (next.has(node.path)) next.delete(node.path);
    else next.add(node.path);
    expanded = next;
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

  function onEmptyContext(e: MouseEvent) {
    // Only show if clicking on empty space (not on a tree row)
    const target = e.target as HTMLElement;
    if (target.closest(".tree-row")) return;
    e.preventDefault();
    e.stopPropagation();
    // Determine parent path from the last selected/active folder, or root
    let parentPath = "";
    const activeTab = appState.activeTab;
    if (activeTab && activeTab.path) {
      // Check if active path is a directory
      const activeNode = findNode(appState.tree, activeTab.path);
      if (activeNode && activeNode.kind === "dir") {
        parentPath = activeNode.path;
      }
    }
    emptyCtxMenu = { open: true, x: e.clientX, y: e.clientY, parentPath };
  }

  function handleTreeViewClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    // Only handle clicks on empty space (not on tree rows or their children)
    if (target.closest(".tree-row")) return;
    // Deselect active file/folder
    appState.activePath = null;
  }

  function handleTreeViewKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      appState.activePath = null;
    }
  }

  function startCreate(kind: "dir" | "file", parentPath: string) {
    pendingCreate = { kind, parentPath };
    createName = kind === "dir" ? "New Folder" : "new-file.txt";
    requestAnimationFrame(() => createInput?.select());
  }

  function closeCreate() {
    if (creating) return;
    pendingCreate = null;
  }

  async function confirmCreate() {
    const target = pendingCreate;
    const name = createName.trim();
    if (!target || creating || !name) return;
    creating = true;
    try {
      const relPath = target.parentPath ? `${target.parentPath}/${name}` : name;
      await postWorkspaceMutating({
        action: target.kind === "dir" ? "createDirectory" : "createFile",
        path: relPath,
        content: "",
        showHidden,
      });
      appState.showToast(
        target.kind === "dir" ? `Created folder ${name}` : `Created file ${name}`,
        "info",
      );
      // Reveal the new entry so the user sees where it landed.
      openAncestors(relPath);
      pendingCreate = null;
    } catch (e) {
      appState.showToast(e instanceof Error ? e.message : "Create failed", "error");
    } finally {
      creating = false;
    }
  }

  /** Expand every ancestor folder of a path so the entry is visible in the tree. */
  function openAncestors(relPath: string) {
    const segments = relPath.split("/").slice(0, -1);
    if (!segments.length) return;
    const next = new Set(expanded);
    let acc = "";
    for (const segment of segments) {
      acc = acc ? `${acc}/${segment}` : segment;
      next.add(acc);
    }
    expanded = next;
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

  /** Mutating call: the response tree is fresh, so suppress the next poll. */
  async function postWorkspaceMutating(body: Record<string, unknown>) {
    const data = await postWorkspace(body);
    if (data.tree) {
      appState.tree = data.tree;
      expanded = new Set([...expanded].filter((p) => findNode(appState.tree, p)));
    }
    skipPollAt = Date.now() + 1500;
    return data;
  }

  async function refreshTree(opts?: { silent?: boolean }) {
    if (!appState.workspaceRoot || refreshing) return;
    const scrollTop = treeViewEl?.scrollTop ?? 0;
    if (!opts?.silent) refreshing = true;
    try {
      const data = await postWorkspace({ action: "refresh", showHidden });
      if (data.tree) {
        appState.tree = data.tree;
        // Drop expansion state for paths that no longer exist.
        expanded = new Set([...expanded].filter((p) => findNode(appState.tree, p)));
      }
      skipPollAt = Date.now() + 1500;
      requestAnimationFrame(() => {
        if (treeViewEl) treeViewEl.scrollTop = scrollTop;
      });
    } catch (e) {
      if (!opts?.silent) {
        appState.showToast(e instanceof Error ? e.message : "Refresh failed", "error");
      }
    } finally {
      refreshing = false;
    }
  }

  function manualRefresh() {
    void refreshTree();
  }

  function toggleShowHidden() {
    showHidden = !showHidden;
    void refreshTree();
  }

  function setExpandedAll(expand: boolean) {
    expandedAll = expand;
    if (!expand) {
      expanded = new Set();
      return;
    }
    const dirs: string[] = [];
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.kind === "dir" && node.children?.length) {
          dirs.push(node.path);
          walk(node.children);
        }
      }
    };
    walk(appState.tree);
    expanded = new Set(dirs);
  }

  function expandAll() {
    setExpandedAll(true);
  }

  function collapseAll() {
    setExpandedAll(false);
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
      const data = await postWorkspaceMutating({ action: "rename", path: node.path, name, showHidden });
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

  function addToContext(node: TreeNode) {
    if (node.kind !== "file") return;
    if (!appState.chatContextFiles.includes(node.path)) {
      appState.chatContextFiles = [...appState.chatContextFiles, node.path];
    }
    appState.showToast(`Added ${node.name} to context`, "info");
  }

  function closeConfirm() {
    if (deleting) return;
    pendingDelete = null;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      closeConfirm();
      closeRename();
      closeMove();
      closeCreate();
    }
  }

  async function confirmDelete() {
    const node = pendingDelete;
    if (!node || deleting) return;
    deleting = true;
    try {
      const data = await postWorkspaceMutating({ action: "delete", path: node.path, showHidden });
      appState.showToast(`Deleted ${node.name}`, "info");
    } catch (e) {
      appState.showToast(e instanceof Error ? e.message : "Delete failed", "error");
    } finally {
      deleting = false;
      pendingDelete = null;
    }
  }

  function startMove(node: TreeNode) {
    pendingMove = node;
    moveDestPath = "";
    requestAnimationFrame(() => moveInput?.select());
  }

  function closeMove() {
    if (moving) return;
    pendingMove = null;
  }

  async function confirmMove() {
    const node = pendingMove;
    if (!node || moving) return;
    const dest = moveDestPath.trim();
    if (!dest) return;
    moving = true;
    try {
      const data = await postWorkspaceMutating({ action: "move", source: node.path, dest, showHidden });
      appState.showToast(`Moved to ${dest}`, "info");
    } catch (e) {
      appState.showToast(e instanceof Error ? e.message : "Move failed", "error");
    } finally {
      moving = false;
      pendingMove = null;
    }
  }

  // Drag and drop handlers
  function handleDragStart(e: DragEvent, node: TreeNode) {
    dragSource = node;
    e.dataTransfer?.setData("text/plain", node.path);
    e.dataTransfer!.effectAllowed = "move";
  }

  function handleDragEnd() {
    dragSource = null;
    dragOverTarget = null;
  }

  function handleDragOver(e: DragEvent, targetPath: string) {
    if (!dragSource) return;
    // Prevent dropping into itself or its children
    if (dragSource.path === targetPath || dragSource.path.startsWith(targetPath + "/")) {
      e.dataTransfer!.dropEffect = "none";
      return;
    }
    // Only allow dropping on directories
    const targetNode = findNode(appState.tree, targetPath);
    if (!targetNode || targetNode.kind !== "dir") {
      e.dataTransfer!.dropEffect = "none";
      return;
    }
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
    dragOverTarget = targetPath;
  }

  function handleDragLeave(e: DragEvent, targetPath: string) {
    // Only clear if we're actually leaving the element (not entering a child)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom) {
      if (dragOverTarget === targetPath) dragOverTarget = null;
    }
  }

  async function handleDrop(e: DragEvent, targetPath: string) {
    e.preventDefault();
    if (!dragSource) return;
    // Prevent dropping into itself or its children
    if (dragSource.path === targetPath || dragSource.path.startsWith(targetPath + "/")) {
      dragSource = null;
      dragOverTarget = null;
      return;
    }
    const targetNode = findNode(appState.tree, targetPath);
    if (!targetNode || targetNode.kind !== "dir") {
      dragSource = null;
      dragOverTarget = null;
      return;
    }
    const sourcePath = dragSource.path;
    dragSource = null;
    dragOverTarget = null;
    try {
      const data = await postWorkspaceMutating({ action: "move", source: sourcePath, dest: targetPath, showHidden });
      appState.showToast(`Moved to ${targetPath}`, "info");
    } catch (err) {
      appState.showToast(err instanceof Error ? err.message : "Move failed", "error");
    }
  }

  function findNode(nodes: TreeNode[], path: string): TreeNode | null {
    for (const node of nodes) {
      if (node.path === path) return node;
      if (node.children) {
        const found = findNode(node.children, path);
        if (found) return found;
      }
    }
    return null;
  }

  // ── Live tree updates ───────────────────────────────────────────────
  // Two complementary triggers, both cheap:
  //  - window focus/visibility: catches edits made outside the app (Finder,
  //    git checkout, an editor save), which is the common case.
  //  - interval poll: catches changes made while the app stays focused.
  // Local mutations (create/rename/move/delete/drag) already refresh, so a
  // short skip window prevents a redundant second request.

  function onWindowFocus() {
    if (!appState.workspaceRoot) return;
    void refreshTree({ silent: true });
  }

  function onVisibilityChange() {
    if (document.visibilityState === "visible") onWindowFocus();
  }

  $effect(() => {
    if (!appState.workspaceRoot) return;
    // perfLite users get focus-triggered refresh only, no polling.
    if (appState.perfLite) return;
    const timer = setInterval(() => {
      if (document.hidden || refreshing) return;
      if (Date.now() < skipPollAt) return;
      void refreshTree({ silent: true });
    }, 4000);
    return () => clearInterval(timer);
  });
</script>

{#snippet treeNodes(nodes: TreeNode[])}
  {#each nodes as node}
    {@const isOpen = expanded.has(node.path)}
    <div class="tree-item" class:open={isOpen}>
      <button
        type="button"
        class="tree-row"
        class:selected={appState.activePath === node.path}
        class:drag-over={dragOverTarget === node.path && node.kind === "dir"}
        class:drag-source={dragSource?.path === node.path}
        draggable={true}
        data-path={node.path}
        ondragstart={(e) => handleDragStart(e, node)}
        ondragend={handleDragEnd}
        ondragover={(e) => node.kind === "dir" && handleDragOver(e, node.path)}
        ondragleave={(e) => node.kind === "dir" && handleDragLeave(e, node.path)}
        ondrop={(e) => node.kind === "dir" && handleDrop(e, node.path)}
        onclick={() => {
          if (node.kind === "dir") toggle(node);
          else select(node);
        }}
        oncontextmenu={(e) => onContext(e, node)}
      >
        <span
          class="tree-toggle"
          class:is-leaf={node.kind === "file"}
          aria-expanded={node.kind === "dir" ? isOpen : undefined}
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
    <div class="flex items-center gap-1 ml-auto">
      {#if !appState.treeLoading}
        <Tooltip tip="Refresh tree" prefer="bottom">
          <button
            type="button"
            class="icon-btn btn-xs"
            class:spin={refreshing}
            aria-label="Refresh tree"
            aria-busy={refreshing}
            onclick={manualRefresh}
          >
            <IconRefresh size={14} stroke={1.75} />
          </button>
        </Tooltip>
        <Tooltip tip="Show hidden files" prefer="bottom">
          <button
            type="button"
            class="icon-btn btn-xs"
            class:active={showHidden}
            aria-label={showHidden ? "Hide hidden files" : "Show hidden files"}
            aria-pressed={showHidden}
            onclick={toggleShowHidden}
          >
            {#if showHidden}
              <IconEye size={14} stroke={1.75} />
            {:else}
              <IconEyeOff size={14} stroke={1.75} />
            {/if}
          </button>
        </Tooltip>
        <Tooltip tip={expandedAll ? "Collapse all folders" : "Expand all folders"} prefer="bottom">
          <button
            type="button"
            class="icon-btn btn-xs"
            aria-label={expandedAll ? "Collapse all folders" : "Expand all folders"}
            onclick={expandedAll ? collapseAll : expandAll}
          >
            {#if expandedAll}
              <IconChevronUp size={14} stroke={1.75} />
            {:else}
              <IconChevronDown size={14} stroke={1.75} />
            {/if}
          </button>
        </Tooltip>
      {/if}
      {#if onClose}
        <Tooltip tip="Hide (⌘K → Toggle file browser)" prefer="bottom">
          <button
            type="button"
            class="icon-btn btn-xs"
            aria-label="Hide file browser"
            onclick={onClose}
          >
            <IconX size={14} stroke={1.75} />
          </button>
        </Tooltip>
      {/if}
    </div>
  </div>
  <div class="pane-scan"></div>
  <div
    class="tree-view flex-1 overflow-auto"
    role="tree"
    tabindex="0"
    bind:this={treeViewEl}
    oncontextmenu={onEmptyContext}
    onclick={handleTreeViewClick}
    onkeydown={handleTreeViewKeydown}
  >
    {#if appState.tree.length === 0}
      <div class="p-3 text-xs text-scifi-muted">Empty or still loading…</div>
    {:else}
      {@render treeNodes(appState.tree)}
    {/if}
  </div>
</div>

<svelte:window
  onkeydown={onKey}
  onfocus={onWindowFocus}
  onvisibilitychange={onVisibilityChange}
/>

<ContextMenu open={ctxMenu.open} x={ctxMenu.x} y={ctxMenu.y} onClose={closeContext}>
  {#if ctxMenu.node}
    {@const node = ctxMenu.node}
    <div class="menu">
      <button type="button" class="menu-item" onclick={(e) => { e.stopPropagation(); openWith(node); closeContext(); }}>
        <IconExternalLink size={14} stroke={1.75} />
        Open with
      </button>
      <button type="button" class="menu-item" onclick={(e) => { e.stopPropagation(); reveal(node); closeContext(); }}>
        <IconFocusCentered size={14} stroke={1.75} />
        Reveal in finder
      </button>
      {#if node.kind === "file"}
        <button type="button" class="menu-item" onclick={(e) => { e.stopPropagation(); addToContext(node); closeContext(); }}>
          <IconLinkPlus size={14} stroke={1.75} />
          Add to context
        </button>
      {/if}
      {#if node.kind === "dir"}
        <button type="button" class="menu-item" onclick={(e) => { e.stopPropagation(); startCreate("dir", node.path); closeContext(); }}>
          <IconFolderPlus size={14} stroke={1.75} />
          New folder
        </button>
        <button type="button" class="menu-item" onclick={(e) => { e.stopPropagation(); startCreate("file", node.path); closeContext(); }}>
          <IconFilePlus size={14} stroke={1.75} />
          New file
        </button>
      {/if}
      <div class="menu-divider"></div>
      <button type="button" class="menu-item" onclick={(e) => { e.stopPropagation(); cut(node); closeContext(); }}>
        <IconCut size={14} stroke={1.75} />
        Cut
      </button>
      <button type="button" class="menu-item" onclick={(e) => { e.stopPropagation(); copy(node); closeContext(); }}>
        <IconCopy size={14} stroke={1.75} />
        Copy
      </button>
      <div class="menu-divider"></div>
      <button type="button" class="menu-item" onclick={(e) => { e.stopPropagation(); copyPath(node); closeContext(); }}>
        <IconClipboard size={14} stroke={1.75} />
        Copy path
      </button>
      <button type="button" class="menu-item" onclick={(e) => { e.stopPropagation(); copyRelativePath(node); closeContext(); }}>
        <IconRoute size={14} stroke={1.75} />
        Copy relative path
      </button>
      <div class="menu-divider"></div>
      <button type="button" class="menu-item" onclick={(e) => { e.stopPropagation(); startMove(node); closeContext(); }}>
        <IconArrowsMove size={14} stroke={1.75} />
        Move to...
      </button>
      <button type="button" class="menu-item" onclick={(e) => { e.stopPropagation(); startRename(node); closeContext(); }}>
        <IconEdit size={14} stroke={1.75} />
        Rename
      </button>
      <button type="button" class="menu-item menu-item-danger" onclick={(e) => { e.stopPropagation(); del(node); closeContext(); }}>
        <IconTrash size={14} stroke={1.75} />
        Delete
      </button>
    </div>
  {/if}
</ContextMenu>

<ContextMenu open={emptyCtxMenu.open} x={emptyCtxMenu.x} y={emptyCtxMenu.y} onClose={closeEmptyContext}>
  <div class="menu">
    <button type="button" class="menu-item" onclick={() => { startCreate("dir", emptyCtxMenu.parentPath); closeEmptyContext(); }}>
      <IconFolderPlus size={14} stroke={1.75} />
      New folder
    </button>
    <button type="button" class="menu-item" onclick={() => { startCreate("file", emptyCtxMenu.parentPath); closeEmptyContext(); }}>
      <IconFilePlus size={14} stroke={1.75} />
      New file
    </button>
  </div>
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

{#if pendingMove}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="-1"
    transition:fade={{ duration: 160 }}
    onclick={(e) => {
      if (e.target === e.currentTarget) closeMove();
    }}
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") closeMove();
    }}
  >
    <div
      class="modal max-w-md w-full"
      role="dialog"
      aria-modal="true"
      aria-label="Move"
      tabindex="-1"
      transition:fly={{ y: 16, duration: 220 }}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div class="flex items-start gap-3">
        <span class="shrink-0 text-[var(--scifi-primary)] mt-0.5">
          <IconArrowsMove size={20} stroke={1.75} />
        </span>
        <div class="min-w-0">
          <h3 class="modal-title">Move {pendingMove.kind === "dir" ? "folder" : "file"}</h3>
          <p class="modal-body">Enter destination path for <span class="font-semibold text-[var(--scifi-text)]">{pendingMove.name}</span> (relative to workspace root)</p>
        </div>
      </div>
      <input
        bind:this={moveInput}
        bind:value={moveDestPath}
        class="input w-full"
        style="margin: 0 0 1rem;"
        type="text"
        placeholder="e.g. src/components"
        onkeydown={(e) => {
          if (e.key === "Enter") confirmMove();
          if (e.key === "Escape") closeMove();
        }}
      />
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost btn-sm" onclick={closeMove} disabled={moving}>
          Cancel
        </button>
        <button type="button" class="btn btn-sm" style="color: var(--scifi-primary); border-color: rgba(var(--scifi-primary-rgb), 0.4);" onclick={confirmMove} disabled={moving || !moveDestPath.trim()}>
          {#if moving}
            <span class="loading loading-xs"></span>
          {:else}
            <IconArrowsMove size={14} stroke={1.75} />
          {/if}
          Move
        </button>
      </div>
    </div>
  </div>
{/if}

{#if pendingCreate}
  {@const isDir = pendingCreate.kind === "dir"}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="-1"
    transition:fade={{ duration: 160 }}
    onclick={(e) => {
      if (e.target === e.currentTarget) closeCreate();
    }}
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") closeCreate();
    }}
  >
    <div
      class="modal max-w-md w-full"
      role="dialog"
      aria-modal="true"
      aria-label={isDir ? "New folder" : "New file"}
      tabindex="-1"
      transition:fly={{ y: 16, duration: 220 }}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div class="flex items-start gap-3">
        <span class="shrink-0 text-[var(--scifi-primary)] mt-0.5">
          {#if isDir}
            <IconFolder size={20} stroke={1.75} />
          {:else}
            <IconFile size={20} stroke={1.75} />
          {/if}
        </span>
        <div class="min-w-0">
          <h3 class="modal-title">{isDir ? "New folder" : "New file"}</h3>
          <p class="modal-body">
            {pendingCreate.parentPath
              ? `Inside ${pendingCreate.parentPath}`
              : "In workspace root"}
          </p>
        </div>
      </div>
      <input
        bind:this={createInput}
        bind:value={createName}
        class="input w-full"
        style="margin: 0 0 1rem;"
        type="text"
        placeholder={isDir ? "New Folder" : "new-file.txt"}
        onkeydown={(e) => {
          if (e.key === "Enter") confirmCreate();
          if (e.key === "Escape") closeCreate();
        }}
      />
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost btn-sm" onclick={closeCreate} disabled={creating}>
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-sm"
          style="color: var(--scifi-primary); border-color: rgba(var(--scifi-primary-rgb), 0.4);"
          onclick={confirmCreate}
          disabled={creating || !createName.trim()}
        >
          {#if creating}
            <span class="loading loading-xs"></span>
          {:else if isDir}
            <IconFolder size={14} stroke={1.75} />
          {:else}
            <IconFile size={14} stroke={1.75} />
          {/if}
          {isDir ? "Create folder" : "Create file"}
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
  .tree-row.drag-source {
    opacity: 0.5;
    background: color-mix(in srgb, var(--scifi-primary) 15%, transparent);
  }
  .tree-row.drag-over {
    outline: 2px dashed var(--scifi-primary);
    outline-offset: -2px;
    background: color-mix(in srgb, var(--scifi-primary) 10%, transparent);
  }
  .tree-row[draggable="true"]:hover {
    cursor: grab;
  }
  .tree-row.drag-source {
    cursor: grabbing;
  }
  .tree-view {
    min-height: 200px;
  }
  .icon-btn.spin {
    animation: scifi-tree-spin 0.7s linear infinite;
  }
  @keyframes scifi-tree-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .icon-btn.spin {
      animation: none;
    }
  }
</style>

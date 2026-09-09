<script lang="ts">
  import type { TreeNode } from "@cadan/core";
  import IconChevronRight from "@tabler/icons-svelte/icons/chevron-right";
  import IconFolder from "@tabler/icons-svelte/icons/folder";
  import IconFile from "@tabler/icons-svelte/icons/file";
  import { appState } from "$lib/state.svelte";

  let { onOpenFile }: { onOpenFile: (path: string) => void } = $props();

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

<script lang="ts">
  import { fade } from "svelte/transition";
  import type { Snippet } from "svelte";

  let {
    open = false,
    x = 0,
    y = 0,
    onClose,
    children,
  }: {
    open?: boolean;
    x?: number;
    y?: number;
    onClose?: () => void;
    children: Snippet;
  } = $props();

  let menuEl = $state<HTMLDivElement | undefined>();
  let pos = $state({ x: 0, y: 0 });

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") onClose?.();
  }

  function onPointerDown(e: MouseEvent) {
    if (menuEl && !menuEl.contains(e.target as Node)) onClose?.();
  }

  $effect(() => {
    if (!open) return;
    pos = { x, y };
    requestAnimationFrame(() => {
      if (!menuEl) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const mw = menuEl.offsetWidth;
      const mh = menuEl.offsetHeight;
      pos = {
        x: Math.max(8, Math.min(x, vw - mw - 8)),
        y: Math.max(8, Math.min(y, vh - mh - 8)),
      };
    });
  });
</script>

<svelte:window onkeydown={onKey} onpointerdown={onPointerDown} />

{#if open}
  <div
    class="context-menu"
    bind:this={menuEl}
    use:portal
    style:left="{pos.x}px"
    style:top="{pos.y}px"
    role="menu"
    transition:fade={{ duration: 120 }}
  >
    {@render children()}
  </div>
{/if}

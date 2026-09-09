<script lang="ts">
  import type { Snippet } from "svelte";

  type Placement = "top" | "bottom" | "left" | "right";

  let {
    tip,
    prefer = "bottom",
    disabled = false,
    children,
  }: {
    tip: string;
    prefer?: Placement;
    /** When true, force-hide (e.g. while a dropdown is open). */
    disabled?: boolean;
    children: Snippet;
  } = $props();

  let root: HTMLSpanElement | undefined = $state();
  let tipEl: HTMLSpanElement | undefined = $state();
  let visible = $state(false);
  let coords = $state({ left: -9999, top: -9999 });

  const PAD = 8;
  const GAP = 6;

  const showing = $derived(visible && !disabled && Boolean(tip));

  function place() {
    if (!root || !tipEl || !tip) return false;

    const r = root.getBoundingClientRect();
    const tw = tipEl.offsetWidth;
    const th = tipEl.offsetHeight;
    if (tw < 1 || th < 1) return false;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const space = {
      top: r.top - PAD,
      bottom: vh - r.bottom - PAD,
      left: r.left - PAD,
      right: vw - r.right - PAD,
    };

    const order = [prefer, "bottom", "top", "left", "right"].filter(
      (p, i, a) => a.indexOf(p) === i,
    ) as Placement[];

    let chosen: Placement = prefer;
    let found = false;
    for (const p of order) {
      const need = p === "top" || p === "bottom" ? th + GAP : tw + GAP;
      if (space[p] >= need) {
        chosen = p;
        found = true;
        break;
      }
    }
    if (!found) {
      chosen = (Object.entries(space).sort((a, b) => b[1] - a[1])[0]?.[0] ?? prefer) as Placement;
    }

    let left = 0;
    let top = 0;
    if (chosen === "bottom") {
      top = r.bottom + GAP;
      left = r.left + r.width / 2 - tw / 2;
    } else if (chosen === "top") {
      top = r.top - th - GAP;
      left = r.left + r.width / 2 - tw / 2;
    } else if (chosen === "right") {
      top = r.top + r.height / 2 - th / 2;
      left = r.right + GAP;
    } else {
      top = r.top + r.height / 2 - th / 2;
      left = r.left - tw - GAP;
    }

    left = Math.min(Math.max(PAD, left), vw - tw - PAD);
    top = Math.min(Math.max(PAD, top), vh - th - PAD);
    coords = { left: Math.round(left), top: Math.round(top) };
    return true;
  }

  function show() {
    if (!tip || disabled) return;
    requestAnimationFrame(() => {
      if (disabled) return;
      if (place()) visible = true;
      else {
        requestAnimationFrame(() => {
          if (!disabled && place()) visible = true;
        });
      }
    });
  }

  function hide() {
    visible = false;
  }

  function onWin() {
    if (showing) place();
  }

  $effect(() => {
    if (disabled) visible = false;
  });
</script>

<span
  class="smart-tip"
  bind:this={root}
  role="group"
  onmouseenter={show}
  onmouseleave={hide}
  onfocusin={show}
  onfocusout={hide}
>
  {@render children()}
  {#if tip}
    <span
      class="smart-tip-bubble"
      class:show={showing}
      bind:this={tipEl}
      style:left="{coords.left}px"
      style:top="{coords.top}px"
      role="tooltip"
    >
      {tip}
    </span>
  {/if}
</span>

<svelte:window onresize={onWin} onscroll={onWin} />

<style>
  .smart-tip {
    position: relative;
    display: inline-flex;
    align-items: center;
  }
  .smart-tip-bubble {
    position: fixed;
    z-index: 200;
    padding: 0.28rem 0.55rem;
    border-radius: var(--scifi-radius);
    border: 1px solid var(--scifi-border);
    background: rgba(var(--scifi-surface-1-rgb), 0.96);
    color: var(--scifi-text);
    font-size: 0.6875rem;
    letter-spacing: 0.04em;
    white-space: nowrap;
    max-width: min(18rem, calc(100vw - 1rem));
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    opacity: 0;
    /* visibility:hidden still allows offsetWidth measurement */
    visibility: hidden;
    transition: opacity 0.12s;
    box-shadow: 0 8px 20px -8px rgba(var(--scifi-shadow-rgb), 0.55);
  }
  .smart-tip-bubble.show {
    opacity: 1;
    visibility: visible;
  }
</style>

<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Terminal as TerminalType } from "@xterm/xterm";
  import type { FitAddon as FitAddonType } from "@xterm/addon-fit";
  import IconTerminal from "@tabler/icons-svelte/icons/terminal";
  import IconChevronDown from "@tabler/icons-svelte/icons/chevron-down";
  import IconChevronUp from "@tabler/icons-svelte/icons/chevron-up";
  import IconX from "@tabler/icons-svelte/icons/x";
  import { appState } from "$lib/state.svelte";

  let { open = $bindable(true), onClose = () => {} }: { open?: boolean; onClose?: () => void } = $props();

  let host: HTMLDivElement;
  let term: TerminalType | null = null;
  let fit: FitAddonType | null = null;
  let termId: string | null = null;
  let unsubData: (() => void) | null = null;
  let unsubExit: (() => void) | null = null;
  let observer: ResizeObserver | null = null;
  let alive = $state(false);

  const isDesktop = typeof window !== "undefined" && !!window.cadan;

  function cssVar(name: string, fallback: string): string {
    if (typeof window === "undefined") return fallback;
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function forceTransparentBg() {
    if (!host) return;
    for (const el of host.querySelectorAll<HTMLElement>(".xterm, .xterm > div, .xterm-viewport, .xterm-screen, .xterm-rows")) {
      el.style.backgroundColor = "transparent";
    }
  }

  function themeTokens() {
    const primary = cssVar("--scifi-primary", "#ff2e9a");
    const success = cssVar("--scifi-success", "#69f0ae");
    const warning = cssVar("--scifi-warning", "#ffb86c");
    const text = cssVar("--scifi-text", "#e8e6ff");
    const muted = cssVar("--scifi-muted", "#7a6aa8");
    const selectionRgb = cssVar("--scifi-primary-rgb", "255, 46, 154");
    return {
      background: "rgba(0,0,0,0)",
      foreground: text,
      cursor: primary,
      cursorAccent: cssVar("--scifi-bg", "#050010"),
      selectionBackground: `rgba(${selectionRgb}, 0.25)`,
      selectionInactiveBackground: `rgba(${selectionRgb}, 0.15)`,
      black: muted,
      red: primary,
      green: success,
      yellow: warning,
      blue: primary,
      magenta: primary,
      cyan: success,
      white: text,
      brightBlack: muted,
      brightRed: primary,
      brightGreen: success,
      brightYellow: warning,
      brightBlue: primary,
      brightMagenta: primary,
      brightCyan: success,
      brightWhite: text,
    };
  }

  async function spawn() {
    if (!isDesktop || !window.cadan || !term || !fit) return;
    const cols = term.cols;
    const rows = term.rows;
    termId = await window.cadan.terminalSpawn({
      cwd: appState.workspaceRoot ?? undefined,
      cols,
      rows,
    });
    alive = true;

    unsubData = window.cadan.onTerminalData(termId, (data) => term?.write(data));
    unsubExit = window.cadan.onTerminalExit(termId, () => {
      alive = false;
    });
  }

  function teardown() {
    unsubData?.();
    unsubExit?.();
    unsubData = null;
    unsubExit = null;
    if (termId && window.cadan) window.cadan.terminalDispose(termId);
    termId = null;
    alive = false;
  }

  onMount(() => {
    if (!isDesktop) return;

    let cancelled = false;
    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/xterm/css/xterm.css"),
      ]);
      if (cancelled) return;

      fit = new FitAddon();
      term = new Terminal({
        fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 13,
        lineHeight: 1.2,
        cursorBlink: true,
        allowProposedApi: true,
        theme: themeTokens(),
      });
      term.loadAddon(fit);
      term.open(host);
      forceTransparentBg();
      try {
        fit.fit();
      } catch {
        /* host not laid out yet */
      }

      term.onData((data) => {
        if (termId && window.cadan) window.cadan.terminalInput(termId, data);
      });

      observer = new ResizeObserver(() => {
        if (!fit || !term || !termId) return;
        try {
          fit.fit();
          forceTransparentBg();
          window.cadan?.terminalResize(termId, term.cols, term.rows);
        } catch {
          /* transient */
        }
      });
      observer.observe(host);

      void spawn();
    })();

    return () => {
      cancelled = true;
    };
  });

  onDestroy(() => {
    observer?.disconnect();
    observer = null;
    teardown();
    term?.dispose();
    term = null;
  });

  $effect(() => {
    if (!open) return;
    queueMicrotask(() => {
      try {
        fit?.fit();
        forceTransparentBg();
        if (termId && term && window.cadan) {
          window.cadan.terminalResize(termId, term.cols, term.rows);
        }
      } catch {
        /* transient */
      }
    });
  });

  function toggle() {
    open = !open;
  }
</script>

{#if isDesktop}
  <div class="pane pane-bracketed h-full min-h-0 flex flex-col" class:collapsed={!open} data-enter>
    <div class="pane-header shrink-0 gap-1.5">
      <span class="pane-title"><span class="pane-title-bar"></span> Terminal</span>
      {#if alive}
        <span class="status-chip"><span class="dot"></span> live</span>
      {:else}
        <span class="status-chip"><span class="dot"></span> idle</span>
      {/if}
      <div class="ml-auto flex items-center gap-1">
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
        <button type="button" class="icon-btn" aria-label="Close terminal" onclick={onClose}>
          <IconX size={14} stroke={1.75} />
        </button>
      </div>
    </div>
    <div class="pane-scan"></div>
    {#if open}
      <div class="terminal-host flex-1 min-h-0" bind:this={host}></div>
    {/if}
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
  .terminal-host {
    padding: 4px 8px;
    overflow: hidden;
  }
  :global(.terminal-host .xterm) {
    height: 100%;
    padding: 4px 0;
  }
  :global(.terminal-host .xterm .xterm-screen) {
    background: transparent !important;
  }
  :global(.terminal-host .xterm-viewport) {
    scrollbar-width: thin;
    background-color: transparent !important;
  }
  :global(.terminal-host .xterm .composition-view) {
    background: transparent !important;
  }
  :global(.terminal-host .xterm .xterm-rows) {
    font-feature-settings: "calt" 0;
  }
</style>

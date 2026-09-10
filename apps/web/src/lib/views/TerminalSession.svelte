<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Terminal as TerminalType } from "@xterm/xterm";
  import type { FitAddon as FitAddonType } from "@xterm/addon-fit";
  import { appState } from "$lib/state.svelte";

  let {
    id,
    active = true,
  }: {
    id: string;
    active?: boolean;
  } = $props();

  let host: HTMLDivElement;
  let term: TerminalType | null = null;
  let fit: FitAddonType | null = null;
  let termId: string | null = null;
  let unsubData: (() => void) | null = null;
  let unsubExit: (() => void) | null = null;
  let observer: ResizeObserver | null = null;
  let disposed = false;

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

  function refit() {
    if (!fit || !term || disposed) return;
    try {
      fit.fit();
      forceTransparentBg();
      if (termId && window.cadan) {
        window.cadan.terminalResize(termId, term.cols, term.rows);
      }
    } catch {
      /* transient */
    }
  }

  function setAlive(alive: boolean) {
    if (disposed) return;
    // Only update if this tab is still in appState (avoid racing a just-removed tab)
    if (!appState.terminalSessions.some((t) => t.id === id)) return;
    appState.setTerminalAlive(id, alive);
  }

  async function spawn() {
    if (disposed || !window.cadan || !term || !fit) return;
    const cols = term.cols;
    const rows = term.rows;
    const spawned = await window.cadan.terminalSpawn({
      cwd: appState.workspaceRoot ?? undefined,
      cols,
      rows,
    });
    if (disposed || !appState.terminalSessions.some((t) => t.id === id)) {
      window.cadan.terminalDispose(spawned);
      return;
    }
    termId = spawned;
    setAlive(true);

    unsubData = window.cadan.onTerminalData(termId, (data) => {
      if (!disposed) term?.write(data);
    });
    unsubExit = window.cadan.onTerminalExit(termId, () => {
      setAlive(false);
    });
  }

  function teardown() {
    if (disposed) return;
    disposed = true;
    unsubData?.();
    unsubExit?.();
    unsubData = null;
    unsubExit = null;
    if (termId && window.cadan) window.cadan.terminalDispose(termId);
    termId = null;
    // Do not touch appState here — removeTerminalSession already dropped the tab
  }

  onMount(() => {
    let cancelled = false;
    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/xterm/css/xterm.css"),
      ]);
      if (cancelled || disposed) return;

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
      refit();

      term.onData((data) => {
        if (termId && window.cadan && !disposed) window.cadan.terminalInput(termId, data);
      });

      observer = new ResizeObserver(() => {
        if (!active || disposed) return;
        refit();
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
    if (!active || disposed) return;
    queueMicrotask(() => refit());
  });
</script>

<div class="terminal-host flex-1 min-h-0" class:inactive={!active} bind:this={host}></div>

<style>
  .terminal-host {
    padding: 4px 8px;
    overflow: hidden;
  }
  .terminal-host.inactive {
    position: absolute;
    inset: 0;
    visibility: hidden;
    pointer-events: none;
    z-index: 0;
  }
  .terminal-host:not(.inactive) {
    position: relative;
    z-index: 1;
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

<script lang="ts">
  import { onMount } from "svelte";
  import { createCommandPalette } from "@scifiui/core/js";
  import AppChrome from "$lib/views/AppChrome.svelte";
  import ModeRail from "$lib/views/ModeRail.svelte";
  import WorkspacePicker from "$lib/views/WorkspacePicker.svelte";
  import FileTreeView from "$lib/views/FileTreeView.svelte";
  import EditorView from "$lib/views/EditorView.svelte";
  import ChatView from "$lib/views/ChatView.svelte";
  import Terminal from "$lib/views/Terminal.svelte";
  import StatusBar from "$lib/views/StatusBar.svelte";
  import ToastHost from "$lib/views/ToastHost.svelte";
  import ThreeBackground from "$lib/three/ThreeBackground.svelte";
  import SettingsPanel from "$lib/views/settings/SettingsPanel.svelte";
  import { appState } from "$lib/state.svelte";
  import { enterShell } from "$lib/motion/enter";

  let shell: HTMLDivElement;
  let leftW = $state(240);
  let rightW = $state(320);
  let termH = $state(220);
  let filesOpen = $state(true);
  let termOpen = $state(true);
  let chatOpen = $state(true);
  let drag = $state<"l" | "r" | "t" | null>(null);

  const RAIL = 48;
  const RESIZERS = 10;
  const LEFT_MIN = 160;
  const LEFT_MAX = 420;
  const RIGHT_MIN = 220;
  const RIGHT_MAX = 480;
  const TERM_MIN = 80;
  const TERM_MAX = 560;

  function clampPanes() {
    const avail = Math.max(480, window.innerWidth - RAIL - RESIZERS);
    const leftMax = Math.min(LEFT_MAX, Math.floor(avail * 0.4));
    const rightMax = Math.min(RIGHT_MAX, Math.floor(avail * 0.42));
    leftW = Math.min(Math.max(leftW, LEFT_MIN), leftMax);
    rightW = Math.min(Math.max(rightW, RIGHT_MIN), rightMax);
    // Keep a usable editor strip
    const editorMin = 280;
    if (leftW + rightW > avail - editorMin) {
      const overflow = leftW + rightW - (avail - editorMin);
      rightW = Math.max(RIGHT_MIN, rightW - overflow);
    }
  }

  onMount(() => {
    if (shell) enterShell(shell);
    clampPanes();

    createCommandPalette({
      keys: ["mod+k"],
      items: [
        { title: "Toggle file browser", group: "Panels", icon: "folders", command: "toggle-files", shortcut: ["mod", "B"] },
        { title: "Toggle terminal", group: "Panels", icon: "terminal", command: "toggle-terminal", shortcut: ["mod", "`"] },
        { title: "Toggle chat agent", group: "Panels", icon: "message", command: "toggle-chat", shortcut: ["mod", "J"] },
      ],
      onSelect: (cmd) => {
        if (cmd === "toggle-files") filesOpen = !filesOpen;
        else if (cmd === "toggle-terminal") termOpen = !termOpen;
        else if (cmd === "toggle-chat") chatOpen = !chatOpen;
      },
    });

    const move = (e: MouseEvent) => {
      if (drag === "l") {
        leftW = Math.min(LEFT_MAX, Math.max(LEFT_MIN, e.clientX - RAIL));
        clampPanes();
      }
      if (drag === "r") {
        rightW = Math.min(RIGHT_MAX, Math.max(RIGHT_MIN, window.innerWidth - e.clientX));
        clampPanes();
      }
      if (drag === "t") {
        termH = Math.min(TERM_MAX, Math.max(TERM_MIN, window.innerHeight - e.clientY - 32));
      }
    };
    const up = () => {
      drag = null;
    };
    const onResize = () => clampPanes();
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("resize", onResize);
    };
  });

  async function openFile(path: string) {
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "open", path }),
    });
    const data = await res.json();
    if (!res.ok) {
      appState.showToast(data.error ?? "Open failed", "error");
      return;
    }
    const existing = appState.tabs.find((t) => t.path === data.path);
    if (existing) {
      existing.content = data.content;
      existing.hash = data.hash;
      existing.dirty = false;
      appState.tabs = [...appState.tabs];
    } else {
      appState.tabs = [...appState.tabs, { ...data, dirty: false }];
    }
    appState.activePath = data.path;
  }

  async function closeWorkspace() {
    await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close" }),
    });
    appState.workspaceRoot = null;
    appState.tree = [];
    appState.tabs = [];
    appState.activePath = null;
    appState.clearChatSessions();
    appState.clearTerminalSessions();
  }
</script>

{#if appState.threeBackground}
  <ThreeBackground />
{/if}

<ToastHost />
<SettingsPanel bind:open={appState.settingsOpen} />

<div class="flex flex-col h-screen" bind:this={shell}>
  <AppChrome
    onCloseWorkspace={appState.workspaceRoot ? closeWorkspace : undefined}
    onOpenSettings={() => (appState.settingsOpen = true)}
  />

  {#if !appState.workspaceRoot}
    <div class="flex-1 min-h-0">
      <WorkspacePicker />
    </div>
  {:else}
    <div class="flex flex-1 min-h-0 min-w-0 gap-1 p-1 overflow-hidden">
      <ModeRail />
      <div class="split split-row flex-1 min-h-0 min-w-0 overflow-hidden gap-1">
        {#if filesOpen}
          <div class="split-pane" style="flex: 0 1 {leftW}px; width: {leftW}px; min-width: {LEFT_MIN}px">
            <FileTreeView onOpenFile={openFile} onClose={() => (filesOpen = false)} />
          </div>
          <button
            type="button"
            class="split-resizer"
            class:active={drag === "l"}
            aria-label="Resize tree"
            onmousedown={() => (drag = "l")}
          ></button>
        {/if}
        <div class="split-pane flex-1 relative min-w-0 flex flex-col">
          <div class="flex-1 min-h-0 overflow-hidden">
            <EditorView />
          </div>
          {#if termOpen}
            <button
              type="button"
              class="split-resizer split-resizer-h"
              class:active={drag === "t"}
              aria-label="Resize terminal"
              onmousedown={() => (drag = "t")}
            ></button>
            <div class="terminal-wrap min-h-0" style="height: {termH}px; flex: 0 0 {termH}px">
              <Terminal onClose={() => (termOpen = false)} />
            </div>
          {/if}
        </div>
        {#if chatOpen}
          <button
            type="button"
            class="split-resizer"
            class:active={drag === "r"}
            aria-label="Resize chat"
            onmousedown={() => (drag = "r")}
          ></button>
          <div class="split-pane min-w-0" style="flex: 0 1 {rightW}px; width: {rightW}px; min-width: {RIGHT_MIN}px">
            <ChatView onClose={() => (chatOpen = false)} />
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <StatusBar />
</div>

<style>
  .split-resizer-h {
    flex-shrink: 0;
    position: relative;
    width: 100%;
    height: 5px;
    border: none;
    padding: 0;
    cursor: row-resize;
    background: transparent;
    z-index: 5;
    transition: background 0.15s;
  }
  .split-resizer-h::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(var(--scifi-primary-rgb), 0.45),
      transparent
    );
    opacity: 0;
    transition: opacity 0.15s;
  }
  .split-resizer-h:hover::after,
  .split-resizer-h:focus-visible::after,
  .split-resizer-h.active::after {
    opacity: 1;
  }
  .terminal-wrap {
    overflow: hidden;
  }
</style>

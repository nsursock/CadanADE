<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } from "@codemirror/view";
  import { EditorState, Compartment, EditorSelection } from "@codemirror/state";
  import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { bracketMatching, foldGutter, indentOnInput } from "@codemirror/language";
  import { showMinimap } from "@replit/codemirror-minimap";
  import IconDeviceFloppy from "@tabler/icons-svelte/icons/device-floppy";
  import IconClearAll from "@tabler/icons-svelte/icons/clear-all";
  import { isImagePath } from "@cadan/core";
  import { appState } from "$lib/state.svelte";
  import { languageSupportForPath, scifiSyntaxHighlighting } from "$lib/editor/highlight";
  import { minimapGutterColors, pendingDiffExtension } from "$lib/editor/pending-diff";
  import Tooltip from "./Tooltip.svelte";

  let host: HTMLDivElement;
  let view: EditorView | null = null;
  let lastPath: string | null = null;
  let lastBaseline: string | null | undefined = undefined;
  let lastDocNonce = -1;
  /** Skip mirroring CM → tab while we programmatically set the doc. */
  let applyingExternal = false;
  const langCompartment = new Compartment();
  const pendingCompartment = new Compartment();

  /** Cmd on Apple hardware, Ctrl elsewhere — mirrors CodeMirror's `Mod-` prefix. */
  const MOD_LABEL = typeof navigator !== "undefined" && /mac|iphone|ipad|ipod/i.test(navigator.platform)
    ? "⌘"
    : "Ctrl";

  /** Mutable ref so CM extensions can read current baseline without reconfigure storms. */
  let baselineRef: string | null = null;

  const showingImage = $derived(!!appState.activePath && isImagePath(appState.activePath));
  const imageSrc = $derived(
    showingImage && appState.activeTab
      ? `/api/files/raw?path=${encodeURIComponent(appState.activeTab.path)}&h=${appState.activeTab.hash}`
      : null,
  );

  function getBaseline() {
    return baselineRef;
  }

  function createMinimapDom() {
    const dom = document.createElement("div");
    return { dom };
  }

  function setEditorDoc(path: string, content: string) {
    if (!view) return;
    if (isImagePath(path)) return;
    if (appState.activePath && path !== appState.activePath) return;
    const cur = view.state.doc.toString();
    if (cur === content) {
      lastDocNonce = appState.editorDocNonce;
      lastPath = path;
      return;
    }
    applyingExternal = true;
    try {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
      });
      lastPath = path;
      lastDocNonce = appState.editorDocNonce;
    } finally {
      applyingExternal = false;
    }
  }

  function syncFromTab() {
    const tab = appState.activeTab;
    const pending = appState.activePending;
    // Agent review baseline wins; otherwise highlight vs last saved content.
    const nextBaseline = pending ? pending.baseline : (tab?.savedContent ?? null);
    const nonce = appState.editorDocNonce;
    const forceDoc = nonce !== lastDocNonce;
    if (!view) {
      baselineRef = nextBaseline;
      return;
    }

    if (!tab || isImagePath(tab.path)) {
      baselineRef = null;
      lastBaseline = null;
      lastDocNonce = nonce;
      applyingExternal = true;
      try {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: "" },
          effects: [
            langCompartment.reconfigure([]),
            pendingCompartment.reconfigure([]),
          ],
        });
      } finally {
        applyingExternal = false;
      }
      lastPath = tab?.path ?? null;
      return;
    }

    const pathChanged = tab.path !== lastPath;
    const baselineChanged = nextBaseline !== lastBaseline;
    baselineRef = nextBaseline;
    lastBaseline = nextBaseline;

    const doc = view.state.doc.toString();
    const effects = [];
    if (pathChanged) {
      effects.push(langCompartment.reconfigure(languageSupportForPath(tab.path)));
    }
    // Keep change decorations enabled while a file is open.
    if (pathChanged || baselineChanged) {
      effects.push(pendingCompartment.reconfigure(pendingDiffExtension(getBaseline)));
    }

    const contentChanged = forceDoc || pathChanged || doc !== tab.content;
    if (contentChanged) {
      applyingExternal = true;
      try {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: tab.content ?? "" },
          effects,
        });
      } finally {
        applyingExternal = false;
      }
      lastPath = tab.path;
      lastDocNonce = nonce;
    } else if (effects.length) {
      view.dispatch({ effects });
      lastPath = tab.path;
    }
  }

  onMount(() => {
    const initialPath = appState.activePath;
    baselineRef = appState.activePending?.baseline ?? appState.activeTab?.savedContent ?? null;
    lastBaseline = baselineRef;
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: appState.activeTab && !isImagePath(appState.activeTab.path)
          ? (appState.activeTab.content ?? "")
          : "",
        extensions: [
          lineNumbers(),
          foldGutter(),
          drawSelection(),
          highlightActiveLine(),
          indentOnInput(),
          bracketMatching(),
          history(),
          keymap.of([
            // Mod- is Cmd on Apple, Ctrl on Linux/Windows. First so it wins over the browser default.
            { key: "Mod-s", run: () => { if (appState.activeTab?.dirty) void save(); return true; }, preventDefault: true },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          langCompartment.of(languageSupportForPath(initialPath && !isImagePath(initialPath) ? initialPath : null)),
          pendingCompartment.of(pendingDiffExtension(getBaseline)),
          // Stable minimap extension — gutters recompute via facet, not compartment churn.
          showMinimap.compute(["doc"], (state) => ({
            create: createMinimapDom,
            displayText: "blocks" as const,
            showOverlay: "always" as const,
            gutters: [minimapGutterColors(getBaseline(), state.doc.toString())],
          })),
          scifiSyntaxHighlighting,
          EditorView.updateListener.of((u) => {
            if (applyingExternal) return;
            if (!u.docChanged || !appState.activePath) return;
            if (isImagePath(appState.activePath)) return;
            const content = u.state.doc.toString();
            const tab = appState.tabs.find((t) => t.path === appState.activePath);
            if (tab && tab.content !== content) {
              tab.content = content;
              tab.dirty = true;
              // Bump array identity so tab dirty dots update, without forcing a doc rewrite
              // when syncFromTab sees matching content.
              appState.tabs = [...appState.tabs];
            }
          }),
          EditorView.theme({
            "&": {
              height: "100%",
              backgroundColor: "transparent",
              fontSize: "13px",
              fontFamily: "var(--scifi-font, 'JetBrains Mono', ui-monospace, monospace)",
            },
            ".cm-content": {
              caretColor: "var(--scifi-primary)",
              color: "var(--scifi-text)",
              fontFamily: "inherit",
            },
            ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--scifi-primary)" },
            "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
              backgroundColor: "rgba(var(--scifi-primary-rgb), 0.28)",
            },
            ".cm-activeLine": { backgroundColor: "rgba(var(--scifi-primary-rgb), 0.06)" },
            ".cm-gutters": {
              backgroundColor: "transparent",
              color: "var(--scifi-muted)",
              border: "none",
            },
            ".cm-activeLineGutter": {
              backgroundColor: "rgba(var(--scifi-primary-rgb), 0.08)",
              color: "var(--scifi-text)",
            },
            ".cm-foldPlaceholder": {
              backgroundColor: "rgba(var(--scifi-surface-1-rgb, 20, 10, 40), 0.6)",
              border: "1px solid var(--scifi-border)",
              color: "var(--scifi-muted)",
            },
            ".cm-change-add": {
              backgroundColor: "rgba(34, 197, 94, 0.12)",
            },
            ".cm-change-gutter": {
              width: "4px",
            },
            ".cm-change-add-marker": {
              width: "3px",
              height: "100%",
              marginLeft: "1px",
              backgroundColor: "rgba(34, 197, 94, 0.9)",
            },
            ".cm-change-del-marker": {
              width: "3px",
              height: "100%",
              marginLeft: "1px",
              backgroundColor: "rgba(239, 68, 68, 0.85)",
            },
            ".cm-pending-add": {
              backgroundColor: "rgba(34, 197, 94, 0.12)",
            },
            ".cm-pending-del-gutter": {
              width: "4px",
            },
            ".cm-pending-del-marker": {
              width: "3px",
              height: "100%",
              marginLeft: "1px",
              backgroundColor: "rgba(239, 68, 68, 0.85)",
            },
            ".cm-minimap-gutter": {
              backgroundColor: "rgba(var(--scifi-surface-1-rgb, 20, 10, 40), 0.35)",
              borderLeft: "1px solid var(--scifi-border)",
            },
          }),
        ],
      }),
    });
    lastPath = initialPath;
    lastDocNonce = appState.editorDocNonce;
    appState.bindEditorSetDoc(setEditorDoc);
  });

  $effect(() => {
    appState.activePath;
    appState.tabs;
    appState.pendingChanges;
    appState.editorDocNonce;
    // Track content + saved baseline so highlights refresh while typing / after save.
    void appState.activeTab?.content;
    void appState.activeTab?.savedContent;
    syncFromTab();
  });

  $effect(() => {
    const line = appState.scrollToLine;
    if (line == null || !view || showingImage) return;
    const doc = view.state.doc;
    const safe = Math.max(1, Math.min(line, doc.lines));
    const pos = doc.line(safe).from;
    view.dispatch({
      selection: EditorSelection.cursor(pos),
      effects: EditorView.scrollIntoView(pos, { y: "center" }),
    });
    view.focus();
    appState.scrollToLine = null;
  });

  onDestroy(() => {
    appState.bindEditorSetDoc(null);
    view?.destroy();
  });

  async function activate(path: string) {
    appState.activePath = path;
    await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "activate", path }),
    });
  }

  async function closeTab(path: string, e: MouseEvent) {
    e.stopPropagation();
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close", path }),
    });
    const data = await res.json();
    appState.tabs = appState.tabs.filter((t) => t.path !== path);
    appState.activePath = data.activePath ?? appState.tabs.at(-1)?.path ?? null;
  }

  async function closeAll() {
    if (appState.tabs.length === 0) return;
    const discarded = appState.tabs.filter((t) => t.dirty).length;
    await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "closeAll" }),
    });
    appState.tabs = [];
    appState.activePath = null;
    if (discarded > 0) {
      appState.showToast(`Discarded unsaved changes in ${discarded} file(s)`, "warning");
    }
  }

  /**
   * Cmd/Ctrl+S outside the editor (tree, chat, terminal). Accepts either modifier
   * so Mac Ctrl+S and Windows/Linux Cmd+S both work.
   */
  function onWindowKeydown(e: KeyboardEvent) {
    // The CodeMirror Mod-s binding already handled it (and prevented the default).
    if (e.defaultPrevented) return;
    if (e.altKey || !(e.metaKey || e.ctrlKey)) return;
    if (e.key.toLowerCase() !== "s") return;
    const tab = appState.activeTab;
    if (!tab || isImagePath(tab.path)) return;
    // Never hand the combo to the browser's own "save page" dialog.
    e.preventDefault();
    if (tab.dirty) void save();
  }

  async function save() {
    const tab = appState.activeTab;
    if (!tab || isImagePath(tab.path)) return;
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", path: tab.path, content: tab.content }),
    });
    const data = await res.json();
    if (!res.ok) {
      appState.showToast(data.error ?? "Save failed", "error");
      return;
    }
    const t = appState.tabs.find((x) => x.path === tab.path);
    if (t) {
      t.hash = data.hash;
      t.content = data.content;
      t.savedContent = data.content;
      t.dirty = false;
      appState.tabs = [...appState.tabs];
    }
    if (data.historyWarning) {
      appState.showToast(data.historyWarning, "warning");
    } else {
      appState.showToast("Saved", "success");
    }
    appState.bumpHistory();
  }

  async function applyReview(action: "accept" | "reject") {
    const path = appState.activePath;
    if (!path) return;
    const pending = appState.activePending;
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, path }),
    });
    const data = await res.json();
    if (!res.ok) {
      appState.showToast(data.error ?? `${action} failed`, "error");
      return;
    }
    if (Array.isArray(data.pending)) appState.setPendingChanges(data.pending);

    if (action === "reject" && data.deleted) {
      appState.tabs = appState.tabs.filter((t) => t.path !== path);
      appState.activePath = appState.tabs.at(-1)?.path ?? null;
    } else if (action === "reject" && data.restored && pending) {
      const t = appState.tabs.find((x) => x.path === path);
      if (t) {
        t.content = pending.baseline;
        t.hash = pending.baselineHash || t.hash;
        t.savedContent = pending.baseline;
        t.dirty = false;
        appState.tabs = [...appState.tabs];
      }
    } else if (action === "accept") {
      const t = appState.tabs.find((x) => x.path === path);
      if (t) {
        t.dirty = false;
        t.savedContent = t.content;
        appState.tabs = [...appState.tabs];
      }
    }
    appState.showToast(action === "accept" ? "Accepted" : "Rejected", "success");
    if (action === "accept") appState.bumpHistory();
  }
</script>

<div class="pane pane-bracketed h-full min-h-0 flex flex-col relative" data-enter>
  <div class="tab-bar shrink-0">
    {#each appState.tabs as tab}
      <button
        type="button"
        class="tab"
        class:active={tab.path === appState.activePath}
        class:pending={!!appState.pendingChanges.find((p) => p.path === tab.path)}
        onclick={() => activate(tab.path)}
      >
        {tab.path.split("/").pop()}{tab.dirty ? " •" : ""}
        <span
          class="ml-1 opacity-60 hover:opacity-100"
          role="presentation"
          onclick={(e) => closeTab(tab.path, e)}>×</span
        >
      </button>
    {/each}
    <div class="flex-1"></div>
    {#if appState.activePending && !showingImage}
      <button type="button" class="btn btn-xs btn-ghost m-1 text-[var(--scifi-success)]" onclick={() => applyReview("accept")}>
        Accept
      </button>
      <button type="button" class="btn btn-xs btn-ghost m-1 text-[var(--scifi-error)]" onclick={() => applyReview("reject")}>
        Reject
      </button>
    {/if}
    {#if !showingImage}
      <Tooltip tip={`Save (${MOD_LABEL}+S)`} prefer="bottom">
        <button
          type="button"
          class="icon-btn btn-xs m-1"
          disabled={!appState.activeTab?.dirty}
          aria-label="Save active file"
          onclick={save}
        >
          <IconDeviceFloppy size={14} stroke={1.75} />
        </button>
      </Tooltip>
    {/if}
    <Tooltip tip="Close all tabs" prefer="bottom">
      <button
        type="button"
        class="icon-btn btn-xs m-1"
        disabled={appState.tabs.length === 0}
        aria-label="Close all tabs"
        onclick={closeAll}
      >
        <IconClearAll size={14} stroke={1.75} />
      </button>
    </Tooltip>
  </div>
  <div class="flex-1 min-h-0 overflow-hidden relative">
    <div class="h-full min-h-0 overflow-hidden" class:hidden={showingImage} bind:this={host}></div>
    {#if showingImage && imageSrc}
      <div class="absolute inset-0 flex items-center justify-center overflow-auto p-4 bg-[rgba(var(--scifi-surface-0-rgb,10,8,20),0.35)]">
        <img
          src={imageSrc}
          alt={appState.activeTab?.path?.split("/").pop() ?? "image"}
          class="max-w-full max-h-full object-contain shadow-[0_0_0_1px_var(--scifi-border)]"
        />
      </div>
    {/if}
  </div>
  {#if !appState.activeTab}
    <div class="absolute inset-0 flex items-center justify-center pointer-events-none text-scifi-muted text-sm">
      Open a file from the tree
    </div>
  {/if}
</div>

<svelte:window onkeydown={onWindowKeydown} />

<style>
  :global(.tab.pending) {
    box-shadow: inset 0 -2px 0 rgba(34, 197, 94, 0.7);
  }
</style>

<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } from "@codemirror/view";
  import { EditorState, Compartment } from "@codemirror/state";
  import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { bracketMatching, foldGutter, indentOnInput } from "@codemirror/language";
  import { appState } from "$lib/state.svelte";
  import { languageSupportForPath, scifiSyntaxHighlighting } from "$lib/editor/highlight";

  let host: HTMLDivElement;
  let view: EditorView | null = null;
  let lastPath: string | null = null;
  const langCompartment = new Compartment();

  function syncFromTab() {
    const tab = appState.activeTab;
    if (!view) return;
    if (!tab) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: "" },
        effects: langCompartment.reconfigure([]),
      });
      lastPath = null;
      return;
    }
    const pathChanged = tab.path !== lastPath;
    const doc = view.state.doc.toString();
    const effects = pathChanged ? [langCompartment.reconfigure(languageSupportForPath(tab.path))] : [];
    if (pathChanged || doc !== tab.content) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: tab.content },
        effects,
      });
      lastPath = tab.path;
    }
  }

  onMount(() => {
    const initialPath = appState.activePath;
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: appState.activeTab?.content ?? "",
        extensions: [
          lineNumbers(),
          foldGutter(),
          drawSelection(),
          highlightActiveLine(),
          indentOnInput(),
          bracketMatching(),
          history(),
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
          langCompartment.of(languageSupportForPath(initialPath)),
          scifiSyntaxHighlighting,
          EditorView.updateListener.of((u) => {
            if (!u.docChanged || !appState.activePath) return;
            const content = u.state.doc.toString();
            const tab = appState.tabs.find((t) => t.path === appState.activePath);
            if (tab && tab.content !== content) {
              tab.content = content;
              tab.dirty = true;
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
          }),
        ],
      }),
    });
    lastPath = initialPath;
  });

  $effect(() => {
    appState.activePath;
    appState.tabs;
    syncFromTab();
  });

  onDestroy(() => view?.destroy());

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

  async function save() {
    const tab = appState.activeTab;
    if (!tab) return;
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
      t.dirty = false;
      appState.tabs = [...appState.tabs];
    }
    appState.showToast("Saved", "success");
  }
</script>

<div class="pane pane-bracketed h-full min-h-0 flex flex-col relative" data-enter>
  <div class="tab-bar shrink-0">
    {#each appState.tabs as tab}
      <button
        type="button"
        class="tab"
        class:active={tab.path === appState.activePath}
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
    <button type="button" class="btn btn-xs btn-ghost m-1" disabled={!appState.activeTab?.dirty} onclick={save}>
      Save
    </button>
  </div>
  <div class="flex-1 min-h-0 overflow-hidden" bind:this={host}></div>
  {#if !appState.activeTab}
    <div class="absolute inset-0 flex items-center justify-center pointer-events-none text-scifi-muted text-sm">
      Open a file from the tree
    </div>
  {/if}
</div>

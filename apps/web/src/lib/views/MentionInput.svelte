<script lang="ts">
  import IconSend from "@tabler/icons-svelte/icons/send";
  import IconFile from "@tabler/icons-svelte/icons/file";
  import IconX from "@tabler/icons-svelte/icons/x";
  import { appState } from "$lib/state.svelte";

  let {
    draft = "",
    attachedFiles = $bindable<string[]>([]),
    onSend,
    streaming = false,
    canSend = false,
    placeholder = "Ask Cadan…",
  }: {
    draft: string;
    attachedFiles?: string[];
    onSend: () => void;
    streaming?: boolean;
    canSend?: boolean;
    placeholder?: string;
  } = $props();

  let textareaEl: HTMLTextAreaElement | null = null;
  let mentionActive = $state(false);
  let mentionQuery = $state("");
  let mentionIndex = $state(0);
  let mentionStart = $state(-1);
  let flatFiles = $state<string[]>([]);
  let flatFilesLoaded = false;
  let flatFilesRoot = "";

  async function ensureFlatFiles() {
    const root = appState.workspaceRoot ?? "";
    if (flatFilesLoaded && flatFilesRoot === root) return;
    flatFilesLoaded = true;
    flatFilesRoot = root;
    try {
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "flat" }),
      });
      if (res.ok) {
        const data = await res.json();
        flatFiles = (data.files as string[]).filter((f) => !f.endsWith("/"));
      }
    } catch {
      flatFilesLoaded = false;
    }
  }

  const mentionMatches = $derived(
    mentionActive
      ? flatFiles
          .filter((f) => f.toLowerCase().includes(mentionQuery.toLowerCase()))
          .slice(0, 50)
      : [],
  );

  const mentionIdx = $derived(
    mentionMatches.length ? Math.min(mentionIndex, mentionMatches.length - 1) : 0,
  );

  function checkMention(el: HTMLTextAreaElement) {
    const text = el.value;
    const pos = el.selectionStart;
    let i = pos - 1;
    while (i >= 0 && text[i] !== "@" && !/\s/.test(text[i]!)) i--;
    if (i >= 0 && text[i] === "@" && (i === 0 || /\s/.test(text[i - 1]!))) {
      mentionActive = true;
      mentionStart = i;
      mentionQuery = text.slice(i + 1, pos);
      mentionIndex = 0;
      void ensureFlatFiles();
      return;
    }
    mentionActive = false;
    mentionQuery = "";
    mentionStart = -1;
  }

  function selectMention(path: string) {
    if (!textareaEl || mentionStart < 0) return;
    const before = draft.slice(0, mentionStart);
    const after = draft.slice(textareaEl.selectionStart);
    const newDraft = `${before}${after}`;
    const cursorPos = before.length;
    appState.setChatDraft(appState.activeChatId ?? "", newDraft);
    if (!attachedFiles.includes(path)) attachedFiles = [...attachedFiles, path];
    mentionActive = false;
    mentionQuery = "";
    mentionStart = -1;
    requestAnimationFrame(() => {
      textareaEl?.focus();
      textareaEl?.setSelectionRange(cursorPos, cursorPos);
    });
  }

  function removeAttachedFile(path: string) {
    attachedFiles = attachedFiles.filter((f) => f !== path);
  }

  function onKeydown(e: KeyboardEvent) {
    if (mentionActive && mentionMatches.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        mentionIndex = (mentionIndex + 1) % mentionMatches.length;
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        mentionIndex = (mentionIndex - 1 + mentionMatches.length) % mentionMatches.length;
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectMention(mentionMatches[mentionIdx]!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        mentionActive = false;
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  function onInput(e: Event) {
    const el = e.currentTarget as HTMLTextAreaElement;
    appState.setChatDraft(appState.activeChatId ?? "", el.value);
    checkMention(el);
  }
</script>

{#if attachedFiles.length}
  <div class="px-2 pt-1.5 flex flex-wrap gap-1 shrink-0">
    {#each attachedFiles as path (path)}
      <span class="mention-chip">
        <IconFile size={12} stroke={1.75} class="shrink-0 opacity-60" />
        <span class="truncate max-w-[12rem]">{path}</span>
        <button
          type="button"
          class="mention-chip-x"
          aria-label="Remove {path}"
          onclick={() => removeAttachedFile(path)}
        ><IconX size={12} stroke={1.75} /></button>
      </span>
    {/each}
  </div>
{/if}

<div class="p-2 border-t border-[var(--scifi-border)] flex gap-2 shrink-0 min-w-0 relative">
  {#if mentionActive && mentionMatches.length}
    <div class="mention-dropdown">
      {#each mentionMatches as path, i (path)}
        <button
          type="button"
          class="mention-item"
          class:mention-item-active={i === mentionIdx}
          onclick={() => selectMention(path)}
        >
          {path}
        </button>
      {/each}
    </div>
  {/if}
  <textarea
    bind:this={textareaEl}
    class="textarea flex-1 min-w-0 min-h-[2.5rem] max-h-28 text-sm"
    rows="2"
    {placeholder}
    value={draft}
    oninput={onInput}
    onkeydown={onKeydown}
  ></textarea>
  <button
    type="button"
    class="btn btn-primary self-end inline-flex items-center gap-1 shrink-0"
    disabled={!canSend || streaming}
    onclick={onSend}
  >
    <IconSend size={16} stroke={1.75} />
    Send
  </button>
</div>

<style>
  .mention-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.35rem 0.15rem 0.4rem;
    font-size: 0.65rem;
    border: 1px solid var(--scifi-border);
    border-radius: 0.3rem;
    background: var(--scifi-surface, rgba(255, 255, 255, 0.05));
    color: var(--scifi-text);
    max-width: 100%;
  }
  .mention-chip-x {
    border: none;
    background: transparent;
    color: inherit;
    opacity: 0.55;
    cursor: pointer;
    font-size: 0.8rem;
    line-height: 1;
    padding: 0;
    flex-shrink: 0;
  }
  .mention-chip-x:hover {
    opacity: 1;
  }
  .mention-dropdown {
    position: absolute;
    bottom: 100%;
    left: 0.5rem;
    right: 0.5rem;
    max-height: 18rem;
    overflow-y: auto;
    border: 1px solid var(--scifi-border);
    border-radius: 0.25rem;
    background: var(--scifi-bg, #0d0a14);
    z-index: 50;
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.4);
  }
  .mention-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.35rem 0.6rem;
    font-size: 0.75rem;
    border: none;
    background: transparent;
    color: var(--scifi-text);
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mention-item:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  .mention-item-active {
    background: var(--scifi-primary);
    color: var(--scifi-bg, #0d0a14);
  }
</style>

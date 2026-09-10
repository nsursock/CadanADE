<script lang="ts">
  import { onMount } from "svelte";
  import IconList from "@tabler/icons-svelte/icons/list";
  import IconListDetails from "@tabler/icons-svelte/icons/list-details";
  import IconClipboardCopy from "@tabler/icons-svelte/icons/clipboard-copy";
  import IconPlus from "@tabler/icons-svelte/icons/plus";
  import IconX from "@tabler/icons-svelte/icons/x";
  import { patchSettings, type AgentEvent, type ChatDisplayMode } from "@cadan/core";
  import { appState } from "$lib/state.svelte";
  import { formatChatTranscript } from "$lib/chat-transcript";
  import Tooltip from "./Tooltip.svelte";
  import ChatMessage from "./ChatMessage.svelte";
  import MentionInput from "./MentionInput.svelte";

  let { onClose }: { onClose?: () => void } = $props();

  let copying = $state(false);
  let bootstrapping = $state(false);
  let attachedFiles = $state<string[]>([]);

  const chat = $derived(appState.activeChat);

  // Sync files added from outside ChatView (e.g. file browser "Add to context").
  $effect(() => {
    const incoming = appState.chatContextFiles;
    if (incoming.length) {
      const merged = [...attachedFiles];
      for (const f of incoming) if (!merged.includes(f)) merged.push(f);
      attachedFiles = merged;
      appState.chatContextFiles = [];
    }
  });

  onMount(() => {
    void ensureAtLeastOneChat();
  });

  async function ensureAtLeastOneChat() {
    if (appState.chatSessions.length > 0 || bootstrapping) return;
    bootstrapping = true;
    try {
      await createChat();
    } finally {
      bootstrapping = false;
    }
  }

  async function createChat() {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create" }),
    });
    const data = await res.json();
    if (!res.ok) {
      appState.showToast(data.error ?? "Could not create chat", "error");
      return;
    }
    appState.addChatSession(String(data.sessionId));
  }

  async function switchChat(id: string) {
    if (id === appState.activeChatId) return;
    appState.setActiveChat(id);
    const sessionId = appState.chatById(id)?.sessionId;
    if (!sessionId) return;
    await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "switch", sessionId }),
    });
  }

  async function closeChat(id: string, e?: Event) {
    e?.preventDefault();
    e?.stopPropagation();
    const target = appState.chatById(id);
    if (!target) return;
    if (appState.chatSessions.length <= 1) {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", sessionId: target.sessionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        appState.showToast(data.error ?? "Could not reset chat", "error");
        return;
      }
      appState.removeChatSession(id);
      appState.addChatSession(String(data.sessionId));
      return;
    }
    if (target.sessionId) {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", sessionId: target.sessionId }),
      });
    }
    appState.removeChatSession(id);
  }

  function setDisplayMode(mode: ChatDisplayMode) {
    appState.chatDisplayMode = mode;
    patchSettings({ chatDisplayMode: mode });
  }

  async function copyTranscript() {
    if (!chat?.messages.length || copying) return;
    const text = formatChatTranscript(chat.messages);
    if (!text.trim()) {
      appState.showToast("Nothing to copy", "warning");
      return;
    }
    copying = true;
    try {
      await navigator.clipboard.writeText(text);
      appState.showToast("Transcript copied (verbose)", "info");
    } catch {
      appState.showToast("Could not copy transcript", "error");
    } finally {
      copying = false;
    }
  }

  async function refreshTree() {
    const res = await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refresh" }),
    });
    const data = await res.json();
    if (res.ok && data.tree) appState.tree = data.tree;
  }

  function applyEvent(ev: AgentEvent) {
    const key = ev.sessionId;
    const target = appState.chatById(key);
    if (!target) return;

    switch (ev.type) {
      case "reasoning.delta":
        appState.appendReasoning(key, String(ev.data?.text ?? ""));
        break;
      case "text.delta":
        appState.appendText(key, String(ev.data?.text ?? ""));
        break;
      case "status":
        appState.setChatStreaming(key, true, String(ev.data?.message ?? ""));
        break;
      case "tool.start":
        appState.upsertTool(key, {
          id: String(ev.data?.toolCallId),
          name: String(ev.data?.toolName),
          status: "running",
        });
        break;
      case "tool.args":
        appState.upsertTool(key, {
          id: String(ev.data?.toolCallId),
          name: String(ev.data?.toolName),
          args: ev.data?.args,
          status: "running",
        });
        break;
      case "tool.result":
        appState.upsertTool(key, {
          id: String(ev.data?.toolCallId),
          name: String(ev.data?.toolName),
          result: String(ev.data?.result ?? ""),
          status: "done",
        });
        appState.setChatPendingApproval(key, null);
        void refreshTree();
        break;
      case "tool.error":
        appState.upsertTool(key, {
          id: String(ev.data?.toolCallId),
          name: String(ev.data?.toolName),
          error: String(ev.data?.error ?? ""),
          status: "error",
        });
        appState.setChatPendingApproval(key, null);
        break;
      case "tool.approval_required":
        appState.upsertTool(key, {
          id: String(ev.data?.toolCallId),
          name: String(ev.data?.toolName),
          args: ev.data?.args,
          status: "approval",
        });
        appState.setChatPendingApproval(key, {
          toolCallId: String(ev.data?.toolCallId),
          toolName: String(ev.data?.toolName),
          args: ev.data?.args,
        });
        break;
      case "error":
        appState.showToast(String(ev.data?.message ?? "Agent error"), "error");
        if (ev.data) appState.applyUsage(key, ev.data);
        break;
      case "done":
      case "cancelled":
        if (ev.data) appState.applyUsage(key, ev.data);
        break;
      case "title":
        if (ev.data?.title) appState.setChatTitle(key, String(ev.data.title));
        break;
    }
  }

  async function approve(approved: boolean) {
    const pending = chat?.pendingApproval;
    const sessionId = chat?.sessionId;
    if (!pending || !sessionId) return;
    await fetch("/api/chat/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        toolCallId: pending.toolCallId,
        approved,
      }),
    });
  }

  async function send() {
    const active = appState.activeChat;
    const text = (active?.draft ?? "").trim();
    if (!text || !active?.sessionId || active.streaming) return;
    if (!appState.workspaceRoot) {
      appState.showToast("Open a workspace first", "warning");
      return;
    }
    const sessionKey = active.sessionId;
    const priorMessages = active.messages;
    const isFirstMessage = !priorMessages.some((m) => m.role === "user");
    const contextFiles = [
      ...(isFirstMessage && appState.activePath ? [appState.activePath] : []),
      ...attachedFiles,
    ];
    attachedFiles = [];
    appState.setChatDraft(sessionKey, "");
    appState.setChatStreaming(sessionKey, true, "Starting…");
    appState.setChatPendingApproval(sessionKey, null);
    appState.setChatMessages(sessionKey, [
      ...priorMessages,
      { id: `u-${Date.now()}`, role: "user", content: text, at: Date.now() },
      { id: `a-${Date.now()}`, role: "assistant", content: "", at: Date.now(), parts: [], tools: [] },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, sessionId: sessionKey, contextFiles }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let buf = "";
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const chunks = buf.split("\n\n");
          buf = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const line = chunk.trim();
            if (!line.startsWith("data:")) continue;
            const ev = JSON.parse(line.slice(5).trim()) as AgentEvent;
            applyEvent(ev);
          }
        }
      }
    } catch (e) {
      appState.showToast(e instanceof Error ? e.message : "Chat failed", "error");
    } finally {
      appState.setChatStreaming(sessionKey, false, null);
    }
  }
</script>

<div class="pane pane-bracketed h-full min-h-0 min-w-0 flex flex-col overflow-hidden" data-enter>
  <div class="pane-header shrink-0 gap-1 !px-1">
    <div class="session-tabs flex-1 min-w-0">
      <div class="tab-bar tabs-scroll !border-0 !bg-transparent">
        {#each appState.chatSessions as tab (tab.id)}
          <div class="tab" class:active={tab.id === appState.activeChatId}>
            <button type="button" class="tab-main" onclick={() => void switchChat(tab.id)}>
              {tab.title}
              {#if tab.streaming}
                <span class="stream-dot" title="running"></span>
              {/if}
            </button>
            <button
              type="button"
              class="tab-close"
              aria-label="Close {tab.title}"
              onpointerdown={(e) => void closeChat(tab.id, e)}
            >×</button>
          </div>
        {/each}
      </div>
      <button type="button" class="icon-btn tab-add" aria-label="New chat" onclick={() => void createChat()}>
        <IconPlus size={14} stroke={1.75} />
      </button>
    </div>
    <div class="ml-auto flex items-center gap-1 shrink-0 pr-1">
      {#if appState.agentMode === "thrift"}
        <span class="badge badge-primary">thrift</span>
      {/if}
      <Tooltip tip="Copy transcript (always verbose)">
        <button
          type="button"
          class="btn btn-ghost btn-xs px-1.5"
          disabled={!chat?.messages.length || copying}
          onclick={() => void copyTranscript()}
          aria-label="Copy transcript"
        >
          <IconClipboardCopy size={14} stroke={1.75} />
        </button>
      </Tooltip>
      <div class="inline-flex rounded border border-[var(--scifi-border)] overflow-hidden">
        <Tooltip tip="Compact — tool names only, hide reasoning">
          <button
            type="button"
            class="btn btn-xs rounded-none px-1.5"
            class:btn-primary={appState.chatDisplayMode === "compact"}
            class:btn-ghost={appState.chatDisplayMode !== "compact"}
            aria-pressed={appState.chatDisplayMode === "compact"}
            onclick={() => setDisplayMode("compact")}
          >
            <IconList size={14} stroke={1.75} />
          </button>
        </Tooltip>
        <Tooltip tip="Verbose — reasoning + tool args/results">
          <button
            type="button"
            class="btn btn-xs rounded-none px-1.5"
            class:btn-primary={appState.chatDisplayMode === "verbose"}
            class:btn-ghost={appState.chatDisplayMode !== "verbose"}
            aria-pressed={appState.chatDisplayMode === "verbose"}
            onclick={() => setDisplayMode("verbose")}
          >
            <IconListDetails size={14} stroke={1.75} />
          </button>
        </Tooltip>
      </div>
      {#if chat?.streaming}
        <span class="status-chip"><span class="dot"></span> {chat.status ?? "running"}</span>
      {:else}
        <span class="status-chip"><span class="dot"></span> ready</span>
      {/if}
      {#if onClose}
        <Tooltip tip="Hide (⌘K → Toggle chat agent)" prefer="bottom">
          <button
            type="button"
            class="icon-btn btn-xs"
            aria-label="Hide chat agent"
            onclick={onClose}
          >
            <IconX size={14} stroke={1.75} />
          </button>
        </Tooltip>
      {/if}
    </div>
  </div>
  <div class="pane-scan"></div>
  <div class="chat flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto p-3">
    {#if !chat || chat.messages.length === 0}
      <p class="text-xs text-scifi-muted">
        {#if appState.agentMode === "thrift"}
          Thrift mode: oversized reads return outlines instead of full files. Toggle in Settings → Provider.
        {:else}
          Normal mode: full file reads enter context. Switch to Thrift in Settings to compare spend.
        {/if}
        OpenRouter tags this chat as <code class="text-[0.65rem]">cadan:{appState.agentMode}:…</code> for Activity A/B.
      </p>
    {/if}
    {#if chat}
      {#each chat.messages as msg (msg.id)}
        <ChatMessage {msg} displayMode={appState.chatDisplayMode} />
      {/each}
    {/if}
  </div>

  {#if chat?.pendingApproval}
    <div class="mx-2 mb-2 alert alert-warning text-xs shrink-0">
      <div class="flex-1 min-w-0 overflow-hidden">
        Approve <strong>{chat.pendingApproval.toolName}</strong>?
        <pre class="mt-1 opacity-80 overflow-x-auto max-h-16 whitespace-pre-wrap break-all">{JSON.stringify(chat.pendingApproval.args, null, 2)}</pre>
      </div>
      <div class="flex gap-1 shrink-0">
        <button type="button" class="btn btn-xs btn-danger" onclick={() => approve(false)}>Deny</button>
        <button type="button" class="btn btn-xs btn-primary" onclick={() => approve(true)}>Allow</button>
      </div>
    </div>
  {/if}

  {#if chat && chat.sessionUsage.turns > 0}
    <div
      class="mx-2 mb-1 px-2 py-1.5 text-[0.65rem] text-scifi-muted flex flex-wrap items-center gap-x-3 gap-y-1 border border-[var(--scifi-border)] rounded shrink-0"
      title={chat.openRouterSessionId ?? undefined}
    >
      <span>
        Session · {chat.sessionUsage.turns} turn{chat.sessionUsage.turns === 1 ? "" : "s"} ·
        {chat.sessionUsage.totalTokens.toLocaleString()} tok ·
        ${chat.sessionUsage.costUsd.toFixed(4)}
      </span>
      {#if chat.turnUsage}
        <span class="text-scifi-text/80">
          Last · {chat.turnUsage.totalTokens.toLocaleString()} tok · ${chat.turnUsage.costUsd.toFixed(4)} ·
          {chat.turnUsage.agentMode}
        </span>
      {/if}
      {#if chat.openRouterSessionId}
        <span class="font-mono truncate max-w-full opacity-70">{chat.openRouterSessionId}</span>
      {/if}
    </div>
  {/if}

  <MentionInput
    draft={chat?.draft ?? ""}
    bind:attachedFiles
    onSend={() => void send()}
    streaming={chat?.streaming ?? false}
    canSend={!!chat?.sessionId}
    placeholder="Ask Cadan to edit the workspace…  (type @ to attach a file)"
  />
</div>

<style>
  .session-tabs {
    display: flex;
    align-items: stretch;
    min-width: 0;
    min-height: 2.35rem;
  }
  .tabs-scroll {
    flex: 1 1 auto;
    min-width: 0;
  }
  .tab-add {
    flex: 0 0 auto;
    align-self: center;
    margin-left: 0.125rem;
  }
  .tab {
    padding: 0;
    gap: 0;
  }
  .tab-main {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.45rem 0.35rem 0.45rem 0.9rem;
    background: transparent;
    border: none;
    color: inherit;
    font: inherit;
    font-weight: inherit;
    cursor: pointer;
    white-space: nowrap;
    max-width: 10rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tab-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    margin-right: 0.35rem;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    opacity: 0.55;
    cursor: pointer;
    font-size: 0.85rem;
    line-height: 1;
    flex-shrink: 0;
  }
  .tab-close:hover {
    opacity: 1;
  }
  .stream-dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--scifi-primary);
    box-shadow: 0 0 4px var(--scifi-primary);
  }
  :global(.chat-row) {
    max-width: 100%;
    min-width: 0;
  }
  :global(.chat-bubble) {
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
</style>

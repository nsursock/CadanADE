<script lang="ts">
  import IconSend from "@tabler/icons-svelte/icons/send";
  import IconUser from "@tabler/icons-svelte/icons/user";
  import IconRobot from "@tabler/icons-svelte/icons/robot";
  import IconTool from "@tabler/icons-svelte/icons/tool";
  import IconList from "@tabler/icons-svelte/icons/list";
  import IconListDetails from "@tabler/icons-svelte/icons/list-details";
  import IconClipboardCopy from "@tabler/icons-svelte/icons/clipboard-copy";
  import { patchSettings, type AgentEvent, type ChatDisplayMode, type ChatPart } from "@cadan/core";
  import { appState } from "$lib/state.svelte";
  import { formatChatTranscript } from "$lib/chat-transcript";
  import Tooltip from "./Tooltip.svelte";

  let draft = $state("");
  let sending = $state(false);
  let copying = $state(false);

  function setDisplayMode(mode: ChatDisplayMode) {
    appState.chatDisplayMode = mode;
    patchSettings({ chatDisplayMode: mode });
  }

  async function copyTranscript() {
    if (!appState.messages.length || copying) return;
    const text = formatChatTranscript(appState.messages);
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

  function visibleParts(parts: ChatPart[] | undefined): ChatPart[] {
    if (!parts?.length) return [];
    if (appState.chatDisplayMode === "verbose") return parts;
    return parts.filter((p) => p.kind !== "reasoning");
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
    appState.sessionId = ev.sessionId;
    switch (ev.type) {
      case "reasoning.delta":
        appState.appendReasoning(String(ev.data?.text ?? ""));
        break;
      case "text.delta":
        appState.appendText(String(ev.data?.text ?? ""));
        break;
      case "status":
        appState.chatStatus = String(ev.data?.message ?? "");
        break;
      case "tool.start":
        appState.upsertTool({
          id: String(ev.data?.toolCallId),
          name: String(ev.data?.toolName),
          status: "running",
        });
        break;
      case "tool.args":
        appState.upsertTool({
          id: String(ev.data?.toolCallId),
          name: String(ev.data?.toolName),
          args: ev.data?.args,
          status: "running",
        });
        break;
      case "tool.result":
        appState.upsertTool({
          id: String(ev.data?.toolCallId),
          name: String(ev.data?.toolName),
          result: String(ev.data?.result ?? ""),
          status: "done",
        });
        appState.pendingApproval = null;
        void refreshTree();
        break;
      case "tool.error":
        appState.upsertTool({
          id: String(ev.data?.toolCallId),
          name: String(ev.data?.toolName),
          error: String(ev.data?.error ?? ""),
          status: "error",
        });
        appState.pendingApproval = null;
        break;
      case "tool.approval_required":
        appState.upsertTool({
          id: String(ev.data?.toolCallId),
          name: String(ev.data?.toolName),
          args: ev.data?.args,
          status: "approval",
        });
        appState.pendingApproval = {
          toolCallId: String(ev.data?.toolCallId),
          toolName: String(ev.data?.toolName),
          args: ev.data?.args,
        };
        break;
      case "error":
        appState.showToast(String(ev.data?.message ?? "Agent error"), "error");
        if (ev.data) appState.applyUsage(ev.data);
        break;
      case "done":
      case "cancelled":
        if (ev.data) appState.applyUsage(ev.data);
        break;
    }
  }

  async function approve(approved: boolean) {
    const pending = appState.pendingApproval;
    if (!pending || !appState.sessionId) return;
    await fetch("/api/chat/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: appState.sessionId,
        toolCallId: pending.toolCallId,
        approved,
      }),
    });
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    if (!appState.workspaceRoot) {
      appState.showToast("Open a workspace first", "warning");
      return;
    }
    draft = "";
    sending = true;
    appState.chatStreaming = true;
    appState.chatStatus = "Starting…";
    appState.pendingApproval = null;
    appState.messages = [
      ...appState.messages,
      { id: `u-${Date.now()}`, role: "user", content: text, at: Date.now() },
      { id: `a-${Date.now()}`, role: "assistant", content: "", at: Date.now(), parts: [], tools: [] },
    ];

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
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
      sending = false;
      appState.chatStreaming = false;
      appState.chatStatus = null;
    }
  }
</script>

<div class="pane pane-bracketed h-full min-h-0 min-w-0 flex flex-col overflow-hidden" data-enter>
  <div class="pane-header shrink-0 gap-1.5">
    <span class="pane-title"><span class="pane-title-bar"></span> Agent</span>
    {#if appState.agentMode === "thrift"}
      <span class="badge badge-primary">thrift</span>
    {/if}
    <div class="ml-auto flex items-center gap-1">
      <Tooltip tip="Copy transcript (always verbose)">
        <button
          type="button"
          class="btn btn-ghost btn-xs px-1.5"
          disabled={!appState.messages.length || copying}
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
      {#if appState.chatStreaming}
        <span class="status-chip"><span class="dot"></span> {appState.chatStatus ?? "running"}</span>
      {:else}
        <span class="status-chip"><span class="dot"></span> ready</span>
      {/if}
    </div>
  </div>
  <div class="pane-scan"></div>
  <div class="chat flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto p-3">
    {#if appState.messages.length === 0}
      <p class="text-xs text-scifi-muted">
        {#if appState.agentMode === "thrift"}
          Thrift mode: oversized reads return outlines instead of full files. Toggle in Settings → Provider.
        {:else}
          Normal mode: full file reads enter context. Switch to Thrift in Settings to compare spend.
        {/if}
        OpenRouter tags this chat as <code class="text-[0.65rem]">cadan:{appState.agentMode}:…</code> for Activity A/B.
      </p>
    {/if}
    {#each appState.messages as msg}
      <div class="chat-row" class:chat-end={msg.role === "user"} class:chat-start={msg.role !== "user"}>
        <div class="chat-avatar" aria-hidden="true">
          {#if msg.role === "user"}
            <IconUser size={14} stroke={1.75} />
          {:else}
            <IconRobot size={14} stroke={1.75} />
          {/if}
        </div>
        <div
          class="chat-bubble min-w-0"
          class:chat-bubble-primary={msg.role === "user"}
          class:chat-bubble-accent={msg.role !== "user"}
        >
          <div class="chat-header">
            <span class="chat-name">{msg.role === "user" ? "You" : "Cadan"}</span>
          </div>
          {#if msg.role === "user"}
            {#if msg.content}
              <div class="chat-body whitespace-pre-wrap break-words">{msg.content}</div>
            {/if}
          {:else}
            {@const parts = visibleParts(msg.parts)}
            {#if parts.length}
              <div class="chat-body space-y-2">
                {#each parts as part (part.id)}
                  {#if part.kind === "reasoning"}
                    <div class="rounded border border-[var(--scifi-border)]/70 bg-black/10 px-2 py-1.5 text-[0.7rem] text-scifi-muted whitespace-pre-wrap break-words">
                      <div class="mb-1 text-[0.6rem] uppercase tracking-wide opacity-70">Reasoning</div>
                      {part.text}
                    </div>
                  {:else if part.kind === "text"}
                    <div class="whitespace-pre-wrap break-words">{part.text}</div>
                  {:else}
                    {@const tool = part.tool}
                    {@const verbose = appState.chatDisplayMode === "verbose"}
                    <div
                      class="alert text-xs py-2 px-2.5"
                      class:alert-warning={tool.status === "approval"}
                      class:alert-error={tool.status === "error"}
                      class:alert-success={verbose && tool.status === "done"}
                    >
                      <IconTool size={14} stroke={1.75} class="shrink-0 mt-0.5" />
                      <div class="min-w-0 overflow-hidden">
                        <div class="font-semibold truncate">
                          {tool.name}{#if verbose}<span class="opacity-70"> · {tool.status}</span>{/if}
                        </div>
                        {#if verbose}
                          {#if tool.args}
                            <pre class="mt-1 text-[0.65rem] overflow-x-auto max-h-20 opacity-80 whitespace-pre-wrap break-all">{JSON.stringify(tool.args, null, 0)}</pre>
                          {/if}
                          {#if tool.result}
                            <pre class="mt-1 text-[0.65rem] overflow-x-auto max-h-24 opacity-80 whitespace-pre-wrap break-all">{tool.result.slice(0, 800)}</pre>
                          {/if}
                        {/if}
                        {#if tool.error}
                          <div class="mt-1 text-scifi-error break-words">{tool.error}</div>
                        {/if}
                      </div>
                    </div>
                  {/if}
                {/each}
              </div>
            {:else if msg.content}
              <div class="chat-body whitespace-pre-wrap break-words">{msg.content}</div>
            {/if}
          {/if}
        </div>
      </div>
    {/each}
  </div>

  {#if appState.pendingApproval}
    <div class="mx-2 mb-2 alert alert-warning text-xs shrink-0">
      <div class="flex-1 min-w-0 overflow-hidden">
        Approve <strong>{appState.pendingApproval.toolName}</strong>?
        <pre class="mt-1 opacity-80 overflow-x-auto max-h-16 whitespace-pre-wrap break-all">{JSON.stringify(appState.pendingApproval.args, null, 2)}</pre>
      </div>
      <div class="flex gap-1 shrink-0">
        <button type="button" class="btn btn-xs btn-danger" onclick={() => approve(false)}>Deny</button>
        <button type="button" class="btn btn-xs btn-primary" onclick={() => approve(true)}>Allow</button>
      </div>
    </div>
  {/if}

  {#if appState.sessionUsage.turns > 0}
    <div
      class="mx-2 mb-1 px-2 py-1.5 text-[0.65rem] text-scifi-muted flex flex-wrap items-center gap-x-3 gap-y-1 border border-[var(--scifi-border)] rounded shrink-0"
      title={appState.openRouterSessionId ?? undefined}
    >
      <span>
        Session · {appState.sessionUsage.turns} turn{appState.sessionUsage.turns === 1 ? "" : "s"} ·
        {appState.sessionUsage.totalTokens.toLocaleString()} tok ·
        ${appState.sessionUsage.costUsd.toFixed(4)}
      </span>
      {#if appState.turnUsage}
        <span class="text-scifi-text/80">
          Last · {appState.turnUsage.totalTokens.toLocaleString()} tok · ${appState.turnUsage.costUsd.toFixed(4)} ·
          {appState.turnUsage.agentMode}
        </span>
      {/if}
      {#if appState.openRouterSessionId}
        <span class="font-mono truncate max-w-full opacity-70">{appState.openRouterSessionId}</span>
      {/if}
    </div>
  {/if}

  <div class="p-2 border-t border-[var(--scifi-border)] flex gap-2 shrink-0 min-w-0">
    <textarea
      class="textarea flex-1 min-w-0 min-h-[2.5rem] max-h-28 text-sm"
      rows="2"
      placeholder="Ask Cadan to edit the workspace…"
      bind:value={draft}
      onkeydown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      }}
    ></textarea>
    <button type="button" class="btn btn-primary self-end inline-flex items-center gap-1 shrink-0" disabled={sending} onclick={send}>
      <IconSend size={16} stroke={1.75} />
      Send
    </button>
  </div>
</div>

<style>
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

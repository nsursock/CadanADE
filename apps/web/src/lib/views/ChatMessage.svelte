<script lang="ts">
  import IconUser from "@tabler/icons-svelte/icons/user";
  import IconRobot from "@tabler/icons-svelte/icons/robot";
  import IconTool from "@tabler/icons-svelte/icons/tool";
  import type { ChatDisplayMode, ChatPart } from "@cadan/core";

  let {
    msg,
    displayMode,
  }: {
    msg: { id: string; role: string; content: string; parts?: ChatPart[] };
    displayMode: ChatDisplayMode;
  } = $props();

  function visibleParts(parts: ChatPart[] | undefined): ChatPart[] {
    if (!parts?.length) return [];
    if (displayMode === "verbose") return parts;
    return parts.filter((p) => p.kind !== "reasoning");
  }
</script>

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
              {@const verbose = displayMode === "verbose"}
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

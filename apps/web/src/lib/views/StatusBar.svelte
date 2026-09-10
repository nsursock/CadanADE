<script lang="ts">
  import { appState } from "$lib/state.svelte";
</script>

<footer class="status-bar shrink-0" data-enter>
  <div class="status-bar-section">
    {#if appState.workspaceRoot}
      <span class="status-bar-item"><strong>{appState.workspaceRoot.split("/").pop()}</strong></span>
      <span class="status-chip"><span class="dot"></span> linked</span>
    {:else}
      <span class="status-bar-item">No workspace</span>
    {/if}
    {#if appState.activeTab}
      <span class="status-bar-item">{appState.activeTab.path}{appState.activeTab.dirty ? " •" : ""}</span>
    {/if}
  </div>
  <div class="status-bar-section">
    <span
      class="status-bar-item font-mono"
      title={appState.turnUsage?.routedModel
        ? `Routed: ${appState.turnUsage.routedModel}\nSelected: ${appState.selectedModelId}`
        : appState.selectedModelId}
    >
      {#if appState.turnUsage?.routedModel}
        {appState.turnUsage.routedModel.split("/").pop()}
      {:else}
        {appState.selectedModelId.split("/").pop()}
      {/if}
    </span>
    {#if appState.agentMode === "thrift"}
      <span class="badge badge-primary">thrift</span>
    {:else}
      <span class="status-bar-item">normal</span>
    {/if}
    {#if appState.sessionUsage.turns > 0}
      <span class="status-bar-item" title={appState.openRouterSessionId ?? "OpenRouter session"}>
        ${appState.sessionUsage.costUsd.toFixed(4)} · {appState.sessionUsage.totalTokens.toLocaleString()} tok
      </span>
    {/if}
    {#if appState.turnUsage?.finishReason === "length"}
      <span class="status-bar-item text-warning" title="Last completion hit max_tokens">length</span>
    {:else if (appState.turnUsage?.promptTokens ?? 0) >= 20000}
      <span
        class="status-bar-item"
        class:text-warning={(appState.turnUsage?.promptTokens ?? 0) >= 40000}
        title="Last turn prompt tokens"
      >
        {(appState.turnUsage?.promptTokens ?? 0).toLocaleString()} in
      </span>
    {/if}
    <span class="status-bar-item">{appState.themeId}</span>
    <span class="feature-pill text-[0.65rem] py-0.5 px-2"
      >{appState.tabs.length} files · {appState.chatSessions.length} chats</span
    >
  </div>
</footer>

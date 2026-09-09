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
    <span class="status-bar-item">{appState.selectedModelId.split("/").pop()}</span>
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
    <span class="status-bar-item">{appState.themeId}</span>
    <span class="feature-pill text-[0.65rem] py-0.5 px-2">{appState.tabs.length} tabs</span>
  </div>
</footer>

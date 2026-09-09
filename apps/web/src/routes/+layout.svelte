<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { loadSettings } from "@cadan/core";
  import { appState } from "$lib/state.svelte";

  let { children } = $props();

  onMount(() => {
    const s = loadSettings();
    appState.themeId = s.themeId;
    appState.threeBackground = s.threeBackground;
    appState.perfLite = s.perfLite;
    appState.selectedModelId = s.selectedModelId || "openrouter/free";
    appState.workerModelId = s.workerModelId || "openrouter/free";
    appState.agentMode = s.agentMode === "thrift" ? "thrift" : "normal";
    appState.chatDisplayMode = s.chatDisplayMode === "verbose" ? "verbose" : "compact";
    document.documentElement.dataset.theme = s.themeId;
    document.documentElement.classList.toggle("perf-lite", s.perfLite);

    // Push stored provider secrets to the server (overrides env for this process)
    void fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: s.openrouterApiKey || undefined,
        baseUrl: s.providerBaseUrl || undefined,
        model: s.selectedModelId || "openrouter/free",
        workerModel: s.workerModelId || "openrouter/free",
        agentMode: s.agentMode === "thrift" ? "thrift" : "normal",
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        appState.hasProviderKey = Boolean(data.hasKey);
        if (data.model) appState.selectedModelId = data.model;
        if (data.workerModel) appState.workerModelId = data.workerModel;
        if (data.agentMode === "thrift" || data.agentMode === "normal") {
          appState.agentMode = data.agentMode;
        }
      })
      .catch(() => {
        /* ignore */
      });
  });
</script>

{@render children()}

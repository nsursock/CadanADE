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
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        appState.hasProviderKey = Boolean(data.hasKey);
        if (data.model) appState.selectedModelId = data.model;
      })
      .catch(() => {
        /* ignore */
      });
  });
</script>

{@render children()}

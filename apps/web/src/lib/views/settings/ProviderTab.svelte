<script lang="ts">
  import IconKey from "@tabler/icons-svelte/icons/key";
  import IconEye from "@tabler/icons-svelte/icons/eye";
  import IconEyeOff from "@tabler/icons-svelte/icons/eye-off";
  import IconCheck from "@tabler/icons-svelte/icons/check";
  import IconRefresh from "@tabler/icons-svelte/icons/refresh";
  import { DEFAULT_SETTINGS, loadSettings, patchSettings } from "@cadan/core";
  import { appState } from "$lib/state.svelte";
  import Tooltip from "../Tooltip.svelte";

  let apiKey = $state("");
  let baseUrl = $state(DEFAULT_SETTINGS.providerBaseUrl);
  let model = $state(DEFAULT_SETTINGS.selectedModelId);
  let showKey = $state(false);
  let saving = $state(false);
  let saved = $state(false);
  let error = $state<string | null>(null);
  let keyHint = $state<string | null>(null);
  let hasKey = $state(false);
  let free = $state<{ id: string; name: string }[]>([]);
  let paid = $state<{ id: string; name: string }[]>([]);
  let modelsLoading = $state(false);

  $effect(() => {
    const s = loadSettings();
    apiKey = s.openrouterApiKey;
    baseUrl = s.providerBaseUrl;
    model = s.selectedModelId || DEFAULT_SETTINGS.selectedModelId;
    void hydrateServer();
  });

  async function hydrateServer() {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.baseUrl) baseUrl = data.baseUrl;
      if (data.model) model = data.model;
      keyHint = data.keyHint ?? null;
      hasKey = Boolean(data.hasKey);
      if (hasKey) void loadModels();
    } catch {
      /* ignore */
    }
  }

  async function loadModels() {
    modelsLoading = true;
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      free = data.free ?? [{ id: "openrouter/free", name: "OpenRouter Free (auto)" }];
      paid = data.paid ?? [];
    } catch {
      free = [{ id: "openrouter/free", name: "OpenRouter Free (auto)" }];
      paid = [];
    } finally {
      modelsLoading = false;
    }
  }

  async function saveProvider() {
    saving = true;
    error = null;
    saved = false;
    try {
      const nextModel = model.trim() || DEFAULT_SETTINGS.selectedModelId;
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, baseUrl, model: nextModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      model = nextModel;
      patchSettings({
        openrouterApiKey: apiKey,
        providerBaseUrl: baseUrl,
        selectedModelId: nextModel,
      });
      appState.selectedModelId = nextModel;
      appState.hasProviderKey = Boolean(data.hasKey);
      hasKey = Boolean(data.hasKey);
      keyHint = data.keyHint ?? null;
      saved = true;
      appState.showToast("Provider settings saved", "success");
      if (hasKey) void loadModels();
      setTimeout(() => (saved = false), 2000);
    } catch (e) {
      error = e instanceof Error ? e.message : "Save failed";
    } finally {
      saving = false;
    }
  }

  function clearKey() {
    apiKey = "";
    keyHint = null;
    hasKey = false;
  }
</script>

<section class="space-y-5">
  <div>
    <div class="flex items-center gap-2 mb-1">
      <IconKey size={16} stroke={1.75} class="text-scifi-primary" />
      <h3 class="pane-title !normal-case !tracking-normal !text-sm"><span class="pane-title-bar"></span> OpenRouter</h3>
    </div>
    <p class="text-xs text-scifi-muted mb-3">
      Save an API key to unlock the model picker (defaults to <code>openrouter/free</code>).
    </p>

    <label class="block mb-3">
      <span class="label-kicker block mb-1">API key</span>
      <div class="flex gap-2">
        <input
          class="input flex-1 font-mono text-xs"
          type={showKey ? "text" : "password"}
          placeholder={keyHint ?? "sk-or-v1-…"}
          bind:value={apiKey}
          autocomplete="off"
        />
        <Tooltip tip={showKey ? "Hide key" : "Show key"} prefer="left">
          <button type="button" class="icon-btn" aria-label="Toggle visibility" onclick={() => (showKey = !showKey)}>
            {#if showKey}
              <IconEyeOff size={16} stroke={1.75} />
            {:else}
              <IconEye size={16} stroke={1.75} />
            {/if}
          </button>
        </Tooltip>
      </div>
    </label>

    <label class="block mb-3">
      <span class="label-kicker block mb-1">Base URL</span>
      <input class="input font-mono text-xs" bind:value={baseUrl} placeholder="https://openrouter.ai/api/v1" />
    </label>

    <label class="block mb-3">
      <span class="label-kicker block mb-1">Model</span>
      {#if hasKey}
        <div class="flex gap-2">
          <select class="select flex-1 font-mono text-xs" bind:value={model}>
            <optgroup label="Routers">
              <option value="openrouter/free">openrouter/free</option>
              <option value="openrouter/auto">openrouter/auto</option>
            </optgroup>
            {#if free.length}
              <optgroup label="Free">
                {#each free.filter((m) => !m.id.startsWith("openrouter/")) as m}
                  <option value={m.id}>{m.id}</option>
                {/each}
              </optgroup>
            {/if}
            {#if paid.length}
              <optgroup label="Paid">
                {#each paid.filter((m) => !m.id.startsWith("openrouter/")) as m}
                  <option value={m.id}>{m.id}</option>
                {/each}
              </optgroup>
            {/if}
          </select>
          <Tooltip tip="Refresh models" prefer="left">
            <button type="button" class="icon-btn" aria-label="Refresh models" onclick={loadModels} disabled={modelsLoading}>
              <IconRefresh size={16} stroke={1.75} class={modelsLoading ? "animate-spin" : ""} />
            </button>
          </Tooltip>
        </div>
      {:else}
        <input class="input font-mono text-xs opacity-60" disabled value={model || "openrouter/free"} />
        <p class="text-[0.65rem] text-scifi-muted mt-1">Save an API key to browse and change models.</p>
      {/if}
    </label>

    {#if error}
      <div class="alert alert-error text-xs mb-3">{error}</div>
    {/if}

    <div class="flex flex-wrap gap-2">
      <button type="button" class="btn btn-primary btn-sm inline-flex items-center gap-1" disabled={saving} onclick={saveProvider}>
        {#if saved}<IconCheck size={14} stroke={1.75} />{/if}
        {saving ? "Saving…" : saved ? "Saved" : "Save provider"}
      </button>
      <button type="button" class="btn btn-ghost btn-sm" onclick={clearKey}>Clear key</button>
      <button
        type="button"
        class="btn btn-ghost btn-sm"
        onclick={() => (baseUrl = "https://openrouter.ai/api/v1")}
      >Reset URL</button>
    </div>
  </div>
</section>

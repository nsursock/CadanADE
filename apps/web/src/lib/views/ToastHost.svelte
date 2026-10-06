<script lang="ts">
  import { fly } from "svelte/transition";
  import IconX from "@tabler/icons-svelte/icons/x";
  import { appState } from "$lib/state.svelte";
</script>

{#if appState.toasts.length}
  <div class="toast toast-top toast-end" aria-live="polite">
    {#each appState.toasts as toast (toast.id)}
      <div
        class="toast-item toast-{toast.variant}"
        role={toast.variant === "error" ? "alert" : "status"}
        transition:fly={{ y: 6, duration: 180 }}
      >
        <span class="min-w-0 flex-1 break-words">{toast.text}</span>
        <button
          type="button"
          class="btn btn-ghost btn-xs shrink-0 !px-1 opacity-70 hover:opacity-100"
          aria-label="Dismiss notification"
          onclick={() => appState.dismissToast(toast.id)}
        >
          <IconX size={13} stroke={2} />
        </button>
      </div>
    {/each}
  </div>
{/if}
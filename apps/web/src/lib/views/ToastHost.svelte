<script lang="ts">
  import { appState } from "$lib/state.svelte";
</script>

{#if appState.toast}
  <div class="toast toast-top toast-end" aria-live="polite">
    <div class="toast-item toast-{appState.toast.variant}">{appState.toast.text}</div>
  </div>
{/if}

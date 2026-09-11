<script lang="ts">
  import OutlinePanel from "./OutlinePanel.svelte";
  import TimelinePanel from "./TimelinePanel.svelte";
</script>

<div class="side-panels flex flex-col gap-1 min-h-0 shrink-0">
  <OutlinePanel />
  <TimelinePanel />
</div>

<style>
  .side-panels {
    flex: 0 1 46%;
    max-height: 46%;
    min-height: 8rem;
    padding-top: 0.15rem;
  }
</style>

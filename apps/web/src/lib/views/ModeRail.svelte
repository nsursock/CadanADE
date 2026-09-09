<script lang="ts">
  import IconCode from "@tabler/icons-svelte/icons/code";
  import IconRobot from "@tabler/icons-svelte/icons/robot";
  import IconChartBar from "@tabler/icons-svelte/icons/chart-bar";
  import IconEye from "@tabler/icons-svelte/icons/eye";
</script>

<aside class="mode-rail shrink-0 hidden sm:flex" data-enter>
  <span class="tooltip tooltip-right" data-tip="Editor">
    <button type="button" class="icon-btn active" aria-label="Editor">
      <IconCode size={18} stroke={1.75} />
    </button>
  </span>
  <span class="tooltip tooltip-right" data-tip="Agent (soon)">
    <button type="button" class="icon-btn" disabled aria-label="Agent">
      <IconRobot size={18} stroke={1.75} />
    </button>
  </span>
  <span class="tooltip tooltip-right" data-tip="Stats (soon)">
    <button type="button" class="icon-btn" disabled aria-label="Stats">
      <IconChartBar size={18} stroke={1.75} />
    </button>
  </span>
  <span class="tooltip tooltip-right" data-tip="Monitor (soon)">
    <button type="button" class="icon-btn" disabled aria-label="Monitor">
      <IconEye size={18} stroke={1.75} />
    </button>
  </span>
</aside>

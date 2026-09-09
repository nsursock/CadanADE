<script lang="ts">
  import IconCode from "@tabler/icons-svelte/icons/code";
  import IconRobot from "@tabler/icons-svelte/icons/robot";
  import IconChartBar from "@tabler/icons-svelte/icons/chart-bar";
  import IconEye from "@tabler/icons-svelte/icons/eye";
  import Tooltip from "./Tooltip.svelte";
</script>

<aside class="mode-rail shrink-0 hidden sm:flex" data-enter>
  <Tooltip tip="Editor" prefer="right">
    <button type="button" class="icon-btn active" aria-label="Editor">
      <IconCode size={18} stroke={1.75} />
    </button>
  </Tooltip>
  <Tooltip tip="Agent (soon)" prefer="right">
    <button type="button" class="icon-btn" disabled aria-label="Agent">
      <IconRobot size={18} stroke={1.75} />
    </button>
  </Tooltip>
  <Tooltip tip="Stats (soon)" prefer="right">
    <button type="button" class="icon-btn" disabled aria-label="Stats">
      <IconChartBar size={18} stroke={1.75} />
    </button>
  </Tooltip>
  <Tooltip tip="Monitor (soon)" prefer="right">
    <button type="button" class="icon-btn" disabled aria-label="Monitor">
      <IconEye size={18} stroke={1.75} />
    </button>
  </Tooltip>
</aside>

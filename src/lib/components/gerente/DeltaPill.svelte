<script>
  export let value = 0;
  export let neutral = false;
  $: direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
</script>

<span class:positive={direction === 'up' && !neutral} class:negative={direction === 'down' && !neutral} class="delta tabular-nums">
  {direction === 'up' ? '+' : ''}{Math.round(Number(value || 0) * 100)}%
</span>

<style>
  .delta { font-size: 11px; color: var(--text-muted); }
  .positive { color: var(--status-success-text); }
  .negative { color: var(--status-warning-text); }
</style>


<script>
  export let label = '';
  export let value = '-';
  export let detail = '';
</script>

<div class="stat-tile">
  <span>{label}</span>
  <strong class="tabular-nums">{value}</strong>
  {#if detail}<small>{detail}</small>{/if}
</div>

<style>
  .stat-tile { min-width: 0; padding: 14px; border: 1px solid var(--border-card); border-radius: 8px; background: var(--bg-input); display: grid; gap: 3px; }
  span, small { color: var(--text-muted); font-size: 12px; }
  strong { color: var(--text-main); font-size: 20px; line-height: 1.2; overflow-wrap: anywhere; }
</style>


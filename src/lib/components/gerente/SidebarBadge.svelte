<script>
  export let count = 0;
  export let hasCritical = false;

  $: label = Number(count) > 9 ? '9+' : String(Math.max(0, Number(count) || 0));
</script>

{#if count > 0}
  <span class:critical={hasCritical} class="sidebar-badge" aria-label={`${count} avisos novos`}>
    {label}
  </span>
{/if}

<style>
  .sidebar-badge {
    display: inline-grid;
    place-items: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--primary);
    color: white;
    font-size: 10px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    animation: badge-in 160ms ease-out;
  }

  .sidebar-badge.critical { background: var(--status-error-text); }

  @keyframes badge-in { from { transform: scale(.82); } to { transform: scale(1); } }
  @media (prefers-reduced-motion: reduce) { .sidebar-badge { animation: none; } }
</style>

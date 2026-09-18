<script>
  import { orderSourceBadge } from '$lib/orders/ifoodPresentation.js';

  /** Queue view model from mapCanonicalOrder. */
  export let order = null;
  /** Hide ZeloMenu/manual badges and show only non-default channels. */
  export let onlyExternal = false;

  $: badge = orderSourceBadge(order);
  $: visible = !onlyExternal || badge.source === 'ifood';
</script>

{#if visible}
  <span
    class="source-badge"
    data-source={badge.source}
    aria-label={badge.reference ? `Canal ${badge.label}, pedido ${badge.reference}` : `Canal ${badge.label}`}
  >
    <span class="source-label">{badge.label}</span>
    {#if badge.reference}
      <span class="source-reference">#{badge.reference}</span>
    {/if}
  </span>
{/if}

<style>
  /* Plain-text badge: the iFood logo requires formal authorization first. */
  .source-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 2px 8px;
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    background: var(--bg-card);
    color: var(--text-label);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    line-height: 1.4;
    white-space: nowrap;
  }

  .source-badge[data-source='ifood'] {
    border-color: var(--status-error-border);
    background: var(--status-error-bg);
    color: var(--status-error-text);
  }

  .source-label {
    text-transform: uppercase;
  }

  .source-reference {
    color: var(--text-main);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
  }
</style>

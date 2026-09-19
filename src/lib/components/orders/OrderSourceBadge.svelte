<script>
  import { orderSourceBadge } from '$lib/orders/ifoodPresentation.js';

  let { order = null, onlyExternal = false } = $props();

  let badge = $derived(orderSourceBadge(order));
  let visible = $derived(!onlyExternal || badge.source === 'ifood');
  let isIfood = $derived(badge.source === 'ifood');
</script>

{#if visible}
  <span
    class="source-badge-wrap"
    data-source={badge.source}
    aria-label={badge.reference ? `Canal ${badge.label}, pedido ${badge.reference}` : `Canal ${badge.label}`}
  >
    {#if isIfood}
      <span class="source-mark" aria-hidden="true">
        <img src="/ifood-logo.png" alt="" width="24" height="24" />
      </span>
    {/if}
    <span class="source-badge" data-source={badge.source}>
      <span class="source-label">{badge.label}</span>
      {#if badge.reference}
        <span class="source-reference">#{badge.reference}</span>
      {/if}
    </span>
  </span>
{/if}

<style>
  .source-badge-wrap {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  .source-mark {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    overflow: hidden;
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    background: var(--bg-card);
  }

  .source-mark img {
    width: 82%;
    height: 82%;
    object-fit: contain;
  }

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

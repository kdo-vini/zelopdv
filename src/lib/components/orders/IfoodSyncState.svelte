<script>
  import { AlarmClock, CloudUpload, TriangleAlert } from 'lucide-svelte';
  import {
    ifoodReviewClock,
    ifoodSyncPresentation,
    ifoodWaitingLabel,
    isIfoodOrder
  } from '$lib/orders/ifoodPresentation.js';

  /** Queue view model from mapCanonicalOrder. */
  export let order = null;
  /** Entry from GET /api/integrations/ifood/orders/sync-state for this order. */
  export let syncState = null;
  /** Current time in ms; the page ticks it so the clock stays live. */
  export let now = Date.now();
  /** Compact variant for queue cards. */
  export let compact = false;

  $: ifood = isIfoodOrder(order);
  $: clock = ifoodReviewClock(order, now);
  $: sync = ifoodSyncPresentation(syncState, order);
  $: waiting = ifoodWaitingLabel(order);
</script>

{#if ifood}
  <div class="ifood-sync" class:compact>
    {#if clock.persistent}
      <p class="sync-line clock" data-severity={clock.severity} role="status">
        <AlarmClock class="size-4" aria-hidden="true" />
        <span>
          {clock.severity === 'critical' ? 'Confirme agora' : 'Aguardando confirmação'}
          · {clock.elapsedMinutes} min
        </span>
      </p>
    {/if}

    {#if sync}
      <p class="sync-line" data-tone={sync.tone} role="status">
        {#if sync.tone === 'error'}
          <TriangleAlert class="size-4" aria-hidden="true" />
        {:else}
          <CloudUpload class="size-4" aria-hidden="true" />
        {/if}
        <span>
          <strong>{sync.label}</strong>
          {#if !compact}<span class="sync-detail">{sync.detail}</span>{/if}
        </span>
      </p>
    {:else if waiting && !compact}
      <p class="sync-line" data-tone="neutral">
        <span>{waiting}</span>
      </p>
    {/if}
  </div>
{/if}

<style>
  .ifood-sync {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .sync-line {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    margin: 0;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
    background: var(--bg-card);
    color: var(--text-label);
    font-size: 0.75rem;
    line-height: 1.4;
  }

  .compact .sync-line {
    padding: 0.25rem 0.5rem;
    font-size: 0.68rem;
  }

  .sync-line :global(svg) {
    flex: 0 0 auto;
    margin-top: 0.1rem;
  }

  .sync-line strong {
    font-weight: 700;
  }

  .sync-detail {
    display: block;
    color: var(--text-muted);
  }

  .sync-line[data-tone='info'] {
    border-color: var(--border-strong);
  }

  .sync-line[data-tone='warning'],
  .clock[data-severity='attention'],
  .clock[data-severity='warning'] {
    border-color: var(--status-warning-border);
    background: var(--status-warning-bg);
    color: var(--status-warning-text);
  }

  .sync-line[data-tone='error'],
  .clock[data-severity='critical'] {
    border-color: var(--status-error-border);
    background: var(--status-error-bg);
    color: var(--status-error-text);
  }

  .clock[data-severity='critical'] {
    font-weight: 700;
  }

  @media (prefers-reduced-motion: no-preference) {
    .clock[data-severity='critical'] {
      animation: sync-pulse 1.6s ease-in-out infinite;
    }
  }

  @keyframes sync-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.72; }
  }
</style>

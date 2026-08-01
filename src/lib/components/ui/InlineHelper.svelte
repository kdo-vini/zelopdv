<script>
  import { Info } from 'lucide-svelte';

  export let message = '';
  export let id = undefined;
  export let tone = 'info';
  export let compact = false;
  export let role = 'status';
</script>

{#if message}
  <p {id} {role} class:inline-helper-compact={compact} class:inline-helper-warning={tone === 'warning'} class="inline-helper">
    <Info size={compact ? 13 : 15} aria-hidden="true" />
    <span>{message}</span>
  </p>
{/if}

<style>
  .inline-helper {
    display: flex;
    align-items: flex-start;
    gap: 0.45rem;
    width: 100%;
    margin: 0;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--border-subtle);
    border-radius: 0.55rem;
    background: var(--bg-card);
    color: var(--text-muted);
    font-size: 0.75rem;
    line-height: 1.4;
  }

  .inline-helper :global(svg) {
    flex: 0 0 auto;
    margin-top: 0.08rem;
    color: var(--primary);
  }

  .inline-helper-warning {
    border-color: var(--status-warning-border);
    background: var(--status-warning-bg);
    color: var(--status-warning-text);
  }

  .inline-helper-warning :global(svg) {
    color: var(--status-warning-text);
  }

  .inline-helper-compact {
    width: auto;
    padding: 0.35rem 0.5rem;
    font-size: 0.68rem;
  }

  @media (min-width: 640px) {
    .inline-helper:not(.inline-helper-compact) {
      width: auto;
    }
  }
</style>

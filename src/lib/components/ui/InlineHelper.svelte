<script>
  import { Info, TriangleAlert, CircleCheck, CircleAlert } from 'lucide-svelte';
  import { zeloSurface } from '$lib/theme/surface';

  export let message = '';
  export let id = undefined;
  /** info | warning | success | error — nas superfícies Zelo cada tom usa os tokens de estado. */
  export let tone = 'info';
  export let compact = false;
  export let role = 'status';

  const ZELO_ICONS = { info: Info, warning: TriangleAlert, success: CircleCheck, error: CircleAlert };
</script>

{#if message}
  <p
    {id}
    {role}
    class:inline-helper-compact={compact}
    class:inline-helper-warning={tone === 'warning'}
    class:inline-helper-success={tone === 'success'}
    class:inline-helper-error={tone === 'error'}
    class="inline-helper"
  >
    {#if $zeloSurface}
      <svelte:component this={ZELO_ICONS[tone] || Info} size={compact ? 13 : 15} strokeWidth={1.75} aria-hidden="true" />
    {:else}
      <Info size={compact ? 13 : 15} aria-hidden="true" />
    {/if}
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

  .inline-helper-success {
    border-color: var(--status-success-border);
    background: var(--status-success-bg);
    color: var(--status-success-text);
  }

  .inline-helper-error {
    border-color: var(--status-error-border);
    background: var(--status-error-bg);
    color: var(--status-error-text);
  }

  .inline-helper-success :global(svg),
  .inline-helper-error :global(svg) {
    color: currentColor;
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

  /* ── Zelo Design System (app/brand): neutro rebaixado, estados pelos tokens de status ── */
  :global(:is([data-surface="app"], [data-surface="brand"])) .inline-helper {
    gap: 8px;
    padding: 8px 12px;
    border-color: transparent;
    border-radius: var(--zelo-radius-control);
    background: var(--bg-sunken);
    color: var(--text-label);
    font-size: 12.5px;
  }
  :global(:is([data-surface="app"], [data-surface="brand"])) .inline-helper :global(svg) { color: var(--text-muted); margin-top: 1px; }
  :global(:is([data-surface="app"], [data-surface="brand"])) .inline-helper-warning { border-color: var(--status-warning-border); background: var(--status-warning-bg); color: var(--status-warning-text); }
  :global(:is([data-surface="app"], [data-surface="brand"])) .inline-helper-success { border-color: var(--status-success-border); background: var(--status-success-bg); color: var(--status-success-text); }
  :global(:is([data-surface="app"], [data-surface="brand"])) .inline-helper-error { border-color: var(--status-error-border); background: var(--status-error-bg); color: var(--status-error-text); }
  :global(:is([data-surface="app"], [data-surface="brand"])) :is(.inline-helper-warning, .inline-helper-success, .inline-helper-error) :global(svg) { color: currentColor; }
  :global(:is([data-surface="app"], [data-surface="brand"])) .inline-helper-compact { padding: 5px 10px; border-radius: var(--zelo-radius-seg); font-size: 11.5px; }
</style>

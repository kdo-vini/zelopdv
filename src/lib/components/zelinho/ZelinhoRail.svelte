<script>
  import { isOpen, openAssistant } from '$lib/stores/assistant';
  import { Sparkles } from 'lucide-svelte';

  export let label = 'Abrir Zelinho';
</script>

{#if !$isOpen}
  <button type="button" data-zelinho-rail class="zelinho-rail" on:click={openAssistant} aria-label={label} title={label}>
    <Sparkles class="size-5" aria-hidden="true" />
    <span>Zelinho</span>
  </button>
{/if}

<style>
  .zelinho-rail {
    position: fixed; z-index: 70; top: 50%; right: 0; display: inline-flex; align-items: center;
    gap: 0.5rem; min-height: 44px; padding: 0.625rem 0.75rem 0.625rem 0.625rem;
    border: 1px solid var(--border-subtle); border-right: 0; border-radius: 8px 0 0 8px;
    background: var(--bg-panel); color: var(--text-main); cursor: pointer; transform: translateY(-50%);
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .zelinho-rail:hover { background: var(--sidebar-item-hover-bg); }
  .zelinho-rail:focus-visible { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 16%, transparent); }
  .zelinho-rail span { font-size: 0.875rem; font-weight: 600; }
  @media (max-width: 767px) {
    .zelinho-rail { top: 0.75rem; right: auto; left: 3.75rem; min-width: 44px; padding: 0.625rem; border-right: 1px solid var(--border-subtle); border-radius: 8px; transform: none; justify-content: center; }
    .zelinho-rail span { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  }
  @media (prefers-reduced-motion: reduce) { .zelinho-rail { transition: none; } }
</style>

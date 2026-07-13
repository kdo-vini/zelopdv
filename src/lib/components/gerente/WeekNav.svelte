<script>
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';
  import Button from '$lib/components/ui/button/button.svelte';

  export let label = '';
  export let canGoBack = true;
  export let canGoForward = false;
  export let onPrevious = () => {};
  export let onNext = () => {};
</script>

<nav class="week-nav" aria-label="Navegação entre semanas">
  <Button variant="outline" size="sm" on:click={onPrevious} disabled={!canGoBack} aria-label="Semana anterior">
    <ChevronLeft aria-hidden="true" />
  </Button>
  <span>{label}</span>
  <Button variant="outline" size="sm" on:click={onNext} disabled={!canGoForward} aria-label="Semana seguinte">
    <ChevronRight aria-hidden="true" />
  </Button>
</nav>

<style>
  .week-nav { display: inline-flex; align-items: center; gap: 8px; padding: 4px; border: 1px solid var(--border-card); border-radius: 8px; background: var(--bg-card); }.week-nav :global(button) { min-width: 44px; min-height: 44px; }
  .week-nav span { min-width: 172px; text-align: center; color: var(--text-label); font-size: 13px; font-weight: 600; }
  @media (max-width: 420px) { .week-nav { width: 100%; justify-content: space-between; } .week-nav span { min-width: 0; } }
</style>

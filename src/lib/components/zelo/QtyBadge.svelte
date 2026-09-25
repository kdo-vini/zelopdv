<script>
  /**
   * Count badge (item quantity in the comanda, unread count). Zelo Design System → QtyBadge.
   * Pops in with a spring when it appears, and bumps when the number changes
   * (not on first render). docs/DESIGN_SYSTEM.md → Movimento.
   */
  import { untrack } from 'svelte';
  import { pop } from '$lib/motion/transitions.js';
  let { count = 0, class: className = '' } = $props();

  let el = $state();
  let previous = untrack(() => count);

  $effect(() => {
    const next = count;
    const node = el;
    if (next === previous) return;
    if (next > 0 && !node) return; // not bound yet: the effect re-runs once it is
    if (next > 0) pop(node, { from: previous > 0 ? 0.78 : 0.4 });
    previous = next;
  });
</script>

{#if count > 0}<span bind:this={el} class="qty {className}" aria-label="{count} na comanda">{count}</span>{/if}

<style>
  .qty { min-width: 24px; height: 24px; padding: 0 7px; border-radius: 12px; display: inline-grid; place-items: center; background: var(--primary); color: var(--primary-text); font: var(--type-num-sm); letter-spacing: var(--type-num-sm-tracking); font-variant-numeric: tabular-nums; }
</style>

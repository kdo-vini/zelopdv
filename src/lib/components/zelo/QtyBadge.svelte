<script>
  /** Count badge (item quantity in the comanda, unread count). Zelo Design System → QtyBadge. */
  let { count = 0, class: className = '' } = $props();
</script>

{#if count > 0}<span class="qty {className}" aria-label="{count} na comanda">{count}</span>{/if}

<style>
  .qty { min-width: 24px; height: 24px; padding: 0 7px; border-radius: 12px; display: inline-grid; place-items: center; background: var(--primary); color: var(--primary-text); font: 500 12px/1 var(--zelo-font-num); }
</style>

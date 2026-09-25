<script>
  /** Money in pt-BR with the small "R$" prefix, mono and tabular. Zelo Design System → MoneyText. */
  let { value = 0, size = 'md', prefix = true, class: className = '' } = $props();
  const formatted = $derived(Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
</script>

<span class="money money-{size} {className}">{#if prefix}<small>R$</small>{/if}<span>{formatted}</span></span>

<style>
  .money { display: inline-flex; align-items: baseline; gap: 4px; font-family: var(--zelo-font-num); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; font-weight: 500; }
  .money small { font: 500 0.55em/1 var(--zelo-font-ui); color: var(--text-muted); letter-spacing: 0; }
  .money-sm { font-size: 14px; } .money-md { font-size: 20px; } .money-lg { font-size: 32px; letter-spacing: -0.03em; }
  .money-sm small { font-size: 12px; }
</style>

<script>
  /** Product tile for the PDV grid. States: normal · in comanda (navy ring + QtyBadge) · low stock. Zelo Design System → Tile. */
  import MoneyText from './MoneyText.svelte';
  import QtyBadge from './QtyBadge.svelte';
  let { name, price = 0, meta = '', quantity = 0, lowStock = null, onclick = () => {}, class: className = '', ...rest } = $props();
</script>

<button type="button" class="tile {className}" class:in={quantity > 0} {onclick} {...rest}>
  <span class="head">
    <span class="nm">{name}</span>
    {#if meta}<span class="meta">{meta}</span>{/if}
    {#if lowStock != null}<span class="low">{lowStock} restantes</span>{/if}
  </span>
  <MoneyText value={price} />
  <QtyBadge count={quantity} class="badge" />
</button>

<style>
  .tile { position: relative; display: flex; flex-direction: column; justify-content: space-between; gap: 14px; min-height: 118px; padding: 14px; text-align: left; border-radius: var(--zelo-radius-card); background: var(--bg-card); border: 1px solid var(--border-card); color: var(--text-main); transition: border-color var(--zelo-dur-fast), box-shadow var(--zelo-dur-fast), transform var(--zelo-dur-slow) var(--zelo-ease-spring); }
  .tile:hover { border-color: var(--border-strong); }
  /* press squash: quick in, springs back on release (docs/DESIGN_SYSTEM.md → Movimento) */
  .tile:active { transform: scale(var(--zelo-press-scale)); transition-duration: var(--zelo-dur-fast); }
  .tile:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--focus); }
  .tile.in { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
  .head { display: flex; flex-direction: column; gap: 4px; padding-right: 28px; }
  .nm { font: var(--type-body-strong); letter-spacing: var(--type-body-strong-tracking); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .meta { font: var(--type-caption); letter-spacing: var(--type-caption-tracking); color: var(--text-muted); }
  .low { display: inline-flex; align-items: center; gap: 5px; font: var(--type-caption); letter-spacing: var(--type-caption-tracking); font-weight: 500; color: var(--status-warning-text); }
  .low::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--warning); }
  .tile :global(.badge) { position: absolute; top: 10px; right: 10px; }
</style>

<script>
  /** Segmented control (Retirada/Delivery, tabelas de preço). Zelo Design System → Segmented. */
  let { options = [], value = $bindable(), label = '', size = 'md', class: className = '' } = $props();
</script>

<div class="seg seg-{size} {className}" role="radiogroup" aria-label={label}>
  {#each options as option (option.value)}
    <button type="button" role="radio" aria-checked={value === option.value} class:on={value === option.value} onclick={() => (value = option.value)}>
      {#if option.icon}<option.icon size={18} strokeWidth={1.75} aria-hidden="true" />{/if}{option.label}
    </button>
  {/each}
</div>

<style>
  .seg { display: inline-flex; gap: 2px; padding: 4px; border-radius: var(--zelo-radius-control); background: var(--bg-sunken); }
  .seg button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 14px; border-radius: var(--zelo-radius-seg); font-weight: 500; font-size: 13.5px; color: var(--text-muted); transition: background var(--zelo-dur-fast) var(--zelo-ease-out), color var(--zelo-dur-fast); }
  .seg-md button { height: 36px; } .seg-lg button { height: 40px; }
  .seg button.on { background: var(--bg-panel); color: var(--text-main); box-shadow: 0 0 0 1px var(--border-subtle); }
  .seg button:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--focus); }
</style>

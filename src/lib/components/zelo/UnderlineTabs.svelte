<script>
  /** Underline tabs with mono counters (categorias). Zelo Design System → Tabs. */
  let { tabs = [], value = $bindable(), label = '', class: className = '' } = $props();
</script>

<div class="tabs {className}" role="tablist" aria-label={label}>
  {#each tabs as tab (tab.value)}
    <button type="button" role="tab" aria-selected={value === tab.value} class:on={value === tab.value} onclick={() => (value = tab.value)}>
      {tab.label}{#if tab.count != null}<span class="n">{tab.count}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--border-subtle); overflow-x: auto; scrollbar-width: none; }
  .tabs button { position: relative; height: 40px; display: flex; align-items: center; gap: 7px; white-space: nowrap; font-weight: 500; color: var(--text-muted); }
  .tabs button.on { color: var(--text-main); }
  .tabs button.on::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; border-radius: 2px; background: var(--primary); }
  .tabs button:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--focus); border-radius: 6px; }
  .n { font: 500 11px/1 var(--zelo-font-num); color: var(--text-muted); opacity: 0.75; }
</style>

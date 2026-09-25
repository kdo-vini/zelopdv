<script>
  /**
   * Underline tabs with mono counters (categorias). Zelo Design System → Tabs.
   * The underline is a liquid indicator (split-edge springs, docs/DESIGN_SYSTEM.md → Movimento);
   * until it is measured the active tab draws its own underline.
   */
  import { LiquidIndicator } from '$lib/motion/liquid.svelte.js';
  let { tabs = [], value = $bindable(), label = '', class: className = '' } = $props();

  let root = $state();
  const indicator = new LiquidIndicator();
  const activeTab = () => root?.querySelector('[aria-selected="true"]');
  const hasActive = $derived(tabs.some((tab) => tab.value === value));

  $effect(() => {
    value;
    tabs;
    indicator.follow(activeTab());
  });

  $effect(() => {
    if (!root || typeof ResizeObserver === 'undefined') return;
    tabs;
    const observer = new ResizeObserver(() => indicator.follow(activeTab(), { instant: true }));
    observer.observe(root);
    for (const button of root.querySelectorAll('button')) observer.observe(button);
    return () => observer.disconnect();
  });

  $effect(() => () => indicator.destroy());
</script>

<div bind:this={root} class="tabs {className}" class:live={indicator.ready && hasActive} role="tablist" aria-label={label}>
  {#each tabs as tab (tab.value)}
    <button type="button" role="tab" aria-selected={value === tab.value} class:on={value === tab.value} onclick={() => (value = tab.value)}>
      {tab.label}{#if tab.count != null}<span class="n">{tab.count}</span>{/if}
    </button>
  {/each}
  {#if indicator.ready && hasActive}
    <span class="ind" aria-hidden="true" style="transform: translateX({indicator.x}px); width: {indicator.width}px"></span>
  {/if}
</div>

<style>
  /* the baseline is an inset shadow so the underline can sit on it inside the scroll box */
  .tabs { position: relative; display: flex; gap: 22px; box-shadow: inset 0 -1px 0 var(--border-subtle); overflow-x: auto; scrollbar-width: none; }
  .tabs button { position: relative; height: 40px; display: flex; align-items: center; gap: 7px; white-space: nowrap; font-weight: 500; color: var(--text-muted); transition: color var(--zelo-dur-fast), transform var(--zelo-dur-slow) var(--zelo-ease-spring); }
  .tabs button:active { transform: scale(var(--zelo-press-scale)); transition-duration: var(--zelo-dur-fast); }
  .tabs button.on { color: var(--text-main); }
  .tabs button.on::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; border-radius: 2px; background: var(--primary); }
  .tabs.live button.on::after { content: none; }
  .ind { position: absolute; left: 0; bottom: 0; height: 2px; border-radius: 2px; background: var(--primary); pointer-events: none; will-change: transform, width; }
  .tabs button:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--focus); border-radius: 6px; }
  .n { font: 500 11px/1 var(--zelo-font-num); color: var(--text-muted); opacity: 0.75; }
</style>

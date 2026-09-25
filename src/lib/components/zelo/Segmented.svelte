<script>
  /**
   * Segmented control (Retirada/Delivery, tabelas de preço). Zelo Design System → Segmented.
   * The active pill is a liquid indicator: its leading edge rides a stiff spring and the
   * trailing edge a soft one (docs/DESIGN_SYSTEM.md → Movimento). Until it is measured the
   * active button paints the pill itself, so SSR and no-JS look the same.
   */
  import { LiquidIndicator } from '$lib/motion/liquid.svelte.js';
  let { options = [], value = $bindable(), label = '', size = 'md', class: className = '' } = $props();

  let root = $state();
  const indicator = new LiquidIndicator();
  const activeButton = () => root?.querySelector('[aria-checked="true"]');
  const hasActive = $derived(options.some((option) => option.value === value));

  $effect(() => {
    value;
    options;
    indicator.follow(activeButton());
  });

  $effect(() => {
    if (!root || typeof ResizeObserver === 'undefined') return;
    options;
    const observer = new ResizeObserver(() => indicator.follow(activeButton(), { instant: true }));
    observer.observe(root);
    for (const button of root.querySelectorAll('button')) observer.observe(button);
    return () => observer.disconnect();
  });

  $effect(() => () => indicator.destroy());
</script>

<div bind:this={root} class="seg seg-{size} {className}" class:live={indicator.ready && hasActive} role="radiogroup" aria-label={label}>
  {#if indicator.ready && hasActive}
    <span class="ind" aria-hidden="true" style="transform: translateX({indicator.x}px); width: {indicator.width}px"></span>
  {/if}
  {#each options as option (option.value)}
    <button type="button" role="radio" aria-checked={value === option.value} class:on={value === option.value} onclick={() => (value = option.value)}>
      {#if option.icon}<option.icon size={18} strokeWidth={1.75} aria-hidden="true" />{/if}{option.label}
    </button>
  {/each}
</div>

<style>
  .seg { position: relative; display: inline-flex; gap: 2px; padding: 4px; border-radius: var(--zelo-radius-control); background: var(--bg-sunken); isolation: isolate; }
  .seg button { position: relative; z-index: 1; flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 14px; border-radius: var(--zelo-radius-seg); font-weight: 500; font-size: 13.5px; color: var(--text-muted); transition: background var(--zelo-dur-fast) var(--zelo-ease-out), color var(--zelo-dur-fast), transform var(--zelo-dur-slow) var(--zelo-ease-spring); }
  .seg button:active { transform: scale(var(--zelo-press-scale)); transition-duration: var(--zelo-dur-fast); }
  .seg-md button { height: 36px; } .seg-lg button { height: 40px; }
  .seg button.on { background: var(--bg-panel); color: var(--text-main); box-shadow: 0 0 0 1px var(--border-subtle); }
  /* measured: the indicator paints the pill, the button only carries the label */
  .seg.live button.on { background: transparent; }
  .seg.live button.on:not(:focus-visible) { box-shadow: none; }
  .ind { position: absolute; z-index: 0; top: 4px; bottom: 4px; left: 0; border-radius: var(--zelo-radius-seg); background: var(--bg-panel); box-shadow: 0 0 0 1px var(--border-subtle); pointer-events: none; will-change: transform, width; }
  .seg button:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--focus); }
</style>

<script>
  import { createEventDispatcher } from 'svelte';
  import { resolveAppIcon } from '$lib/icons/appIcons';
  import Kbd from '$lib/components/zelo/Kbd.svelte';

  const dispatch = createEventDispatcher();

  /** @type {Array<{id: string, label: string, icon?: string, shortcut?: string, taxPct?: number}>} */
  export let methods = [];
  export let selectedId = null;
  export let variant = 'default';
  export let showShortcuts = true;
  export let ariaLabel = 'Forma de pagamento';
  /** Zelo Design System layout (tiles with Kbd). Callers pass `$zeloSurface`; legacy markup stays untouched. */
  export let zelo = false;

  function select(method) {
    dispatch('select', method.id);
  }
</script>

{#if zelo}
  <div class="zpm-grid" role="group" aria-label={ariaLabel}>
    {#each methods as method (method.id)}
      <button
        type="button"
        class="zpm-tile"
        class:on={selectedId === method.id}
        on:click={() => select(method)}
        aria-pressed={selectedId === method.id}
      >
        <span class="zpm-top">
          <span class="zpm-icon" aria-hidden="true">
            <svelte:component this={resolveAppIcon(method.icon || 'plataformas')} class="size-5" strokeWidth={1.75} />
          </span>
          {#if method.taxPct != null}
            <span class="zpm-tax">{method.taxPct}%</span>
          {:else if showShortcuts && method.shortcut}
            <Kbd class="zpm-kbd">{method.shortcut}</Kbd>
          {/if}
        </span>
        <span class="zpm-label">{method.label}</span>
      </button>
    {/each}
  </div>
{:else}
  <div class:compact={variant === 'mesa'} class="payment-method-grid" role="group" aria-label={ariaLabel}>
    {#each methods as method (method.id)}
      <button
        type="button"
        class="payment-method-button"
        class:selected={selectedId === method.id}
        on:click={() => select(method)}
        aria-pressed={selectedId === method.id}
      >
        <span class="payment-method-icon" aria-hidden="true">
          <svelte:component this={resolveAppIcon(method.icon || 'plataformas')} class="size-5" />
        </span>
        <span class="payment-method-label">{method.label}</span>
        {#if method.taxPct != null}
          <span class="payment-method-tax">{method.taxPct}%</span>
        {:else if showShortcuts && method.shortcut}
          <span class="payment-method-shortcut">{method.shortcut}</span>
        {/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .payment-method-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 8px;
  }

  .payment-method-grid.compact {
    grid-template-columns: repeat(auto-fit, minmax(85px, 1fr));
    gap: 0.5rem;
  }

  .payment-method-button {
    position: relative;
    display: flex;
    min-height: 76px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 10px 6px;
    border: 1.5px solid var(--border-subtle);
    border-radius: 12px;
    background: var(--bg-input);
    color: var(--text-label);
    cursor: pointer;
    transition: border-color var(--transition-fast), background var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
  }

  .payment-method-button:hover {
    border-color: var(--border-strong);
    color: var(--text-main);
  }

  .payment-method-button.selected {
    border-color: var(--primary);
    background: var(--accent-light);
    color: var(--primary);
    box-shadow: 0 0 0 1px var(--primary), 0 0 12px color-mix(in srgb, var(--primary) 25%, transparent);
  }

  .payment-method-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .payment-method-label {
    max-width: 100%;
    overflow-wrap: anywhere;
    text-align: center;
    font-size: 0.8rem;
    font-weight: 600;
    line-height: 1.15;
    color: var(--text-main);
  }

  .payment-method-button.selected .payment-method-label {
    color: currentColor;
  }

  .payment-method-shortcut {
    position: absolute;
    top: 4px;
    right: 6px;
    font-size: 0.55rem;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text-muted);
    opacity: 0.7;
  }

  .payment-method-tax {
    border-radius: 99px;
    padding: 1px 6px;
    background: color-mix(in srgb, var(--warning) 15%, transparent);
    color: var(--warning);
    font-size: 0.65rem;
    font-weight: 700;
  }

  /* ─── Zelo Design System (tiles in the ProductTile language) ─── */
  .zpm-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .zpm-tile {
    display: flex;
    min-height: 78px;
    flex-direction: column;
    justify-content: space-between;
    gap: 10px;
    padding: 12px;
    text-align: left;
    border-radius: var(--zelo-radius-card);
    border: 1px solid var(--border-card);
    background: var(--bg-card);
    color: var(--text-label);
    cursor: pointer;
    transition: border-color var(--zelo-dur-fast), box-shadow var(--zelo-dur-fast), transform var(--zelo-dur-slow) var(--zelo-ease-spring);
  }
  .zpm-tile:hover { border-color: var(--border-strong); }
  .zpm-tile:active { transform: scale(var(--zelo-press-scale)); transition-duration: var(--zelo-dur-fast); }
  .zpm-tile:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--focus); }
  .zpm-tile.on { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); color: var(--text-main); }
  .zpm-tile.on:focus-visible { box-shadow: 0 0 0 1px var(--primary), 0 0 0 5px var(--focus); }
  .zpm-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 6px; }
  .zpm-icon { display: inline-flex; line-height: 1; }
  .zpm-label { font-size: 13.5px; font-weight: 500; line-height: 1.25; color: var(--text-main); overflow-wrap: anywhere; }
  .zpm-tax {
    display: inline-flex; align-items: center; height: 22px; padding: 0 7px;
    border-radius: var(--zelo-radius-pill); border: 1px solid var(--status-warning-border);
    background: var(--status-warning-bg); color: var(--status-warning-text);
    font: var(--type-kbd); letter-spacing: var(--type-kbd-tracking);
  }
  .zpm-tile.on :global(.zpm-kbd) { border-color: var(--border-strong); color: var(--text-main); }
  @media (max-width: 767px) {
    .zpm-tile { min-height: 64px; gap: 6px; padding: 10px; }
    .zpm-label { font-size: 13px; }
    .zpm-tile :global(.zpm-kbd) { display: none; } /* shortcuts are for the keyboard; phones hide them */
  }
  @media (max-width: 340px) {
    .zpm-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .zpm-tile { transition: none; }
    .zpm-tile:active { transform: none; }
  }

  .compact .payment-method-button {
    min-height: 72px;
    gap: 0.35rem;
    padding: 0.75rem 0.5rem;
    border-width: 2px;
  }
</style>

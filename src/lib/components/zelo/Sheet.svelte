<!--
  Zelo Design System → Sheet (dialog container).
  Centered panel on desktop, bottom sheet on mobile (≤767px, above the mobile bottom nav).
  Purely presentational: it owns no state and no focus policy. Each modal keeps its own
  behaviour and plugs it in through the props below, so migrating a modal never changes it:
    - `backdropAction` / `panelAction`: Svelte actions applied to the backdrop / panel
      (focus-on-mount, focus trap, prefill…), exactly as the modal applied them before.
    - `on:backdrop`: click on the dim area itself (the old `on:click|self`); omit to ignore.
    - `on:keydown`: forwarded from the backdrop (Escape, Ctrl+Enter…).
    - `on:close`: the header close button (only rendered when `closable`).
  Written in legacy syntax (slots) because the PDV modals that use it are legacy components.
  Content classes styled here, for slot content: .zsheet-body, .zsheet-footer, .zsheet-form,
  .z-field, .z-label, .z-input, .z-money, .z-hint, .z-error, .z-alert, .z-check, .z-select.
  docs/DESIGN_SYSTEM.md → Catálogo de componentes.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import { X } from 'lucide-svelte';

  /** id of the element that names the dialog (usually the title below). */
  export let labelledby;
  export let describedby = undefined;
  /** Title text; omit and use the `header` slot for a custom header. */
  export let title = '';
  /** Small label above the title. */
  export let eyebrow = '';
  /** sm 440px · md 520px · lg 600px (desktop width). */
  export let size = 'md';
  /** Stacking order — keep each modal's previous value (PDV: 50, montável: 80, cadastro: 200). */
  export let z = 50;
  /** Stacking order on mobile, where the /app comanda sheet (z 60) may be open underneath. */
  export let zMobile = Math.max(z, 70);
  /** Renders the header close button (dispatches `close`). */
  export let closable = false;
  export let closeLabel = 'Fechar';
  /** Attributes for the backdrop / panel (data-update-safe, role, aria-label…). */
  export let backdropProps = {};
  export let panelProps = {};
  /** Svelte actions for backdrop / panel (see header comment). */
  export let backdropAction = noop;
  export let panelAction = noop;

  const dispatch = createEventDispatcher();

  function noop() {
    return {};
  }

  function onBackdropClick(event) {
    if (event.target === event.currentTarget) dispatch('backdrop', event);
  }
</script>

<div
  class="zsheet-backdrop"
  style:--zsheet-z={z}
  style:--zsheet-z-mobile={zMobile}
  role="presentation"
  {...backdropProps}
  use:backdropAction
  on:click={onBackdropClick}
  on:keydown
>
  <div
    class="zsheet zsheet-{size}"
    role="dialog"
    aria-modal="true"
    aria-labelledby={labelledby}
    aria-describedby={describedby}
    {...panelProps}
    use:panelAction
  >
    <span class="zsheet-grab" aria-hidden="true"></span>
    <header class="zsheet-head">
      <div class="zsheet-titles">
        <slot name="header">
          {#if eyebrow}<p class="zsheet-eyebrow">{eyebrow}</p>{/if}
          <h2 id={labelledby} class="zsheet-title">{title}</h2>
        </slot>
        <slot name="subtitle" />
      </div>
      {#if closable}
        <button type="button" class="zsheet-close" aria-label={closeLabel} on:click={() => dispatch('close')}>
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      {/if}
    </header>
    <slot />
  </div>
</div>

<style>
  /* ── container ─────────────────────────────────────────────── */
  .zsheet-backdrop {
    position: fixed; inset: 0; z-index: var(--zsheet-z);
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
    background: color-mix(in srgb, var(--shadow-color) 42%, transparent);
  }
  .zsheet {
    position: relative;
    display: flex; flex-direction: column;
    width: 100%; max-height: min(88vh, 860px);
    overflow: hidden;
    background: var(--bg-panel);
    color: var(--text-main);
    font-family: var(--zelo-font-ui);
    border: 1px solid var(--border-subtle);
    border-radius: var(--zelo-radius-sheet);
    box-shadow: var(--shadow-modal);
  }
  .zsheet:focus { outline: none; }
  .zsheet-sm { max-width: 440px; }
  .zsheet-md { max-width: 520px; }
  .zsheet-lg { max-width: 600px; }
  .zsheet-grab { display: none; }

  .zsheet-head {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
    padding: 22px 24px 4px;
  }
  .zsheet-titles { min-width: 0; }
  .zsheet-titles :global(.zsheet-eyebrow),
  .zsheet-eyebrow { margin: 0 0 6px; color: var(--text-muted); font: var(--type-eyebrow); letter-spacing: var(--type-eyebrow-tracking); text-transform: uppercase; }
  .zsheet-titles :global(.zsheet-title),
  .zsheet-title { margin: 0; font: var(--type-heading); letter-spacing: var(--type-heading-tracking); overflow-wrap: anywhere; }
  .zsheet-titles :global(.zsheet-subtitle) { margin: 6px 0 0; color: var(--text-muted); font: var(--type-body); letter-spacing: var(--type-body-tracking); }
  .zsheet-close {
    flex: 0 0 auto; display: grid; place-items: center;
    width: 44px; height: 44px; margin: -8px -10px 0 0;
    border-radius: var(--zelo-radius-control);
    color: var(--text-label); background: transparent;
    transition: background var(--zelo-dur-fast) var(--zelo-ease-spring), color var(--zelo-dur-fast);
  }
  .zsheet-close:hover { background: var(--bg-sunken); color: var(--text-main); }
  .zsheet-close:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--focus); }

  /* ── content (slot) ────────────────────────────────────────── */
  .zsheet :global(.zsheet-form) { display: flex; flex-direction: column; min-height: 0; flex: 1 1 auto; }
  .zsheet :global(.zsheet-body) {
    display: flex; flex-direction: column; gap: 16px;
    min-height: 0; overflow-y: auto; overscroll-behavior: contain;
    padding: 14px 24px 22px;
    font: var(--type-body); letter-spacing: var(--type-body-tracking);
  }
  .zsheet :global(.zsheet-footer) {
    display: flex; align-items: center; justify-content: flex-end; gap: 10px;
    padding: 16px 24px 20px;
    border-top: 1px solid var(--border-subtle);
    background: var(--bg-panel);
  }
  .zsheet :global(.zsheet-footer > *) { min-width: 120px; }

  .zsheet :global(.z-field) { display: flex; flex-direction: column; gap: 6px; }
  .zsheet :global(.z-label) { color: var(--text-label); font: var(--type-label); letter-spacing: var(--type-label-tracking); }
  .zsheet :global(.z-label .z-optional) { color: var(--text-muted); font-weight: 400; }
  .zsheet :global(.z-hint) { margin: 0; color: var(--text-muted); font: var(--type-caption); letter-spacing: var(--type-caption-tracking); }
  .zsheet :global(.z-error) { margin: 0; color: var(--status-error-text); font: var(--type-caption); letter-spacing: var(--type-caption-tracking); }
  .zsheet :global(.z-alert) {
    margin: 0; padding: 10px 12px;
    border: 1px solid var(--status-error-border); border-radius: var(--zelo-radius-control);
    background: var(--status-error-bg); color: var(--status-error-text);
    font: var(--type-body); letter-spacing: var(--type-body-tracking);
  }

  /* 48px input, 12px radius, 4px focus ring */
  .zsheet :global(.z-input),
  .zsheet :global(.z-select) {
    display: block; width: 100%; height: 48px;
    padding: 0 14px;
    border: 1px solid var(--border-subtle); border-radius: var(--zelo-radius-control);
    background: var(--bg-input); color: var(--text-main);
    font: var(--type-body); letter-spacing: var(--type-body-tracking);
    outline: none;
    transition: border-color var(--zelo-dur-fast) var(--zelo-ease-spring), box-shadow var(--zelo-dur-fast) var(--zelo-ease-spring);
  }
  .zsheet :global(.z-select) { display: flex !important; align-items: center; justify-content: space-between; }
  .zsheet :global(.z-input::placeholder) { color: var(--text-muted); }
  .zsheet :global(.z-input:hover:not(:disabled)),
  .zsheet :global(.z-select:hover:not(:disabled)) { border-color: var(--border-strong); }
  .zsheet :global(.z-input:focus),
  .zsheet :global(.z-select:focus-visible),
  .zsheet :global(.z-money:focus-within) { border-color: var(--primary); box-shadow: 0 0 0 4px var(--focus); }
  .zsheet :global(.z-input:disabled),
  .zsheet :global(.z-select:disabled),
  .zsheet :global(.z-money:has(input:disabled)) { opacity: 0.55; cursor: not-allowed; }
  .zsheet :global(.z-input[aria-invalid='true']),
  .zsheet :global(.z-money:has(input[aria-invalid='true'])) { border-color: var(--status-error-text); }
  .zsheet :global(.z-input.z-num) { font-family: var(--zelo-font-num); font-variant-numeric: tabular-nums; }

  /* money: small "R$" in Geist + mono value */
  .zsheet :global(.z-money) {
    display: flex; align-items: center; gap: 8px;
    height: 56px; padding: 0 16px;
    border: 1px solid var(--border-subtle); border-radius: var(--zelo-radius-control);
    background: var(--bg-input);
    transition: border-color var(--zelo-dur-fast) var(--zelo-ease-spring), box-shadow var(--zelo-dur-fast) var(--zelo-ease-spring);
  }
  .zsheet :global(.z-money:hover) { border-color: var(--border-strong); }
  .zsheet :global(.z-money > span) { color: var(--text-muted); font: var(--type-label); letter-spacing: var(--type-label-tracking); }
  .zsheet :global(.z-money input) {
    flex: 1; width: 100%; min-width: 0; height: 100%;
    border: 0; outline: 0; padding: 0; background: none;
    color: var(--text-main);
    font: var(--type-num-lg); letter-spacing: var(--type-num-lg-tracking); font-variant-numeric: tabular-nums;
    appearance: textfield; -moz-appearance: textfield;
  }
  .zsheet :global(.z-money input:focus) { outline: 0; border: 0; box-shadow: none; }
  .zsheet :global(.z-money input::-webkit-outer-spin-button),
  .zsheet :global(.z-money input::-webkit-inner-spin-button) { -webkit-appearance: none; margin: 0; }
  .zsheet :global(.z-money input::placeholder) { color: var(--text-muted); }
  .zsheet :global(.z-money.z-money-sm) { height: 48px; }
  .zsheet :global(.z-money.z-money-sm input) { font: var(--type-num-md); letter-spacing: var(--type-num-md-tracking); font-variant-numeric: tabular-nums; }

  /* checkbox row (touch target ≥ 44px) */
  .zsheet :global(.z-check) {
    display: flex; align-items: flex-start; gap: 12px;
    min-height: 44px; padding: 11px 0;
    color: var(--text-main); font: var(--type-body); letter-spacing: var(--type-body-tracking);
    cursor: pointer;
  }
  .zsheet :global(.z-check input) { flex: 0 0 auto; margin-top: 1px; }
  .zsheet :global(.themed-checkbox) { width: 20px; height: 20px; border-radius: 6px; }
  .zsheet :global(.themed-radio) { width: 20px; height: 20px; }
  .zsheet :global(.themed-checkbox:checked),
  .zsheet :global(.themed-radio:checked) { box-shadow: none; }
  .zsheet :global(.themed-checkbox:focus-visible),
  .zsheet :global(.themed-radio:focus-visible) { box-shadow: 0 0 0 4px var(--focus); }
  .zsheet :global(.z-check small) { display: block; margin-top: 2px; color: var(--text-muted); font: var(--type-caption); letter-spacing: var(--type-caption-tracking); }

  /* ── mobile: bottom sheet above the bottom nav ─────────────── */
  @media (max-width: 767px) {
    .zsheet-backdrop {
      z-index: var(--zsheet-z-mobile);
      align-items: flex-end; padding: 0;
      bottom: var(--mobile-bottom-nav-offset);
    }
    .zsheet,
    .zsheet-sm, .zsheet-md, .zsheet-lg {
      max-width: none;
      max-height: calc(100dvh - var(--mobile-bottom-nav-offset) - 12px);
      border-width: 1px 0 0;
      border-radius: var(--zelo-radius-sheet) var(--zelo-radius-sheet) 0 0;
    }
    .zsheet-grab { display: block; flex: 0 0 auto; width: 40px; height: 5px; margin: 9px auto 0; border-radius: var(--zelo-radius-pill); background: var(--border-strong); }
    .zsheet-head { padding: 12px 16px 2px; }
    .zsheet :global(.zsheet-body) { padding: 12px 16px 18px; }
    .zsheet :global(.zsheet-footer) { padding: 12px 16px 16px; }
    .zsheet :global(.zsheet-footer > *) { flex: 1 1 0; min-width: 0; }
    .zsheet :global(.zsheet-footer > .z-primary) { flex-grow: 2; }
  }
</style>

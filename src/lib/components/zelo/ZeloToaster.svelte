<script>
  /**
   * Toast renderer for the Zelo surfaces (app + brand). Zelo Design System → Toast.
   * Fed by `addToast` (src/lib/stores/ui.js); the legacy surface keeps svelte-sonner.
   *
   * Look: the brand motion piece's "Caixa fechado" toast — a solid block in the
   * surface's action colour (navy on app, white on brand), monochrome icon per tone,
   * title, optional detail and a hairline that shows the time left.
   *
   * Position (bottom, centred on desktop, full width minus 12px gutters on mobile):
   *  - base: `--toast-offset` (already clears the mobile bottom nav / keyboard);
   *  - /app mobile with the floating "Ver comanda" bar (`.fc-cartbar`): above it,
   *    `--mobile-bottom-nav-offset + 86px` (bar = offset + 12px + 62px tall, + 12px gap);
   *  - when the offline pill (`[data-offline-status]`) is on screen: lifted 52px over it;
   *  - mobile with a modal open (`[aria-modal="true"]`, bottom sheets): at the top instead.
   * Hovering or focusing the stack, or hiding the tab, pauses every timer.
   */
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-svelte';
  import { zeloToasts, dismissZeloToast } from '$lib/stores/ui';

  const ICONS = { success: CircleCheck, error: CircleX, warning: TriangleAlert, info: Info };
  const LABELS = { success: 'Sucesso', error: 'Erro', warning: 'Atenção', info: 'Aviso' };

  const paused = writable(false);
  let hovered = $state(false);
  let focused = $state(false);
  let hidden = $state(false);
  let leaving = $state(new Set());

  $effect(() => { paused.set(hovered || focused || hidden); });

  function exitDuration() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--zelo-dur-fast').trim();
    const ms = raw.endsWith('ms') ? parseFloat(raw) : parseFloat(raw) * 1000;
    return Number.isFinite(ms) ? ms : 150;
  }

  function leave(id) {
    if (leaving.has(id)) return;
    leaving = new Set(leaving).add(id);
    setTimeout(() => {
      dismissZeloToast(id);
      const next = new Set(leaving); next.delete(id); leaving = next;
    }, exitDuration());
  }

  /** Auto-dismiss timer that honours the shared pause. */
  function lifetime(node, toast) {
    if (!toast.duration) return {};
    let remaining = toast.duration;
    let startedAt = 0;
    let timer = null;
    const run = () => { startedAt = performance.now(); timer = setTimeout(() => leave(toast.id), remaining); };
    const hold = () => { if (timer === null) return; clearTimeout(timer); timer = null; remaining -= performance.now() - startedAt; };
    const unsubscribe = paused.subscribe((isPaused) => (isPaused ? hold() : run()));
    return { destroy() { unsubscribe(); hold(); } };
  }

  onMount(() => {
    const onVisibility = () => { hidden = document.visibilityState === 'hidden'; };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  });
</script>

<section
  class="zt-region"
  class:paused={hovered || focused || hidden}
  aria-label="Notificações"
  aria-live="polite"
  onmouseenter={() => (hovered = true)}
  onmouseleave={() => (hovered = false)}
  onfocusin={() => (focused = true)}
  onfocusout={() => (focused = false)}
>
  {#each $zeloToasts as toast (toast.id)}
    {@const Icon = ICONS[toast.tone] || Info}
    <div class="zt" class:leaving={leaving.has(toast.id)} data-tone={toast.tone} role={toast.tone === 'error' ? 'alert' : undefined} use:lifetime={toast}>
      <span class="zt-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.75} /></span>
      <div class="zt-copy">
        <p class="zt-title"><span class="sr-only">{LABELS[toast.tone]}: </span>{toast.title}</p>
        {#if toast.detail}<p class="zt-detail">{toast.detail}</p>{/if}
      </div>
      <button type="button" class="zt-close" aria-label="Fechar aviso" onclick={() => leave(toast.id)}>
        <X size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {#if toast.duration}
        <span class="zt-track" aria-hidden="true"><span class="zt-bar" style:animation-duration="{toast.duration}ms"></span></span>
      {/if}
    </div>
  {/each}
</section>

<style>
  .zt-region {
    position: fixed;
    z-index: 1200;
    left: 50%;
    bottom: calc(var(--toast-offset) + var(--zt-lift, 0px));
    transform: translateX(-50%);
    width: min(26rem, calc(100vw - 32px));
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }
  :global(html:has([data-offline-status])) .zt-region { --zt-lift: 52px; }

  .zt {
    position: relative;
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    align-items: center;
    column-gap: 12px;
    min-height: 60px;
    padding: 14px 48px 16px 18px;
    border-radius: var(--zelo-radius-sheet);
    background: var(--primary);
    color: var(--primary-text);
    box-shadow: var(--elevation-float);
    pointer-events: auto;
    animation: zt-in var(--zelo-dur-base) var(--zelo-ease-spring) both;
  }
  .zt.leaving { animation: zt-out var(--zelo-dur-fast) var(--zelo-ease-out) both; }

  .zt-icon { display: grid; place-items: center; align-self: start; margin-top: 1px; }
  .zt-copy { min-width: 0; display: grid; gap: 3px; }
  .zt-title { margin: 0; font: var(--type-body-strong); letter-spacing: var(--type-body-strong-tracking); overflow-wrap: anywhere; }
  .zt-detail { margin: 0; font: var(--type-caption); letter-spacing: var(--type-caption-tracking); color: color-mix(in srgb, var(--primary-text) 70%, transparent); overflow-wrap: anywhere; }

  .zt-close {
    position: absolute;
    top: 50%;
    right: 8px;
    width: 32px;
    height: 32px;
    margin-top: -16px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: var(--zelo-radius-pill);
    background: transparent;
    color: color-mix(in srgb, var(--primary-text) 70%, transparent);
    cursor: pointer;
    transition: background var(--zelo-dur-fast) var(--zelo-ease-out), color var(--zelo-dur-fast) var(--zelo-ease-out);
  }
  .zt-close:hover { background: color-mix(in srgb, var(--primary-text) 12%, transparent); color: var(--primary-text); }
  .zt-close:focus-visible { outline: 2px solid var(--primary-text); outline-offset: -2px; }

  .zt-track {
    position: absolute;
    left: 18px;
    right: 18px;
    bottom: 7px;
    height: 2px;
    border-radius: 1px;
    overflow: hidden;
    background: color-mix(in srgb, var(--primary-text) 18%, transparent);
  }
  .zt-bar {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: color-mix(in srgb, var(--primary-text) 75%, transparent);
    transform-origin: left center;
    animation-name: zt-bar;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
  }
  .paused .zt-bar { animation-play-state: paused; }

  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

  @keyframes zt-in { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: none; } }
  @keyframes zt-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(8px) scale(0.98); } }
  @keyframes zt-bar { from { transform: scaleX(1); } to { transform: scaleX(0); } }

  @media (max-width: 767px) {
    .zt-region { left: 12px; right: 12px; width: auto; transform: none; }
    /* /app: sobe acima da barra flutuante "Ver comanda" (offset + 12px + 62px + 12px de respiro) */
    :global(html:has(.fc-cartbar)) .zt-region { bottom: calc(var(--mobile-bottom-nav-offset) + 86px + var(--zt-lift, 0px)); }
    /* a bottom sheet is open (payment, success, confirm…): the stack moves to the top so it never covers the sheet */
    :global(html:has([aria-modal="true"])) .zt-region { top: calc(12px + env(safe-area-inset-top, 0px)); bottom: auto; }
  }
</style>

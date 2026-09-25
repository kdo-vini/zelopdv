<script>
  /**
   * Button that morphs through an async action. Zelo Design System → MorphButton.
   *   idle    → the button (children, or `label`)
   *   loading → the shape shrinks to a circle and a spinner arc turns
   *   success → the arc gives way to a check that draws itself
   *   error   → back to full width in the danger colour with `errorLabel` (or the `error` snippet)
   * Content swaps with `blurSwap`; the shape morphs with the spring token; press squashes.
   * The parent owns `state` (e.g. `state = 'loading'` → await → 'success' → setTimeout → 'idle').
   *
   * Accessibility: the button keeps its focus and an accessible name in every state
   * (`aria-label` = state text while round), `aria-busy` while loading, `aria-disabled` and
   * ignored clicks while loading/success, and a polite live region announces the change.
   *
   * Usage (payment modal "Confirmar"):
   *   <MorphButton state={confirmState} size="cta" onclick={confirmar} loadingLabel="Registrando venda…" successLabel="Venda registrada">
   *     Confirmar<Kbd>Enter</Kbd>
   *   </MorphButton>
   */
  import { untrack } from 'svelte';
  import { CircleAlert } from 'lucide-svelte';
  import { blurSwap, drawStroke } from '$lib/motion/transitions.js';

  let {
    // prop is `state`; named `phase` locally because `state` would shadow the $state rune
    state: phase = 'idle',
    size = 'cta',
    align = 'center',
    label = '',
    loadingLabel = 'Processando…',
    successLabel = 'Concluído',
    errorLabel = 'Não deu certo. Tente de novo',
    type = 'button',
    disabled = false,
    onclick = undefined,
    children = undefined,
    error = undefined,
    ref = $bindable(null),
    class: className = '',
    ...rest
  } = $props();

  const round = $derived(phase === 'loading' || phase === 'success');
  const announcement = $derived(phase === 'loading' ? loadingLabel : phase === 'success' ? successLabel : phase === 'error' ? errorLabel : '');

  // Inline sizes collapse to the spinner when the idle content leaves: keep the idle width.
  let lockedWidth = $state(null);
  $effect.pre(() => {
    const leavingIdle = phase !== 'idle';
    untrack(() => {
      if (!leavingIdle) lockedWidth = null;
      else if (lockedWidth == null && ref) lockedWidth = ref.getBoundingClientRect().width;
    });
  });

  function handleClick(event) {
    if (round) {
      event.preventDefault();
      return;
    }
    onclick?.(event);
  }
</script>

<button
  {...rest}
  bind:this={ref}
  {type}
  class="mb mb-{size} align-{align} on-action {className}"
  class:round
  class:is-error={phase === 'error'}
  data-state={phase}
  disabled={disabled && !round}
  aria-busy={phase === 'loading'}
  aria-disabled={round || undefined}
  aria-label={round ? announcement : rest['aria-label']}
  style:min-width={lockedWidth != null ? `${lockedWidth}px` : undefined}
  onclick={handleClick}
>
  <span class="mb-shape" aria-hidden="true"></span>
  <span class="mb-stage">
    {#if phase === 'loading'}
      <span class="mb-layer mb-center" in:blurSwap out:blurSwap>
        <svg class="mb-spinner" viewBox="-16 -16 32 32" aria-hidden="true"><circle class="mb-track" r="11" /><circle class="mb-arc" r="11" pathLength="100" /></svg>
      </span>
    {:else if phase === 'success'}
      <span class="mb-layer mb-center" in:blurSwap out:blurSwap>
        <svg class="mb-check" viewBox="-16 -16 32 32" aria-hidden="true"><path d="M-9 0.5 L-3 6.5 L9.5 -6" in:drawStroke={{ delay: 110 }} /></svg>
      </span>
    {:else if phase === 'error'}
      <span class="mb-layer mb-content" in:blurSwap out:blurSwap>
        {#if error}{@render error()}{:else}<CircleAlert size={20} strokeWidth={1.75} aria-hidden="true" />{errorLabel}{/if}
      </span>
    {:else}
      <span class="mb-layer mb-content" in:blurSwap out:blurSwap>
        {#if children}{@render children()}{:else}{label}{/if}
      </span>
    {/if}
  </span>
</button>
<span class="mb-live" role="status" aria-live="polite">{announcement}</span>

<style>
  .mb {
    --mb-h: 40px;
    --mb-r: var(--zelo-radius-control);
    position: relative; isolation: isolate; display: inline-grid; height: var(--mb-h); min-width: var(--mb-h);
    padding: 0; border: 0; background: transparent; color: var(--primary-text); cursor: pointer;
    font: 600 14px/1 var(--zelo-font-ui); -webkit-tap-highlight-color: transparent;
    transition: transform var(--zelo-dur-slow) var(--zelo-ease-spring);
  }
  .mb-md { --mb-h: 40px; }
  .mb-touch { --mb-h: 48px; }
  .mb-cta { --mb-h: 64px; --mb-r: var(--zelo-radius-cta); width: 100%; font-size: 17px; }

  /* the one shape: morphs width, radius and colour; the button box itself never moves */
  .mb-shape {
    position: absolute; z-index: -1; top: 0; bottom: 0; left: 0; right: 0;
    border-radius: var(--mb-r); background: var(--primary);
    transition:
      left var(--zelo-dur-slow) var(--zelo-ease-spring),
      right var(--zelo-dur-slow) var(--zelo-ease-spring),
      border-radius var(--zelo-dur-slow) var(--zelo-ease-spring),
      background-color var(--zelo-dur-base) var(--zelo-ease-out),
      box-shadow var(--zelo-dur-fast);
  }
  .mb-cta .mb-shape { box-shadow: var(--elevation-float); }
  .mb:hover:not(.round):not(.is-error):not(:disabled) .mb-shape { background: var(--primary-hover); }
  .mb.round { cursor: progress; }
  .mb.round .mb-shape { left: calc(50% - var(--mb-h) / 2); right: calc(50% - var(--mb-h) / 2); border-radius: calc(var(--mb-h) / 2); }
  .mb.is-error { color: var(--destructive-foreground); }
  .mb.is-error .mb-shape, .mb.is-error:hover .mb-shape { background: var(--destructive); }
  .mb:focus-visible { outline: none; }
  .mb:focus-visible .mb-shape { box-shadow: 0 0 0 4px var(--focus); }
  .mb:disabled { cursor: not-allowed; opacity: 0.5; }

  /* press squash */
  .mb:active:not(.round):not(:disabled) { transform: scale(var(--zelo-press-scale)); transition-duration: var(--zelo-dur-fast); }

  /* content layers share one grid cell; blurSwap guarantees they never overlap visibly */
  .mb-stage { display: grid; width: 100%; height: 100%; min-width: 0; }
  .mb-layer { grid-area: 1 / 1; display: flex; align-items: center; gap: 12px; min-width: 0; padding: 0 16px; white-space: nowrap; }
  .mb-cta .mb-layer { padding: 0 20px; }
  .mb-content { justify-content: center; }
  .align-start .mb-content { justify-content: flex-start; }
  .mb-center { justify-content: center; padding: 0; }

  .mb-spinner, .mb-check { width: calc(var(--mb-h) * 0.5); height: calc(var(--mb-h) * 0.5); fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; }
  .mb-track { stroke-width: 2.4; opacity: 0.18; }
  .mb-arc { stroke-width: 2.4; stroke-dasharray: 28 100; transform-origin: center; animation: mb-spin 860ms linear infinite, mb-arc 1400ms ease-in-out infinite alternate; }
  .mb-check path { stroke-width: 2.6; }
  @keyframes mb-spin { from { transform: rotate(-90deg); } to { transform: rotate(270deg); } }
  @keyframes mb-arc { from { stroke-dasharray: 22 100; } to { stroke-dasharray: 52 100; } }
  /* reduced motion: the spinner still signals progress, just slower and without the breathing arc */
  @media (prefers-reduced-motion: reduce) { .mb-arc { animation: mb-spin 1600ms linear infinite; } }

  .mb-live { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
</style>

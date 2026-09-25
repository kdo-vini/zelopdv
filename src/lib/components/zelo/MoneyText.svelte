<script>
  /**
   * Money in pt-BR with the small "R$" prefix, mono and tabular. Zelo Design System → MoneyText.
   * `animate`: the number counts to each new value (critically damped, never overshoots) instead
   * of jumping; assistive tech reads only the final value. Skipped under reduced motion.
   */
  import { untrack } from 'svelte';
  import { Tween } from 'svelte/motion';
  import { springEasing, springSettleTime, SPRING_COUNT } from '$lib/motion/spring.js';
  import { reducedMotion } from '$lib/motion/transitions.js';

  let { value = 0, size = 'md', prefix = true, animate = false, class: className = '' } = $props();

  const toNumber = (v) => Number(v || 0);
  const format = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const COUNT_MS = Math.round(springSettleTime(SPRING_COUNT.omega, SPRING_COUNT.zeta) * 1000);
  const tween = new Tween(untrack(() => toNumber(value)), { duration: COUNT_MS, easing: springEasing(SPRING_COUNT.omega, SPRING_COUNT.zeta) });

  $effect(() => {
    const next = toNumber(value);
    if (animate && !reducedMotion()) tween.target = next;
    else tween.set(next, { duration: 0 });
  });

  const formatted = $derived(format(toNumber(value)));
  // round to cents while counting so the digits never show fractions of a centavo
  const shown = $derived(animate ? format(Math.round(tween.current * 100) / 100) : formatted);
</script>

<span class="money money-{size} {className}">{#if prefix}<small>R$</small>{/if}{#if animate}<span aria-hidden="true">{shown}</span><span class="vh">{formatted}</span>{:else}<span>{formatted}</span>{/if}</span>

<style>
  .money { position: relative; display: inline-flex; align-items: baseline; gap: 4px; }
  /* size = number role (docs/DESIGN_SYSTEM.md → Tipografia); `font` resets numeric variants, so set tabular after */
  .money-sm { font: var(--type-num-md); letter-spacing: var(--type-num-md-tracking); font-variant-numeric: tabular-nums; }
  .money-md { font: var(--type-num-lg); letter-spacing: var(--type-num-lg-tracking); font-variant-numeric: tabular-nums; }
  .money-lg { font: var(--type-num-xl); letter-spacing: var(--type-num-xl-tracking); font-variant-numeric: tabular-nums; }
  /* the "R$" prefix scales with the number (0.55em), in Geist */
  .money small { font-family: var(--type-label-font); font-weight: var(--type-label-weight); font-size: 0.55em; line-height: 1; color: var(--text-muted); letter-spacing: 0; }
  .money-sm small { font-size: var(--type-caption-size); }
  .vh { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
</style>

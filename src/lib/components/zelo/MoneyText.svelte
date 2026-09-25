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
  .money { position: relative; display: inline-flex; align-items: baseline; gap: 4px; font-family: var(--zelo-font-num); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; font-weight: 500; }
  .money small { font: 500 0.55em/1 var(--zelo-font-ui); color: var(--text-muted); letter-spacing: 0; }
  .money-sm { font-size: 14px; } .money-md { font-size: 20px; } .money-lg { font-size: 32px; letter-spacing: -0.03em; }
  .money-sm small { font-size: 12px; }
  .vh { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
</style>

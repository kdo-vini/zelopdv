<script>
  /** Quantity stepper. size: sm (30px, desktop) | lg (40px, touch). Zelo Design System → Stepper. */
  import { Minus, Plus } from 'lucide-svelte';
  let { value = $bindable(1), min = 0, size = 'sm', label = 'Quantidade', onchange = () => {} } = $props();
  function set(next) { value = Math.max(min, next); onchange(value); }
</script>

<div class="step step-{size}" role="group" aria-label={label}>
  <button type="button" aria-label="Diminuir" onclick={() => set(value - 1)} disabled={value <= min}><Minus size={16} strokeWidth={1.75} /></button>
  <span aria-live="polite">{value}</span>
  <button type="button" aria-label="Aumentar" onclick={() => set(value + 1)}><Plus size={16} strokeWidth={1.75} /></button>
</div>

<style>
  .step { display: inline-flex; align-items: center; border: 1px solid var(--border-subtle); border-radius: 9px; background: var(--bg-panel); }
  .step button { display: grid; place-items: center; color: var(--text-label); }
  .step button:hover:not(:disabled) { color: var(--text-main); }
  .step button:disabled { opacity: 0.4; }
  .step span { min-width: 24px; text-align: center; font: 500 13px/1 var(--zelo-font-num); color: var(--text-main); }
  .step-sm { height: 30px; } .step-sm button { width: 30px; height: 28px; }
  .step-lg { height: 40px; border-radius: var(--zelo-radius-control); } .step-lg button { width: 40px; height: 38px; } .step-lg span { font-size: 14.5px; }
</style>

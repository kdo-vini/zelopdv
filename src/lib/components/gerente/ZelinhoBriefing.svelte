<script>
  import { Sparkles } from 'lucide-svelte';
  import SignalCard from './SignalCard.svelte';
  import DaySnapshotSummary from './DaySnapshotSummary.svelte';
  export let signals = [];
  export let snapshot = null;
  export let learning = false;
  export let salesDays = 0;
  export let onRead = () => {};
  export let onAsk = () => {};
  $: critical = signals.some((signal) => signal.severity === 'critical');
  $: greeting = learning ? 'Estou conhecendo o ritmo do seu negócio.' : critical ? 'Tem alguns pontos que pedem sua atenção hoje.' : signals.length ? 'Separei o que vale acompanhar nas vendas de ontem.' : 'Ontem foi um dia tranquilo. Aqui está o resumo.';
</script>

<section class="briefing">
  <div class="briefing-intro"><div class="avatar"><Sparkles size={20} /></div><div><p class="eyebrow">ZELINHO GERENTE</p><h2>{greeting}</h2></div></div>
  {#if learning}<div class="learning"><span>Semana {Math.min(4, Math.max(1, Math.ceil(salesDays / 7)))} de 4</span><div><i style={`width: ${Math.min(100, salesDays / 28 * 100)}%`}></i></div><small>{salesDays} dias com venda de 28</small></div>{/if}
  {#if signals.length}<div class="briefing-signals">{#each signals.slice(0, 3) as signal, index}<div style={`animation-delay: ${index * 60}ms`} class="briefing-signal"><SignalCard {signal} {onRead} {onAsk} /></div>{/each}</div>{:else if snapshot}<DaySnapshotSummary {snapshot} />{/if}
</section>

<style>
  .briefing { border: 1px solid var(--border-card); border-top: 2px solid var(--primary); border-radius: 8px; background: var(--bg-card); padding: 18px; }.briefing-intro { display: flex; gap: 11px; align-items: center; }.avatar { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; color: var(--primary); background: var(--accent-light); }.eyebrow { margin: 0 0 3px; color: var(--text-muted); font-size: 10px; font-weight: 700; letter-spacing: .12em; }.briefing h2 { margin: 0; color: var(--text-main); font-size: 16px; line-height: 1.35; }.briefing-signals { display: grid; gap: 10px; margin-top: 18px; }.briefing-signal { animation: enter 280ms both ease-out; }.learning { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; margin: 18px 0; color: var(--text-muted); font-size: 12px; }.learning > div { overflow: hidden; height: 6px; border-radius: 6px; background: var(--border-subtle); }.learning i { display: block; height: 100%; background: var(--primary); }.learning small { font-size: 11px; }.briefing :global(.snapshot-grid) { margin-top: 18px; } @keyframes enter { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } } @media (prefers-reduced-motion: reduce) { .briefing-signal { animation: none; } }.learning { grid-template-columns: 1fr; gap: 5px; }
</style>


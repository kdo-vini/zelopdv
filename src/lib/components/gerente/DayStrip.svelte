<script>
  import { ArrowDownRight, ArrowUpRight } from 'lucide-svelte';
  /** Objeto de computeDayStrip (src/lib/gerente/dayStrip.js) ou null. */
  export let strip = null;
  const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
  const pct = (v) => `${Math.round(Math.abs(Number(v)) * 100)}%`;
  $: maxSpark = strip ? Math.max(1, ...strip.spark.map((p) => p.value)) : 1;
</script>

{#if strip}
  <div class="day" aria-label="Números de ontem">
    <div>
      <span class="l">Receita de ontem</span>
      <strong class="v tabular-nums">{money(strip.receita)}</strong>
      {#if strip.receitaDeltaPct == null}<span class="d flat">sem referência</span>
      {:else if strip.receitaDeltaPct < 0}<span class="d down"><ArrowDownRight size={12} aria-hidden="true" />{pct(strip.receitaDeltaPct)} abaixo da sua média</span>
      {:else}<span class="d up"><ArrowUpRight size={12} aria-hidden="true" />{pct(strip.receitaDeltaPct)} acima da sua média</span>{/if}
      <div class="spark" aria-hidden="true">{#each strip.spark as p (p.date)}<i class={p.kind} style={`height:${Math.max(10, Math.round((p.value / maxSpark) * 100))}%`}></i>{/each}</div>
    </div>
    <div><span class="l">Vendas</span><strong class="v tabular-nums">{strip.vendas}</strong><span class="d flat">{strip.vendasMedia == null ? 'sem referência' : `média ${strip.vendasMedia}`}</span></div>
    <div>
      <span class="l">Ticket médio</span>
      <strong class="v tabular-nums">{strip.ticket == null ? '—' : money(strip.ticket)}</strong>
      {#if strip.ticketDeltaPct == null}<span class="d flat">sem referência</span>
      {:else if strip.ticketDeltaPct < 0}<span class="d down"><ArrowDownRight size={12} aria-hidden="true" />{pct(strip.ticketDeltaPct)}</span>
      {:else}<span class="d up"><ArrowUpRight size={12} aria-hidden="true" />{pct(strip.ticketDeltaPct)}</span>{/if}
    </div>
    <div><span class="l">Recebido em Pix</span><strong class="v tabular-nums">{strip.pixShare == null ? '—' : pct(strip.pixShare)}</strong><span class="d flat">{strip.dinheiroShare == null ? 'sem pagamentos' : `dinheiro ${pct(strip.dinheiroShare)}`}</span></div>
  </div>
{/if}

<style>
  .day { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--border-card); border-radius: 12px; background: var(--bg-card); overflow: hidden; }
  .day > div { padding: 14px 16px; border-right: 1px solid var(--border-card); display: grid; gap: 2px; min-width: 0; }
  .day > div:last-child { border-right: 0; }
  .l { font-size: 12px; color: var(--text-muted); }
  .v { font-size: 20px; font-weight: 600; letter-spacing: -0.01em; color: var(--text-main); overflow-wrap: anywhere; }
  .d { font-size: 12px; display: inline-flex; align-items: center; gap: 4px; }
  .d.down { color: var(--status-error-text); } .d.up { color: var(--status-success-text); } .d.flat { color: var(--text-muted); }
  .spark { display: flex; align-items: flex-end; gap: 3px; height: 28px; margin-top: 6px; }
  .spark i { flex: 1; background: var(--border-strong); border-radius: 4px 4px 0 0; min-height: 3px; }
  .spark i.now { background: var(--primary); }
  @media (max-width: 720px) { .day { grid-template-columns: repeat(2, 1fr); } .day > div:nth-child(2) { border-right: 0; } .day > div:nth-child(-n+2) { border-bottom: 1px solid var(--border-card); } }
</style>

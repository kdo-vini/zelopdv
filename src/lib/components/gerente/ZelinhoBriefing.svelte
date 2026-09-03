<script>
  import SignalRow from './SignalRow.svelte';
  export let signals = [];
  export let learning = false;
  export let salesDays = 0;
  export let onRead = () => {};
  export let onAsk = () => {};
  export let onMute = () => {};
  export let onQuickAction = () => {};
  export let menuAtivo = false;
  $: week = Math.min(4, Math.max(1, Math.ceil(salesDays / 7)));
</script>

<section class="briefing" aria-labelledby="briefing-title">
  <div class="section-h"><h2 id="briefing-title">O que pede sua atenção</h2><a href="/gestao/gerente/preferencias">Silenciar tipos de aviso</a></div>
  {#if learning}<p class="learning">Ainda estou conhecendo seu ritmo: semana {week} de 4 ({salesDays} dias com venda de 28).</p>{/if}
  <div class="signals">
    {#if signals.length}
      {#each signals.slice(0, 3) as signal (signal.id)}<SignalRow {signal} {onRead} {onAsk} {onMute} {onQuickAction} {menuAtivo} />{/each}
    {:else}
      <p class="empty">Nada pede sua atenção hoje. Continue registrando as vendas e eu aviso quando algo mudar.</p>
    {/if}
  </div>
</section>

<style>
  .briefing { margin-top: 26px; }
  .section-h { display: flex; align-items: baseline; justify-content: space-between; margin: 0 0 10px; }
  .section-h h2 { margin: 0; font-size: 16px; font-weight: 600; color: var(--text-main); }
  .section-h a { font-size: 12px; color: var(--text-muted); text-decoration: none; min-height: 28px; display: inline-flex; align-items: center; }
  .section-h a:hover { color: var(--text-main); }
  .learning { margin: 0 0 10px; font-size: 12px; color: var(--text-muted); }
  .signals { border: 1px solid var(--border-card); border-radius: 12px; background: var(--bg-card); overflow: hidden; }
  .empty { margin: 0; padding: 18px; font-size: 13px; color: var(--text-muted); }
</style>

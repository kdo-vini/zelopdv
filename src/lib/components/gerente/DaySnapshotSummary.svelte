<script>
  import StatTile from './StatTile.svelte';
  export let snapshot = null;
  export let compact = false;
  const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
</script>

{#if snapshot}
  <div class:compact class="snapshot-grid">
    <StatTile label="Receita bruta" value={money(snapshot.receita_bruta)} />
    <StatTile label="Vendas" value={new Intl.NumberFormat('pt-BR').format(Number(snapshot.qtd_vendas) || 0)} />
    <StatTile label="Ticket médio" value={money(snapshot.ticket_medio)} />
  </div>
{/if}

<style>
  .snapshot-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .compact :global(.stat-tile) { padding: 10px; }
  @media (max-width: 520px) { .snapshot-grid { grid-template-columns: 1fr; } }
</style>


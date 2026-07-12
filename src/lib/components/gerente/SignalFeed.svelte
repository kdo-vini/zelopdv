<script>
  import SignalCard from './SignalCard.svelte';
  export let signals = [];
  export let snapshots = [];
  export let onRead = () => {};
  export let onAsk = () => {};
  const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(value) || 0);
  $: grouped = signals.reduce((groups, signal) => { (groups[signal.signal_date] ||= []).push(signal); return groups; }, {});
  $: dates = [...new Set([...Object.keys(grouped), ...snapshots.map((snapshot) => snapshot.snapshot_date)])].sort((a, b) => b.localeCompare(a));
  $: snapshotByDate = Object.fromEntries(snapshots.map((snapshot) => [snapshot.snapshot_date, snapshot]));
  const label = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' });
</script>

<section class="feed"><h2>Histórico</h2>{#each dates as date}<div class="day" id={date}><header>{label(date)}</header>{#if grouped[date]}<div class="day-signals">{#each grouped[date] as signal}<SignalCard {signal} {onRead} {onAsk} />{/each}</div>{:else if snapshotByDate[date]}<p class="quiet">Dia tranquilo · {money(snapshotByDate[date].receita_bruta)} em {snapshotByDate[date].qtd_vendas} vendas</p>{/if}</div>{/each}</section>

<style>
  .feed { margin-top: 28px; }.feed h2 { margin: 0 0 12px; color: var(--text-main); font-size: 16px; }.day { scroll-margin-top: 18px; margin-bottom: 17px; }.day header { position: sticky; top: 0; z-index: 1; padding: 7px 0; color: var(--text-muted); font-size: 12px; font-weight: 700; text-transform: capitalize; backdrop-filter: blur(8px); background: color-mix(in srgb, var(--bg-app) 84%, transparent); }.day-signals { display: grid; gap: 10px; }.quiet { margin: 0; padding: 12px; border: 1px dashed var(--border-strong); border-radius: 6px; color: var(--text-muted); font-size: 13px; }
</style>

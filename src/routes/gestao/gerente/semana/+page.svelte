<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { Copy, Share2, Sparkles } from 'lucide-svelte';
  import { supabase } from '$lib/supabaseClient.js';
  import { getAccessContext } from '$lib/accessControl.js';
  import { addToast } from '$lib/stores/ui.js';
  import { openAssistantWithContext } from '$lib/stores/assistant.js';
  import BackLink from '$lib/components/ui/BackLink.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import DonutChart from '$lib/components/charts/DonutChart.svelte';
  import StatTile from '$lib/components/gerente/StatTile.svelte';
  import DeltaPill from '$lib/components/gerente/DeltaPill.svelte';
  import WeekNav from '$lib/components/gerente/WeekNav.svelte';
  import { getSignalPresenter } from '$lib/gerente/signalPresenter.js';
  import { buildWeekReport, getWeekStart, normalizeWeekStart, shiftWeek } from '$lib/gerente/weekReport.js';

  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  const colors = ['var(--primary)', 'var(--status-success-text)', 'var(--status-warning-text)', 'var(--text-muted)', 'var(--border-strong)'];
  let loading = true;
  let error = '';
  let snapshots = [];
  let signals = [];
  $: currentWeek = getWeekStart();
  $: requestedWeek = $page.url.searchParams.get('semana');
  $: selectedWeek = normalizeWeekStart(requestedWeek, currentWeek);
  $: report = buildWeekReport(snapshots, signals, selectedWeek);
  $: weekLabel = `${shortDate.format(new Date(`${report.weekStart}T12:00:00Z`))} a ${shortDate.format(new Date(`${report.weekEnd}T12:00:00Z`))}`;
  $: oldestWeek = shiftWeek(currentWeek, -7);
  $: canGoBack = selectedWeek > oldestWeek;
  $: canGoForward = selectedWeek < currentWeek;
  $: chartData = report.daily.map((day) => ({ label: day.label, value: day.value, extra: `${day.vendas} vendas` }));
  $: donutData = report.paymentMix.map((entry, index) => ({ ...entry, color: colors[index % colors.length] }));

  function formatMoney(value) { return money.format(Number(value) || 0); }
  // Guards against NaN% when the week's top product has 0 receita (e.g. a free/promo item ranked first by quantity ties).
  function productBarWidth(product, topReceita) { return topReceita > 0 ? Math.max(8, (product.receita / topReceita) * 100) : 8; }
  function setWeek(week) { goto(`/gestao/gerente/semana?semana=${week}`); }
  function askZelinhoAboutWeek() {
    openAssistantWithContext({
      source: 'gerente-semana',
      title: `Resumo semanal: ${weekLabel}`,
      route: `/gestao/gerente/semana?semana=${selectedWeek}`,
      contextType: 'vendas',
      entity: { type: 'weekly_report', id: selectedWeek, name: weekLabel },
    });
  }
  function shareText() {
    return `Resumo semanal ZeloPDV (${weekLabel})\nReceita bruta: ${formatMoney(report.current.receita)}\nVendas: ${report.current.vendas}\nTicket médio: ${formatMoney(report.current.ticket)}\nResultado operacional aproximado: ${formatMoney(report.current.resultadoOperacional)} (não inclui o custo dos produtos).`;
  }
  async function copySummary() {
    try { await navigator.clipboard.writeText(shareText()); addToast('Resumo copiado.', 'success'); }
    catch { addToast('Não foi possível copiar o resumo.', 'error'); }
  }
  async function shareSummary() {
    const text = shareText();
    if (navigator.share) { try { await navigator.share({ text }); return; } catch (shareError) { if (shareError?.name === 'AbortError') return; } }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }
  async function load() {
    if (!supabase) { error = 'Não foi possível iniciar a conexão.'; loading = false; return; }
    try {
      const { data: userResult, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!userResult.user) throw new Error('Sessão expirada.');
      const access = await getAccessContext();
      const ownerUserId = access?.ownerUserId || userResult.user.id;
      const [{ data: profile, error: profileError }, { data: snapshotRows, error: snapshotsError }, { data: signalRows, error: signalsError }] = await Promise.all([
        supabase.from('empresa_perfil').select('intelligence_enabled_at').eq('user_id', ownerUserId).maybeSingle(),
        supabase.from('business_daily_snapshots').select('snapshot_date, receita_bruta, receita_realizada, qtd_vendas, ticket_medio, metrics').order('snapshot_date', { ascending: false }).limit(70),
        supabase.from('business_signals').select('id, signal_date, type, severity, narrative').order('signal_date', { ascending: false }).limit(200),
      ]);
      if (profileError) throw profileError;
      if (!profile?.intelligence_enabled_at) { error = 'O relatório semanal estará disponível quando o piloto for habilitado para esta empresa.'; return; }
      if (snapshotsError) throw snapshotsError;
      if (signalsError) throw signalsError;
      snapshots = snapshotRows || [];
      signals = signalRows || [];
    } catch (loadError) { error = loadError?.message || 'Não foi possível carregar o relatório semanal.'; }
    finally { loading = false; }
  }
  onMount(load);
</script>

<svelte:head><title>Resumo semanal | Zelinho Gerente</title></svelte:head>

<section class="week-page">
  <BackLink href="/gestao/gerente" label="Zelinho Gerente" />
  <div class="mb-6 flex items-end justify-between border-b  pb-4" style="border-color: var(--border-card);">
    <div><p class="text-[10px] font-bold uppercase tracking-[0.2em] mb-1" style="color: var(--text-muted);">Gestão / Zelinho</p><h1 class="text-xl font-bold tracking-tight" style="color: var(--text-main);">Resumo semanal</h1></div>
    {#if !loading && !error}<div class="share-actions"><Button variant="outline" size="sm" on:click={askZelinhoAboutWeek}><Sparkles />Perguntar ao Zelinho</Button><Button variant="outline" size="sm" on:click={copySummary}><Copy />Copiar resumo</Button><Button variant="outline" size="sm" on:click={shareSummary}><Share2 />WhatsApp</Button></div>{/if}
  </div>
  {#if loading}<div class="skeleton"></div>
  {:else if error}<div class="empty">{error}</div>
  {:else}
    <WeekNav label={weekLabel} {canGoBack} {canGoForward} onPrevious={() => setWeek(shiftWeek(selectedWeek, -1))} onNext={() => setWeek(shiftWeek(selectedWeek, 1))} />
    {#if report.isIncomplete}<p class="partial">Esta semana ainda tá aberta - números parciais até ontem.</p>{/if}
    <section class="opening"><p>{report.opening}</p></section>
    <div class="stat-grid">
      <div><StatTile label="Receita bruta" value={formatMoney(report.current.receita)} /><DeltaPill value={report.deltas.receita ?? 0} neutral={report.deltas.receita === null} /></div>
      <div><StatTile label="Vendas" value={report.current.vendas} /><DeltaPill value={report.deltas.vendas ?? 0} neutral={report.deltas.vendas === null} /></div>
      <div><StatTile label="Ticket médio" value={formatMoney(report.current.ticket)} /><DeltaPill value={report.deltas.ticket ?? 0} neutral={report.deltas.ticket === null} /></div>
      <div><StatTile label="Resultado operacional aproximado" value={formatMoney(report.current.resultadoOperacional)} detail="Não inclui o custo dos produtos." /><DeltaPill value={report.deltas.resultadoOperacional ?? 0} neutral={report.deltas.resultadoOperacional === null} /></div>
    </div>
    <section class="panel"><BarChart title="Receita por dia" data={chartData} barColor="bg-sky-500" /></section>
    <div class="split">
      <section class="panel"><h2>Produtos com mais saída</h2>{#if report.products.length}<ol class="products">{#each report.products as product}<li><div><strong>{product.nome}</strong><span>{formatMoney(product.receita)} · {product.qtd} itens</span></div><div class="product-rank"><i style={`width: ${productBarWidth(product, report.products[0].receita)}%`}></i><b class:up={product.positionChange > 0} class:down={product.positionChange < 0}>{product.positionChange > 0 ? `↑ ${product.positionChange}` : product.positionChange < 0 ? `↓ ${Math.abs(product.positionChange)}` : '—'}</b></div></li>{/each}</ol>{:else}<p class="muted">Ainda não há produtos vendidos nesta semana.</p>{/if}</section>
      <section class="panel"><DonutChart title="Formas de pagamento" data={donutData} size={150} />{#if report.paymentMixSentence}<p class="muted">{report.paymentMixSentence}</p>{/if}</section>
    </div>
    <section class="panel"><h2>Sinais da semana</h2>{#if report.signals.length}<ul class="signals">{#each report.signals as signal}<li><a href={`/gestao/gerente#${signal.signal_date}`}><span class={`tag ${signal.severity}`}>{signal.severity === 'critical' ? 'Precisa de você' : signal.severity === 'attention' ? 'Fica de olho' : 'Pra saber'}</span>{getSignalPresenter(signal).titulo}</a></li>{/each}</ul>{:else}<p class="muted">Nenhum aviso novo nesta semana.</p>{/if}</section>
    <section class="next"><h2>Pra semana que vem</h2><p>{report.nextWeek}</p></section>
  {/if}
</section>

<style>
  .week-page { max-width: 980px; margin: 0 auto; }.share-actions { display: flex; gap: 6px; }.partial { margin: 14px 0; padding: 8px 10px; border: 1px solid var(--status-warning-border); border-radius: 6px; background: var(--status-warning-bg); color: var(--text-label); font-size: 13px; }.opening, .panel, .next { margin-top: 16px; padding: 16px; border: 1px solid var(--border-card); border-radius: 8px; background: var(--bg-card); }.opening { border-top: 2px solid var(--primary); color: var(--text-label); }.stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 16px; }.stat-grid > div :global(.delta) { display: block; margin: 5px 2px 0; }.split { display: grid; grid-template-columns: 1.15fr .85fr; gap: 16px; }.panel h2, .next h2 { margin: 0 0 12px; color: var(--text-main); font-size: 14px; }.products, .signals { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }.products li { display: grid; grid-template-columns: minmax(0, 1fr) 42%; gap: 12px; align-items: center; }.products strong, .products span { display: block; }.products strong { color: var(--text-label); font-size: 13px; }.products span, .muted { color: var(--text-muted); font-size: 12px; }.product-rank { display: flex; align-items: center; gap: 6px; }.product-rank i { display: block; height: 5px; min-width: 8px; background: var(--primary); border-radius: 4px; }.product-rank b { color: var(--text-muted); font-size: 12px; white-space: nowrap; }.product-rank b.up { color: var(--status-success-text); }.product-rank b.down { color: var(--status-warning-text); }.signals a { display: flex; align-items: center; gap: 8px; color: var(--text-label); font-size: 13px; text-decoration: none; }.signals a:hover { color: var(--primary); }.tag { padding: 2px 7px; border-radius: 99px; font-size: 9px; font-weight: 700; text-transform: uppercase; }.tag.critical { color: var(--status-error-text); background: var(--status-error-bg); }.tag.attention { color: var(--status-warning-text); background: var(--status-warning-bg); }.tag.info { color: var(--primary); background: var(--accent-light); }.next p { color: var(--text-label); font-size: 13px; }.empty, .skeleton { min-height: 160px; display: grid; place-items: center; margin-top: 16px; border: 1px dashed var(--border-strong); border-radius: 8px; color: var(--text-muted); }.skeleton { animation: pulse 1.2s ease-in-out infinite; background: var(--bg-panel); } @keyframes pulse { 50% { opacity: .5; } } @media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } } @media (max-width: 700px) { .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.split { grid-template-columns: 1fr; }.share-actions { flex-wrap: wrap; justify-content: flex-end; } } @media (max-width: 420px) { .share-actions :global(button) { padding-inline: 7px; }.week-page { max-width: 100%; } }
  .share-actions :global(button) { min-height: 44px; }
</style>

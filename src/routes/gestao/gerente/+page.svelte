<script>
  import { onMount } from 'svelte';
  import { CloudOff, RefreshCw } from 'lucide-svelte';
  import { supabase } from '$lib/supabaseClient.js';
  import { getAccessContext } from '$lib/accessControl.js';
  import { addToast } from '$lib/stores/ui.js';
  import { markRead } from '$lib/stores/gerente.js';
  import ZelinhoBriefing from '$lib/components/gerente/ZelinhoBriefing.svelte';
  import SignalFeed from '$lib/components/gerente/SignalFeed.svelte';
  let loading = true;
  let refreshing = false;
  let error = '';
  let failures = 0;
  let enabled = false;
  let signals = [];
  let snapshots = [];
  let profile = null;
  $: latestSnapshot = snapshots[0] || null;
  $: latestDate = latestSnapshot?.snapshot_date || signals[0]?.signal_date || null;
  $: todaySignals = signals.filter((signal) => signal.signal_date === latestDate);
  $: salesDays = snapshots.filter((snapshot) => Number(snapshot.qtd_vendas) > 0).length;
  $: learning = salesDays < 28;
  $: analysedAt = latestSnapshot?.computed_at ? new Date(latestSnapshot.computed_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;

  async function load({ silent = false } = {}) {
    if (!supabase) { error = 'Não foi possível iniciar a conexão.'; loading = false; return; }
    if (!silent) loading = true;
    error = '';
    try {
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!userData.user) throw new Error('Sessão expirada.');
      const access = await getAccessContext();
      const ownerUserId = access?.ownerUserId || userData.user.id;
      const [{ data: perfil, error: profileError }, { data: signalRows, error: signalsError }, { data: snapshotRows, error: snapshotsError }] = await Promise.all([
        supabase.from('empresa_perfil').select('intelligence_enabled_at').eq('user_id', ownerUserId).maybeSingle(),
        supabase.from('business_signals').select('id, signal_date, type, severity, confidence, evidence, narrative, narrative_source, read_at, created_at').order('signal_date', { ascending: false }).limit(200),
        supabase.from('business_daily_snapshots').select('snapshot_date, receita_bruta, qtd_vendas, ticket_medio, computed_at').order('snapshot_date', { ascending: false }).limit(56),
      ]);
      if (profileError) throw profileError;
      profile = perfil;
      enabled = Boolean(perfil?.intelligence_enabled_at);
      if (!enabled) return;
      if (signalsError) throw signalsError;
      if (snapshotsError) throw snapshotsError;
      signals = signalRows || [];
      snapshots = snapshotRows || [];
      failures = 0;
    } catch (loadError) {
      error = loadError?.message || 'Não foi possível carregar o gerente.';
      failures += 1;
      if (failures >= 2) addToast('O Zelinho ainda não conseguiu atualizar os dados.', 'error');
    } finally { loading = false; refreshing = false; }
  }
  async function read(signalId) { const signal = signals.find((item) => item.id === signalId); if (!signal || signal.read_at) return; signal.read_at = new Date().toISOString(); signals = [...signals]; try { await markRead([signalId], supabase); } catch { addToast('Não foi possível marcar o aviso como lido.', 'warning'); } }
  function ask() { addToast('O contexto deste aviso estará disponível no chat em breve.', 'info'); }
  function refresh() { refreshing = true; load({ silent: true }); }
  onMount(() => { load(); const visibility = () => { if (document.visibilityState === 'visible') load({ silent: true }); }; document.addEventListener('visibilitychange', visibility); return () => document.removeEventListener('visibilitychange', visibility); });
</script>

<svelte:head><title>Zelinho Gerente | ZeloPDV</title></svelte:head>
<section class="manager-page">
  <div class="mb-6 flex items-end justify-between border-b border-slate-700/60 pb-4"><div><p class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">Gestão / Zelinho</p><h1 class="text-xl font-bold text-slate-100 tracking-tight">Zelinho Gerente</h1></div>{#if enabled && analysedAt}<button class="refresh" on:click={refresh} disabled={refreshing} title="Atualizar dados">Analisado às {analysedAt}<span class:spinning={refreshing}><RefreshCw size={15} /></span></button>{/if}</div>
  {#if loading}<div class="skeleton hero"></div><div class="skeleton card"></div><div class="skeleton card"></div><div class="skeleton card"></div>
  {:else if error}<div class="error-state"><CloudOff size={56} /><p>{error}</p><button on:click={() => load()}>Tentar novamente</button></div>
  {:else if !enabled}<div class="empty-state"><h2>O Zelinho Gerente ainda não está disponível para esta empresa.</h2><p>Quando o piloto estiver habilitado, os resumos e avisos aparecerão aqui.</p></div>
  {:else}<ZelinhoBriefing signals={todaySignals} snapshot={latestSnapshot} {learning} {salesDays} onRead={read} onAsk={ask} /><SignalFeed {signals} {snapshots} onRead={read} onAsk={ask} />{/if}
</section>

<style>
  .manager-page { max-width: 900px; margin: 0 auto; }.refresh { display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; color: var(--text-muted); font-size: 12px; cursor: pointer; }.refresh:disabled { opacity: .6; }.spinning { animation: spin .7s linear infinite; }.skeleton { border-radius: 8px; background: var(--bg-panel); animation: pulse 1.2s ease-in-out infinite; }.skeleton.hero { height: 260px; }.skeleton.card { height: 136px; margin-top: 10px; border-left: 3px solid var(--border-strong); }.error-state, .empty-state { padding: 40px 20px; text-align: center; border: 1px dashed var(--border-strong); border-radius: 8px; color: var(--text-muted); }.error-state :global(svg) { color: var(--text-muted); }.error-state button { margin-top: 8px; border: 1px solid var(--border-strong); border-radius: 6px; background: var(--bg-input); color: var(--text-label); padding: 7px 10px; cursor: pointer; }.empty-state h2 { color: var(--text-main); font-size: 16px; } @keyframes pulse { 50% { opacity: .5; } } @keyframes spin { to { transform: rotate(360deg); } } @media (max-width: 520px) { .manager-page { max-width: 100%; } }
</style>

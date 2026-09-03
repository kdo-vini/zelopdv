<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { CloudOff, RefreshCw } from 'lucide-svelte';
  import { supabase } from '$lib/supabaseClient.js';
  import { getAccessContext } from '$lib/accessControl.js';
  import { hasZeloMenuAccess } from '$lib/guards.js';
  import { addToast } from '$lib/stores/ui.js';
  import { capturePostHogEvent } from '$lib/posthogClient.js';
  import { markRead } from '$lib/stores/gerente.js';
  import { openAssistantWithSignal, openAssistantWithMessage } from '$lib/stores/assistant.js';
  import { closeSupport } from '$lib/stores/support.js';
  import { computeDayStrip } from '$lib/gerente/dayStrip.js';
  import { buildGreeting } from '$lib/gerente/greeting.js';
  import DayStrip from '$lib/components/gerente/DayStrip.svelte';
  import ZelinhoBriefing from '$lib/components/gerente/ZelinhoBriefing.svelte';
  import SignalFeed from '$lib/components/gerente/SignalFeed.svelte';
  import AgentActionsList from '$lib/components/gerente/AgentActionsList.svelte';
  let loading = true;
  let refreshing = false;
  let error = '';
  let failures = 0;
  let signals = [];
  let menuAtivo = false;
  let snapshots = [];
  let profile = null;
  let ownerUserId = null;
  let loadVersion = 0;
  $: latestSnapshot = snapshots[0] || null;
  $: latestDate = latestSnapshot?.snapshot_date || signals[0]?.signal_date || null;
  $: todaySignals = signals.filter((signal) => signal.signal_date === latestDate);
  $: mutedTypes = Array.isArray(profile?.gerente_prefs?.muted_types) ? profile.gerente_prefs.muted_types : [];
  $: briefingSignals = todaySignals.filter((signal) => !mutedTypes.includes(signal.type));
  $: salesDays = snapshots.filter((snapshot) => Number(snapshot.qtd_vendas) > 0).length;
  $: learning = salesDays < 28;
  $: analysedAt = latestSnapshot?.computed_at ? new Date(latestSnapshot.computed_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;
  $: dayStrip = computeDayStrip(snapshots);
  $: greeting = buildGreeting({ nomeExibicao: profile?.nome_exibicao, dayStrip, signals: briefingSignals, hour: new Date().getHours() });
  $: tab = ['briefing', 'acoes', 'historico'].includes($page.url.searchParams.get('aba')) ? $page.url.searchParams.get('aba') : 'briefing';
  $: previousDays = snapshots.filter((s) => s.snapshot_date !== latestDate).slice(0, 3);

  function setTab(next) { goto(`?aba=${next}`, { replaceState: true, noScroll: true, keepFocus: true }); }
  function quick(mensagem) { closeSupport(); if (!openAssistantWithMessage(mensagem)) addToast('Não foi possível abrir o Zelinho.', 'error'); }
  const longDate = (date) => { const s = new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short', timeZone: 'UTC' }); return s.charAt(0).toUpperCase() + s.slice(1); };
  const money0 = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(v) || 0);

  async function load({ silent = false } = {}) {
    const requestVersion = ++loadVersion;
    if (!supabase) { error = 'Não foi possível iniciar a conexão.'; loading = false; return; }
    if (!silent) loading = true;
    error = '';
    try {
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!userData.user) throw new Error('Sessão expirada.');
      const access = await getAccessContext();
      ownerUserId = access?.ownerUserId || userData.user.id;
      const [{ data: perfil, error: profileError }, { data: signalRows, error: signalsError }, { data: snapshotRows, error: snapshotsError }, menuAccess] = await Promise.all([
        supabase.from('empresa_perfil').select('nome_exibicao, gerente_prefs').eq('user_id', ownerUserId).maybeSingle(),
        supabase.from('business_signals').select('id, signal_date, type, severity, confidence, evidence, narrative, narrative_source, read_at, created_at').order('signal_date', { ascending: false }).limit(200),
        supabase.from('business_daily_snapshots').select('snapshot_date, receita_bruta, receita_realizada, qtd_vendas, ticket_medio, metrics, computed_at').order('snapshot_date', { ascending: false }).limit(56),
        hasZeloMenuAccess(ownerUserId).catch(() => false),
      ]);
      if (requestVersion !== loadVersion) return;
      if (profileError) throw profileError;
      profile = perfil;
      if (signalsError) throw signalsError;
      if (snapshotsError) throw snapshotsError;
      signals = signalRows || [];
      snapshots = snapshotRows || [];
      menuAtivo = menuAccess === true;
      if (!silent) void capturePostHogEvent('gerente_briefing_view', { signal_count: signals.length, learning });
      failures = 0;
    } catch (loadError) {
      if (requestVersion !== loadVersion) return;
      error = loadError?.message || 'Não foi possível carregar o gerente.';
      failures += 1;
      if (failures >= 2) addToast('O Zelinho ainda não conseguiu atualizar os dados.', 'error');
    } finally {
      if (requestVersion === loadVersion) {
        loading = false;
        refreshing = false;
      }
    }
  }
  async function read(signalId) {
    const signal = signals.find((item) => item.id === signalId);
    if (!signal || signal.read_at) return;
    const previousReadAt = signal.read_at;
    signal.read_at = new Date().toISOString();
    signals = [...signals];
    try {
      await markRead([signalId], supabase, { signalType: signal.type, severity: signal.severity, mutedTypes });
    } catch {
      signal.read_at = previousReadAt;
      signals = [...signals];
      addToast('Não foi possível marcar o aviso como lido.', 'warning');
    }
  }
  async function mute(type) { if (!profile || !ownerUserId || ['CASH_DIFFERENCE_RECURRING', 'STOCK_ZERO_WITH_DEMAND'].includes(type)) { addToast('Esse aviso permanece sempre ativo.', 'info'); return; } const muted = [...new Set([...mutedTypes, type])]; const gerente_prefs = { ...(profile.gerente_prefs || {}), muted_types: muted }; const { error: muteError } = await supabase.from('empresa_perfil').update({ gerente_prefs }).eq('user_id', ownerUserId); if (muteError) { addToast('Não foi possível silenciar esse tipo.', 'error'); return; } profile = { ...profile, gerente_prefs }; addToast('Esse tipo foi silenciado no briefing e no WhatsApp.', 'success'); }
  function ask(signal) {
    closeSupport();
    if (!openAssistantWithSignal(signal)) addToast('Não foi possível abrir o contexto deste aviso.', 'error');
  }
  async function refresh(event) {
    event?.preventDefault();
    if (refreshing) return;
    refreshing = true;
    await load({ silent: true });
  }
  onMount(() => { load(); const visibility = () => { if (document.visibilityState === 'visible') load({ silent: true }); }; document.addEventListener('visibilitychange', visibility); return () => document.removeEventListener('visibilitychange', visibility); });
  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }
</script>

<svelte:head><title>Zelinho Gerente | ZeloPDV</title></svelte:head>
<section class="manager-page">
  <div class="head">
    <div>
      <p class="crumbs">Gestão <span>/ Zelinho Gerente</span></p>
      <h1>{greeting.title}</h1>
      <p class="lead">{greeting.lead}</p>
    </div>
    {#if analysedAt}<button type="button" class="meta" on:click={refresh} disabled={refreshing}><i class="dot" aria-hidden="true"></i>Analisado hoje às {analysedAt}</button>{/if}
  </div>

  <div class="tabs" role="tablist" aria-label="Seções do Zelinho">
    <button role="tab" class="tab" aria-selected={tab === 'briefing'} on:click={() => setTab('briefing')}>Briefing</button>
    <button role="tab" class="tab" aria-selected={tab === 'acoes'} on:click={() => setTab('acoes')}>Ações do Zelinho</button>
    <button role="tab" class="tab" aria-selected={tab === 'historico'} on:click={() => setTab('historico')}>Histórico</button>
    <a class="tab link" href="/gestao/gerente/semana">Resumo semanal</a>
    <a class="tab link" href="/gestao/gerente/preferencias">Preferências</a>
  </div>

  {#if loading}<div class="skeleton strip"></div><div class="skeleton row"></div><div class="skeleton row"></div>
  {:else if error}<div class="error-state"><CloudOff size={56} aria-hidden="true" /><p>{error}</p><button type="button" on:click={() => load()}>Tentar novamente</button></div>
  {:else if tab === 'briefing'}
    <DayStrip strip={dayStrip} />
    <ZelinhoBriefing signals={briefingSignals} {learning} {salesDays} {menuAtivo} onRead={read} onAsk={ask} onMute={mute} onQuickAction={quick} />
    {#if previousDays.length}
      <div class="section-h"><h2>Dias anteriores</h2><button type="button" class="linkish" on:click={() => setTab('historico')}>Ver histórico</button></div>
      {#each previousDays as day (day.snapshot_date)}<div class="hist"><b>{longDate(day.snapshot_date)}</b><span class="tabular-nums">{money0(day.receita_bruta)} em {day.qtd_vendas} vendas</span></div>{/each}
    {/if}
  {:else if tab === 'acoes'}
    <AgentActionsList {supabase} {getToken} onExample={quick} />
  {:else}
    <SignalFeed {signals} {snapshots} {mutedTypes} {menuAtivo} onRead={read} onAsk={ask} onMute={mute} onQuickAction={quick} />
  {/if}
</section>

<style>
  .manager-page { max-width: 880px; margin: 0 auto; }
  .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .crumbs { margin: 0 0 6px; font-size: 12px; color: var(--text-muted); }
  .crumbs span { color: var(--text-label); }
  h1 { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; color: var(--text-main); text-wrap: balance; }
  .lead { margin: 8px 0 0; color: var(--text-label); font-size: 16px; max-width: 60ch; }
  .meta { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; border: 0; background: transparent; color: var(--text-muted); font-size: 12px; cursor: pointer; }
  .meta:disabled { opacity: .6; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--status-success-text); }
  .tabs { display: flex; gap: 2px; margin: 22px 0 18px; padding: 3px; background: var(--bg-card); border: 1px solid var(--border-card); border-radius: 8px; width: max-content; max-width: 100%; overflow-x: auto; }
  .tab { min-height: 36px; padding: 0 14px; border: 0; border-radius: 6px; background: transparent; color: var(--text-muted); font-size: 13px; font-weight: 500; white-space: nowrap; text-decoration: none; display: inline-flex; align-items: center; cursor: pointer; transition: background 180ms cubic-bezier(.22,1,.36,1), color 180ms cubic-bezier(.22,1,.36,1); }
  .tab:hover { color: var(--text-main); }
  .tab[aria-selected="true"] { background: var(--bg-panel); color: var(--text-main); }
  .tab.link { color: var(--text-muted); }
  .section-h { display: flex; align-items: baseline; justify-content: space-between; margin: 26px 0 10px; }
  .section-h h2 { margin: 0; font-size: 16px; font-weight: 600; color: var(--text-main); }
  .linkish { border: 0; background: transparent; padding: 0; min-height: 28px; font-size: 12px; color: var(--text-muted); cursor: pointer; }
  .linkish:hover { color: var(--text-main); }
  .hist { display: flex; justify-content: space-between; gap: 12px; padding: 12px 16px; margin-bottom: 8px; border: 1px dashed var(--border-subtle); border-radius: 8px; color: var(--text-muted); font-size: 13px; }
  .hist b { color: var(--text-label); font-weight: 500; }
  .skeleton { border-radius: 12px; background: var(--bg-card); border: 1px solid var(--border-card); margin-bottom: 12px; }
  .skeleton.strip { height: 96px; } .skeleton.row { height: 88px; }
  .error-state { display: grid; place-items: center; gap: 10px; padding: 40px 0; color: var(--text-muted); }
  .error-state button { min-height: 44px; padding: 0 16px; border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-input); color: var(--text-main); cursor: pointer; }
  .tab:focus-visible, .meta:focus-visible, .linkish:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 30%, transparent); }
  @media (prefers-reduced-motion: reduce) { .tab { transition: none; } }
</style>

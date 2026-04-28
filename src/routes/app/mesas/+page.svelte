<script>
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabaseClient';
  import { hasMesasAddon } from '$lib/guards';
  import { addToast } from '$lib/stores/ui';

  let userId = '';
  let addonActive = false;
  let ready = false;
  let mesas = [];
  let comandasAbertas = new Map(); // mesa_id → created_at
  let loading = true;
  let opening = null;
  let now = Date.now();
  let tickInterval = null;

  // Filtro: 'todas' | 'livre' | 'ocupada' | 'fechando'
  let filtroStatus = 'todas';

  onMount(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id || '';
    if (!userId) {
      window.location.href = '/login';
      return;
    }

    addonActive = await hasMesasAddon(userId);
    ready = true;

    if (addonActive) {
      await loadMesas();
      // Tick a cada 30s pra manter o "aberta há Xmin" atualizado sem refetch
      tickInterval = setInterval(() => { now = Date.now(); }, 30000);
    }
  });

  onDestroy(() => {
    if (tickInterval) clearInterval(tickInterval);
  });

  async function loadMesas() {
    loading = true;
    const [mesasResp, comandasResp] = await Promise.all([
      supabase.from('mesas').select('*').eq('ativa', true).order('numero', { ascending: true }),
      supabase.from('comandas').select('id_mesa, created_at').eq('status', 'aberta'),
    ]);

    if (mesasResp.error) {
      addToast('Erro ao carregar mesas: ' + mesasResp.error.message, 'error');
    } else {
      mesas = mesasResp.data || [];
    }

    if (!comandasResp.error && comandasResp.data) {
      comandasAbertas = new Map(comandasResp.data.map(c => [c.id_mesa, c.created_at]));
    }

    loading = false;
  }

  async function abrirMesa(mesa) {
    if (opening) return;
    opening = mesa.id;

    // Look up an open comanda for this mesa
    const { data: existing, error: findErr } = await supabase
      .from('comandas')
      .select('id')
      .eq('id_mesa', mesa.id)
      .eq('status', 'aberta')
      .maybeSingle();

    if (findErr) {
      addToast('Erro ao abrir mesa: ' + findErr.message, 'error');
      opening = null;
      return;
    }

    if (existing?.id) {
      goto(`/app/mesas/${mesa.id}`);
      return;
    }

    // Create a new comanda
    const { error: insErr } = await supabase
      .from('comandas')
      .insert({
        id_mesa: mesa.id,
        id_usuario: userId,
        status: 'aberta',
        num_pessoas: 1,
      });

    if (insErr) {
      addToast('Erro ao criar comanda: ' + insErr.message, 'error');
      opening = null;
      return;
    }

    // Update mesa status to ocupada (best-effort)
    await supabase
      .from('mesas')
      .update({ status: 'ocupada' })
      .eq('id', mesa.id);

    goto(`/app/mesas/${mesa.id}`);
  }

  function statusLabel(s) {
    return ({ livre: 'Livre', ocupada: 'Ocupada', fechando: 'Fechando' })[s] || s;
  }

  function formatTempoAberto(createdAt, nowMs) {
    if (!createdAt) return null;
    const diffMin = Math.max(0, Math.floor((nowMs - new Date(createdAt).getTime()) / 60000));
    if (diffMin < 1) return 'agora';
    if (diffMin < 60) return `${diffMin}min`;
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return m === 0 ? `${h}h` : `${h}h${m}min`;
  }

  $: livres   = mesas.filter(m => m.status === 'livre').length;
  $: ocupadas = mesas.filter(m => m.status === 'ocupada').length;
  $: fechando = mesas.filter(m => m.status === 'fechando').length;
  $: mesasFiltradas = filtroStatus === 'todas'
    ? mesas
    : mesas.filter(m => m.status === filtroStatus);
</script>

<svelte:head>
  <title>Mesas — Zelo PDV</title>
</svelte:head>

<div class="page-shell">
  {#if !ready}
    <div class="centered-state">
      <p class="muted">Carregando…</p>
    </div>
  {:else if !addonActive}
    <div class="upsell-card">
      <div class="upsell-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="9" width="18" height="10" rx="2"/>
          <path d="M5 9V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M7 19v2M17 19v2" stroke-linecap="round"/>
        </svg>
      </div>
      <h1 class="upsell-title">Módulo Mesas não está ativo</h1>
      <p class="upsell-desc">
        Gerencie mesas, comandas e divisão de conta. <strong>+R$ 30/mês</strong> (total R$ 89/mês).
      </p>
      <a href="/assinatura?addon=mesas" class="btn-primary">Ativar Módulo Mesas</a>
    </div>
  {:else}
    <header class="map-header">
      <div class="header-titles">
        <h1 class="title">Mesas</h1>
        <div class="kpi-row" aria-label="Resumo do status das mesas">
          <span class="kpi-chip" data-status="livre">
            <span class="kpi-dot" aria-hidden="true"></span>
            <span class="kpi-num">{livres}</span> {livres === 1 ? 'livre' : 'livres'}
          </span>
          <span class="kpi-chip" data-status="ocupada">
            <span class="kpi-dot" aria-hidden="true"></span>
            <span class="kpi-num">{ocupadas}</span> {ocupadas === 1 ? 'ocupada' : 'ocupadas'}
          </span>
          {#if fechando > 0}
            <span class="kpi-chip" data-status="fechando">
              <span class="kpi-dot" aria-hidden="true"></span>
              <span class="kpi-num">{fechando}</span> fechando
            </span>
          {/if}
        </div>
      </div>
      <a href="/gestao/mesas" class="btn-secondary">
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.251l-1.18 2.044a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.113a7.047 7.047 0 0 1 0-2.228L1.821 7.773a1 1 0 0 1-.206-1.251l1.18-2.044a1 1 0 0 1 1.187-.447l1.598.54A6.993 6.993 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clip-rule="evenodd"/>
        </svg>
        Configurar mesas
      </a>
    </header>

    {#if mesas.length > 0}
      <div class="filtros" role="tablist" aria-label="Filtrar por status">
        {#each [
          { id: 'todas',    label: 'Todas',    count: mesas.length },
          { id: 'livre',    label: 'Livres',   count: livres },
          { id: 'ocupada',  label: 'Ocupadas', count: ocupadas },
          { id: 'fechando', label: 'Fechando', count: fechando },
        ] as f}
          <button
            type="button"
            class="filtro-chip"
            class:active={filtroStatus === f.id}
            on:click={() => filtroStatus = f.id}
            role="tab"
            aria-selected={filtroStatus === f.id}
          >
            {f.label}
            <span class="filtro-count">{f.count}</span>
          </button>
        {/each}
      </div>
    {/if}

    {#if loading}
      <p class="muted">Carregando mesas…</p>
    {:else if mesas.length === 0}
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
            <rect x="3" y="9" width="18" height="10" rx="2"/>
            <path d="M5 9V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M7 19v2M17 19v2" stroke-linecap="round"/>
          </svg>
        </div>
        <h2 class="empty-title">Nenhuma mesa cadastrada</h2>
        <p class="empty-desc">Cadastre suas mesas para começar a abrir comandas.</p>
        <a href="/gestao/mesas" class="btn-primary">+ Cadastrar mesas</a>
      </div>
    {:else if mesasFiltradas.length === 0}
      <div class="empty-state">
        <h2 class="empty-title">Nenhuma mesa neste status</h2>
        <p class="empty-desc">Tente outro filtro acima.</p>
      </div>
    {:else}
      <div class="mesa-grid">
        {#each mesasFiltradas as mesa (mesa.id)}
          {@const tempo = mesa.status === 'ocupada' || mesa.status === 'fechando'
            ? formatTempoAberto(comandasAbertas.get(mesa.id), now)
            : null}
          <button
            type="button"
            class="mesa-tile"
            data-status={mesa.status}
            on:click={() => abrirMesa(mesa)}
            disabled={opening === mesa.id}
            aria-label={`Mesa ${mesa.numero}, ${statusLabel(mesa.status)}`}
          >
            <div class="tile-top">
              <span class="tile-num">{mesa.numero}</span>
              <span class="tile-status">
                <span class="tile-status-dot" aria-hidden="true"></span>
                {statusLabel(mesa.status)}
              </span>
            </div>

            <div class="tile-mid">
              {#if mesa.capacidade}
                <span class="tile-meta">
                  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-7 8a7 7 0 0 1 14 0H3Z"/>
                  </svg>
                  {mesa.capacidade} {mesa.capacidade === 1 ? 'lugar' : 'lugares'}
                </span>
              {/if}
            </div>

            <div class="tile-bottom">
              {#if tempo}
                <span class="tile-meta">
                  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .2.08.39.22.53l3 3a.75.75 0 1 0 1.06-1.06l-2.78-2.78V5Z" clip-rule="evenodd"/>
                  </svg>
                  Aberta há {tempo}
                </span>
              {:else if opening === mesa.id}
                <span class="tile-meta loading-meta">Abrindo…</span>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .page-shell {
    height: 100%;
    padding: 1.25rem 1.5rem;
    box-sizing: border-box;
    overflow-y: auto;
  }

  .centered-state {
    height: 60vh;
    display: flex; align-items: center; justify-content: center;
  }
  .muted { color: var(--text-muted); }

  .upsell-card {
    max-width: 480px;
    margin: 4rem auto;
    padding: 2rem;
    text-align: center;
    border-radius: 16px;
    background: var(--bg-card);
    border: 1px solid var(--border-card);
  }
  .upsell-icon {
    display: flex; justify-content: center;
    color: var(--primary);
    margin-bottom: 0.75rem;
  }
  .upsell-icon svg { width: 48px; height: 48px; }
  .upsell-title { font-size: 1.5rem; font-weight: 700; color: var(--text-main); margin: 0 0 0.5rem; }
  .upsell-desc { color: var(--text-label); line-height: 1.5; margin-bottom: 1.5rem; }

  .map-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem;
  }
  .header-titles { display: flex; flex-direction: column; gap: 0.6rem; min-width: 0; }
  .title {
    font-size: 1.75rem; font-weight: 800; color: var(--text-main);
    margin: 0; letter-spacing: -0.02em;
  }

  .kpi-row {
    display: flex; flex-wrap: wrap; gap: 0.5rem;
  }
  .kpi-chip {
    display: inline-flex; align-items: center; gap: 0.5rem;
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    font-size: 0.78rem; font-weight: 600;
    background: var(--bg-card);
    color: var(--text-label);
    border: 1px solid var(--border-subtle);
  }
  .kpi-num { font-weight: 800; color: var(--text-main); }
  .kpi-dot {
    width: 8px; height: 8px;
    border-radius: 999px;
    background: currentColor;
    flex-shrink: 0;
  }
  .kpi-chip[data-status="livre"]    { color: var(--status-success-text); border-color: var(--status-success-border); background: var(--status-success-bg); }
  .kpi-chip[data-status="ocupada"]  { color: var(--status-error-text);   border-color: var(--status-error-border);   background: var(--status-error-bg); }
  .kpi-chip[data-status="fechando"] { color: var(--status-warning-text); border-color: var(--status-warning-border); background: var(--status-warning-bg); }
  .kpi-chip[data-status="livre"] .kpi-num    { color: var(--status-success-text); }
  .kpi-chip[data-status="ocupada"] .kpi-num  { color: var(--status-error-text); }
  .kpi-chip[data-status="fechando"] .kpi-num { color: var(--status-warning-text); }

  .filtros {
    display: flex; gap: 0.4rem; overflow-x: auto;
    padding-bottom: 0.5rem;
    margin-bottom: 1rem;
  }
  .filtro-chip {
    flex-shrink: 0;
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.45rem 0.95rem;
    background: var(--bg-input);
    color: var(--text-label);
    border: 1px solid var(--border-subtle);
    border-radius: 999px;
    font-size: 0.82rem; font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .filtro-chip:hover { color: var(--text-main); border-color: var(--border-strong); }
  .filtro-chip.active {
    background: var(--accent-light);
    color: var(--primary);
    border-color: var(--primary);
  }
  .filtro-count {
    font-size: 0.7rem; font-weight: 800;
    background: rgba(255,255,255,0.06);
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    min-width: 18px; text-align: center;
  }
  .filtro-chip.active .filtro-count {
    background: var(--primary);
    color: var(--primary-text);
  }

  .empty-state {
    max-width: 460px; margin: 3rem auto;
    padding: 2.5rem 2rem;
    text-align: center;
    background: var(--bg-card);
    border: 1px dashed var(--border-subtle);
    border-radius: 16px;
    display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
  }
  .empty-icon {
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }
  .empty-icon svg { width: 56px; height: 56px; }
  .empty-title { font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin: 0; }
  .empty-desc { color: var(--text-label); margin: 0 0 1rem; font-size: 0.9rem; }

  .mesa-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 0.85rem;
  }

  .mesa-tile {
    position: relative;
    display: flex; flex-direction: column;
    gap: 0.5rem;
    padding: 1rem 1.1rem;
    min-height: 150px;
    border-radius: 14px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-card);
    color: var(--text-main);
    cursor: pointer;
    transition: transform 0.12s, border-color 0.15s, box-shadow 0.15s;
    text-align: left;
    overflow: hidden;
  }
  .mesa-tile::before {
    content: '';
    position: absolute; left: 0; top: 0; bottom: 0;
    width: 4px;
    background: var(--border-strong);
  }
  .mesa-tile:hover {
    transform: translateY(-2px);
    border-color: var(--primary);
    box-shadow: 0 8px 20px rgba(0,0,0,0.25);
  }
  .mesa-tile:active { transform: translateY(0); }
  .mesa-tile:disabled { opacity: 0.55; cursor: progress; }

  .mesa-tile[data-status="livre"]::before    { background: var(--status-success-text); }
  .mesa-tile[data-status="ocupada"]::before  { background: var(--status-error-text); }
  .mesa-tile[data-status="fechando"]::before { background: var(--status-warning-text); }

  .mesa-tile[data-status="livre"]    { background: linear-gradient(180deg, var(--status-success-bg) 0%, var(--bg-card) 60%); }
  .mesa-tile[data-status="ocupada"]  { background: linear-gradient(180deg, var(--status-error-bg) 0%, var(--bg-card) 60%); }
  .mesa-tile[data-status="fechando"] { background: linear-gradient(180deg, var(--status-warning-bg) 0%, var(--bg-card) 60%); }

  .tile-top {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 0.5rem;
  }
  .tile-num {
    font-size: 1.85rem; font-weight: 800;
    color: var(--text-main);
    line-height: 1.05;
    letter-spacing: -0.02em;
  }
  .tile-status {
    display: inline-flex; align-items: center; gap: 0.35rem;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    font-size: 0.65rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
    border: 1px solid var(--border-subtle);
    background: var(--bg-input);
    color: var(--text-muted);
  }
  .tile-status-dot {
    width: 6px; height: 6px;
    border-radius: 999px;
    background: currentColor;
  }
  .mesa-tile[data-status="livre"] .tile-status    { color: var(--status-success-text); border-color: var(--status-success-border); background: var(--status-success-bg); }
  .mesa-tile[data-status="ocupada"] .tile-status  { color: var(--status-error-text);   border-color: var(--status-error-border);   background: var(--status-error-bg); }
  .mesa-tile[data-status="fechando"] .tile-status { color: var(--status-warning-text); border-color: var(--status-warning-border); background: var(--status-warning-bg); }

  .tile-mid { flex: 1; display: flex; align-items: flex-start; }
  .tile-bottom { display: flex; align-items: center; }
  .tile-meta {
    display: inline-flex; align-items: center; gap: 0.35rem;
    font-size: 0.78rem; color: var(--text-muted);
  }
  .tile-meta svg { width: 14px; height: 14px; flex-shrink: 0; }
  .loading-meta { color: var(--primary); font-weight: 600; }

  .btn-primary {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
    padding: 0.7rem 1.25rem;
    background: var(--primary); color: var(--primary-text);
    border: 1px solid var(--primary); border-radius: 10px;
    font-weight: 600; font-size: 0.9rem;
    text-decoration: none; cursor: pointer;
  }
  .btn-primary:hover { background: var(--primary-hover); border-color: var(--primary-hover); }
  .btn-primary svg { width: 16px; height: 16px; }

  .btn-secondary {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.55rem 1rem;
    background: var(--bg-input); color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    font-weight: 600; font-size: 0.85rem;
    text-decoration: none;
    transition: background 0.15s, border-color 0.15s;
  }
  .btn-secondary:hover { background: var(--bg-panel); border-color: var(--border-strong); }
  .btn-secondary svg { width: 16px; height: 16px; color: var(--text-muted); }

  @media (max-width: 768px) {
    /* top maior: hambúrguer da sidebar fica fixed em top:12px + 36px do botão */
    .page-shell { padding: 3.25rem 0.85rem 1.25rem; }
    .map-header { flex-direction: column; align-items: stretch; }
    .map-header .btn-secondary { align-self: flex-start; }
    .mesa-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.65rem; }
    .mesa-tile { min-height: 140px; padding: 0.95rem 1rem; }
    .tile-num { font-size: 1.7rem; }
    /* Toques maiores nos chips de filtro */
    .filtro-chip { padding: 0.6rem 1rem; font-size: 0.88rem; }
  }
</style>

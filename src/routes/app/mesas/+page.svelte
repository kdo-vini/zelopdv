<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabaseClient';
  import { hasMesasAddon } from '$lib/guards';
  import { addToast } from '$lib/stores/ui';

  let userId = '';
  let addonActive = false;
  let ready = false;
  let mesas = [];
  let loading = true;
  let opening = null;

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
    }
  });

  async function loadMesas() {
    loading = true;
    const { data, error } = await supabase
      .from('mesas')
      .select('*')
      .eq('ativa', true)
      .order('numero', { ascending: true });
    if (error) {
      addToast('Erro ao carregar mesas: ' + error.message, 'error');
    } else {
      mesas = data || [];
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

  $: livres   = mesas.filter(m => m.status === 'livre').length;
  $: ocupadas = mesas.filter(m => m.status === 'ocupada' || m.status === 'fechando').length;
</script>

<svelte:head>
  <title>Mesas — Zelo PDV</title>
</svelte:head>

{#if !ready}
  <div class="centered-state">
    <p style="color: var(--text-muted);">Carregando…</p>
  </div>
{:else if !addonActive}
  <div class="upsell-card">
    <div class="upsell-icon">🪑</div>
    <h1 class="upsell-title">Módulo Mesas não está ativo</h1>
    <p class="upsell-desc">
      Gerencie mesas, comandas e divisão de conta. <strong>+R$ 30/mês</strong> (total R$ 89/mês).
    </p>
    <a href="/assinatura?addon=mesas" class="btn-primary">Ativar Módulo Mesas</a>
  </div>
{:else}
  <header class="map-header">
    <div>
      <h1 class="title">Mesas</h1>
      <p class="subtitle">{livres} livre{livres === 1 ? '' : 's'} · {ocupadas} ocupada{ocupadas === 1 ? '' : 's'}</p>
    </div>
    <a href="/gestao/mesas" class="btn-secondary">Configurar mesas</a>
  </header>

  {#if loading}
    <p style="color: var(--text-muted);">Carregando mesas…</p>
  {:else if mesas.length === 0}
    <div class="empty-state">
      <p><strong>Nenhuma mesa ativa.</strong></p>
      <p style="color: var(--text-muted); margin-top: 0.5rem;">
        <a href="/gestao/mesas" style="color: var(--primary);">Cadastre suas mesas</a> para começar.
      </p>
    </div>
  {:else}
    <div class="mesa-grid">
      {#each mesas as mesa (mesa.id)}
        <button
          type="button"
          class="mesa-tile"
          data-status={mesa.status}
          on:click={() => abrirMesa(mesa)}
          disabled={opening === mesa.id}
          aria-label={`Mesa ${mesa.numero}, ${statusLabel(mesa.status)}`}
        >
          <span class="tile-num">{mesa.numero}</span>
          <span class="tile-status">{statusLabel(mesa.status)}</span>
          {#if mesa.capacidade}
            <span class="tile-cap">{mesa.capacidade} lug.</span>
          {/if}
          {#if opening === mesa.id}
            <span class="tile-loading">Abrindo…</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .centered-state {
    height: 60vh;
    display: flex; align-items: center; justify-content: center;
  }

  .upsell-card {
    max-width: 480px;
    margin: 4rem auto;
    padding: 2rem;
    text-align: center;
    border-radius: 16px;
    background: var(--bg-card);
    border: 1px solid var(--border-card);
  }
  .upsell-icon { font-size: 3rem; margin-bottom: 0.5rem; }
  .upsell-title { font-size: 1.5rem; font-weight: 700; color: var(--text-main); margin: 0 0 0.5rem; }
  .upsell-desc { color: var(--text-label); line-height: 1.5; margin-bottom: 1.5rem; }

  .map-header {
    display: flex; justify-content: space-between; align-items: flex-end;
    gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem;
  }
  .title { font-size: 1.75rem; font-weight: 800; color: var(--text-main); margin: 0; }
  .subtitle { font-size: 0.9rem; color: var(--text-label); margin: 0.25rem 0 0; }

  .empty-state {
    padding: 3rem 1rem;
    text-align: center;
    background: var(--bg-card);
    border: 1px dashed var(--border-subtle);
    border-radius: 12px;
  }

  .mesa-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.85rem;
  }

  .mesa-tile {
    display: flex; flex-direction: column; align-items: flex-start;
    gap: 0.4rem;
    padding: 1rem 1.1rem;
    min-height: 130px;
    border-radius: 14px;
    border: 2px solid var(--border-subtle);
    background: var(--bg-card);
    color: var(--text-main);
    cursor: pointer;
    transition: transform 0.12s, border-color 0.15s, background 0.15s;
    text-align: left;
  }
  .mesa-tile:hover { transform: translateY(-2px); border-color: var(--primary); }
  .mesa-tile:active { transform: translateY(0); }
  .mesa-tile:disabled { opacity: 0.55; cursor: progress; }

  .mesa-tile[data-status="livre"]    { border-color: rgba(34,197,94,0.45);  background: rgba(34,197,94,0.06); }
  .mesa-tile[data-status="ocupada"]  { border-color: rgba(239,68,68,0.45);  background: rgba(239,68,68,0.06); }
  .mesa-tile[data-status="fechando"] { border-color: rgba(245,158,11,0.45); background: rgba(245,158,11,0.06); }

  .tile-num {
    font-size: 1.85rem; font-weight: 800; color: var(--text-main);
    line-height: 1.05;
  }
  .tile-status {
    font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .mesa-tile[data-status="livre"]    .tile-status { color: #166534; }
  .mesa-tile[data-status="ocupada"]  .tile-status { color: #991b1b; }
  .mesa-tile[data-status="fechando"] .tile-status { color: #92400e; }

  .tile-cap { font-size: 0.75rem; color: var(--text-muted); margin-top: auto; }
  .tile-loading { font-size: 0.7rem; color: var(--primary); }

  .btn-primary {
    padding: 0.65rem 1.1rem;
    background: var(--primary); color: #fff;
    border: none; border-radius: 8px;
    font-weight: 600; font-size: 0.9rem;
    text-decoration: none; cursor: pointer;
    display: inline-block;
  }
  .btn-primary:hover { background: var(--primary-hover); }

  .btn-secondary {
    padding: 0.55rem 1rem;
    background: var(--bg-input); color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    font-weight: 500; font-size: 0.85rem;
    text-decoration: none;
  }
  .btn-secondary:hover { background: var(--bg-card); }
</style>

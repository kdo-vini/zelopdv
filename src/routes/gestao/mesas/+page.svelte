<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { hasMesasAddon, bounceSubUserMissingAddon } from '$lib/guards';
  import { getAccessContext } from '$lib/accessControl';
  import { addToast, confirmAction } from '$lib/stores/ui';

  let userId = '';
  let isSubUser = false;
  let addonActive = false;
  let ready = false;
  let mesas = [];
  let loading = true;
  let saving = false;

  // Busca + paginação
  let busca = '';
  let pagina = 1;
  const PAGE_SIZE = 10;

  // Form state
  let modalOpen = false;
  let editingId = null;
  let form = { numero: '', capacidade: '', ativa: true };

  onMount(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id || '';
    if (!userId) {
      window.location.href = '/login';
      return;
    }

    const ctx = await getAccessContext();
    isSubUser = !!ctx?.isSubUser;

    addonActive = await hasMesasAddon(userId);
    if (bounceSubUserMissingAddon({ addonActive, isSubUser, addonLabel: 'Mesas' })) return;
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
      .order('numero', { ascending: true });
    if (error) {
      addToast('Erro ao carregar mesas: ' + error.message, 'error');
    } else {
      mesas = data || [];
    }
    loading = false;
  }

  function openNew() {
    editingId = null;
    form = { numero: '', capacidade: '', ativa: true };
    modalOpen = true;
  }

  function openEdit(mesa) {
    editingId = mesa.id;
    form = {
      numero: mesa.numero || '',
      capacidade: mesa.capacidade ?? '',
      ativa: mesa.ativa ?? true,
    };
    modalOpen = true;
  }

  function closeModal() {
    modalOpen = false;
    editingId = null;
  }

  async function salvar() {
    if (!form.numero.trim()) {
      addToast('Informe o número/identificador da mesa.', 'warning');
      return;
    }
    saving = true;

    const payload = {
      numero: form.numero.trim(),
      capacidade: form.capacidade === '' ? null : Number(form.capacidade),
      ativa: !!form.ativa,
    };

    let result;
    if (editingId) {
      result = await supabase
        .from('mesas')
        .update(payload)
        .eq('id', editingId);
    } else {
      result = await supabase
        .from('mesas')
        .insert({ ...payload, id_usuario: userId });
    }

    saving = false;

    if (result.error) {
      const msg = result.error.message.includes('mesas_usuario_numero_unique')
        ? `Já existe uma mesa com o número "${payload.numero}".`
        : 'Erro ao salvar: ' + result.error.message;
      addToast(msg, 'error');
      return;
    }

    addToast(editingId ? 'Mesa atualizada.' : 'Mesa criada.', 'success');
    closeModal();
    await loadMesas();
  }

  async function excluir(mesa) {
    const ok = await confirmAction(
      'Excluir mesa',
      `Excluir a mesa "${mesa.numero}"? Esta ação não pode ser desfeita.`
    );
    if (!ok) return;

    const { error } = await supabase
      .from('mesas')
      .delete()
      .eq('id', mesa.id);

    if (error) {
      const msg = error.message.includes('foreign key')
        ? 'Não é possível excluir: existem comandas associadas a esta mesa.'
        : 'Erro ao excluir: ' + error.message;
      addToast(msg, 'error');
      return;
    }

    addToast('Mesa excluída.', 'success');
    await loadMesas();
  }

  function statusLabel(s) {
    return ({ livre: 'Livre', ocupada: 'Ocupada', fechando: 'Fechando' })[s] || s;
  }

  // Para mesa inativa, mostramos pill cinza "Inativa" no lugar do status real
  function tipoStatus(mesa) {
    if (!mesa.ativa) return 'inativa';
    return mesa.status || 'livre';
  }
  function labelStatus(mesa) {
    if (!mesa.ativa) return 'Inativa';
    return statusLabel(mesa.status);
  }

  $: mesasFiltradas = busca.trim()
    ? mesas.filter(m => String(m.numero).toLowerCase().includes(busca.trim().toLowerCase()))
    : mesas;
  $: totalPaginas = Math.max(1, Math.ceil(mesasFiltradas.length / PAGE_SIZE));
  $: paginaAtual = Math.min(pagina, totalPaginas);
  $: mesasNaPagina = mesasFiltradas.slice(
    (paginaAtual - 1) * PAGE_SIZE,
    paginaAtual * PAGE_SIZE
  );
  $: rangeStart = mesasFiltradas.length === 0 ? 0 : (paginaAtual - 1) * PAGE_SIZE + 1;
  $: rangeEnd = Math.min(paginaAtual * PAGE_SIZE, mesasFiltradas.length);
  $: { busca; pagina = 1; } // reset página quando busca muda
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
        O Módulo Mesas custa <strong>+R$ 30/mês</strong> e adiciona gestão de mesas, comandas
        e divisão de conta. Total: R$ 89/mês.
      </p>
      <a href="/assinatura?addon=mesas" class="btn-primary">Ativar Módulo Mesas</a>
    </div>
  {:else}
    <header class="page-header">
      <div class="header-text">
        <h1 class="title">Mesas do Salão</h1>
        <p class="subtitle">
          Gerencie as mesas disponíveis no seu estabelecimento,<br>
          capacidade de clientes e status atual para o PDV.
        </p>
      </div>
      <div class="header-actions">
        <div class="search-wrap">
          <svg class="search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M9 17a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm5.32-3.27 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
          <input
            type="search"
            class="search-input"
            placeholder="Buscar mesa por número..."
            bind:value={busca}
          />
        </div>
        <button class="btn-primary" on:click={openNew}>
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M10 3.5a.75.75 0 0 1 .75.75v5h5a.75.75 0 0 1 0 1.5h-5v5a.75.75 0 0 1-1.5 0v-5h-5a.75.75 0 0 1 0-1.5h5v-5A.75.75 0 0 1 10 3.5Z" clip-rule="evenodd"/>
          </svg>
          Nova Mesa
        </button>
      </div>
    </header>

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
        <p class="empty-desc">Clique em "Nova Mesa" para começar.</p>
      </div>
    {:else}
      <div class="table-card">
        <table class="mesas-table">
          <thead>
            <tr>
              <th class="th-num">Número</th>
              <th>Capacidade</th>
              <th>Status Padrão</th>
              <th class="th-actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {#each mesasNaPagina as mesa (mesa.id)}
              <tr class:inactive={!mesa.ativa}>
                <td class="td-num">
                  <span class="num-pill">{mesa.numero}</span>
                </td>
                <td class="td-cap">
                  <span class="cap-cell">
                    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2 16.5a5 5 0 1 1 10 0v.5H2v-.5Zm11-.5a6.97 6.97 0 0 0-.79-3.21A4 4 0 0 1 18 16.5v.5h-5v-1Z"/>
                    </svg>
                    <span>
                      {mesa.capacidade ?? '—'}
                      {mesa.capacidade === 1 ? 'Lugar' : 'Lugares'}
                    </span>
                  </span>
                </td>
                <td class="td-status">
                  <span class="status-pill" data-status={tipoStatus(mesa)}>
                    <span class="status-dot" aria-hidden="true"></span>
                    {labelStatus(mesa)}
                  </span>
                </td>
                <td class="td-actions">
                  <button
                    class="icon-btn"
                    on:click={() => openEdit(mesa)}
                    title="Editar"
                    aria-label="Editar mesa {mesa.numero}"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path d="M2.695 14.763 1.5 18.5l3.737-1.195 11.84-11.84a2.5 2.5 0 0 0-3.535-3.535L1.7 13.77l.995.992Z"/>
                    </svg>
                  </button>
                  <button
                    class="icon-btn icon-btn-danger"
                    on:click={() => excluir(mesa)}
                    title="Excluir"
                    aria-label="Excluir mesa {mesa.numero}"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 0 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clip-rule="evenodd"/>
                    </svg>
                  </button>
                </td>
              </tr>
            {/each}

            {#if mesasNaPagina.length === 0}
              <tr>
                <td colspan="4" class="td-empty">
                  Nenhuma mesa encontrada para "<strong>{busca}</strong>".
                </td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>

      <div class="page-footer">
        <p class="muted footer-count">
          Mostrando {rangeStart}{rangeEnd > rangeStart ? `-${rangeEnd}` : ''} de {mesasFiltradas.length} mesa{mesasFiltradas.length === 1 ? '' : 's'}
        </p>
        {#if totalPaginas > 1}
          <div class="pager">
            <button
              type="button"
              class="pager-btn"
              on:click={() => pagina = Math.max(1, paginaAtual - 1)}
              disabled={paginaAtual === 1}
              aria-label="Página anterior"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z" clip-rule="evenodd"/>
              </svg>
            </button>
            <button
              type="button"
              class="pager-btn"
              on:click={() => pagina = Math.min(totalPaginas, paginaAtual + 1)}
              disabled={paginaAtual === totalPaginas}
              aria-label="Próxima página"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clip-rule="evenodd"/>
              </svg>
            </button>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>

{#if modalOpen}
  <div class="modal-overlay" on:click|self={closeModal} role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="mesa-modal-title">
      <h2 id="mesa-modal-title" class="modal-title">
        {editingId ? 'Editar mesa' : 'Nova mesa'}
      </h2>

      <label class="field">
        <span class="field-label">Número / Identificador *</span>
        <input
          type="text"
          bind:value={form.numero}
          placeholder="Ex: 1, M2, Varanda"
          maxlength="20"
        />
      </label>

      <label class="field">
        <span class="field-label">Capacidade (lugares)</span>
        <input
          type="number"
          bind:value={form.capacidade}
          placeholder="Opcional"
          min="0"
          max="50"
        />
      </label>

      <label class="switch-row">
        <input type="checkbox" bind:checked={form.ativa} />
        <span class="switch-track" aria-hidden="true">
          <span class="switch-thumb"></span>
        </span>
        <span class="switch-label">Mesa ativa</span>
      </label>

      <div class="modal-actions">
        <button class="btn-secondary" on:click={closeModal}>Cancelar</button>
        <button class="btn-primary" on:click={salvar} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .page-shell {
    height: 100%;
    padding: 1.5rem 1.75rem;
    box-sizing: border-box;
    overflow-y: auto;
  }

  .centered-state {
    height: 60vh;
    display: flex; align-items: center; justify-content: center;
  }
  .muted { color: var(--text-muted); }

  /* === Upsell === */
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

  /* === Header === */
  .page-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 1.5rem; flex-wrap: wrap;
    margin-bottom: 1.5rem;
  }
  .header-text { flex: 1; min-width: 240px; }
  .title {
    font-size: 1.85rem; font-weight: 800; color: var(--text-main);
    margin: 0; letter-spacing: -0.02em;
    line-height: 1.15;
  }
  .subtitle {
    font-size: 0.92rem; color: var(--text-label);
    line-height: 1.5;
    margin: 0.5rem 0 0;
    max-width: 460px;
  }

  .header-actions {
    display: flex; align-items: center; gap: 0.75rem;
    flex-wrap: wrap;
  }

  .search-wrap { position: relative; }
  .search-icon {
    position: absolute; left: 0.85rem; top: 50%;
    transform: translateY(-50%);
    width: 16px; height: 16px;
    color: var(--text-muted);
    pointer-events: none;
  }
  .search-input {
    width: 280px;
    padding: 0.65rem 0.85rem 0.65rem 2.4rem;
    background: var(--bg-card);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    font-size: 0.9rem;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .search-input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--accent-light);
  }

  /* === Buttons === */
  .btn-primary {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem;
    padding: 0.7rem 1.25rem;
    background: linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%);
    color: var(--primary-text);
    border: none;
    border-radius: 10px;
    font-weight: 600; font-size: 0.9rem;
    text-decoration: none; cursor: pointer;
    box-shadow: 0 4px 12px -3px rgba(14, 165, 233, 0.45);
    transition: transform 0.1s, box-shadow 0.15s, filter 0.15s;
  }
  .btn-primary:hover { filter: brightness(1.07); box-shadow: 0 6px 16px -3px rgba(14, 165, 233, 0.55); }
  .btn-primary:active { transform: translateY(1px); }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; box-shadow: none; }
  .btn-primary svg { width: 16px; height: 16px; }

  .btn-secondary {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.65rem 1.1rem;
    background: var(--bg-input); color: var(--text-main);
    border: 1px solid var(--border-subtle); border-radius: 10px;
    font-weight: 600; font-size: 0.9rem; cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .btn-secondary:hover { background: var(--bg-panel); border-color: var(--border-strong); }

  /* === Empty state === */
  .empty-state {
    max-width: 460px; margin: 3rem auto;
    padding: 2.5rem 2rem;
    text-align: center;
    background: var(--bg-card);
    border: 1px dashed var(--border-subtle);
    border-radius: 16px;
    display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
  }
  .empty-icon { color: var(--text-muted); margin-bottom: 0.5rem; }
  .empty-icon svg { width: 56px; height: 56px; }
  .empty-title { font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin: 0; }
  .empty-desc { color: var(--text-label); margin: 0.25rem 0 0; font-size: 0.9rem; }

  /* === Table card === */
  .table-card {
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 16px;
    overflow: hidden;
  }
  .mesas-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
  }
  .mesas-table th {
    background: transparent;
    padding: 1rem 1.25rem;
    text-align: left;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-muted);
    font-weight: 700;
    border-bottom: 1px solid var(--border-subtle);
  }
  .mesas-table .th-actions { text-align: right; }

  .mesas-table td {
    padding: 1rem 1.25rem;
    color: var(--text-main);
    font-size: 0.92rem;
    border-bottom: 1px solid var(--border-subtle);
    vertical-align: middle;
  }
  .mesas-table tbody tr:last-child td { border-bottom: none; }
  .mesas-table tbody tr {
    transition: background 0.12s;
  }
  .mesas-table tbody tr:hover { background: rgba(255,255,255,0.02); }
  .mesas-table tr.inactive { opacity: 0.55; }

  .td-num { width: 110px; }
  .num-pill {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 44px;
    padding: 0.45rem 0.75rem;
    background: var(--accent-light);
    color: var(--primary);
    border-radius: 8px;
    font-weight: 800;
    font-size: 0.95rem;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }

  .cap-cell {
    display: inline-flex; align-items: center; gap: 0.5rem;
    color: var(--text-label);
    font-weight: 500;
  }
  .cap-cell svg {
    width: 16px; height: 16px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .status-pill {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.3rem 0.7rem;
    border-radius: 999px;
    font-size: 0.75rem; font-weight: 600;
    background: var(--bg-input);
    color: var(--text-muted);
    border: 1px solid var(--border-subtle);
  }
  .status-dot {
    width: 7px; height: 7px;
    border-radius: 999px;
    background: currentColor;
    flex-shrink: 0;
  }
  .status-pill[data-status="livre"] {
    background: var(--status-success-bg);
    color: var(--status-success-text);
    border-color: var(--status-success-border);
  }
  .status-pill[data-status="ocupada"] {
    background: var(--status-error-bg);
    color: var(--status-error-text);
    border-color: var(--status-error-border);
  }
  .status-pill[data-status="fechando"] {
    background: var(--status-warning-bg);
    color: var(--status-warning-text);
    border-color: var(--status-warning-border);
  }
  .status-pill[data-status="inativa"] {
    background: var(--bg-input);
    color: var(--text-muted);
    border-color: var(--border-subtle);
  }

  .td-actions {
    text-align: right;
    white-space: nowrap;
    width: 110px;
  }
  .icon-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 34px; height: 34px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--text-muted);
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
    margin-left: 0.25rem;
  }
  .icon-btn:hover {
    background: var(--bg-input);
    border-color: var(--border-subtle);
    color: var(--text-main);
  }
  .icon-btn-danger:hover {
    background: var(--status-error-bg);
    border-color: var(--status-error-border);
    color: var(--status-error-text);
  }
  .icon-btn svg { width: 16px; height: 16px; }

  .td-empty {
    text-align: center;
    color: var(--text-muted);
    padding: 2.5rem 1rem !important;
    font-size: 0.9rem;
  }

  /* === Footer === */
  .page-footer {
    display: flex; align-items: center; justify-content: space-between;
    gap: 1rem;
    margin-top: 1rem;
    padding: 0 0.25rem;
  }
  .footer-count { font-size: 0.85rem; margin: 0; }
  .pager { display: flex; gap: 0.5rem; }
  .pager-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 34px; height: 34px;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    color: var(--text-label);
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }
  .pager-btn:hover:not(:disabled) {
    background: var(--bg-panel);
    border-color: var(--border-strong);
    color: var(--text-main);
  }
  .pager-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .pager-btn svg { width: 16px; height: 16px; }

  /* === Modal === */
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
    z-index: 100;
    padding: 1rem;
    backdrop-filter: blur(2px);
  }
  .modal {
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 14px;
    padding: 1.5rem;
    width: 100%; max-width: 460px;
    display: flex; flex-direction: column; gap: 1rem;
    box-shadow: 0 20px 50px rgba(0,0,0,0.4);
  }
  .modal-title { font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin: 0; }

  .field { display: flex; flex-direction: column; gap: 0.4rem; }
  .field-label {
    font-size: 0.72rem; font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 0.06em;
  }
  .field input[type="text"], .field input[type="number"] {
    padding: 0.6rem 0.8rem;
    background: var(--bg-input);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    font-size: 0.95rem;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .field input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--accent-light);
  }

  /* Switch custom */
  .switch-row {
    display: inline-flex; align-items: center; gap: 0.65rem;
    cursor: pointer;
    user-select: none;
  }
  .switch-row input[type="checkbox"] {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .switch-track {
    position: relative;
    display: inline-block;
    width: 38px; height: 22px;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: 999px;
    transition: background 0.2s, border-color 0.2s;
    flex-shrink: 0;
  }
  .switch-thumb {
    position: absolute;
    top: 2px; left: 2px;
    width: 16px; height: 16px;
    background: var(--text-muted);
    border-radius: 999px;
    transition: transform 0.2s, background 0.2s;
  }
  .switch-row input:checked + .switch-track {
    background: var(--primary);
    border-color: var(--primary);
  }
  .switch-row input:checked + .switch-track .switch-thumb {
    transform: translateX(16px);
    background: var(--primary-text);
  }
  .switch-row input:focus-visible + .switch-track {
    box-shadow: 0 0 0 3px var(--accent-light);
  }
  .switch-label {
    font-size: 0.92rem;
    color: var(--text-main);
    font-weight: 500;
  }

  .modal-actions {
    display: flex; justify-content: flex-end; gap: 0.6rem;
    margin-top: 0.5rem;
  }

  /* === Mobile === */
  @media (max-width: 768px) {
    /* top maior: hambúrguer da sidebar */
    .page-shell { padding: 3.25rem 1rem 1.25rem; }
    .page-header { flex-direction: column; }
    .header-actions { width: 100%; }
    .search-wrap { flex: 1; }
    .search-input { width: 100%; }
    .mesas-table th,
    .mesas-table td { padding: 0.85rem 0.85rem; font-size: 0.85rem; }
    .td-cap .cap-cell span { display: none; }
    .td-cap .cap-cell::after {
      content: attr(data-cap);
      font-size: 0.85rem;
    }
    .icon-btn { width: 40px; height: 40px; }
  }
</style>

<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { hasMesasAddon } from '$lib/guards';
  import { addToast, confirmAction } from '$lib/stores/ui';

  let userId = '';
  let addonActive = false;
  let ready = false;
  let mesas = [];
  let loading = true;
  let saving = false;

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
</script>

<svelte:head>
  <title>Mesas — Zelo PDV</title>
</svelte:head>

{#if !ready}
  <div class="flex items-center justify-center h-full">
    <p style="color: var(--text-muted);">Carregando…</p>
  </div>
{:else if !addonActive}
  <div class="upsell-card">
    <div class="upsell-icon">🪑</div>
    <h1 class="upsell-title">Módulo Mesas não está ativo</h1>
    <p class="upsell-desc">
      O Módulo Mesas custa <strong>+R$ 30/mês</strong> e adiciona gestão de mesas, comandas
      e divisão de conta. Total: R$ 89/mês.
    </p>
    <a href="/assinatura?addon=mesas" class="btn-primary">Ativar Módulo Mesas</a>
  </div>
{:else}
  <header class="page-header">
    <div>
      <p class="breadcrumb">Gestão / Mesas</p>
      <h1 class="title">Mesas</h1>
      <p class="subtitle">Cadastre as mesas do seu estabelecimento.</p>
    </div>
    <button class="btn-primary" on:click={openNew}>+ Nova Mesa</button>
  </header>

  {#if loading}
    <p style="color: var(--text-muted);">Carregando mesas…</p>
  {:else if mesas.length === 0}
    <div class="empty-state">
      <p><strong>Nenhuma mesa cadastrada.</strong></p>
      <p style="color: var(--text-muted); margin-top: 0.5rem;">
        Clique em "Nova Mesa" para começar.
      </p>
    </div>
  {:else}
    <div class="table-card">
      <table class="mesas-table">
        <thead>
          <tr>
            <th>Número</th>
            <th>Capacidade</th>
            <th>Status</th>
            <th>Ativa</th>
            <th class="actions-col">Ações</th>
          </tr>
        </thead>
        <tbody>
          {#each mesas as mesa (mesa.id)}
            <tr class:inactive={!mesa.ativa}>
              <td><strong>{mesa.numero}</strong></td>
              <td>{mesa.capacidade ?? '—'}</td>
              <td>
                <span class="status-pill" data-status={mesa.status}>
                  {statusLabel(mesa.status)}
                </span>
              </td>
              <td>{mesa.ativa ? 'Sim' : 'Não'}</td>
              <td class="actions-col">
                <button class="btn-link" on:click={() => openEdit(mesa)}>Editar</button>
                <button class="btn-link danger" on:click={() => excluir(mesa)}>Excluir</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}

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

      <label class="field-inline">
        <input type="checkbox" bind:checked={form.ativa} />
        <span>Mesa ativa</span>
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

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }
  .breadcrumb {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.2em; color: var(--text-muted); margin: 0;
  }
  .title { font-size: 1.75rem; font-weight: 800; color: var(--text-main); margin: 0.25rem 0 0; }
  .subtitle { font-size: 0.95rem; color: var(--text-label); margin: 0.25rem 0 0; }

  .empty-state {
    padding: 3rem 1rem;
    text-align: center;
    background: var(--bg-card);
    border: 1px dashed var(--border-subtle);
    border-radius: 12px;
  }

  .table-card {
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 12px;
    overflow: hidden;
  }
  .mesas-table { width: 100%; border-collapse: collapse; }
  .mesas-table th, .mesas-table td {
    padding: 0.75rem 1rem;
    text-align: left;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-main);
    font-size: 0.9rem;
  }
  .mesas-table th {
    background: var(--bg-panel);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    font-weight: 700;
  }
  .mesas-table tbody tr:last-child td { border-bottom: none; }
  .mesas-table tr.inactive { opacity: 0.55; }
  .actions-col { text-align: right; white-space: nowrap; }

  .status-pill {
    display: inline-block;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--bg-input);
    color: var(--text-muted);
    border: 1px solid var(--border-subtle);
  }
  .status-pill[data-status="livre"]   { background: rgba(34,197,94,0.15);  color: #166534; border-color: rgba(34,197,94,0.35); }
  .status-pill[data-status="ocupada"] { background: rgba(239,68,68,0.15);  color: #991b1b; border-color: rgba(239,68,68,0.35); }
  .status-pill[data-status="fechando"]{ background: rgba(245,158,11,0.15); color: #92400e; border-color: rgba(245,158,11,0.35); }

  .btn-primary {
    padding: 0.6rem 1.1rem;
    background: var(--primary); color: #fff;
    border: none; border-radius: 8px;
    font-weight: 600; font-size: 0.9rem; cursor: pointer;
    text-decoration: none; display: inline-block;
  }
  .btn-primary:hover { background: var(--primary-hover); }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

  .btn-secondary {
    padding: 0.6rem 1.1rem;
    background: var(--bg-input); color: var(--text-main);
    border: 1px solid var(--border-subtle); border-radius: 8px;
    font-weight: 500; font-size: 0.9rem; cursor: pointer;
  }
  .btn-secondary:hover { background: var(--bg-card); }

  .btn-link {
    background: transparent; border: none; padding: 0.25rem 0.5rem;
    color: var(--primary); cursor: pointer; font-size: 0.85rem;
    font-weight: 600;
  }
  .btn-link:hover { text-decoration: underline; }
  .btn-link.danger { color: var(--error); }

  /* Modal */
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.55);
    display: flex; align-items: center; justify-content: center;
    z-index: 100;
    padding: 1rem;
  }
  .modal {
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 12px;
    padding: 1.5rem;
    width: 100%; max-width: 420px;
    display: flex; flex-direction: column; gap: 0.85rem;
  }
  .modal-title { font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin: 0; }

  .field { display: flex; flex-direction: column; gap: 0.35rem; }
  .field-label {
    font-size: 0.75rem; font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  .field input[type="text"], .field input[type="number"] {
    padding: 0.55rem 0.75rem;
    background: var(--bg-input);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    font-size: 0.95rem;
  }
  .field input:focus {
    outline: none;
    border-color: var(--primary);
  }
  .field-inline {
    display: flex; align-items: center; gap: 0.5rem;
    color: var(--text-main); font-size: 0.9rem;
  }
  .field-inline input[type="checkbox"] {
    accent-color: var(--primary);
    width: 1rem; height: 1rem;
  }

  .modal-actions {
    display: flex; justify-content: flex-end; gap: 0.5rem;
    margin-top: 0.5rem;
  }
</style>

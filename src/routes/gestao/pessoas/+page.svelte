<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { Plus, Pencil, Trash2, BookOpen, Search } from 'lucide-svelte';
  import { supabase } from '$lib/supabaseClient';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import { maskPhone } from '$lib/masks';
  import { getAccessContext } from '$lib/accessControl';
  import { getFiadoState } from '$lib/finance/fiado';
  import { formatMoney } from '$lib/formatMoney';
  import { cn } from '$lib/utils';
  import ModalPessoa from '$lib/components/modals/ModalPessoa.svelte';

  let pessoas = $state(/** @type {any[]} */ ([]));
  let loading = $state(true);
  let errorMsg = $state('');
  let uid = $state(/** @type {string | null} */ (null));
  let ownerUserId = $state(/** @type {string | null} */ (null));

  let busca = $state('');
  let tipoFilter = $state('todos'); // todos | cliente | funcionario

  let modalOpen = $state(false);
  let editingPessoa = $state(/** @type {Record<string, any> | null} */ (null));
  let deepLinkHandled = $state(/** @type {string | null} */ (null));

  let filteredPessoas = $derived.by(() => {
    return pessoas.filter((p) => {
      if (tipoFilter !== 'todos' && p.tipo !== tipoFilter) return false;
      const q = busca.trim().toLowerCase();
      if (!q) return true;
      const nome = (p.nome || '').toLowerCase();
      const contato = (p.contato || '').toLowerCase();
      const contatoDigits = (p.contato || '').replace(/\D/g, '');
      const qDigits = q.replace(/\D/g, '');
      return (
        nome.includes(q) ||
        contato.includes(q) ||
        (qDigits.length > 0 && contatoDigits.includes(qDigits))
      );
    });
  });

  let hasActiveFilter = $derived(busca.trim().length > 0 || tipoFilter !== 'todos');
  let countLabel = $derived(
    hasActiveFilter
      ? `${filteredPessoas.length} de ${pessoas.length}`
      : `${pessoas.length} registros`
  );

  async function load() {
    loading = true;
    errorMsg = '';
    const { data, error } = await supabase
      .from('pessoas')
      .select('id,nome,tipo,contato,saldo_fiado,aniversario_dia,aniversario_mes,aniversario_ano')
      .order('nome');
    if (error) {
      errorMsg = 'Não foi possível carregar os cadastros. Verifique sua conexão e tente novamente.';
    }
    pessoas = data || [];
    loading = false;
    openFromQuery();
  }

  function openFromQuery() {
    const editId = $page.url.searchParams.get('editar');
    if (!editId || loading) return;
    if (deepLinkHandled === editId && modalOpen) return;
    const found = pessoas.find((p) => String(p.id) === String(editId));
    if (!found) {
      if (pessoas.length) addToast('Pessoa não encontrada.', 'warning');
      clearEditQuery();
      return;
    }
    deepLinkHandled = editId;
    openEdit(found);
  }

  function clearEditQuery() {
    if (!$page.url.searchParams.has('editar')) return;
    const url = new URL($page.url);
    url.searchParams.delete('editar');
    void goto(`${url.pathname}${url.search}${url.hash}`, { replaceState: true, noScroll: true, keepFocus: true });
  }

  function formatBirthday(p) {
    if (!p.aniversario_dia || !p.aniversario_mes) return '—';
    const day = String(p.aniversario_dia).padStart(2, '0');
    const month = String(p.aniversario_mes).padStart(2, '0');
    return p.aniversario_ano ? `${day}/${month}/${p.aniversario_ano}` : `${day}/${month}`;
  }

  function openCreate() {
    editingPessoa = null;
    modalOpen = true;
  }

  function openEdit(p) {
    editingPessoa = p;
    modalOpen = true;
  }

  function closeModal() {
    modalOpen = false;
    editingPessoa = null;
    deepLinkHandled = null;
    clearEditQuery();
  }

  async function onSaved() {
    await load();
  }

  async function remove(id) {
    const ok = await confirmAction(
      'Excluir pessoa',
      'Tem certeza que deseja excluir esta pessoa? O saldo precisa estar quitado. O histórico financeiro e os snapshots dos pedidos serão preservados; vendas e pedidos permanecem sem vínculo com esta pessoa.'
    );
    if (!ok) return;
    const { error } = await supabase.rpc('fiado_excluir_pessoa', { p_id_pessoa: id });
    if (error) {
      const message =
        error.code === '23514'
          ? 'Não é possível excluir uma pessoa com saldo de fiado em aberto ou crédito pendente.'
          : 'Não foi possível excluir a pessoa. Tente novamente.';
      addToast(message, 'error');
      return;
    }
    addToast('Pessoa excluída.', 'success');
    load();
  }

  function clearFilters() {
    busca = '';
    tipoFilter = 'todos';
  }

  $effect(() => {
    const editId = $page.url.searchParams.get('editar');
    if (loading || !editId) return;
    openFromQuery();
  });

  onMount(async () => {
    const { data: userData } = await supabase.auth.getUser();
    uid = userData?.user?.id || null;
    const accessContext = await getAccessContext();
    ownerUserId = accessContext?.ownerUserId || uid;
    await load();
  });
</script>

<div class="page">
  <div class="page-header">
    <div class="page-title-block">
      <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">
        Gestão / Cadastros
      </p>
      <h1 class="text-xl font-bold text-slate-100 tracking-tight">Pessoas</h1>
    </div>

    <div class="header-right">
      <span class="count-label">{countLabel}</span>
      <button class="btn-primary page-new-btn" type="button" onclick={openCreate}>
        <Plus class="w-4 h-4" aria-hidden="true" />
        <span>Nova pessoa</span>
      </button>
    </div>
  </div>

  {#if errorMsg}
    <div class="error-banner" role="alert">{errorMsg}</div>
  {/if}

  <div class="toolbar">
    <div class="search-wrapper">
      <Search class="w-4 h-4 shrink-0 search-icon" aria-hidden="true" />
      <input
        type="search"
        class="search-input"
        placeholder="Buscar por nome ou contato..."
        bind:value={busca}
        aria-label="Buscar pessoas"
      />
    </div>

    <div class="type-filters" role="group" aria-label="Filtrar por tipo">
      <button
        type="button"
        class={cn('type-chip', tipoFilter === 'todos' && 'active')}
        onclick={() => (tipoFilter = 'todos')}
      >
        Todos
      </button>
      <button
        type="button"
        class={cn('type-chip', tipoFilter === 'cliente' && 'active')}
        onclick={() => (tipoFilter = 'cliente')}
      >
        Cliente
      </button>
      <button
        type="button"
        class={cn('type-chip', tipoFilter === 'funcionario' && 'active')}
        onclick={() => (tipoFilter = 'funcionario')}
      >
        Funcionário
      </button>
    </div>
  </div>

  <div class="list-shell">
    {#if loading}
      <div class="empty-state">Carregando...</div>
    {:else if pessoas.length === 0}
      <div class="empty-state">
        <p>Nenhuma pessoa cadastrada.</p>
        <button type="button" class="link-btn" onclick={openCreate}>Cadastrar primeira pessoa</button>
      </div>
    {:else if filteredPessoas.length === 0}
      <div class="empty-state">
        <p>Nenhuma pessoa encontrada com os filtros atuais.</p>
        <button type="button" class="link-btn" onclick={clearFilters}>Limpar filtros</button>
      </div>
    {:else}
      <!-- Mobile cards -->
      <div class="mobile-list">
        {#each filteredPessoas as p (p.id)}
          {@const fiado = getFiadoState(p.saldo_fiado)}
          <article class="person-card">
            <div class="person-card-head">
              <div class="person-card-title">
                <h2>{p.nome}</h2>
                <span class={cn('type-badge', p.tipo === 'funcionario' ? 'type-func' : 'type-cli')}>
                  {p.tipo === 'funcionario' ? 'Funcionário' : 'Cliente'}
                </span>
              </div>
            </div>

            <div class="person-card-meta">
              <div class="meta-row">
                <span class="meta-label">Contato</span>
                <span class="meta-value tabular-nums">{maskPhone(p.contato) || '—'}</span>
              </div>
              <div class="meta-row">
                <span class="meta-label">Aniversário</span>
                <span class="meta-value tabular-nums">{formatBirthday(p)}</span>
              </div>
              <div class="meta-row">
                <span class="meta-label">Fiado</span>
                <span class={cn('meta-value', `fiado-${fiado.key}`)}>
                  <span class="fiado-label">{fiado.label}</span>
                  {formatMoney(fiado.value)}
                </span>
              </div>
            </div>

            <div class="person-card-actions">
              <a href="/gestao/fichario?p={p.id}" class="card-action">
                <BookOpen class="w-4 h-4" aria-hidden="true" />
                Fichário
              </a>
              <button type="button" class="card-action" onclick={() => openEdit(p)}>
                <Pencil class="w-4 h-4" aria-hidden="true" />
                Editar
              </button>
              <button type="button" class="card-action card-action-danger" onclick={() => remove(p.id)}>
                <Trash2 class="w-4 h-4" aria-hidden="true" />
                Excluir
              </button>
            </div>
          </article>
        {/each}
      </div>

      <!-- Desktop table -->
      <div class="table-scroll-wrapper desktop-table">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-700/60">
              <th class="col-header px-4 sm:px-5 py-3 text-left min-w-[140px]">Nome</th>
              <th class="col-header px-3 sm:px-4 py-3 text-left min-w-[80px]">Tipo</th>
              <th class="col-header px-3 sm:px-4 py-3 text-left min-w-[130px]">Contato</th>
              <th class="col-header px-3 sm:px-4 py-3 text-left min-w-[100px]">Aniversário</th>
              <th class="col-header px-3 sm:px-4 py-3 text-right min-w-[120px]">Situação do fiado</th>
              <th class="px-3 sm:px-4 py-3 min-w-[140px]"></th>
            </tr>
          </thead>
          <tbody>
            {#each filteredPessoas as p (p.id)}
              {@const fiado = getFiadoState(p.saldo_fiado)}
              <tr class="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors group">
                <td class="px-4 sm:px-5 py-3 font-medium text-slate-100 whitespace-nowrap">{p.nome}</td>
                <td class="px-3 sm:px-4 py-3">
                  <span class={cn('type-badge', p.tipo === 'funcionario' ? 'type-func' : 'type-cli')}>
                    {p.tipo === 'funcionario' ? 'Func.' : 'Cliente'}
                  </span>
                </td>
                <td class="px-3 sm:px-4 py-3 text-slate-400 tabular-nums whitespace-nowrap">
                  {maskPhone(p.contato) || '—'}
                </td>
                <td class="px-3 sm:px-4 py-3 text-slate-400 tabular-nums whitespace-nowrap">
                  {formatBirthday(p)}
                </td>
                <td class={cn('px-3 sm:px-4 py-3 text-right tabular-nums font-medium', `fiado-${fiado.key}`)}>
                  <span class="fiado-label">{fiado.label}</span>
                  <span>{formatMoney(fiado.value)}</span>
                </td>
                <td class="px-3 sm:px-4 py-3">
                  <div class="flex items-center justify-end gap-1 actions-cell">
                    <a
                      href="/gestao/fichario?p={p.id}"
                      class="icon-btn"
                      title="Ver fichário"
                      aria-label="Ver fichário de {p.nome}"
                    >
                      <BookOpen class="w-4 h-4" aria-hidden="true" />
                    </a>
                    <button
                      type="button"
                      class="icon-btn"
                      onclick={() => openEdit(p)}
                      title="Editar {p.nome}"
                      aria-label="Editar {p.nome}"
                    >
                      <Pencil class="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      class="icon-btn icon-btn-danger"
                      onclick={() => remove(p.id)}
                      title="Excluir {p.nome}"
                      aria-label="Excluir {p.nome}"
                    >
                      <Trash2 class="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<button
  class="mobile-create-fab"
  type="button"
  aria-label="Nova pessoa"
  onclick={openCreate}
>
  <Plus class="mobile-create-fab-icon" aria-hidden="true" />
</button>

{#if modalOpen}
  {#key editingPessoa?.id ?? 'new'}
    <ModalPessoa
      open={true}
      pessoa={editingPessoa}
      {ownerUserId}
      onclose={closeModal}
      onsaved={onSaved}
    />
  {/key}
{/if}

<style>
  .page {
    padding: 1rem;
    max-width: 72rem;
    margin: 0 auto;
  }

  @media (min-width: 640px) {
    .page {
      padding: 1.5rem;
    }
  }

  .page-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 80%, transparent);
  }

  .page-title-block {
    min-width: 0;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
  }

  .count-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    min-height: 2.75rem;
    padding: 0.5rem 1rem;
    border: 0;
    border-radius: 0.5rem;
    background: var(--primary);
    color: var(--primary-text);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .btn-primary:hover {
    background: var(--primary-hover);
  }

  .error-banner {
    margin-bottom: 1rem;
    padding: 0.625rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid color-mix(in srgb, var(--error) 25%, transparent);
    background: color-mix(in srgb, var(--error) 10%, transparent);
    color: var(--status-error-text);
    font-size: 0.875rem;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .search-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1 1 14rem;
    min-width: 0;
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
    background: var(--bg-input);
  }

  .search-icon {
    color: var(--text-muted);
  }

  .search-input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--text-main);
    font-size: 0.875rem;
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .type-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .type-chip {
    min-height: 2.25rem;
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--border-subtle);
    border-radius: 9999px;
    background: var(--bg-panel);
    color: var(--text-muted);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
  }

  .type-chip:hover {
    color: var(--text-main);
    background: var(--sidebar-item-hover-bg);
  }

  .type-chip.active {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary);
  }

  .list-shell {
    border: 1px solid color-mix(in srgb, var(--border-subtle) 80%, transparent);
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--bg-panel) 80%, transparent);
    overflow: hidden;
  }

  .empty-state {
    padding: 2.5rem 1rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .link-btn {
    margin-top: 0.5rem;
    border: 0;
    background: transparent;
    color: var(--primary);
    font-size: 0.8125rem;
    cursor: pointer;
  }

  .mobile-list {
    display: none;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
  }

  .person-card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    border: 1px solid var(--border-subtle);
    border-radius: 0.75rem;
    background: var(--bg-card);
  }

  .person-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .person-card-title {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 0;
  }

  .person-card-title h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-main);
    line-height: 1.3;
  }

  .person-card-meta {
    display: grid;
    gap: 0.5rem;
  }

  .meta-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .meta-label {
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .meta-value {
    text-align: right;
    font-size: 0.875rem;
    color: var(--text-label);
  }

  .person-card-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
    padding-top: 0.25rem;
    border-top: 1px solid var(--border-subtle);
  }

  .card-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    min-height: 2.75rem;
    padding: 0.5rem 0.5rem;
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
    background: var(--bg-panel);
    color: var(--text-label);
    font-size: 0.8125rem;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .card-action:hover {
    background: var(--sidebar-item-hover-bg);
    color: var(--text-main);
  }

  .card-action-danger:hover {
    background: var(--status-error-bg);
    color: var(--status-error-text);
    border-color: transparent;
  }

  .desktop-table {
    display: block;
  }

  .col-header {
    color: var(--text-muted);
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .type-badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .type-cli {
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    color: var(--primary);
    border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
  }

  .type-func {
    background: var(--bg-input);
    color: var(--text-label);
    border: 1px solid var(--border-subtle);
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.375rem;
    border: 0;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: background-color var(--transition-fast), color var(--transition-fast);
  }

  .icon-btn:hover {
    background: var(--sidebar-item-hover-bg);
    color: var(--text-main);
  }

  .icon-btn-danger:hover {
    background: var(--status-error-bg);
    color: var(--status-error-text);
  }

  .fiado-label {
    display: block;
    margin-bottom: 0.125rem;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .fiado-devedor {
    color: var(--status-warning-text);
  }

  .fiado-credor {
    color: var(--status-success-text);
  }

  .fiado-neutro {
    color: var(--text-muted);
  }

  .table-scroll-wrapper {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-color: var(--border-subtle) transparent;
  }

  .table-scroll-wrapper::-webkit-scrollbar {
    height: 6px;
  }

  .table-scroll-wrapper::-webkit-scrollbar-track {
    background: transparent;
  }

  .table-scroll-wrapper::-webkit-scrollbar-thumb {
    background: var(--border-subtle);
    border-radius: 3px;
  }

  .actions-cell {
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .group:hover .actions-cell {
    opacity: 1;
  }

  @media (hover: none) and (pointer: coarse) {
    .actions-cell {
      opacity: 1;
    }
  }

  .mobile-create-fab {
    display: none;
  }

  @media (max-width: 768px) {
    .page-new-btn {
      display: none;
    }

    .page-header {
      align-items: flex-end;
      margin-bottom: 1rem;
      padding-bottom: 0.875rem;
    }

    .list-shell {
      border: 0;
      border-radius: 0;
      background: transparent;
      overflow: visible;
    }

    .mobile-list {
      display: flex;
    }

    .desktop-table {
      display: none;
    }

    .mobile-create-fab {
      position: fixed;
      right: 1rem;
      bottom: calc(1rem + var(--mobile-bottom-nav-offset));
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 3.5rem;
      height: 3.5rem;
      border: 1px solid var(--primary);
      border-radius: 50%;
      background: var(--primary);
      color: var(--primary-text);
      cursor: pointer;
      transition: background var(--transition-fast), border-color var(--transition-fast);
    }

    .mobile-create-fab:hover {
      background: var(--primary-hover);
      border-color: var(--primary-hover);
    }

    .mobile-create-fab :global(svg) {
      width: 1.5rem;
      height: 1.5rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .btn-primary,
    .type-chip,
    .card-action,
    .icon-btn,
    .mobile-create-fab,
    .actions-cell {
      transition: none;
    }
  }
</style>

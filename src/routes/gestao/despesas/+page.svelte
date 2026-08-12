<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { ensureActiveSubscription } from '$lib/guards';
  import { logAuditAction } from '$lib/accessControl';
  import { formatStoredDateForPtBr, getLocalDateInputValue, localDateInputToIso } from '$lib/dateRange';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import AdminLock from '$lib/components/AdminLock.svelte';
  import * as Select from '$lib/components/ui/select/index.js';

  let uid = null;
  let pinConfigured = false;
  let ownerUserId = null;
  let operadorUserId = null;
  let isSubUser = false;

  async function loadAdminPinStatus() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const response = await fetch('/api/auth/admin-pin', {
      headers: { authorization: `Bearer ${session.access_token}` },
    });
    if (response.ok) {
      const status = await response.json().catch(() => ({}));
      pinConfigured = status.configured === true;
    }
  }

  // Date range — defaults to current month
  let today = new Date();
  let dataInicio = new Date(today.getFullYear(), today.getMonth(), 1);
  let dataFim = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  $: dataInicioStr = getLocalDateInputValue(dataInicio);
  $: dataFimStr = getLocalDateInputValue(dataFim);

  // Expenses data
  let expenses = [];
  let loading = false;
  let loadingOp = false;

  // New expense form
  let newExpense = {
    description: '',
    amount: '',
    category: 'Fornecedor',
    date: getLocalDateInputValue()
  };

  const categories = ['Fornecedor', 'Insumos', 'Aluguel', 'Contas fixas', 'Pessoal', 'Manutenção', 'Outros'];

  // Search & filter
  let searchQuery = '';
  let filterCategory = '';

  // Pagination
  let currentPage = 1;
  const pageSize = 10;

  // Edit state
  let editingId = null;
  let editData = {};

  // Filtered expenses
  $: filteredExpenses = expenses.filter(ex => {
    const matchSearch = !searchQuery || ex.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory = !filterCategory || ex.category === filterCategory;
    return matchSearch && matchCategory;
  });

  $: totalPages = Math.max(1, Math.ceil(filteredExpenses.length / pageSize));
  $: pagedExpenses = filteredExpenses.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Stats
  $: totalDespesas = expenses.reduce((acc, ex) => acc + Number(ex.amount || 0), 0);
  $: categoryCounts = expenses.reduce((acc, ex) => {
    acc[ex.category] = (acc[ex.category] || 0) + Number(ex.amount || 0);
    return acc;
  }, {});
  $: maiorCategoria = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0] || null;
  $: maiorCategoriaPercent = totalDespesas > 0 && maiorCategoria ? ((maiorCategoria[1] / totalDespesas) * 100).toFixed(1) : '0';

  // Reset page when filters change
  $: if (searchQuery || filterCategory) currentPage = 1;

  function getErrorMessage(error, fallback = 'Erro inesperado. Tente novamente.') {
    if (!error) return fallback;
    if (typeof error === 'string') return error;
    return error.message || error.error_description || error.details || fallback;
  }

  function ensureSupabaseReady() {
    if (!supabase) {
      throw new Error('Configuração do Supabase ausente. Recarregue a página ou acione o suporte.');
    }
    if (!uid) {
      throw new Error('Sessão não carregada. Recarregue a página e tente novamente.');
    }
  }

  async function loadExpenses() {
    if (!uid) return;
    loading = true;
    try {
      ensureSupabaseReady();
      const startIso = localDateInputToIso(dataInicioStr);
      const endIso = localDateInputToIso(dataFimStr, { endOfDay: true });
      if (!startIso || !endIso) throw new Error('Período inválido.');

      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('user_id', uid)
        .gte('date', startIso)
        .lte('date', endIso)
        .order('date', { ascending: false });
      if (error) throw error;
      expenses = data || [];
    } catch (error) {
      console.error('[despesas] loadExpenses:', error);
      addToast('Erro ao carregar despesas: ' + getErrorMessage(error), 'error', 5000);
    } finally {
      loading = false;
    }
  }

  $: if (uid && dataInicio && dataFim) loadExpenses();

  async function addExpense() {
    const amount = Number(newExpense.amount);
    if (!newExpense.description || !Number.isFinite(amount) || amount <= 0) {
      addToast('Preencha descrição e valor positivo', 'warning');
      return;
    }
    loadingOp = true;
    try {
      ensureSupabaseReady();
      const dateIso = localDateInputToIso(newExpense.date);
      if (!dateIso) throw new Error('Data inválida.');

      const { data: insertedExpense, error } = await supabase.from('expenses').insert({
        user_id: uid,
        id_operador: operadorUserId,
        description: newExpense.description,
        amount,
        category: newExpense.category,
        date: dateIso
      })
      .select('*')
      .single();
      if (error) throw error;
      if (!insertedExpense?.id) throw new Error('O banco não confirmou o cadastro da despesa.');
      if (isSubUser) {
        logAuditAction({
          ownerUserId,
          action: 'despesa.criada',
          entityType: 'expense',
          details: {
            description: newExpense.description,
            amount,
            category: newExpense.category
          }
        });
      }
      addToast('Despesa lançada!', 'success');
      newExpense = { ...newExpense, description: '', amount: '' };
      await loadExpenses();
    } catch (e) {
      console.error('[despesas] addExpense:', e);
      addToast('Erro ao salvar despesa: ' + getErrorMessage(e), 'error', 6000);
    } finally {
      loadingOp = false;
    }
  }

  function startEdit(ex) {
    editingId = ex.id;
    editData = { description: ex.description, amount: ex.amount, category: ex.category };
  }

  function cancelEdit() {
    editingId = null;
    editData = {};
  }

  async function saveEdit(id) {
    loadingOp = true;
    try {
      ensureSupabaseReady();
      const newAmount = parseFloat(editData.amount);
      if (!editData.description || !Number.isFinite(newAmount) || newAmount <= 0) {
        throw new Error('Preencha descrição e valor positivo.');
      }
      const previous = expenses.find((ex) => ex.id === id);
      const { data: updatedExpense, error } = await supabase.from('expenses').update({
        description: editData.description,
        amount: newAmount,
        category: editData.category
      }).eq('id', id).eq('user_id', uid).select('*').single();
      if (error) throw error;
      if (!updatedExpense?.id) throw new Error('Nenhuma despesa foi atualizada. Recarregue a página e tente novamente.');
      // Optimistically update local array immediately so UI reflects the change
      expenses = expenses.map(ex =>
        ex.id === id
          ? { ...ex, description: editData.description, amount: newAmount, category: editData.category }
          : ex
      );
      if (isSubUser) {
        logAuditAction({
          ownerUserId,
          action: 'despesa.editada',
          entityType: 'expense',
          entityId: String(id),
          details: {
            before: previous ? {
              description: previous.description,
              amount: Number(previous.amount || 0),
              category: previous.category
            } : null,
            after: {
              description: editData.description,
              amount: newAmount,
              category: editData.category
            }
          }
        });
      }
      addToast('Despesa atualizada!', 'success');
      editingId = null;
      editData = {};
    } catch (e) {
      console.error('[despesas] saveEdit:', e);
      addToast('Erro ao atualizar despesa: ' + getErrorMessage(e), 'error', 6000);
    } finally {
      loadingOp = false;
    }
  }

  async function deleteExpense(id) {
    const confirmed = await confirmAction('Apagar despesa?', 'Tem certeza que deseja remover esta despesa permanentemente?');
    if (!confirmed) return;
    try {
      ensureSupabaseReady();
      const previous = expenses.find((ex) => ex.id === id);
      const { data: deletedExpense, error } = await supabase.from('expenses').delete().eq('id', id).eq('user_id', uid).select('id').single();
      if (error) throw error;
      if (!deletedExpense?.id) throw new Error('Nenhuma despesa foi removida. Recarregue a página e tente novamente.');
      if (isSubUser) {
        logAuditAction({
          ownerUserId,
          action: 'despesa.removida',
          entityType: 'expense',
          entityId: String(id),
          details: previous ? {
            description: previous.description,
            amount: Number(previous.amount || 0),
            category: previous.category
          } : {}
        });
      }
      addToast('Despesa removida', 'success');
      await loadExpenses();
    } catch (e) {
      console.error('[despesas] deleteExpense:', e);
      addToast('Erro ao excluir despesa: ' + getErrorMessage(e), 'error', 6000);
    }
  }

  onMount(async () => {
    try {
      if (!supabase) throw new Error('Configuração do Supabase ausente.');
      const authCtx = await ensureActiveSubscription({ requireProfile: true });
      if (!authCtx) return;
      uid = authCtx.userId;
      ownerUserId = authCtx.ownerUserId;
      operadorUserId = authCtx.userId;
      isSubUser = authCtx.isSubUser;
      if (uid) {
        await loadAdminPinStatus();
        // Override uid with ownerUserId for all DB operations
        uid = ownerUserId;
        await loadExpenses();
      }
    } catch (error) {
      console.error('[despesas] onMount:', error);
      addToast('Erro ao iniciar despesas: ' + getErrorMessage(error), 'error', 6000);
    }
  });
</script>

<AdminLock pinConfigured={pinConfigured}>
<div class="space-y-6">
  <!-- Header -->
  <header class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div>
      <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">Financeiro / Despesas</p>
      <h1 class="text-xl font-bold text-slate-100 tracking-tight">Gerenciar Despesas</h1>
      <p class="text-sm" style="color: var(--text-muted);">Lance contas, fornecedores e retiradas.</p>
    </div>
    <div class="flex items-center gap-2 px-3 py-2 rounded-lg" style="background: var(--bg-card); border: 1px solid var(--border-subtle);">
      <input type="date" class="input-tiny" value={dataInicioStr} on:change={e => dataInicio = new Date(e.target.value+'T00:00:00')} />
      <span style="color: var(--text-muted);">até</span>
      <input type="date" class="input-tiny" value={dataFimStr} on:change={e => dataFim = new Date(e.target.value+'T00:00:00')} />
    </div>
  </header>

  <!-- Stats Cards -->
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <div class="rounded-lg p-4" style="background: var(--bg-card); border: 1px solid var(--border-subtle);">
      <p class="text-xs font-medium uppercase tracking-wider mb-1" style="color: var(--text-muted);">Total de Despesas Mês</p>
      <p class="text-xl font-bold" style="color: var(--accent);">
        Total: R$ {totalDespesas.toFixed(2)}
      </p>
    </div>
    <div class="rounded-lg p-4" style="background: var(--bg-card); border: 1px solid var(--border-subtle);">
      <p class="text-xs font-medium uppercase tracking-wider mb-1" style="color: var(--text-muted);">Maior Categoria de Despesa</p>
      {#if maiorCategoria}
        <div class="flex items-baseline gap-2">
          <span class="text-sm font-semibold" style="color: var(--text-main);">{maiorCategoria[0]}</span>
          <span class="text-xs" style="color: var(--text-muted);">({maiorCategoriaPercent}%)</span>
        </div>
        <p class="text-lg font-bold" style="color: var(--accent);">R$ {maiorCategoria[1].toFixed(2)}</p>
      {:else}
        <p class="text-sm" style="color: var(--text-muted);">—</p>
      {/if}
    </div>
    <div class="rounded-lg p-4" style="background: var(--bg-card); border: 1px solid var(--border-subtle);">
      <p class="text-xs font-medium uppercase tracking-wider mb-1" style="color: var(--text-muted);">Total de Lançamentos</p>
      <p class="text-xl font-bold" style="color: var(--text-main);">{expenses.length}</p>
    </div>
  </div>

  <!-- New Expense Form -->
  <div class="rounded-lg p-4" style="background: var(--bg-card); border: 1px solid var(--border-subtle);">
    <h3 class="text-sm font-semibold mb-3" style="color: var(--text-main);">Novo Lançamento</h3>
    <div class="flex flex-col lg:flex-row gap-3 items-end">
      <div class="flex-1 min-w-0">
        <label for="exp-desc" class="text-xs mb-1 block" style="color: var(--text-muted);">Descrição</label>
        <input id="exp-desc" type="text" placeholder="ex: Compra de embalagens" class="input-form w-full" bind:value={newExpense.description} />
      </div>
      <div class="w-full lg:w-28">
        <label for="exp-amount" class="text-xs mb-1 block" style="color: var(--text-muted);">Valor (R$)</label>
        <input id="exp-amount" type="number" step="0.01" min="0" class="input-form w-full text-right" placeholder="0.00" bind:value={newExpense.amount} />
      </div>
      <div class="w-full lg:w-40">
        <label for="exp-date" class="text-xs mb-1 block" style="color: var(--text-muted);">Data</label>
        <input id="exp-date" type="date" class="input-form w-full" bind:value={newExpense.date} />
      </div>
      <div class="w-full lg:w-44">
        <label class="text-xs mb-1 block" style="color: var(--text-muted);">Categoria/Fornecedor</label>
        <Select.Root bind:value={newExpense.category}>
          <Select.Trigger class="input-form w-full !h-10">
            {newExpense.category || 'Selecione...'}
          </Select.Trigger>
          <Select.Content>
            {#each categories as cat}
              <Select.Item value={cat} label={cat} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <button
        class="btn-primary whitespace-nowrap flex items-center gap-2 h-10 px-4"
        on:click={addExpense}
        disabled={loadingOp}
        style="background: var(--primary); color: var(--primary-text);"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
        {loadingOp ? 'Salvando...' : 'Lançar Despesa'}
      </button>
    </div>
  </div>

  <!-- Table -->
  <div class="rounded-lg overflow-hidden" style="background: var(--bg-card); border: 1px solid var(--border-subtle);">
    <!-- Table Header with Search & Filter -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-b" style="border-color: var(--border-subtle);">
      <h3 class="text-sm font-semibold flex items-center gap-2" style="color: var(--text-main);">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4" style="color: var(--accent);"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" /></svg>
        Gestão de Despesas
      </h3>
      <div class="flex flex-col sm:flex-row items-stretch gap-2 w-full sm:w-auto">
        <div class="relative w-full sm:w-56">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style="color: var(--text-muted);">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar despesa..."
            class="input-form text-sm h-9 w-full !pl-9"
            bind:value={searchQuery}
          />
        </div>
        <div class="w-full sm:w-48">
        <Select.Root bind:value={filterCategory}>
          <Select.Trigger class="input-form text-sm !h-9 w-full">
            {filterCategory || 'Filtro de categoria'}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="" label="Todas as categorias" />
            {#each categories as cat}
              <Select.Item value={cat} label={cat} />
            {/each}
          </Select.Content>
        </Select.Root>
        </div>
      </div>
    </div>

    <!-- Table Content -->
    {#if loading}
      <div class="p-8 text-center" style="color: var(--text-muted);">Carregando...</div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-subtle);">
              <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Data</th>
              <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Descrição</th>
              <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Categoria</th>
              <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-right" style="color: var(--text-muted);">Valor</th>
              <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-right" style="color: var(--text-muted);">Ações</th>
            </tr>
          </thead>
          <tbody>
            {#if filteredExpenses.length === 0}
              <tr><td colspan="5" class="px-4 py-8 text-center" style="color: var(--text-muted);">Nenhuma despesa no período.</td></tr>
            {/if}
            {#each pagedExpenses as ex (ex.id)}
              <tr class="transition-colors" style="border-bottom: 1px solid var(--border-subtle);"
                on:mouseenter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                on:mouseleave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td class="px-4 py-3 whitespace-nowrap" style="color: var(--text-muted);">
                  {formatStoredDateForPtBr(ex.date)}
                </td>
                <td class="px-4 py-3 font-medium" style="color: var(--text-main);">
                  {#if editingId === ex.id}
                    <input type="text" class="input-form text-sm h-8 w-full" bind:value={editData.description} />
                  {:else}
                    {ex.description}
                  {/if}
                </td>
                <td class="px-4 py-3">
                  {#if editingId === ex.id}
                    <Select.Root bind:value={editData.category}>
                      <Select.Trigger class="input-form text-sm h-8">
                        {editData.category || 'Selecione...'}
                      </Select.Trigger>
                      <Select.Content>
                        {#each categories as cat}
                          <Select.Item value={cat} label={cat} />
                        {/each}
                      </Select.Content>
                    </Select.Root>
                  {:else}
                    <span class="px-2.5 py-1 rounded-sm text-xs font-semibold uppercase" style="background: var(--accent); color: var(--primary-text);">
                      {ex.category}
                    </span>
                  {/if}
                </td>
                <td class="px-4 py-3 text-right font-bold whitespace-nowrap" style="color: var(--error);">
                  {#if editingId === ex.id}
                    <input type="number" step="0.01" class="input-form text-sm h-8 w-24 text-right" bind:value={editData.amount} />
                  {:else}
                    - R$ {Number(ex.amount).toFixed(2)}
                  {/if}
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="flex items-center justify-end gap-1">
                    {#if editingId === ex.id}
                      <button
                        class="p-1.5 rounded-sm transition-colors"
                        style="color: var(--success);"
                        on:click={() => saveEdit(ex.id)}
                        title="Salvar"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      </button>
                      <button
                        class="p-1.5 rounded-sm transition-colors"
                        style="color: var(--text-muted);"
                        on:click={cancelEdit}
                        title="Cancelar"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    {:else}
                      <button
                        class="p-1.5 rounded-sm transition-colors"
                        style="color: var(--text-muted);"
                        on:click={() => startEdit(ex)}
                        title="Editar"
                        on:mouseenter={e => e.currentTarget.style.color = 'var(--accent)'}
                        on:mouseleave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" /></svg>
                      </button>
                      <button
                        class="p-1.5 rounded-sm transition-colors"
                        style="color: var(--text-muted);"
                        on:click={() => deleteExpense(ex.id)}
                        title="Excluir"
                        on:mouseenter={e => e.currentTarget.style.color = 'var(--error)'}
                        on:mouseleave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      {#if totalPages > 1}
        <div class="flex items-center justify-center gap-1 py-3 border-t" style="border-color: var(--border-subtle);">
          <button
            class="px-2 py-1 rounded-sm text-sm transition-colors"
            style="color: var(--text-muted);"
            disabled={currentPage <= 1}
            on:click={() => currentPage = Math.max(1, currentPage - 1)}
          >&lt;</button>
          {#each Array(totalPages) as _, i}
            <button
              class="w-8 h-8 rounded-sm text-sm font-medium transition-colors"
              style="
                background: {currentPage === i + 1 ? 'var(--primary)' : 'transparent'};
                color: {currentPage === i + 1 ? 'white' : 'var(--text-muted)'};
              "
              on:click={() => currentPage = i + 1}
            >{i + 1}</button>
          {/each}
          <button
            class="px-2 py-1 rounded-sm text-sm transition-colors"
            style="color: var(--text-muted);"
            disabled={currentPage >= totalPages}
            on:click={() => currentPage = Math.min(totalPages, currentPage + 1)}
          >&gt;</button>
        </div>
      {/if}
    {/if}
  </div>
</div>
</AdminLock>

<style>
  .input-tiny {
    border: none;
    background: transparent;
    font-size: 0.875rem;
    color: var(--text-main);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    color-scheme: dark;
  }
  .input-tiny:focus {
    outline: none;
    box-shadow: none;
  }
  :global(html.light) .input-tiny {
    color-scheme: light;
  }
</style>

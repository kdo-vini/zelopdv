<script>
  import { supabase } from '$lib/supabaseClient';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import { createEventDispatcher } from 'svelte';
  
  export let uid;
  export let expenses = []; // Receive as prop

  const dispatch = createEventDispatcher();

  let loadingOp = false;
  let newExpense = {
    description: '',
    amount: '',
    category: 'Fornecedor',
    date: new Date().toISOString().slice(0, 10)
  };

  async function addExpense() {
    if (!newExpense.description || !newExpense.amount || Number(newExpense.amount) <= 0) {
        addToast('Preencha descrição e valor positivo', 'warning');
        return;
    }
    
    loadingOp = true;
    try {
      const { error } = await supabase.from('expenses').insert({
        user_id: uid,
        description: newExpense.description,
        amount: parseFloat(newExpense.amount),
        category: newExpense.category,
        date: new Date(newExpense.date).toISOString()
      });

      if (error) throw error;
      
      addToast('Despesa lançada!', 'success');
      newExpense = { ...newExpense, description: '', amount: '' }; 
      dispatch('refresh'); // Tell parent to reload
    } catch (e) {
      addToast('Erro ao salvar: ' + e.message, 'error');
    } finally {
      loadingOp = false;
    }
  }

  async function deleteExpense(id) {
    const confirmed = await confirmAction('Apagar despesa?', 'Tem certeza que deseja remover esta despesa permanentemente?');
    if(!confirmed) return;

    try {
        const { error } = await supabase.from('expenses').delete().eq('id', id);
        if (error) throw error;
        addToast('Despesa removida', 'success');
        dispatch('refresh'); // Tell parent to reload
    } catch (e) {
        addToast('Erro ao excluir: ' + e.message, 'error');
    }
  }
</script>

<div class="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 p-4 mt-6">
  <h3 class="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
    <span class="text-red-500">📉</span> Gestão de Despesas
  </h3>

  <!-- Add Form -->
  <div class="grid gap-3 mb-6 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <input type="text" placeholder="Descrição (ex: Fornecedor Pão)" class="input-form" bind:value={newExpense.description} />
        <div class="relative">
            <span class="absolute left-3 top-2.5 text-slate-400 text-sm">R$</span>
            <input type="number" step="0.01" min="0" class="input-form pl-10 text-right" placeholder="0,00" bind:value={newExpense.amount} />
        </div>
        <input type="date" class="input-form" bind:value={newExpense.date} />
        <select class="input-form" bind:value={newExpense.category}>
            <option>Fornecedor</option>
            <option>Aluguel</option>
            <option>Contas fixas</option>
            <option>Pessoal</option>
            <option>Outros</option>
        </select>
    </div>
    <button class="btn-primary w-full sm:w-auto self-end" on:click={addExpense} disabled={loadingOp}>
        {loadingOp ? 'Salvando...' : '+ Lançar Despesa'}
    </button>
  </div>

  <!-- List -->
  <div class="overflow-x-auto">
      <table class="w-full text-sm text-left">
          <thead class="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-700">
              <tr>
                  <th class="px-3 py-2">Data</th>
                  <th class="px-3 py-2">Descrição</th>
                  <th class="px-3 py-2">Categoria</th>
                  <th class="px-3 py-2 text-right">Valor</th>
                  <th class="px-3 py-2"></th>
              </tr>
          </thead>
          <tbody>
              {#if expenses.length === 0}
                  <tr><td colspan="5" class="px-3 py-4 text-center text-slate-500">Nenhuma despesa no período.</td></tr>
              {/if}
              {#each expenses as ex}
                  <tr class="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td class="px-3 py-2">{new Date(ex.date).toLocaleDateString()}</td>
                      <td class="px-3 py-2 font-medium">{ex.description}</td>
                      <td class="px-3 py-2 text-xs">
                          <span class="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-600">{ex.category}</span>
                      </td>
                      <td class="px-3 py-2 text-right font-bold text-red-600 dark:text-red-400">- R$ {Number(ex.amount).toFixed(2)}</td>
                      <td class="px-3 py-2 text-right">
                          <button class="text-slate-400 hover:text-red-500" on:click={() => deleteExpense(ex.id)}>🗑️</button>
                      </td>
                  </tr>
              {/each}
          </tbody>
      </table>
  </div>
</div>

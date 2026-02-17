<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { pdvCache } from '$lib/stores/pdvCache';
  import { addToast } from '$lib/stores/ui';
  import { slide } from 'svelte/transition';
  import Swal from 'sweetalert2';

  // --- State ---
  let categorias = [];
  let loading = true;
  
  // UI State
  let showCreateForm = false;
  let selectedItems = new Set();
  let buscaFilter = '';

  // Sorting
  let sortField = 'ordem'; // 'nome' | 'ordem'
  let sortDesc = false;

  // Form
  let form = { nome: '', ordem: 0 };
  let editingId = null;
  let editForm = {};

  // --- Lifecycle ---
  onMount(async () => {
    await carregarCategorias();
  });

  async function carregarCategorias() {
    loading = true;
    try {
      let q = supabase.from('categorias').select('*');
      
      if (buscaFilter && String(buscaFilter).trim() !== '') {
        q = q.ilike('nome', `%${String(buscaFilter).trim()}%`);
      }

      const { data, error } = await q.order('ordem', { ascending: true });
      if (error) addToast(error.message, 'error'); 
      else categorias = data || [];
      
      selectedItems.clear();
    } finally {
      loading = false;
    }
  }

  // --- Computed ---
  $: sortedCategorias = [...categorias].sort((a, b) => {
    const valA = a[sortField];
    const valB = b[sortField];
    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  });

  // --- Actions ---
  async function criarCategoria(e) {
    e.preventDefault();
    const { data: userData } = await supabase.auth.getUser();
    const id_usuario = userData?.user?.id ?? null;
    
    const { error } = await supabase.from('categorias').insert({ 
      nome: form.nome, 
      ordem: form.ordem,
      id_usuario 
    });

    if (error) { addToast(error.message, 'error'); return; }
    
    addToast('Categoria criada com sucesso!', 'success');
    form = { nome: '', ordem: 0 };
    showCreateForm = false;
    pdvCache.invalidateCategorias();
    await carregarCategorias();
  }

  function toggleSort(field) {
    if (sortField === field) {
      sortDesc = !sortDesc;
    } else {
      sortField = field;
      sortDesc = false;
    }
  }

  // Bulk Actions
  function toggleSelectAll(e) {
    if (e.target.checked) {
      sortedCategorias.forEach(c => selectedItems.add(c.id));
    } else {
      selectedItems.clear();
    }
    selectedItems = selectedItems; 
  }

  function toggleSelect(id) {
    if (selectedItems.has(id)) selectedItems.delete(id);
    else selectedItems.add(id);
    selectedItems = selectedItems;
  }

  function confirmarExclusaoEmMassa() {
    if (selectedItems.size === 0) return;
    
    Swal.fire({
      title: 'Excluir Categorias',
      text: `Tem certeza que deseja excluir ${selectedItems.size} categorias selecionadas?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sim, excluir!',
      cancelButtonText: 'Cancelar'
    }).then(async (result) => {
      if (result.isConfirmed) {
        const ids = Array.from(selectedItems);
        const { error } = await supabase.from('categorias').delete().in('id', ids);
        if (error) addToast(error.message, 'error');
        else {
          addToast(`${ids.length} categorias excluídas.`, 'success');
          pdvCache.invalidateCategorias();
          selectedItems.clear();
          await carregarCategorias();
        }
      }
    });
  }

  // Row Actions
  function startEdit(cat) {
    editingId = cat.id;
    editForm = { ...cat };
  }

  function cancelEdit() {
    editingId = null;
    editForm = {};
  }

  async function saveEdit(e) {
    e.preventDefault();
    const { error } = await supabase.from('categorias').update({ 
      nome: editForm.nome, 
      ordem: editForm.ordem 
    }).eq('id', editingId);

    if (error) addToast(error.message, 'error');
    else {
      addToast('Categoria atualizada!', 'success');
      editingId = null;
      pdvCache.invalidateCategorias();
      await carregarCategorias();
    }
  }

  async function confirmarExclusaoCategoria(id) {
    // 1. Check for dependent products
    const { count, error } = await supabase
      .from('produtos')
      .select('*', { count: 'exact', head: true })
      .eq('id_categoria', id);

    if (error) {
      addToast('Erro ao verificar produtos: ' + error.message, 'error');
      return;
    }

    if (count > 0) {
      // 2. Smart Decision Dialog
      const result = await Swal.fire({
        title: 'Atenção: Produtos Vinculados!',
        html: `Esta categoria possui <b>${count}</b> produtos.<br>Como deseja prosseguir?`,
        icon: 'warning',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonColor: '#3085d6', // Keep (Safe)
        denyButtonColor: '#d33',       // Cascade (Destructive)
        confirmButtonText: 'Manter Produtos (Desvincular)',
        denyButtonText: 'Excluir Tudo (Cascata)',
        cancelButtonText: 'Cancelar',
        reverseButtons: true,
        focusConfirm: true
      });

      if (result.isConfirmed) {
        // Option A: Unlink Products -> Delete Category
        const { error: updateError } = await supabase
          .from('produtos')
          .update({ id_categoria: null })
          .eq('id_categoria', id);
          
        if (updateError) {
          addToast('Erro ao desvincular produtos: ' + updateError.message, 'error');
          return;
        }
        await _deleteCategoria(id, 'Categoria excluída e produtos desvinculados.');

      } else if (result.isDenied) {
        // Option B: Delete Products -> Delete Category
        // Double check for destructiveness
        const confirmCascade = await Swal.fire({
          title: 'Tem certeza absoluta?',
          text: `Você irá apagar ${count} produtos permanentemente. Esta ação não pode ser desfeita.`,
          icon: 'error',
          showCancelButton: true,
          confirmButtonColor: '#d33',
          confirmButtonText: 'Sim, apagar tudo!',
          cancelButtonText: 'Cancelar'
        });

        if (confirmCascade.isConfirmed) {
          const { error: deleteProdError } = await supabase
            .from('produtos')
            .delete()
            .eq('id_categoria', id);
            
          if (deleteProdError) {
            addToast('Erro ao excluir produtos: ' + deleteProdError.message, 'error');
            return;
          }
          await _deleteCategoria(id, 'Categoria e produtos excluídos com sucesso.');
        }
      }
    } else {
      // 3. Simple Delete (No Dependencies)
      Swal.fire({
        title: 'Excluir Categoria',
        text: 'Tem certeza que deseja excluir esta categoria?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sim, excluir!',
        cancelButtonText: 'Cancelar'
      }).then(async (result) => {
        if (result.isConfirmed) {
          await _deleteCategoria(id, 'Categoria excluída.');
        }
      });
    }
  }

  async function _deleteCategoria(id, successMessage) {
    const { error } = await supabase.from('categorias').delete().eq('id', id);
    if (error) {
      addToast(error.message, 'error');
    } else {
      addToast(successMessage, 'success');
      pdvCache.invalidateCategorias();
      await carregarCategorias();
    }
  }
</script>

<section class="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 min-w-0">
  <!-- Header Toolbar -->
  <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
    <div class="flex items-center gap-2">
      <h2 class="font-semibold text-lg text-slate-800 dark:text-white">Categorias</h2>
      <span class="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded-full">{categorias.length}</span>
    </div>
    
    <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">
      {#if selectedItems.size > 0}
        <button class="btn-danger text-sm flex items-center gap-2" on:click={confirmarExclusaoEmMassa}>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          Excluir ({selectedItems.size})
        </button>
      {/if}

      <div class="flex-1 sm:flex-none">
        <input 
          type="text" 
          placeholder="Buscar..." 
          class="input-search"
          bind:value={buscaFilter}
          on:input={() => carregarCategorias()}
        />
      </div>

      <button 
        class="btn-primary flex items-center gap-2" 
        on:click={() => showCreateForm = !showCreateForm}>
        {#if showCreateForm}
          Cancelar
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
          Nova Categoria
        {/if}
      </button>
    </div>
  </div>

  <!-- Collapsible Create Form -->
  {#if showCreateForm}
    <div transition:slide class="bg-blue-50/50 dark:bg-slate-900/50 border-b border-blue-100 dark:border-slate-600 p-4">
      <form on:submit={criarCategoria} class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label class="label-form">Nome da Categoria</label>
          <input class="input-form" bind:value={form.nome} required placeholder="Ex: Bebidas" />
        </div>
        <div>
          <label class="label-form">Ordem de Exibição</label>
          <input class="input-form" type="number" step="1" bind:value={form.ordem} required />
        </div>
        <div class="flex items-end">
           <button class="btn-primary px-6 w-full md:w-auto" type="submit">Salvar Categoria</button>
        </div>
      </form>
    </div>
  {/if}

  <!-- Data Grid Table -->
  <div class="overflow-x-auto relative">
    {#if loading}
      <div class="p-8 text-center text-slate-500">Carregando categorias...</div>
    {:else if categorias.length === 0}
      <div class="p-8 text-center text-slate-500">Nenhuma categoria encontrada.</div>
    {:else}
      <table class="w-full text-left text-sm text-slate-600 dark:text-slate-300 min-w-[500px]">
        <thead class="bg-slate-50 dark:bg-slate-700/50 uppercase font-medium text-xs text-slate-500 dark:text-slate-400">
          <tr>
            <th class="p-4 w-4">
              <input type="checkbox" class="rounded border-slate-300" on:change={toggleSelectAll} checked={sortedCategorias.length > 0 && sortedCategorias.every(c => selectedItems.has(c.id))} />
            </th>
            <th class="p-4 cursor-pointer hover:text-slate-700 dark:hover:text-slate-200" on:click={() => toggleSort('nome')}>
              Nome {#if sortField==='nome'}{sortDesc ? '↓' : '↑'}{/if}
            </th>
            <th class="p-4 cursor-pointer hover:text-slate-700" on:click={() => toggleSort('ordem')}>
              Ordem {#if sortField==='ordem'}{sortDesc ? '↓' : '↑'}{/if}
            </th>
            <th class="p-4 text-right">Ações</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
          {#each sortedCategorias as c (c.id)}
            {#if editingId === c.id}
               <!-- Row Editing Mode -->
               <tr class="bg-blue-50/30 dark:bg-blue-900/10">
                 <td class="p-4"></td>
                 <td colspan="2" class="p-4">
                    <form on:submit={saveEdit} class="flex gap-4">
                       <input class="input-form flex-1" bind:value={editForm.nome} placeholder="Nome" required />
                       <input class="input-form w-24" type="number" bind:value={editForm.ordem} placeholder="Ordem" required />
                       <button type="submit" class="btn-primary text-xs">Salvar</button>
                       <button type="button" class="btn-ghost text-xs" on:click={cancelEdit}>Cancelar</button>
                    </form>
                 </td>
                 <td class="p-4"></td>
               </tr>
            {:else}
              <!-- Normal Row -->
              <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/30 group transition-colors">
                <td class="p-4">
                  <input type="checkbox" class="rounded border-slate-300" checked={selectedItems.has(c.id)} on:change={() => toggleSelect(c.id)} />
                </td>
                <td class="p-4 font-medium text-slate-900 dark:text-white">{c.nome}</td>
                <td class="p-4">{c.ordem}</td>
                <td class="p-4 text-right">
                  <div class="flex justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button class="p-2 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-slate-500" title="Editar" on:click={() => startEdit(c)}>
                       <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                    <button class="p-2 hover:bg-red-100 dark:hover:bg-red-900/40 rounded text-red-500" title="Excluir" on:click={() => confirmarExclusaoCategoria(c.id)}>
                       <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</section>

<style lang="postcss">
  /* Styles handled exclusively by global Tailwind classes where possible, or specific consistent scoped styles */
  .input-form { @apply block w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600; }
  .input-search { @apply w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600 pl-4; }
  .label-form { @apply block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1; }
  
  .btn-primary { @apply bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md shadow-sm transition-colors duration-200; }
  .btn-danger { @apply bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md shadow-sm transition-colors duration-200; }
  .btn-ghost { @apply bg-transparent hover:bg-slate-100 text-slate-600 font-medium py-1 px-3 rounded transition-colors duration-200; }
</style>

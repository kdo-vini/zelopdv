<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { pdvCache } from '$lib/stores/pdvCache';
  import { addToast } from '$lib/stores/ui'; 
  import { slide } from 'svelte/transition';
  import Swal from 'sweetalert2';

  // --- State ---
  let produtos = [];
  let categorias = [];
  let subcategorias = [];
  let filterSubcategorias = [];

  // Filtros
  let idCategoriaFilter = null;
  let idSubcategoriaFilter = null;
  let buscaFilter = '';

  // UI State
  let loading = true;
  let showCreateForm = false;
  let selectedItems = new Set();
  
  // Pagination & Sorting
  let currentPage = 1;
  const itemsPerPage = 10;
  let sortField = 'nome'; // 'nome' | 'preco' | 'estoque_atual'
  let sortDesc = false;

  // Form
  let form = { nome: '', preco: 0, id_categoria: null, id_subcategoria: null, eh_item_por_unidade: false, ocultar_no_pdv: false, controlar_estoque: false, estoque_atual: 0 };
  let editingId = null;
  let editForm = {};

  // --- Lifecycle ---
  onMount(async () => {
    await Promise.all([carregarCategorias(), carregarSubcategorias()]);
    await carregarProdutos();
    loading = false;
  });

  // --- Data Loading ---
  async function carregarCategorias() {
    const { data, error } = await supabase.from('categorias').select('*').order('ordem', { ascending: true });
    if (error) addToast(error.message, 'error'); else categorias = data || [];
  }

  async function carregarSubcategorias() {
    const { data, error } = await supabase.from('subcategorias').select('id, id_categoria, nome, ordem').order('ordem', { ascending: true });
    if (error) addToast(error.message, 'error'); else {
      subcategorias = data || [];
      filterSubcategorias = data || [];
    }
  }

  async function carregarProdutos() {
    loading = true;
    try {
      let q = supabase.from('produtos').select('*');
      
      if (idCategoriaFilter) q = q.eq('id_categoria', Number(idCategoriaFilter));
      if (idSubcategoriaFilter) q = q.eq('id_subcategoria', Number(idSubcategoriaFilter));
      if (buscaFilter && String(buscaFilter).trim() !== '') q = q.ilike('nome', `%${String(buscaFilter).trim()}%`);

      const { data, error } = await q.order('nome', { ascending: true });
      if (error) { 
        addToast(error.message, 'error');
        produtos = []; 
      }
      else produtos = data || [];
      
      currentPage = 1;
      selectedItems.clear(); 
    } finally {
      loading = false;
    }
  }

  // --- Computed ---
  $: filteredSubcatsForForm = form.id_categoria 
    ? subcategorias.filter(s => s.id_categoria === form.id_categoria)
    : [];

  $: filteredSubcatsForEdit = editForm.id_categoria
    ? subcategorias.filter(s => s.id_categoria === editForm.id_categoria)
    : [];
    
  $: filteredSubcatsForFilter = idCategoriaFilter
    ? subcategorias.filter(s => s.id_categoria === Number(idCategoriaFilter))
    : subcategorias;

  // Client-side Sorting & Pagination
  $: sortedProdutos = [...produtos].sort((a, b) => {
    const valA = a[sortField];
    const valB = b[sortField];
    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  });

  $: totalPages = Math.ceil(sortedProdutos.length / itemsPerPage);
  $: paginatedProdutos = sortedProdutos.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // --- Actions ---

  async function criarProduto(e) {
    e.preventDefault();
    const { data: userData } = await supabase.auth.getUser();
    const id_usuario = userData?.user?.id ?? null;
    
    const payload = { ...form, id_usuario };
    if (!payload.id_subcategoria) payload.id_subcategoria = null;

    const { error } = await supabase.from('produtos').insert(payload);
    if (error) { addToast(error.message, 'error'); return; }
    
    addToast('Produto criado com sucesso!', 'success');
    resetForm();
    showCreateForm = false;
    pdvCache.invalidateProdutos();
    await carregarProdutos();
  }

  function resetForm() {
    form = { nome: '', preco: 0, id_categoria: null, id_subcategoria: null, eh_item_por_unidade: false, ocultar_no_pdv: false, controlar_estoque: false, estoque_atual: 0 };
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
      paginatedProdutos.forEach(p => selectedItems.add(p.id));
    } else {
      paginatedProdutos.forEach(p => selectedItems.delete(p.id));
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
      title: 'Excluir Produtos',
      text: `Tem certeza que deseja excluir ${selectedItems.size} produtos selecionados?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sim, excluir!',
      cancelButtonText: 'Cancelar'
    }).then(async (result) => {
      if (result.isConfirmed) {
        const ids = Array.from(selectedItems);
        const { error } = await supabase.from('produtos').delete().in('id', ids);
        if (error) addToast(error.message, 'error');
        else {
          addToast(`${ids.length} produtos excluídos.`, 'success');
          pdvCache.invalidateProdutos();
          selectedItems.clear();
          await carregarProdutos();
        }
      }
    });
  }

  // Row Actions
  function startEdit(prod) {
    editingId = prod.id;
    editForm = { ...prod };
  }

  function cancelEdit() {
    editingId = null;
    editForm = {};
  }

  async function saveEdit(e) {
    e.preventDefault();
    const { error } = await supabase.from('produtos').update({
      nome: editForm.nome,
      preco: editForm.preco,
      id_categoria: editForm.id_categoria,
      id_subcategoria: editForm.id_subcategoria || null,
      eh_item_por_unidade: editForm.eh_item_por_unidade,
      ocultar_no_pdv: editForm.ocultar_no_pdv,
      controlar_estoque: editForm.controlar_estoque,
      estoque_atual: editForm.controlar_estoque ? editForm.estoque_atual : 0
    }).eq('id', editingId);

    if (error) addToast(error.message, 'error');
    else {
      addToast('Produto atualizado!', 'success');
      editingId = null;
      pdvCache.invalidateProdutos();
      await carregarProdutos();
    }
  }

  function confirmarExclusaoProduto(id) {
    Swal.fire({
      title: 'Excluir Produto',
      text: 'Tem certeza que deseja excluir este produto?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sim, excluir!',
      cancelButtonText: 'Cancelar'
    }).then(async (result) => {
      if (result.isConfirmed) {
        const { error } = await supabase.from('produtos').delete().eq('id', id);
        if (error) addToast(error.message, 'error');
        else {
          addToast('Produto excluído.', 'success');
          pdvCache.invalidateProdutos();
          await carregarProdutos();
        }
      }
    });
  }
  
  // Helpers
  function getCategoriaNome(id) {
    return categorias.find(c => c.id === id)?.nome || '-';
  }
</script>

<section class="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700">
  <!-- Header Toolbar -->
  <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
    <div class="flex items-center gap-2">
      <h2 class="font-semibold text-lg text-slate-800 dark:text-white">Produtos</h2>
      <span class="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded-full">{produtos.length}</span>
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
          on:input={() => carregarProdutos()}
        />
      </div>

      <button 
        class="btn-primary flex items-center gap-2" 
        on:click={() => showCreateForm = !showCreateForm}>
        {#if showCreateForm}
          Cancelar
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
          Novo Produto
        {/if}
      </button>
    </div>
  </div>

  <!-- Filters Row -->
  <div class="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 flex flex-wrap gap-3 text-sm">
      <div class="flex items-center gap-2">
        <span class="text-slate-500">Filtrar:</span>
        <select class="input-filter" bind:value={idCategoriaFilter} on:change={() => { idSubcategoriaFilter = null; carregarProdutos(); }}>
          <option value={null}>Todas Categorias</option>
          {#each categorias as c}
            <option value={c.id}>{c.nome}</option>
          {/each}
        </select>
        
        <select class="input-filter" bind:value={idSubcategoriaFilter} disabled={!idCategoriaFilter} on:change={carregarProdutos}>
          <option value={null}>Todas Subcategorias</option>
          {#each filteredSubcatsForFilter as s}
            <option value={s.id}>{s.nome}</option>
          {/each}
        </select>
      </div>
      
      {#if idCategoriaFilter || idSubcategoriaFilter || buscaFilter}
        <button class="text-blue-600 hover:underline text-xs" on:click={() => { idCategoriaFilter=null; idSubcategoriaFilter=null; buscaFilter=''; carregarProdutos(); }}>
          Limpar Filtros
        </button>
      {/if}
  </div>

  <!-- Collapsible Create Form -->
  {#if showCreateForm}
    <div transition:slide class="bg-blue-50/50 dark:bg-slate-900/50 border-b border-blue-100 dark:border-slate-600 p-4">
      <form on:submit={criarProduto} class="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="lg:col-span-1">
          <label class="label-form">Nome</label>
          <input class="input-form" bind:value={form.nome} required placeholder="Ex: Coca-Cola" />
        </div>
        <div class="lg:col-span-1">
          <label class="label-form">Preço</label>
          <input class="input-form" type="number" step="0.01" min="0" bind:value={form.preco} required />
        </div>
        <div>
          <label class="label-form">Categoria</label>
          <select class="input-form" bind:value={form.id_categoria} required>
            <option value={null} disabled>Selecione...</option>
            {#each categorias as c}
              <option value={c.id}>{c.nome}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="label-form">Subcategoria</label>
          <select class="input-form" bind:value={form.id_subcategoria} disabled={!form.id_categoria}>
            <option value={null}>—</option>
            {#each filteredSubcatsForForm as s}
              <option value={s.id}>{s.nome}</option>
            {/each}
          </select>
        </div>

        <!-- Toggles -->
        <div class="lg:col-span-4 flex flex-wrap gap-6 items-center pt-2">
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" bind:checked={form.eh_item_por_unidade} class="rounded text-blue-600 focus:ring-blue-500" />
            <span>Venda por unidade</span>
          </label>
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" bind:checked={form.ocultar_no_pdv} class="rounded text-blue-600 focus:ring-blue-500" />
            <span>Ocultar no PDV</span>
          </label>
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" bind:checked={form.controlar_estoque} class="rounded text-blue-600 focus:ring-blue-500" />
            <span>Controlar Estoque</span>
          </label>
          
          {#if form.controlar_estoque}
            <div class="flex items-center gap-2 animate-fadeIn">
               <span class="text-sm text-slate-600">Qtd Inicial:</span>
               <input type="number" step="1" min="0" class="input-form w-24 py-1" bind:value={form.estoque_atual} />
            </div>
          {/if}

          <div class="flex-1 text-right">
             <button class="btn-primary px-6" type="submit">Salvar Produto</button>
          </div>
        </div>
      </form>
    </div>
  {/if}

  <!-- Data Grid Table -->
  <div class="overflow-x-auto relative">
    {#if loading}
      <div class="p-8 text-center text-slate-500">Carregando produtos...</div>
    {:else if produtos.length === 0}
      <div class="p-8 text-center text-slate-500">Nenhum produto encontrado.</div>
    {:else}
      <table class="w-full text-left text-sm text-slate-600 dark:text-slate-300">
        <thead class="bg-slate-50 dark:bg-slate-700/50 uppercase font-medium text-xs text-slate-500 dark:text-slate-400">
          <tr>
            <th class="p-4 w-4">
              <input type="checkbox" class="rounded border-slate-300" on:change={toggleSelectAll} checked={paginatedProdutos.length > 0 && paginatedProdutos.every(p => selectedItems.has(p.id))} />
            </th>
            <th class="p-4 cursor-pointer hover:text-slate-700 dark:hover:text-slate-200" on:click={() => toggleSort('nome')}>
              Nome {#if sortField==='nome'}{sortDesc ? '↓' : '↑'}{/if}
            </th>
            <th class="p-4 cursor-pointer hover:text-slate-700" on:click={() => toggleSort('preco')}>
              Preço {#if sortField==='preco'}{sortDesc ? '↓' : '↑'}{/if}
            </th>
            <th class="p-4">Categoria</th>
            <th class="p-4 text-center cursor-pointer hover:text-slate-700" on:click={() => toggleSort('estoque_atual')}>
              Estoque {#if sortField==='estoque_atual'}{sortDesc ? '↓' : '↑'}{/if}
            </th>
            <th class="p-4 text-right">Ações</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
          {#each paginatedProdutos as p (p.id)}
            {#if editingId === p.id}
               <!-- Row Editing Mode -->
               <tr class="bg-blue-50/30 dark:bg-blue-900/10">
                 <td class="p-4"></td>
                 <td colspan="5" class="p-4">
                    <form on:submit={saveEdit} class="grid gap-4">
                       <div class="flex gap-4">
                         <input class="input-form flex-1" bind:value={editForm.nome} placeholder="Nome" required />
                         <input class="input-form w-32" type="number" step="0.01" bind:value={editForm.preco} placeholder="Preço" required />
                       </div>
                       <div class="flex gap-4">
                          <select class="input-form flex-1" bind:value={editForm.id_categoria}>
                             {#each categorias as c}<option value={c.id}>{c.nome}</option>{/each}
                          </select>
                          <select class="input-form flex-1" bind:value={editForm.id_subcategoria}>
                             <option value={null}>- Subcategoria -</option>
                             {#each filteredSubcatsForEdit as s}<option value={s.id}>{s.nome}</option>{/each}
                          </select>
                       </div>
                       <div class="flex items-center justify-between">
                          <div class="flex gap-4">
                             <label class="flex items-center gap-2 text-xs"><input type="checkbox" bind:checked={editForm.controlar_estoque}> Estoque</label>
                             {#if editForm.controlar_estoque}
                               <input type="number" class="input-form w-20 py-1 text-xs" bind:value={editForm.estoque_atual} />
                             {/if}
                          </div>
                          <div class="flex gap-2">
                             <button type="button" class="btn-ghost text-xs" on:click={cancelEdit}>Cancelar</button>
                             <button type="submit" class="btn-primary text-xs">Salvar</button>
                          </div>
                       </div>
                    </form>
                 </td>
               </tr>
            {:else}
              <!-- Normal Row -->
              <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/30 group transition-colors">
                <td class="p-4">
                  <input type="checkbox" class="rounded border-slate-300" checked={selectedItems.has(p.id)} on:change={() => toggleSelect(p.id)} />
                </td>
                <td class="p-4 font-medium text-slate-900 dark:text-white">
                  {p.nome}
                  {#if p.ocultar_no_pdv}
                    <span class="ml-2 text-[10px] uppercase tracking-wider text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">Oculto</span>
                  {/if}
                </td>
                <td class="p-4">R$ {Number(p.preco).toFixed(2)}</td>
                <td class="p-4 text-slate-500">
                  <div class="text-xs">{getCategoriaNome(p.id_categoria)}</div>
                </td>
                <td class="p-4 text-center">
                  {#if p.controlar_estoque}
                     <span class={`rounded-full px-2 py-0.5 text-xs font-bold ${p.estoque_atual < 5 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                       {p.estoque_atual}
                     </span>
                  {:else}
                     <span class="text-slate-400 text-xs">-</span>
                  {/if}
                </td>
                <td class="p-4 text-right">
                  <div class="flex justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button class="p-2 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-slate-500" title="Editar" on:click={() => startEdit(p)}>
                       <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                    <button class="p-2 hover:bg-red-100 dark:hover:bg-red-900/40 rounded text-red-500" title="Excluir" on:click={() => confirmarExclusaoProduto(p.id)}>
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

  <!-- Pagination -->
  {#if totalPages > 1}
    <div class="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-sm">
      <div class="text-slate-500">
        Página {currentPage} de {totalPages}
      </div>
      <div class="flex gap-2">
        <button 
          class="px-3 py-1 border rounded hover:bg-slate-50 disabled:opacity-50"
          disabled={currentPage === 1}
          on:click={() => currentPage--}>
          Anterior
        </button>
        <button 
          class="px-3 py-1 border rounded hover:bg-slate-50 disabled:opacity-50"
          disabled={currentPage === totalPages}
          on:click={() => currentPage++}>
          Próxima
        </button>
      </div>
    </div>
  {/if}
</section>

<style lang="postcss">
  /* Usa classes globais em src/app.css (.input-form, .btn-*) */
</style>

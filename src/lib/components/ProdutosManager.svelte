<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { pdvCache } from '$lib/stores/pdvCache';
  let produtos = [];
  let categorias = [];
  let subcategorias = [];
  // filtros para a listagem
  let idCategoriaFilter = null;
  let idSubcategoriaFilter = null;
  let buscaFilter = '';
  let errorMessage = '';
  let loading = true;

  let form = { nome: '', preco: 0, id_categoria: null, id_subcategoria: null, eh_item_por_unidade: false, ocultar_no_pdv: false, controlar_estoque: false, estoque_atual: 0 };
  let editingId = null;
  let editForm = {};

  onMount(async () => {
    await carregarCategorias();
    await carregarSubcategorias();
    await carregarProdutos();
    loading = false;
  });

  /** Busca categorias para popular selects do formulário. */
  async function carregarCategorias() {
    const { data, error } = await supabase.from('categorias').select('*').order('ordem', { ascending: true });
    if (error) errorMessage = error.message; else categorias = data;
  }
  async function carregarSubcategorias() {
    // subcategorias usadas no formulário (baseado na categoria do formulário)
    let q = supabase.from('subcategorias').select('id, id_categoria, nome, ordem').order('ordem', { ascending: true });
    if (form.id_categoria) q = q.eq('id_categoria', form.id_categoria);
    const { data, error } = await q;
    if (error) errorMessage = error.message; else subcategorias = data || [];
  }

  async function carregarSubcategoriasFiltro(catId) {
    // subcategorias para os filtros (independente do formulário)
    let q = supabase.from('subcategorias').select('id, id_categoria, nome, ordem').order('ordem', { ascending: true });
    if (catId) q = q.eq('id_categoria', catId);
    const { data, error } = await q;
    if (error) { /* não bloqueia */ } else filterSubcategorias = data || [];
  }

  // guarda as subcategorias do filtro sem conflitar com o select do form
  let filterSubcategorias = [];

  /** Lista produtos ordenados por nome. */
  async function carregarProdutos() {
    // aplica filtros da UI (categoria, subcategoria, busca)
    try {
      loading = true;
      let q = supabase.from('produtos').select('*');
      if (idCategoriaFilter) q = q.eq('id_categoria', Number(idCategoriaFilter));
      if (idSubcategoriaFilter) q = q.eq('id_subcategoria', Number(idSubcategoriaFilter));
      if (buscaFilter && String(buscaFilter).trim() !== '') q = q.ilike('nome', `%${String(buscaFilter).trim()}%`);
      const { data, error } = await q.order('nome', { ascending: true });
      if (error) { errorMessage = error.message; produtos = []; }
      else produtos = data || [];
    } finally {
      loading = false;
    }
  }

  /** Cria novo produto com os campos informados. */
  async function criarProduto(e) {
    e.preventDefault();
    const { data: userData } = await supabase.auth.getUser();
    const id_usuario = userData?.user?.id ?? null;
    const { error } = await supabase.from('produtos').insert({
      id_usuario,
      nome: form.nome,
      preco: form.preco,
      id_categoria: form.id_categoria,
      id_subcategoria: form.id_subcategoria,
      eh_item_por_unidade: form.eh_item_por_unidade,
      ocultar_no_pdv: form.ocultar_no_pdv,
      controlar_estoque: form.controlar_estoque,
      estoque_atual: form.controlar_estoque ? form.estoque_atual : 0
    });
    if (error) { errorMessage = error.message; return; }
    form = { nome: '', preco: 0, id_categoria: form.id_categoria, id_subcategoria: null, eh_item_por_unidade: false, ocultar_no_pdv: false, controlar_estoque: false, estoque_atual: 0 };
    pdvCache.invalidateProdutos();
    await carregarProdutos();
  }

  /** Entra no modo de edição para um produto. */
  function startEdit(prod) {
    editingId = prod.id;
    editForm = { ...prod };
  }

  /** Cancela a edição em andamento. */
  function cancelEdit() {
    editingId = null;
    editForm = {};
  }

  /** Salva alterações de um produto existente. */
  async function saveEdit(e) {
    e.preventDefault();
    const { error } = await supabase.from('produtos').update({
      nome: editForm.nome,
      preco: editForm.preco,
      id_categoria: editForm.id_categoria,
      id_subcategoria: editForm.id_subcategoria,
      eh_item_por_unidade: editForm.eh_item_por_unidade,
      ocultar_no_pdv: editForm.ocultar_no_pdv,
      controlar_estoque: editForm.controlar_estoque,
      estoque_atual: editForm.controlar_estoque ? editForm.estoque_atual : 0
    }).eq('id', editingId);
    if (error) { errorMessage = error.message; return; }
    editingId = null;
    pdvCache.invalidateProdutos();
    await carregarProdutos();
  }

  /** Exclui um produto após confirmação do usuário. */
  async function excluirProduto(id) {
    if (!confirm('Excluir este produto?')) return;
    const { error } = await supabase.from('produtos').delete().eq('id', id);
    if (error) { errorMessage = error.message; return; }
    pdvCache.invalidateProdutos();
    await carregarProdutos();
  }
</script>

<section class="bg-white dark:bg-slate-800 rounded-lg shadow">
  <div class="p-4 border-b font-semibold">Produtos</div>
  <div class="p-4">
    {#if errorMessage}
      <div class="mb-4 text-sm text-red-600">{errorMessage}</div>
    {/if}
    <!-- Filtros: categoria / subcategoria / busca -->
    <div class="mb-4">
      <div class="flex flex-wrap items-center gap-2 mb-2">
        <select class="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 min-w-[12rem]"
          bind:value={idCategoriaFilter}
          on:change={async()=>{ idCategoriaFilter = idCategoriaFilter ? Number(idCategoriaFilter) : null; idSubcategoriaFilter = null; await carregarSubcategoriasFiltro(idCategoriaFilter); await carregarProdutos(); }}>
          <option value={null}>Todas as categorias</option>
          {#each categorias as c}
            <option value={c.id}>{c.nome}</option>
          {/each}
        </select>
        <select class="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 min-w-[12rem] disabled:opacity-50"
          bind:value={idSubcategoriaFilter}
          disabled={!idCategoriaFilter}
          on:change={async()=>{ idSubcategoriaFilter = idSubcategoriaFilter ? Number(idSubcategoriaFilter) : null; await carregarProdutos(); }}>
          <option value={null}>Todas as subcategorias</option>
          {#each filterSubcategorias as s}
            <option value={s.id}>{s.nome}</option>
          {/each}
        </select>
        <input placeholder="Buscar produtos..." class="w-full sm:w-80 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2" bind:value={buscaFilter} on:input={async()=>{ await carregarProdutos(); }} />
        <button class="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" on:click={carregarProdutos}>Aplicar</button>
        {#if idCategoriaFilter || idSubcategoriaFilter || (buscaFilter && buscaFilter.trim() !== '')}
          <button class="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" on:click={async()=>{ idCategoriaFilter=null; idSubcategoriaFilter=null; buscaFilter=''; filterSubcategorias=[]; await carregarProdutos(); }}>Limpar filtros</button>
        {/if}
      </div>
    </div>

    <form on:submit={criarProduto} class="grid md:grid-cols-2 gap-4 mb-6">
      <div>
        <label for="comp-prod-nome" class="block text-sm mb-1">Nome</label>
        <input id="comp-prod-nome" class="input-form" bind:value={form.nome} required />
      </div>
      <div>
        <label for="comp-prod-preco" class="block text-sm mb-1">Preço</label>
        <input id="comp-prod-preco" type="number" step="0.01" min="0" class="input-form" bind:value={form.preco} required />
      </div>
      <div>
        <label for="comp-prod-categoria" class="block text-sm mb-1">Categoria</label>
        <select id="comp-prod-categoria" class="input-form" bind:value={form.id_categoria} required on:change={async()=>{ form.id_subcategoria=null; await carregarSubcategorias(); }}>
          <option value={null} disabled>Selecione...</option>
          {#each categorias as c}
            <option value={c.id}>{c.nome}</option>
          {/each}
        </select>
      </div>
      <div>
        <label for="comp-prod-subcat" class="block text-sm mb-1">Subcategoria (opcional)</label>
        <select id="comp-prod-subcat" class="input-form" bind:value={form.id_subcategoria}>
          <option value={null}>—</option>
          {#each subcategorias as s}
            <option value={s.id}>{s.nome}</option>
          {/each}
        </select>
      </div>
      <div class="flex items-center gap-3">
        <label class="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={form.eh_item_por_unidade} /> Por unidade
        </label>
        <label class="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={form.ocultar_no_pdv} /> Ocultar no PDV
        </label>
        <label class="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={form.controlar_estoque} /> Controlar estoque
        </label>
      </div>
      {#if form.controlar_estoque}
        <div>
          <label for="comp-prod-estoque" class="block text-sm mb-1">Estoque atual</label>
          <input id="comp-prod-estoque" type="number" step="1" min="0" class="input-form" bind:value={form.estoque_atual} />
        </div>
      {/if}
      <div class="md:col-span-2">
        <button class="btn-primary">Salvar</button>
      </div>
    </form>

    {#if loading}
      <div>Carregando...</div>
    {:else}
      <div class="divide-y">
        {#each produtos as p}
          <div class="py-3">
            {#if editingId === p.id}
              <form on:submit={saveEdit} class="grid md:grid-cols-2 gap-4">
                <div>
                  <label for={`comp-edit-prod-nome-${p.id}`} class="block text-sm mb-1">Nome</label>
                  <input id={`comp-edit-prod-nome-${p.id}`} class="input-form" bind:value={editForm.nome} required />
                </div>
                <div>
                  <label for={`comp-edit-prod-preco-${p.id}`} class="block text-sm mb-1">Preço</label>
                  <input id={`comp-edit-prod-preco-${p.id}`} type="number" step="0.01" min="0" class="input-form" bind:value={editForm.preco} required />
                </div>
                <div>
                  <label for={`comp-edit-prod-categoria-${p.id}`} class="block text-sm mb-1">Categoria</label>
                  <select id={`comp-edit-prod-categoria-${p.id}`} class="input-form" bind:value={editForm.id_categoria} required on:change={async()=>{
                    // Recarrega subcategorias quando categoria muda no modo edição
                    let q = supabase.from('subcategorias').select('id, id_categoria, nome, ordem').order('ordem', { ascending: true });
                    if (editForm.id_categoria) q = q.eq('id_categoria', editForm.id_categoria);
                    const { data } = await q; subcategorias = data || []; editForm.id_subcategoria = null;
                  }}>
                    {#each categorias as c}
                      <option value={c.id}>{c.nome}</option>
                    {/each}
                  </select>
                </div>
                <div>
                  <label for={`comp-edit-prod-subcat-${p.id}`} class="block text-sm mb-1">Subcategoria (opcional)</label>
                  <select id={`comp-edit-prod-subcat-${p.id}`} class="input-form" bind:value={editForm.id_subcategoria}>
                    <option value={null}>—</option>
                    {#each subcategorias as s}
                      <option value={s.id}>{s.nome}</option>
                    {/each}
                  </select>
                </div>
                <div class="flex items-center gap-3">
                  <label class="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" bind:checked={editForm.eh_item_por_unidade} /> Por unidade
                  </label>
                  <label class="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" bind:checked={editForm.ocultar_no_pdv} /> Ocultar no PDV
                  </label>
                  <label class="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" bind:checked={editForm.controlar_estoque} /> Controlar estoque
                  </label>
                </div>
                {#if editForm.controlar_estoque}
                  <div>
                    <label for={`comp-edit-prod-estoque-${p.id}`} class="block text-sm mb-1">Estoque atual</label>
                    <input id={`comp-edit-prod-estoque-${p.id}`} type="number" step="1" min="0" class="input-form" bind:value={editForm.estoque_atual} />
                  </div>
                {/if}
                <div class="md:col-span-2 flex gap-2">
                  <button class="btn-primary">Salvar</button>
                  <button type="button" class="btn-secondary" on:click={cancelEdit}>Cancelar</button>
                </div>
              </form>
            {:else}
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-medium">{p.nome}</div>
                  <div class="text-sm text-slate-500">R$ {Number(p.preco).toFixed(2)}</div>
                </div>
                <div class="flex gap-2">
                  <button class="btn-secondary" on:click={() => startEdit(p)}>Editar</button>
                  <button class="btn-danger" on:click={() => excluirProduto(p.id)}>Excluir</button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>

<style lang="postcss">
  /* Usa classes globais em src/app.css (.input-form, .btn-*) */
</style>

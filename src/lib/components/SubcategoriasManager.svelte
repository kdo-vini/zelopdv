<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';

  let categorias = [];
  let subcategorias = [];
  let errorMessage = '';
  let loading = true;

  // Filtros e formulários
  let catFiltro = null; // opção de filtrar por categoria
  let form = { id_categoria: null, nome: '', ordem: 0 };
  let editingId = null;
  let editForm = {};

  onMount(async () => {
    await carregarCategorias();
    await carregarSubcategorias();
    loading = false;
  });

  async function carregarCategorias(){
    const { data, error } = await supabase.from('categorias').select('id, nome, ordem').order('ordem', { ascending: true });
    if (error) errorMessage = error.message; else categorias = data||[];
    if (categorias.length && form.id_categoria == null) form.id_categoria = categorias[0].id;
  }
  async function carregarSubcategorias(){
    let q = supabase.from('subcategorias').select('id, id_categoria, nome, ordem').order('ordem', { ascending: true });
    if (catFiltro) q = q.eq('id_categoria', catFiltro);
    const { data, error } = await q;
    if (error) errorMessage = error.message; else subcategorias = data||[];
  }

  async function criar(e){
    e.preventDefault();
    const { data: userData } = await supabase.auth.getUser();
    const id_usuario = userData?.user?.id ?? null;
    const payload = { id_usuario, id_categoria: form.id_categoria, nome: form.nome, ordem: form.ordem };
    const { error } = await supabase.from('subcategorias').insert(payload);
    if (error) { errorMessage = error.message; return; }
    form = { id_categoria: form.id_categoria, nome: '', ordem: 0 };
    await carregarSubcategorias();
  }

  function startEdit(s){ editingId = s.id; editForm = { ...s }; }
  function cancelEdit(){ editingId = null; editForm = {}; }

  async function saveEdit(e){
    e.preventDefault();
    const { error } = await supabase.from('subcategorias').update({ id_categoria: editForm.id_categoria, nome: editForm.nome, ordem: editForm.ordem }).eq('id', editingId);
    if (error) { errorMessage = error.message; return; }
    editingId = null;
    await carregarSubcategorias();
  }

  async function excluir(id){
    if(!confirm('Excluir esta subcategoria?')) return;
    const { error } = await supabase.from('subcategorias').delete().eq('id', id);
    if (error) { errorMessage = error.message; return; }
    await carregarSubcategorias();
  }
</script>

<section class="bg-white dark:bg-slate-800 rounded-lg shadow">
  <div class="p-4 border-b font-semibold">Subcategorias</div>
  <div class="p-4 space-y-6">
    {#if errorMessage}
      <div class="text-sm text-red-600">{errorMessage}</div>
    {/if}

    <div class="flex items-end gap-3">
      <div>
        <label for="subcat-filtro" class="block text-sm mb-1">Filtrar por categoria</label>
        <select id="subcat-filtro" class="input-form" bind:value={catFiltro} on:change={carregarSubcategorias}>
          <option value={null}>Todas</option>
          {#each categorias as c}
            <option value={c.id}>{c.nome}</option>
          {/each}
        </select>
      </div>
    </div>

    <form on:submit={criar} class="grid md:grid-cols-3 gap-4">
      <div>
        <label for="subcat-cat" class="block text-sm mb-1">Categoria</label>
        <select id="subcat-cat" class="input-form" bind:value={form.id_categoria} required>
          {#each categorias as c}
            <option value={c.id}>{c.nome}</option>
          {/each}
        </select>
      </div>
      <div>
        <label for="subcat-nome" class="block text-sm mb-1">Nome</label>
        <input id="subcat-nome" class="input-form" bind:value={form.nome} required />
      </div>
      <div>
        <label for="subcat-ordem" class="block text-sm mb-1">Ordem</label>
        <input id="subcat-ordem" type="number" class="input-form" bind:value={form.ordem} required />
      </div>
      <div class="md:col-span-3">
        <button class="btn-primary">Salvar</button>
      </div>
    </form>

    {#if loading}
      <div>Carregando...</div>
    {:else}
      <div class="divide-y">
        {#each subcategorias as s}
          <div class="py-3">
            {#if editingId === s.id}
              <form on:submit={saveEdit} class="grid md:grid-cols-3 gap-4">
                <div>
                  <label for={`subcat-edit-cat-${s.id}`} class="block text-sm mb-1">Categoria</label>
                  <select id={`subcat-edit-cat-${s.id}`} class="input-form" bind:value={editForm.id_categoria}>
                    {#each categorias as c}
                      <option value={c.id}>{c.nome}</option>
                    {/each}
                  </select>
                </div>
                <div>
                  <label for={`subcat-edit-nome-${s.id}`} class="block text-sm mb-1">Nome</label>
                  <input id={`subcat-edit-nome-${s.id}`} class="input-form" bind:value={editForm.nome} required />
                </div>
                <div>
                  <label for={`subcat-edit-ordem-${s.id}`} class="block text-sm mb-1">Ordem</label>
                  <input id={`subcat-edit-ordem-${s.id}`} type="number" class="input-form" bind:value={editForm.ordem} required />
                </div>
                <div class="md:col-span-3 flex gap-2">
                  <button class="btn-primary">Salvar</button>
                  <button type="button" class="btn-secondary" on:click={cancelEdit}>Cancelar</button>
                </div>
              </form>
            {:else}
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-medium">{s.nome}</div>
                  <div class="text-sm text-slate-500">Ordem: {s.ordem}</div>
                </div>
                <div class="flex gap-2">
                  <button class="btn-secondary" on:click={() => startEdit(s)}>Editar</button>
                  <button class="btn-danger" on:click={() => excluir(s.id)}>Excluir</button>
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
  .input-form { @apply block w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-slate-900 placeholder-slate-500 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600 dark:placeholder-slate-400; }
  .btn-primary { @apply inline-flex items-center justify-center px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700; }
  .btn-secondary { @apply inline-flex items-center justify-center px-3 py-2 rounded-md border hover:bg-slate-100 dark:hover:bg-slate-700; }
  .btn-danger { @apply inline-flex items-center justify-center px-3 py-2 rounded-md bg-red-600 text-white hover:bg-red-700; }
</style>

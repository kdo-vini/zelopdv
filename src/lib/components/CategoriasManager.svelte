<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';

  let categorias = [];
  let errorMessage = '';
  let loading = true;

  let form = { nome: '', ordem: 0 };
  let editingId = null;
  let editForm = {};

  onMount(async () => {
    await carregar();
    loading = false;
  });

  async function carregar() {
    const { data, error } = await supabase.from('categorias').select('*').order('ordem', { ascending: true });
    if (error) errorMessage = error.message; else categorias = data;
  }

  async function criar(e) {
    e.preventDefault();
    const { data: userData } = await supabase.auth.getUser();
    const id_usuario = userData?.user?.id ?? null;
    const { error } = await supabase.from('categorias').insert({ id_usuario, nome: form.nome, ordem: form.ordem });
    if (error) { errorMessage = error.message; return; }
    form = { nome: '', ordem: 0 };
    await carregar();
  }

  function startEdit(c) {
    editingId = c.id;
    editForm = { ...c };
  }

  function cancelEdit() {
    editingId = null;
    editForm = {};
  }

  async function saveEdit(e) {
    e.preventDefault();
    const { error } = await supabase.from('categorias').update({ nome: editForm.nome, ordem: editForm.ordem }).eq('id', editingId);
    if (error) { errorMessage = error.message; return; }
    editingId = null;
    await carregar();
  }

  async function excluir(id) {
    if (!confirm('Excluir esta categoria?')) return;
    const { error } = await supabase.from('categorias').delete().eq('id', id);
    if (error) { errorMessage = error.message; return; }
    await carregar();
  }
</script>

<section class="bg-white dark:bg-slate-800 rounded-lg shadow">
  <div class="p-4 border-b font-semibold">Categorias</div>
  <div class="p-4">
    {#if errorMessage}
      <div class="mb-4 text-sm text-red-600">{errorMessage}</div>
    {/if}
    <form on:submit={criar} class="grid md:grid-cols-2 gap-4 mb-6">
      <div>
        <label for="comp-cat-nome" class="block text-sm mb-1">Nome</label>
        <input id="comp-cat-nome" class="input-form" bind:value={form.nome} required />
<style lang="postcss">
  /* Usa classes globais em src/app.css (.input-form, .btn-*) */
</style>
      <div class="md:col-span-2">
        <button class="btn-primary">Salvar</button>
      </div>
    </form>

    {#if loading}
      <div>Carregando...</div>
    {:else}
      <div class="divide-y">
        {#each categorias as c}
          <div class="py-3">
            {#if editingId === c.id}
              <form on:submit={saveEdit} class="grid md:grid-cols-2 gap-4">
                <div>
                  <label for={`comp-edit-cat-nome-${c.id}`} class="block text-sm mb-1">Nome</label>
                  <input id={`comp-edit-cat-nome-${c.id}`} class="input-form" bind:value={editForm.nome} required />
                </div>
                <div>
                  <label for={`comp-edit-cat-ordem-${c.id}`} class="block text-sm mb-1">Ordem</label>
                  <input id={`comp-edit-cat-ordem-${c.id}`} type="number" class="input-form" bind:value={editForm.ordem} required />
                </div>
                <div class="md:col-span-2 flex gap-2">
                  <button class="btn-primary">Salvar</button>
                  <button type="button" class="btn-secondary" on:click={cancelEdit}>Cancelar</button>
                </div>
              </form>
            {:else}
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-medium">{c.nome}</div>
                  <div class="text-sm text-slate-500">Ordem: {c.ordem}</div>
                </div>
                <div class="flex gap-2">
                  <button class="btn-secondary" on:click={() => startEdit(c)}>Editar</button>
                  <button class="btn-danger" on:click={() => excluir(c.id)}>Excluir</button>
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

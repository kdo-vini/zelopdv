<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { waitAuthReady } from '$lib/authStore';

  let loading = true;
  let erro = '';
  let userId = null;
  let produtos = [];
  let busca = '';
  let toast = '';
  let toastTimer = null;

  // Filtros
  let categorias = [];
  let subcategorias = [];
  let idCategoria = null;
  let idSubcategoria = null;

  async function carregarCategorias() {
    try {
      const { data, error } = await supabase
        .from('categorias')
        .select('id, nome, ordem')
        .order('ordem', { ascending: true });
      if (error) throw error;
      categorias = data || [];
    } catch (e) {
      // Não bloqueia a página; apenas exibe erro geral
      erro = e?.message || String(e);
    }
  }

  async function carregarSubcategorias() {
    try {
      if (!idCategoria) { subcategorias = []; return; }
      const { data, error } = await supabase
        .from('subcategorias')
        .select('id, id_categoria, nome, ordem')
        .eq('id_categoria', idCategoria)
        .order('ordem', { ascending: true });
      if (error) throw error;
      subcategorias = data || [];
    } catch (e) {
      erro = e?.message || String(e);
    }
  }

  async function carregar() {
    erro = '';
    loading = true;
    try {
      // Aguarda auth pronta para evitar RLS intermitente
      await waitAuthReady();
      // Requer sessão
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/login'; return; }
      userId = session.user.id;
      // Busca apenas produtos com controle de estoque ativo
      let q = supabase
        .from('produtos')
        .select('id, nome, estoque_atual, controlar_estoque, id_categoria, id_subcategoria')
        .eq('id_usuario', userId)
        .eq('controlar_estoque', true);
      const cat = idCategoria ? Number(idCategoria) : null;
      const sub = idSubcategoria ? Number(idSubcategoria) : null;
      if (cat) q = q.eq('id_categoria', cat);
      if (sub) q = q.eq('id_subcategoria', sub);
      const { data, error } = await q.order('nome', { ascending: true });
      if (error) throw error;
      produtos = (data || []).map(p => ({ ...p, _tmpEstoque: p.estoque_atual, _saving: false, _msg: '' }));
    } catch (e) {
      erro = e?.message || String(e);
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    await waitAuthReady();
    await carregarCategorias();
    await carregarSubcategorias();
    await carregar();
  });

  function filtrados() {
    const q = (busca || '').toLowerCase().trim();
    if (!q) return produtos;
    return produtos.filter(p => String(p.nome || '').toLowerCase().includes(q));
  }

  async function salvarLinha(p) {
    if (!p || p._saving) return;
    const novo = Number(p._tmpEstoque);
    if (Number.isNaN(novo) || novo < 0) { p._msg = 'Valor inválido'; return; }
    p._saving = true; p._msg = '';
    try {
      const { error } = await supabase
        .from('produtos')
        .update({ estoque_atual: novo })
        .eq('id', p.id)
        .eq('id_usuario', userId);
      if (error) throw error;
  p.estoque_atual = novo;
  p._msg = 'Salvo';
  // Toast global para dar feedback claro
  toast = 'Estoque salvo com sucesso';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast = ''; }, 2000);
  setTimeout(() => { p._msg = ''; }, 1200);
    } catch (e) {
      p._msg = e?.message || 'Erro ao salvar';
    } finally {
      p._saving = false;
    }
  }
</script>

<h1 class="text-2xl font-semibold mb-4">Estoque</h1>
<p class="text-slate-600 dark:text-slate-300 mb-3">Edite as quantidades de produtos com controle de estoque habilitado.</p>

{#if toast}
  <div class="fixed top-4 right-4 bg-emerald-600 text-white px-3 py-2 rounded shadow">
    {toast}
  </div>
{/if}

<div class="flex flex-col gap-2 mb-4">
  <div class="flex flex-wrap items-center gap-2">
    <select class="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 min-w-[12rem]"
      bind:value={idCategoria}
      on:change={async () => { idCategoria = idCategoria ? Number(idCategoria) : null; idSubcategoria = null; await carregarSubcategorias(); await carregar(); }}>
      <option value={null}>Todas as categorias</option>
      {#each categorias as c}
        <option value={c.id}>{c.nome}</option>
      {/each}
    </select>
    <select class="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 min-w-[12rem] disabled:opacity-50"
      bind:value={idSubcategoria}
      disabled={!idCategoria}
      on:change={async () => { idSubcategoria = idSubcategoria ? Number(idSubcategoria) : null; await carregar(); }}>
      <option value={null}>Todas as subcategorias</option>
      {#each subcategorias as s}
        <option value={s.id}>{s.nome}</option>
      {/each}
    </select>
    <input
      placeholder="Buscar produto..."
      class="w-full sm:w-80 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
      bind:value={busca}
    />
    <button class="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" on:click={carregar}>
      Atualizar
    </button>
    {#if idCategoria || idSubcategoria || (busca && busca.trim() !== '')}
      <button class="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
        on:click={async ()=>{ idCategoria=null; idSubcategoria=null; busca=''; subcategorias=[]; await carregar(); }}>
        Limpar filtros
      </button>
    {/if}
  </div>
</div>

{#if loading}
  <p>Carregando estoque...</p>
{:else if erro}
  <p class="text-red-500">{erro}</p>
{:else}
  {#if filtrados().length === 0}
    <p class="text-slate-500">Nenhum produto com controle de estoque encontrado.</p>
  {:else}
    <div class="overflow-x-auto">
      <table class="min-w-[520px] w-full text-sm">
        <thead>
          <tr class="text-left border-b border-slate-200 dark:border-slate-700">
            <th class="py-2 pr-4">Produto</th>
            <th class="py-2 pr-4 w-40">Estoque Atual</th>
            <th class="py-2 pr-4 w-32"></th>
            <th class="py-2 pr-4 w-40"></th>
          </tr>
        </thead>
        <tbody>
          {#each filtrados() as p (p.id)}
            <tr class="border-b border-slate-100 dark:border-slate-800">
              <td class="py-2 pr-4">
                <div class="font-medium">{p.nome}</div>
                <div class="text-xs text-slate-500">ID: {p.id}</div>
              </td>
              <td class="py-2 pr-4">
                <input type="number" min="0" step="1" class="w-28 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1"
                  bind:value={p._tmpEstoque}
                  on:keydown={(e) => { if (e.key === 'Enter') salvarLinha(p); }}
                />
              </td>
              <td class="py-2 pr-4">
                <button class="px-3 py-1.5 rounded-md bg-blue-600 text-white disabled:bg-slate-400"
                  disabled={p._saving}
                  on:click={() => salvarLinha(p)}>
                  {p._saving ? 'Salvando...' : 'Salvar'}
                </button>
              </td>
              <td class="py-2 pr-4 text-xs">
                {#if p._msg}
                  <span class="text-slate-500">{p._msg}</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}

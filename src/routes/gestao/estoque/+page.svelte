<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { waitAuthReady } from '$lib/authStore';
  import { pdvCache } from '$lib/stores/pdvCache';

  let loading = true;
  let erro = '';
  let userId = null;
  let produtos = [];
  let linhasEstoque = [];
  let busca = '';
  let toast = '';
  let toastTimer = null;

  let categorias = [];
  let subcategorias = [];
  let idCategoria = null;
  let idSubcategoria = null;

  async function carregarCategorias() {
    try {
      const { data, error } = await supabase
        .from('categorias')
        .select('id, nome, ordem, controlar_estoque_compartilhado, estoque_compartilhado_atual')
        .order('ordem', { ascending: true });
      if (error) throw error;
      categorias = data || [];
    } catch (e) {
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
      await waitAuthReady();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/login'; return; }
      userId = session.user.id;

      let q = supabase
        .from('produtos')
        .select('id, nome, estoque_atual, controlar_estoque, id_categoria, id_subcategoria, categorias(id, nome, controlar_estoque_compartilhado, estoque_compartilhado_atual)')
        .eq('id_usuario', userId);

      const cat = idCategoria ? Number(idCategoria) : null;
      const sub = idSubcategoria ? Number(idSubcategoria) : null;
      if (cat) q = q.eq('id_categoria', cat);
      if (sub) q = q.eq('id_subcategoria', sub);

      const { data, error } = await q.order('nome', { ascending: true });
      if (error) throw error;
      produtos = data || [];
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

  $: linhasEstoque = montarLinhasEstoque(produtos, busca);

  function montarLinhasEstoque(lista, termo) {
    const q = (termo || '').toLowerCase().trim();
    const grupos = new Map();
    const linhas = [];

    for (const produto of lista || []) {
      const categoria = produto.categorias;
      if (categoria?.controlar_estoque_compartilhado) {
        const atual = grupos.get(categoria.id) || {
          tipo: 'categoria',
          id: categoria.id,
          nome: categoria.nome,
          estoque_atual: Number(categoria.estoque_compartilhado_atual || 0),
          _tmpEstoque: Number(categoria.estoque_compartilhado_atual || 0),
          _saving: false,
          _msg: '',
          produtos: []
        };
        atual.produtos.push(produto.nome);
        grupos.set(categoria.id, atual);
      } else if (produto.controlar_estoque) {
        linhas.push({
          tipo: 'produto',
          id: produto.id,
          nome: produto.nome,
          estoque_atual: Number(produto.estoque_atual || 0),
          _tmpEstoque: Number(produto.estoque_atual || 0),
          _saving: false,
          _msg: '',
          produtos: []
        });
      }
    }

    const todas = [...grupos.values(), ...linhas].sort((a, b) => a.nome.localeCompare(b.nome));
    if (!q) return todas;
    return todas.filter((linha) => {
      if (String(linha.nome || '').toLowerCase().includes(q)) return true;
      return linha.produtos.some((nome) => String(nome || '').toLowerCase().includes(q));
    });
  }

  async function salvarLinha(linha) {
    if (!linha || linha._saving) return;
    const novo = Number(linha._tmpEstoque);
    if (Number.isNaN(novo) || novo < 0) { linha._msg = 'Valor inválido'; linhasEstoque = [...linhasEstoque]; return; }
    linha._saving = true; linha._msg = ''; linhasEstoque = [...linhasEstoque];
    try {
      const table = linha.tipo === 'categoria' ? 'categorias' : 'produtos';
      const payload = linha.tipo === 'categoria'
        ? { estoque_compartilhado_atual: novo }
        : { estoque_atual: novo };
      const { error } = await supabase
        .from(table)
        .update(payload)
        .eq('id', linha.id)
        .eq('id_usuario', userId);
      if (error) throw error;
      linha.estoque_atual = novo;
      if (linha.tipo === 'categoria') {
        produtos = produtos.map((produto) => produto.categorias?.id === linha.id
          ? { ...produto, categorias: { ...produto.categorias, estoque_compartilhado_atual: novo } }
          : produto);
      } else {
        produtos = produtos.map((produto) => produto.id === linha.id ? { ...produto, estoque_atual: novo } : produto);
      }
      linha._msg = 'Salvo';
      toast = 'Estoque salvo com sucesso';
      pdvCache.invalidateProdutos();
      pdvCache.invalidateCategorias();
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast = ''; }, 2000);
      setTimeout(() => { linha._msg = ''; linhasEstoque = [...linhasEstoque]; }, 1200);
    } catch (e) {
      linha._msg = e?.message || 'Erro ao salvar';
    } finally {
      linha._saving = false;
      linhasEstoque = [...linhasEstoque];
    }
  }
</script>

<p class="text-[10px] font-bold uppercase tracking-[0.2em] mb-1" style="color: var(--text-muted);">Gestão / Estoque</p>
<h1 class="text-2xl font-semibold mb-4">Estoque</h1>
<p class="text-slate-600 dark:text-slate-300 mb-3">Edite produtos com estoque individual e categorias com estoque compartilhado.</p>

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
      placeholder="Buscar produto ou grupo..."
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
  {#if linhasEstoque.length === 0}
    <p class="text-slate-500">Nenhum produto ou categoria com controle de estoque encontrado.</p>
  {:else}
    <div class="overflow-x-auto">
      <table class="min-w-[620px] w-full text-sm">
        <thead>
          <tr class="text-left border-b border-slate-200 dark:border-slate-700">
            <th class="py-2 pr-4">Item</th>
            <th class="py-2 pr-4 w-40">Estoque Atual</th>
            <th class="py-2 pr-4 w-32"></th>
            <th class="py-2 pr-4 w-40"></th>
          </tr>
        </thead>
        <tbody>
          {#each linhasEstoque as linha (`${linha.tipo}-${linha.id}`)}
            <tr class="border-b border-slate-100 dark:border-slate-800">
              <td class="py-2 pr-4">
                <div class="font-medium">{linha.nome}</div>
                {#if linha.tipo === 'categoria'}
                  <div class="text-xs text-slate-500">
                    Grupo compartilhado · {linha.produtos.length} produto(s): {linha.produtos.slice(0, 4).join(', ')}{linha.produtos.length > 4 ? '...' : ''}
                  </div>
                {:else}
                  <div class="text-xs text-slate-500">Produto · ID: {linha.id}</div>
                {/if}
              </td>
              <td class="py-2 pr-4">
                <input type="number" min="0" step="1" class="w-28 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1"
                  bind:value={linha._tmpEstoque}
                  on:keydown={(e) => { if (e.key === 'Enter') salvarLinha(linha); }}
                />
              </td>
              <td class="py-2 pr-4">
                <button class="px-3 py-1.5 rounded-md bg-blue-600 text-white disabled:bg-slate-400"
                  disabled={linha._saving}
                  on:click={() => salvarLinha(linha)}>
                  {linha._saving ? 'Salvando...' : 'Salvar'}
                </button>
              </td>
              <td class="py-2 pr-4 text-xs">
                {#if linha._msg}
                  <span class="text-slate-500">{linha._msg}</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}

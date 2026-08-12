<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { ensureActiveSubscription } from '$lib/guards';
  import { logAuditAction } from '$lib/accessControl';
  import { pdvCache } from '$lib/stores/pdvCache';
  import * as Select from '$lib/components/ui/select/index.js';

  let loading = true;
  let erro = '';
  let userId = null;
  let ownerUserId = null;
  let isSubUser = false;
  let produtos = [];
  let linhasEstoque = [];
  let busca = '';
  let toast = '';
  let toastTimer = null;
  let expandidos = new Set();
  let salvandoProduto = {};
  let msgProduto = {};

  let categorias = [];
  let subcategorias = [];
  let idCategoria = null;
  let idSubcategoria = null;

  async function ensureAuthContext() {
    if (ownerUserId && userId) return true;
    const authCtx = await ensureActiveSubscription({ requireProfile: true });
    if (!authCtx?.userId) return false;
    userId = authCtx.userId;
    ownerUserId = authCtx.ownerUserId;
    isSubUser = authCtx.isSubUser;
    return true;
  }

  async function carregarCategorias() {
    try {
      if (!(await ensureAuthContext())) return;
      const { data, error } = await supabase
        .from('categorias')
        .select('id, nome, ordem, controlar_estoque_compartilhado, estoque_compartilhado_atual')
        .eq('id_usuario', ownerUserId)
        .order('ordem', { ascending: true });
      if (error) throw error;
      categorias = data || [];
    } catch (e) {
      erro = e?.message || String(e);
    }
  }

  async function carregarSubcategorias() {
    try {
      if (!(await ensureAuthContext())) return;
      if (!idCategoria) { subcategorias = []; return; }
      const { data, error } = await supabase
        .from('subcategorias')
        .select('id, id_categoria, nome, ordem')
        .eq('id_usuario', ownerUserId)
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
      if (!(await ensureAuthContext())) return;

      let q = supabase
        .from('produtos')
        .select('id, nome, estoque_atual, controlar_estoque, id_categoria, id_subcategoria, categorias(id, nome, controlar_estoque_compartilhado, estoque_compartilhado_atual)')
        .eq('id_usuario', ownerUserId);

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
    if (!(await ensureAuthContext())) return;
    await carregarCategorias();
    await carregarSubcategorias();
    await carregar();
  });

  $: linhasEstoque = montarLinhasEstoque(produtos, busca);

  function montarLinhasEstoque(lista, termo) {
    const q = (termo || '').toLowerCase().trim();
    const gruposCompartilhados = new Map();
    const gruposIndividuais = new Map();
    const linhasSoltas = [];

    for (const produto of lista || []) {
      const categoria = produto.categorias;
      if (categoria?.controlar_estoque_compartilhado) {
        const atual = gruposCompartilhados.get(categoria.id) || {
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
        gruposCompartilhados.set(categoria.id, atual);
      } else if (produto.controlar_estoque && categoria) {
        const atual = gruposIndividuais.get(categoria.id) || {
          tipo: 'grupo',
          id: categoria.id,
          nome: categoria.nome,
          itens: []
        };
        atual.itens.push({
          tipo: 'produto',
          id: produto.id,
          nome: produto.nome,
          estoque_atual: Number(produto.estoque_atual || 0),
          _tmpEstoque: Number(produto.estoque_atual || 0)
        });
        gruposIndividuais.set(categoria.id, atual);
      } else if (produto.controlar_estoque) {
        linhasSoltas.push({
          tipo: 'produto',
          id: produto.id,
          nome: produto.nome,
          estoque_atual: Number(produto.estoque_atual || 0),
          _tmpEstoque: Number(produto.estoque_atual || 0),
          _saving: false,
          _msg: ''
        });
      }
    }

    const todas = [
      ...gruposCompartilhados.values(),
      ...gruposIndividuais.values(),
      ...linhasSoltas
    ].sort((a, b) => a.nome.localeCompare(b.nome));

    if (!q) return todas;
    return todas.filter((linha) => {
      if (String(linha.nome || '').toLowerCase().includes(q)) return true;
      if (linha.tipo === 'grupo') {
        return linha.itens.some((item) => String(item.nome || '').toLowerCase().includes(q));
      }
      if (linha.tipo === 'categoria') {
        return linha.produtos.some((nome) => String(nome || '').toLowerCase().includes(q));
      }
      return false;
    });
  }

  function toggleExpandido(id) {
    const novo = new Set(expandidos);
    novo.has(id) ? novo.delete(id) : novo.add(id);
    expandidos = novo;
  }

  async function salvarItem(item) {
    if (salvandoProduto[item.id]) return;
    const novo = Number(item._tmpEstoque);
    if (Number.isNaN(novo) || novo < 0) {
      msgProduto = { ...msgProduto, [item.id]: 'Valor inválido' };
      return;
    }
    salvandoProduto = { ...salvandoProduto, [item.id]: true };
    msgProduto = { ...msgProduto, [item.id]: '' };
    try {
      const anterior = Number(item.estoque_atual || 0);
      const { error } = await supabase.rpc('ajustar_estoque_produto', {
        p_produto_id: item.id,
        p_estoque: novo
      });
      if (error) throw error;
      item.estoque_atual = novo;
      produtos = produtos.map((p) => p.id === item.id ? { ...p, estoque_atual: novo } : p);
      msgProduto = { ...msgProduto, [item.id]: 'Salvo' };
      if (isSubUser) {
        logAuditAction({
          ownerUserId,
          action: 'estoque.ajustado',
          entityType: 'produto',
          entityId: String(item.id),
          details: { nome: item.nome, de: anterior, para: novo, modo: 'individual' }
        });
      }
      toast = 'Estoque salvo com sucesso';
      pdvCache.invalidateProdutos();
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast = ''; }, 2000);
      setTimeout(() => { msgProduto = { ...msgProduto, [item.id]: '' }; }, 1200);
    } catch (e) {
      msgProduto = { ...msgProduto, [item.id]: e?.message || 'Erro ao salvar' };
    } finally {
      salvandoProduto = { ...salvandoProduto, [item.id]: false };
    }
  }

  async function salvarLinha(linha) {
    if (!linha || linha._saving) return;
    const novo = Number(linha._tmpEstoque);
    if (Number.isNaN(novo) || novo < 0) { linha._msg = 'Valor inválido'; linhasEstoque = [...linhasEstoque]; return; }
    linha._saving = true; linha._msg = ''; linhasEstoque = [...linhasEstoque];
    try {
      const anterior = Number(linha.estoque_atual || 0);
      const { error } = linha.tipo === 'categoria'
        ? await supabase.rpc('ajustar_estoque_categoria', {
          p_categoria_id: linha.id,
          p_estoque: novo
        })
        : await supabase.rpc('ajustar_estoque_produto', {
          p_produto_id: linha.id,
          p_estoque: novo
        });
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
      if (isSubUser) {
        logAuditAction({
          ownerUserId,
          action: 'estoque.ajustado',
          entityType: linha.tipo,
          entityId: String(linha.id),
          details: {
            nome: linha.nome,
            de: anterior,
            para: novo,
            modo: linha.tipo === 'categoria' ? 'compartilhado' : 'individual'
          }
        });
      }
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

<div class="mb-6 flex items-end justify-between border-b border-slate-700/60 pb-4">
  <div>
    <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">Gestão / Estoque</p>
    <h1 class="text-xl font-bold text-slate-100 tracking-tight">Estoque</h1>
  </div>
</div>
<p class="mb-3" style="color: var(--text-muted);">Produtos com estoque individual aparecem agrupados por categoria. Clique na categoria para expandir e editar cada produto separadamente.</p>

{#if toast}
  <div class="fixed top-4 right-4 bg-emerald-600 text-white px-3 py-2 rounded-sm shadow-sm">
    {toast}
  </div>
{/if}

<div class="flex flex-col gap-2 mb-4">
  <div class="flex flex-wrap items-center gap-2">
    <Select.Root
      value={idCategoria ?? ""}
      onValueChange={(v) => {
        idCategoria = v || null;
        idSubcategoria = null;
        carregarSubcategorias();
        carregar();
      }}
    >
      <Select.Trigger class="rounded-md px-3 py-2 min-w-48" style="border: 1px solid var(--border-subtle); background: var(--bg-input); color: var(--text-main);">
        <Select.Value placeholder="Filtrar por categoria" />
      </Select.Trigger>
      <Select.Content>
        {#each categorias as c}
          <Select.Item value={String(c.id)} label={c.nome} />
        {/each}
      </Select.Content>
    </Select.Root>
    <Select.Root
      value={idSubcategoria ?? ""}
      disabled={!idCategoria}
      onValueChange={(v) => {
        idSubcategoria = v || null;
        carregar();
      }}
    >
      <Select.Trigger class="rounded-md px-3 py-2 min-w-48 disabled:opacity-50" style="border: 1px solid var(--border-subtle); background: var(--bg-input); color: var(--text-main);">
        <Select.Value placeholder="Filtrar por subcategoria" />
      </Select.Trigger>
      <Select.Content>
        {#each subcategorias as s}
          <Select.Item value={String(s.id)} label={s.nome} />
        {/each}
      </Select.Content>
    </Select.Root>
    <input
      placeholder="Buscar produto ou grupo..."
      class="w-full sm:w-80 rounded-md px-3 py-2"
      style="border: 1px solid var(--border-subtle); background: var(--bg-input); color: var(--text-main);"
      bind:value={busca}
    />
    <button class="px-3 py-2 rounded-md" style="border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-main);" on:click={carregar}>
      Atualizar
    </button>
    {#if idCategoria || idSubcategoria || (busca && busca.trim() !== '')}
      <button class="px-3 py-2 rounded-md" style="border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-main);"
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
          <tr class="text-left" style="border-bottom: 1px solid var(--border-subtle); color: var(--text-label);">
            <th class="py-2 pr-4">Item</th>
            <th class="py-2 pr-4 w-40">Estoque Atual</th>
            <th class="py-2 pr-4 w-32"></th>
            <th class="py-2 pr-4 w-40"></th>
          </tr>
        </thead>
        <tbody>
          {#each linhasEstoque as linha (`${linha.tipo}-${linha.id}`)}
            {#if linha.tipo === 'grupo'}
              <tr
                class="cursor-pointer select-none"
                style="border-bottom: 1px solid var(--border-subtle);"
                on:click={() => toggleExpandido(linha.id)}
              >
                <td class="py-2 pr-4" colspan="4">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold">{linha.nome}</span>
                    <span class="text-xs" style="color: var(--text-muted);">
                      · {linha.itens.reduce((s, i) => s + i.estoque_atual, 0)} un. total · {linha.itens.length} produto(s)
                    </span>
                    <span class="ml-auto text-xs pr-2" style="color: var(--text-muted);">{expandidos.has(linha.id) ? '▲' : '▼'}</span>
                  </div>
                </td>
              </tr>
              {#if expandidos.has(linha.id)}
                {#each linha.itens as item (`produto-${item.id}`)}
                  <tr style="border-bottom: 1px solid var(--border-subtle); background: color-mix(in srgb, var(--bg-panel) 78%, transparent);">
                    <td class="py-2 pr-4 pl-8">
                      <div class="font-medium">{item.nome}</div>
                      <div class="text-xs" style="color: var(--text-muted);">Estoque individual</div>
                    </td>
                    <td class="py-2 pr-4">
                      <input type="number" min="0" step="1"
                        class="w-28 rounded-md px-2 py-1"
                        style="border: 1px solid var(--border-subtle); background: var(--bg-input); color: var(--text-main);"
                        bind:value={item._tmpEstoque}
                        on:keydown={(e) => { if (e.key === 'Enter') salvarItem(item); }}
                      />
                    </td>
                    <td class="py-2 pr-4">
                      <button
                        class="px-3 py-1.5 rounded-md disabled:opacity-60"
                        style="background: var(--primary); color: var(--primary-text);"
                        disabled={salvandoProduto[item.id]}
                        on:click={() => salvarItem(item)}>
                        {salvandoProduto[item.id] ? 'Salvando...' : 'Salvar'}
                      </button>
                    </td>
                    <td class="py-2 pr-4 text-xs">
                      {#if msgProduto[item.id]}
                        <span class="text-slate-500">{msgProduto[item.id]}</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              {/if}
            {:else}
              <tr style="border-bottom: 1px solid var(--border-subtle);">
                <td class="py-2 pr-4">
                  <div class="font-medium">{linha.nome}</div>
                  {#if linha.tipo === 'categoria'}
                    <div class="text-xs" style="color: var(--text-muted);">
                      Pool compartilhado · {linha.produtos.length} produto(s): {linha.produtos.slice(0, 4).join(', ')}{linha.produtos.length > 4 ? '...' : ''}
                    </div>
                  {:else}
                    <div class="text-xs" style="color: var(--text-muted);">Produto individual</div>
                  {/if}
                </td>
                <td class="py-2 pr-4">
                  <input type="number" min="0" step="1" class="w-28 rounded-md px-2 py-1"
                    style="border: 1px solid var(--border-subtle); background: var(--bg-input); color: var(--text-main);"
                    bind:value={linha._tmpEstoque}
                    on:keydown={(e) => { if (e.key === 'Enter') salvarLinha(linha); }}
                  />
                </td>
                <td class="py-2 pr-4">
                  <button class="px-3 py-1.5 rounded-md disabled:opacity-60"
                    style="background: var(--primary); color: var(--primary-text);"
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
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}

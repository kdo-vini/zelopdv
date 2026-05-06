<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabaseClient';
  import { ensureActiveSubscription, hasPedidosAddon } from '$lib/guards';
  import { pdvCache } from '$lib/stores/pdvCache';
  import { addToast } from '$lib/stores/ui';
  import { getFriendlyErrorMessage } from '$lib/errorUtils';

  let ready = false;
  let loading = true;
  let addonActive = false;
  let userId = '';
  let produtos = [];
  let categorias = [];
  let categoriaAtiva = null;
  let busca = '';
  let carrinho = [];
  let nomeCliente = '';
  let observacoes = '';
  let salvando = false;
  let mobileCartOpen = false;

  let pedidoId = '';
  let pedidoCarregado = null;
  let temItensProntos = false;

  $: termoBusca = busca.trim().toLowerCase();
  $: produtosFiltrados = produtos.filter((produto) => {
    if (categoriaAtiva && produto.id_categoria !== categoriaAtiva) return false;
    if (termoBusca && !String(produto.nome || '').toLowerCase().includes(termoBusca)) return false;
    return true;
  });
  $: totalItens = carrinho.reduce((acc, item) => acc + Number(item.quantidade || 0), 0);
  $: totalPedido = carrinho.reduce((acc, item) => acc + Number(item.preco || 0) * Number(item.quantidade || 0), 0);

  onMount(async () => {
    const auth = await ensureActiveSubscription({ requireProfile: true });
    if (!auth?.userId) return;

    userId = auth.userId;
    pdvCache.setUserId(userId);
    addonActive = await hasPedidosAddon(userId);
    ready = true;

    if (!addonActive) {
      loading = false;
      return;
    }

    pedidoId = $page.params.id;
    await Promise.all([carregarProdutos(), carregarCategorias()]);
    await carregarPedido();
    loading = false;
  });

  async function carregarProdutos() {
    try {
      produtos = await pdvCache.getProdutos();
    } catch (err) {
      addToast('Erro ao carregar produtos: ' + getFriendlyErrorMessage(err), 'error');
    }
  }

  async function carregarCategorias() {
    try {
      categorias = await pdvCache.getCategorias();
    } catch (err) {
      addToast('Erro ao carregar categorias: ' + getFriendlyErrorMessage(err), 'error');
    }
  }

  async function carregarPedido() {
    const { data, error } = await supabase
      .from('pedidos')
      .select('id, numero_pedido, status, nome_cliente, observacoes, origem, pedido_itens(id, id_produto, nome, preco_unitario, quantidade, enviado_cozinha, status_cozinha)')
      .eq('id', pedidoId)
      .eq('id_usuario', userId)
      .maybeSingle();

    if (error || !data) {
      addToast('Pedido não encontrado.', 'error');
      goto('/app/pedidos');
      return;
    }

    if (data.status === 'fechado') {
      addToast('Pedido já fechado — não pode ser editado.', 'warning');
      goto('/app/pedidos');
      return;
    }

    pedidoCarregado = data;
    nomeCliente = data.nome_cliente || '';
    observacoes = data.observacoes || '';

    carrinho = (data.pedido_itens || []).map((item) => ({
      id_produto: item.id_produto,
      nome: item.nome,
      preco: Number(item.preco_unitario || 0),
      quantidade: Number(item.quantidade || 0),
      enviado_cozinha: !!item.enviado_cozinha
    }));

    temItensProntos = (data.pedido_itens || []).some((i) => i.status_cozinha === 'pronto');
  }

  function adicionarProduto(produto) {
    const existente = carrinho.find((item) => item.id_produto === produto.id);
    const qtdAtual = Number(existente?.quantidade || 0);
    const disponivel = Number(produto.estoque_atual || 0);

    if (produto.controlar_estoque && qtdAtual + 1 > disponivel) {
      addToast(`Estoque insuficiente para "${produto.nome}". Restam ${disponivel}.`, 'warning');
      return;
    }

    if (existente) {
      existente.quantidade += 1;
      carrinho = [...carrinho];
      return;
    }

    carrinho = [
      ...carrinho,
      {
        id_produto: produto.id,
        nome: produto.nome,
        preco: Number(produto.preco || 0),
        quantidade: 1,
        enviado_cozinha: true
      }
    ];
  }

  function alterarQuantidade(item, delta) {
    const produto = produtos.find((p) => p.id === item.id_produto);
    const proxima = Number(item.quantidade || 0) + delta;

    if (proxima <= 0) {
      carrinho = carrinho.filter((i) => i !== item);
      return;
    }

    if (delta > 0 && produto?.controlar_estoque && proxima > Number(produto.estoque_atual || 0)) {
      addToast(`Estoque insuficiente para "${item.nome}".`, 'warning');
      return;
    }

    item.quantidade = proxima;
    carrinho = [...carrinho];
  }

  function removerItem(item) {
    carrinho = carrinho.filter((i) => i !== item);
  }

  async function salvarAlteracoes() {
    if (salvando) return;
    if (!carrinho.length) {
      addToast('Adicione ao menos um item ao pedido.', 'warning');
      return;
    }

    salvando = true;
    try {
      const { error: updateErr } = await supabase
        .from('pedidos')
        .update({
          nome_cliente: nomeCliente.trim() || null,
          observacoes: observacoes.trim() || null
        })
        .eq('id', pedidoId)
        .eq('id_usuario', userId)
        .in('status', ['aberto', 'pronto']);

      if (updateErr) throw updateErr;

      const { error: delErr } = await supabase
        .from('pedido_itens')
        .delete()
        .eq('id_pedido', pedidoId);
      if (delErr) throw delErr;

      const itens = carrinho.map((item) => ({
        id_pedido: pedidoId,
        id_produto: item.id_produto,
        nome: item.nome,
        preco_unitario: Number(item.preco || 0),
        quantidade: Number(item.quantidade || 0),
        subtotal: Number(item.preco || 0) * Number(item.quantidade || 0),
        enviado_cozinha: !!item.enviado_cozinha,
        status_cozinha: item.enviado_cozinha ? 'aguardando' : null
      }));

      const { error: insErr } = await supabase.from('pedido_itens').insert(itens);
      if (insErr) throw insErr;

      // Se itens foram alterados, pedido volta ao status aberto (não está mais pronto)
      if (pedidoCarregado?.status === 'pronto') {
        await supabase
          .from('pedidos')
          .update({ status: 'aberto' })
          .eq('id', pedidoId)
          .eq('id_usuario', userId);
      }

      addToast(`Pedido #${pedidoCarregado?.numero_pedido} atualizado.`, 'success');
      goto('/app/pedidos');
    } catch (err) {
      addToast('Erro ao salvar pedido: ' + getFriendlyErrorMessage(err), 'error');
    } finally {
      salvando = false;
    }
  }

  function formatMoney(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
</script>

<svelte:head>
  <title>Editar Pedido | Zelo PDV</title>
</svelte:head>

<div class="novo-page">
  {#if !ready}
    <div class="state-card">Carregando...</div>
  {:else if !addonActive}
    <section class="upsell">
      <p class="eyebrow">Módulo Pedidos</p>
      <h1>Pedidos + Cozinha</h1>
      <p>O módulo de pedidos não está ativo nesta assinatura.</p>
      <a href="/assinatura?addon=pedidos">Ativar módulo</a>
    </section>
  {:else}
    <header class="page-header">
      <div class="title-block">
        <p class="eyebrow">Atendimento</p>
        <h1>Editar pedido {pedidoCarregado ? `#${pedidoCarregado.numero_pedido}` : ''}</h1>
        <span class="subtitle">{totalItens} {totalItens === 1 ? 'item' : 'itens'} no pedido</span>
      </div>
      <button type="button" class="btn-secondary" on:click={() => goto('/app/pedidos')}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="icon"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/></svg>
        <span>Voltar para fila</span>
      </button>
    </header>

    {#if loading}
      <div class="state-card">Carregando pedido...</div>
    {:else}
      {#if temItensProntos}
        <div class="warning-banner" role="alert">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>
          <div>
            <strong>Atenção:</strong> este pedido tem itens já marcados como prontos na cozinha.
            Ao salvar, eles serão substituídos pelos itens atuais e voltarão ao status "aguardando".
          </div>
        </div>
      {/if}

      <main class="order-layout">
        <section class="catalog">
          <div class="filters">
            <div class="search-wrap">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="search-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg>
              <input bind:value={busca} type="search" placeholder="Buscar produto" />
            </div>
            <div class="category-row" aria-label="Categorias">
              <button type="button" class:active={categoriaAtiva === null} on:click={() => categoriaAtiva = null}>Todos</button>
              {#each categorias as categoria (categoria.id)}
                <button
                  type="button"
                  class:active={categoriaAtiva === categoria.id}
                  on:click={() => categoriaAtiva = categoria.id}
                >
                  {categoria.nome}
                </button>
              {/each}
            </div>
          </div>

          {#if produtosFiltrados.length === 0}
            <div class="empty-products">Nenhum produto encontrado.</div>
          {:else}
            <div class="product-grid">
              {#each produtosFiltrados as produto (produto.id)}
                <button type="button" class="product-card" on:click={() => adicionarProduto(produto)}>
                  <strong>{produto.nome}</strong>
                  <span class="price">{formatMoney(produto.preco)}</span>
                  {#if produto.controlar_estoque}
                    <small>Estoque: {Number(produto.estoque_atual || 0)}</small>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </section>

        <aside class="cart-panel" class:mobile-open={mobileCartOpen}>
          <div class="cart-mobile-head">
            <h2>Pedido</h2>
            <button type="button" class="icon-close" on:click={() => mobileCartOpen = false} aria-label="Fechar">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <div class="cart-head">
            <h2 class="desktop-only">Pedido</h2>
            <span class="cart-total-mini">{formatMoney(totalPedido)}</span>
          </div>

          <label class="field">
            <span>Nome do cliente</span>
            <input type="text" bind:value={nomeCliente} placeholder="Ex.: João, Mesa externa, Retirada balcão" maxlength="60" />
          </label>

          {#if carrinho.length === 0}
            <div class="empty-cart">Adicione produtos para montar o pedido.</div>
          {:else}
            <ul class="cart-list">
              {#each carrinho as item (item.id_produto)}
                <li>
                  <div class="cart-item-top">
                    <div class="cart-item-info">
                      <strong>{item.nome}</strong>
                      <span>{formatMoney(item.preco)} cada</span>
                    </div>
                    <button type="button" class="icon-btn danger" aria-label="Remover item" on:click={() => removerItem(item)}>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
                    </button>
                  </div>

                  <div class="cart-item-controls">
                    <div class="qty">
                      <button type="button" aria-label="Diminuir" on:click={() => alterarQuantidade(item, -1)}>−</button>
                      <span>{item.quantidade}</span>
                      <button type="button" aria-label="Aumentar" on:click={() => alterarQuantidade(item, 1)}>+</button>
                    </div>
                    <strong class="line-total">{formatMoney(item.preco * item.quantidade)}</strong>
                  </div>
                  <label class="kitchen-check">
                    <input type="checkbox" bind:checked={item.enviado_cozinha} />
                    <span>Enviar para cozinha</span>
                  </label>
                </li>
              {/each}
            </ul>
          {/if}

          <label class="field">
            <span>Observações</span>
            <textarea bind:value={observacoes} rows="3" placeholder="Ex.: sem cebola, ponto da carne, etc."></textarea>
          </label>

          <footer class="cart-footer">
            <div class="footer-total">
              <span>Total</span>
              <strong>{formatMoney(totalPedido)}</strong>
            </div>
            <button type="button" class="btn-success" on:click={salvarAlteracoes} disabled={salvando || carrinho.length === 0}>
              {salvando ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </footer>
        </aside>

        {#if !mobileCartOpen && carrinho.length > 0}
          <button type="button" class="fab-cart" on:click={() => mobileCartOpen = true} aria-label="Ver pedido">
            <span class="fab-count">{totalItens}</span>
            <span class="fab-label">Ver pedido</span>
            <strong>{formatMoney(totalPedido)}</strong>
          </button>
        {/if}
      </main>
    {/if}
  {/if}
</div>

<style>
  .novo-page {
    min-height: 100vh;
    padding: clamp(14px, 2.5vw, 28px);
    background: var(--bg-app);
    color: var(--text-main);
  }

  .page-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
    flex-wrap: wrap;
  }
  .title-block h1 {
    margin: 0;
    font-size: clamp(1.5rem, 4vw, 2rem);
    font-weight: 900;
    color: var(--text-main);
  }
  .subtitle { color: var(--text-muted); font-size: 0.9rem; }

  .eyebrow {
    margin: 0 0 4px;
    color: var(--accent);
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .warning-banner {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 16px;
    margin-bottom: 16px;
    border: 1px solid var(--status-warning-border);
    border-radius: 10px;
    background: var(--status-warning-bg);
    color: var(--status-warning-text);
    font-size: 0.9rem;
  }
  .warning-banner svg { width: 22px; height: 22px; flex-shrink: 0; }
  .warning-banner strong { font-weight: 900; }

  .btn-secondary,
  .btn-success,
  .upsell a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 0;
    border-radius: 10px;
    padding: 12px 18px;
    font-weight: 800;
    font-size: 0.95rem;
    cursor: pointer;
    text-decoration: none;
    min-height: 44px;
    transition: background 160ms ease;
  }
  .btn-secondary {
    background: var(--bg-card);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
  }
  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-panel);
    border-color: var(--border-strong);
  }
  .btn-success {
    background: var(--success);
    color: var(--primary-text);
  }
  .btn-success:hover:not(:disabled) { background: var(--success-hover); }
  .upsell a { background: var(--primary); color: var(--primary-text); }
  .upsell a:hover { background: var(--primary-hover); }

  button:disabled { opacity: 0.55; cursor: not-allowed; }
  .icon { width: 18px; height: 18px; flex-shrink: 0; }

  .order-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
    gap: 16px;
    align-items: start;
  }

  .catalog,
  .cart-panel,
  .state-card,
  .upsell {
    border: 1px solid var(--border-card);
    border-radius: 12px;
    background: var(--bg-panel);
  }

  .catalog { padding: 16px; }

  .filters { display: grid; gap: 12px; margin-bottom: 16px; }
  .search-wrap { position: relative; }
  .search-icon {
    position: absolute;
    left: 12px; top: 50%;
    transform: translateY(-50%);
    width: 18px; height: 18px;
    color: var(--text-muted);
    pointer-events: none;
  }
  .filters input,
  .field input,
  .field textarea {
    width: 100%;
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    padding: 12px 14px;
    background: var(--bg-input);
    color: var(--text-main);
    font: inherit;
    font-size: 0.95rem;
    transition: border-color 140ms ease, box-shadow 140ms ease;
  }
  .filters input { padding-left: 38px; }
  .filters input::placeholder,
  .field input::placeholder,
  .field textarea::placeholder { color: var(--text-muted); }
  .filters input:focus,
  .field input:focus,
  .field textarea:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-light);
  }

  .category-row {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 4px;
    -webkit-overflow-scrolling: touch;
  }
  .category-row::-webkit-scrollbar { height: 4px; }
  .category-row::-webkit-scrollbar-thumb { background: var(--border-subtle); border-radius: 4px; }

  .category-row button {
    flex: 0 0 auto;
    border: 1px solid var(--border-subtle);
    background: var(--bg-card);
    color: var(--text-label);
    padding: 9px 14px;
    border-radius: 999px;
    cursor: pointer;
    font-weight: 700;
    font-size: 0.85rem;
    white-space: nowrap;
    transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
  }
  .category-row button.active {
    border-color: var(--accent);
    background: var(--accent-light);
    color: var(--accent);
  }

  .product-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }

  .product-card {
    display: grid;
    gap: 6px;
    align-content: space-between;
    min-height: 110px;
    border: 1px solid var(--border-card);
    background: var(--bg-card);
    color: var(--text-main);
    padding: 14px;
    text-align: left;
    cursor: pointer;
    border-radius: 10px;
    transition: border-color 140ms ease, transform 80ms ease, background 140ms ease;
  }
  .product-card:hover {
    border-color: var(--accent);
    background: var(--bg-input);
  }
  .product-card:active { transform: scale(0.98); }
  .product-card strong {
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--text-main);
    line-height: 1.25;
  }
  .product-card .price { color: var(--success); font-weight: 900; font-size: 1rem; }
  .product-card small { color: var(--text-muted); font-size: 0.72rem; }

  .cart-panel {
    position: sticky;
    top: 16px;
    display: grid;
    gap: 14px;
    padding: 18px;
    max-height: calc(100vh - 32px);
    overflow-y: auto;
  }

  .cart-mobile-head {
    display: none;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .cart-mobile-head h2 { margin: 0; font-size: 1.2rem; color: var(--text-main); }
  .icon-close {
    width: 36px; height: 36px;
    display: inline-flex; align-items: center; justify-content: center;
    background: transparent;
    border: 0;
    color: var(--text-main);
    cursor: pointer;
    border-radius: 8px;
  }
  .icon-close svg { width: 22px; height: 22px; }
  .icon-close:hover { background: var(--bg-card); }

  .cart-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .cart-head h2 { margin: 0; font-size: 1.1rem; color: var(--text-main); font-weight: 800; }
  .cart-total-mini { color: var(--success); font-weight: 900; font-size: 1.15rem; }

  .field { display: grid; gap: 6px; }
  .field span {
    color: var(--text-label);
    font-size: 0.75rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .field textarea { resize: vertical; min-height: 76px; }

  .cart-list { display: grid; gap: 10px; padding: 0; margin: 0; list-style: none; }
  .cart-list li {
    display: grid;
    gap: 10px;
    border: 1px solid var(--border-card);
    background: var(--bg-card);
    border-radius: 10px;
    padding: 12px;
  }

  .cart-item-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .cart-item-info { display: grid; gap: 2px; min-width: 0; }
  .cart-item-info strong { color: var(--text-main); font-weight: 700; line-height: 1.3; }
  .cart-item-info span { color: var(--text-muted); font-size: 0.78rem; }

  .icon-btn {
    width: 36px; height: 36px;
    display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid transparent;
    border-radius: 8px;
    cursor: pointer;
  }
  .icon-btn svg { width: 18px; height: 18px; }
  .icon-btn.danger {
    background: rgba(239, 68, 68, 0.08);
    border-color: rgba(239, 68, 68, 0.25);
    color: var(--error);
  }
  .icon-btn.danger:hover { background: rgba(239, 68, 68, 0.16); }

  .cart-item-controls { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .line-total { color: var(--text-main); font-weight: 800; }

  .qty {
    display: grid;
    grid-template-columns: 38px 44px 38px;
    align-items: center;
    overflow: hidden;
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    background: var(--bg-input);
  }
  .qty button {
    height: 38px;
    border: 0;
    background: transparent;
    color: var(--text-main);
    font-size: 1.15rem;
    font-weight: 900;
    cursor: pointer;
  }
  .qty button:hover { background: var(--bg-panel); }
  .qty span { text-align: center; color: var(--text-main); font-weight: 900; }

  .kitchen-check {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-label);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    user-select: none;
  }
  .kitchen-check input { accent-color: var(--accent); width: 16px; height: 16px; }

  .cart-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 14px;
    border-top: 1px solid var(--border-subtle);
  }
  .footer-total { display: grid; gap: 2px; }
  .footer-total span { color: var(--text-muted); font-size: 0.85rem; }
  .footer-total strong { color: var(--text-main); font-size: 1.6rem; font-weight: 900; }
  .cart-footer .btn-success { flex: 1; max-width: 220px; }

  .state-card,
  .upsell,
  .empty-products,
  .empty-cart {
    padding: 28px 24px;
    color: var(--text-muted);
    text-align: center;
  }

  .upsell { display: grid; justify-items: center; gap: 12px; }
  .upsell h1 { margin: 0; font-size: 1.4rem; color: var(--text-main); }

  .empty-products,
  .empty-cart {
    border: 1px dashed var(--border-subtle);
    border-radius: 10px;
    background: var(--bg-card);
  }

  .fab-cart {
    display: none;
    position: fixed;
    bottom: calc(16px + env(safe-area-inset-bottom));
    left: 16px;
    right: 16px;
    z-index: 30;
    align-items: center;
    gap: 12px;
    padding: 14px 18px;
    background: var(--success);
    color: var(--primary-text);
    border: 0;
    border-radius: 12px;
    font-weight: 800;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
    cursor: pointer;
  }
  .fab-cart .fab-count {
    background: rgba(255, 255, 255, 0.22);
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 900;
  }
  .fab-cart .fab-label { flex: 1; text-align: left; font-size: 0.95rem; }
  .fab-cart strong { font-size: 1.05rem; }

  .desktop-only { display: block; }

  @media (max-width: 940px) {
    .order-layout { grid-template-columns: 1fr; }
    .cart-panel {
      position: fixed;
      inset: 0;
      max-height: 100vh;
      max-height: 100dvh;
      border-radius: 0;
      z-index: 50;
      transform: translateY(100%);
      transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1);
      padding: 16px;
      padding-bottom: calc(16px + env(safe-area-inset-bottom));
    }
    .cart-panel.mobile-open { transform: translateY(0); }
    .cart-mobile-head { display: flex; }
    .desktop-only { display: none; }
    .fab-cart { display: inline-flex; }

    .cart-footer {
      position: sticky;
      bottom: 0;
      flex-direction: column;
      align-items: stretch;
      background: var(--bg-panel);
      margin: 14px -16px -16px;
      padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
    }
    .footer-total {
      flex-direction: row;
      display: flex;
      align-items: baseline;
      justify-content: space-between;
    }
    .cart-footer .btn-success { max-width: none; }
  }

  @media (max-width: 480px) {
    .product-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
  }
</style>

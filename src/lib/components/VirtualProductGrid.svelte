<!--
  Componente: VirtualProductGrid.svelte
  Descrição: Grid de produtos com virtualização para melhor performance
  Só renderiza os produtos visíveis + buffer, ideal para grandes volumes.
-->
<script>
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { getPrecoTabela } from '$lib/finance/caixa';
  import { pizzaStartingPrice } from '$lib/pizza';
  import { formatMoneyNumber } from '$lib/formatMoney';
  import { Receipt, Plus } from 'lucide-svelte';

  const dispatch = createEventDispatcher();

  /** @type {Array<{id: number, nome: string, preco: number, preco_2?: number, preco_3?: number, por_unidade?: boolean, controlar_estoque?: boolean, estoque_atual?: number, tipo_produto?: string, pizza_config?: any}>} */
  export let produtos = [];

  /** @type {boolean} Differentiates first-use empty state from search/filter with no results. */
  export let hasAnyProducts = true;

  /** @type {boolean} Shows the "+ Cadastrar primeiro produto" CTA in the first-use empty state (hidden for sub-users without produtos.gerenciar). */
  export let canCadastrarProduto = true;

  /** @type {number} Tabela de preço ativa (1, 2 ou 3) */
  export let tabelaAtiva = 1;
  
  /** @type {number} Altura de cada card em pixels */
  export let itemHeight = 128;
  
  /** @type {number} Número de colunas no grid (baseado no viewport) */
  let columns = 4;
  
  /** @type {number} Quantas linhas de buffer renderizar antes/depois da área visível */
  const BUFFER_ROWS = 2;
  
  // Estado interno
  let containerEl;
  let scrollTop = 0;
  let containerHeight = 0;
  
  // Cálculos reativos
  $: rowHeight = itemHeight + 16; // altura + gap
  // +1 accounts for the always-present "Item Avulso" button at the end
  $: totalRows = Math.ceil((produtos.length + 1) / columns);
  $: totalHeight = totalRows * rowHeight;
  
  // Calcula quais itens estão visíveis
  $: {
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - BUFFER_ROWS);
    const visibleRows = Math.ceil(containerHeight / rowHeight) + BUFFER_ROWS * 2;
    const endRow = Math.min(totalRows, startRow + visibleRows);
    
    startIndex = startRow * columns;
    endIndex = Math.min(produtos.length, endRow * columns);
    offsetY = startRow * rowHeight;
  }
  
  let startIndex = 0;
  let endIndex = 0;
  let offsetY = 0;
  
  $: visibleProducts = produtos.slice(startIndex, endIndex);
  
  function handleScroll(e) {
    scrollTop = e.target.scrollTop;
  }
  
  function updateColumns() {
    if (!containerEl) return;
    const width = containerEl.clientWidth;
    
    // Mais colunas para aproveitar telas largas (Full HD+)
    if (width >= 1536) columns = 7;      // 2xl
    else if (width >= 1280) columns = 6; // xl
    else if (width >= 1024) columns = 5; // lg
    else if (width >= 768) columns = 4;  // md
    else if (width >= 640) columns = 3;  // sm
    else columns = 2;                    // default
  }
  
  function handleResize() {
    if (containerEl) {
      containerHeight = containerEl.clientHeight;
      updateColumns();
    }
  }
  
  function handleProdutoClick(produto) {
    dispatch('produtoClick', produto);
  }
  
  function handleValorAvulsoClick() {
    dispatch('valorAvulsoClick');
  }

  function handleCadastrarProdutoClick() {
    dispatch('cadastrarProdutoClick');
  }
  
  // Keyboard navigation
  function handleKeydown(e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); moveFocus(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); moveFocus(-1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(columns); }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-columns); }
    if (e.key === 'Enter' || e.key === ' ') {
      const el = document.activeElement;
      if (el?.dataset?.prod) { e.preventDefault(); el.click(); }
    }
  }
  
  function moveFocus(delta) {
    const buttons = containerEl?.querySelectorAll('[data-prod]');
    if (!buttons?.length) return;
    
    const current = document.activeElement;
    const arr = Array.from(buttons);
    let idx = arr.indexOf(current);
    if (idx === -1) idx = 0;
    
    const next = arr[idx + delta];
    if (next) {
      next.focus();
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
  
  let resizeObserver;
  
  onMount(() => {
    if (containerEl) {
      containerHeight = containerEl.clientHeight;
      updateColumns();
      
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(containerEl);
    }
  });
  
  onDestroy(() => {
    if (resizeObserver) resizeObserver.disconnect();
  });
</script>

<div 
  bind:this={containerEl}
  class="flex-1 overflow-y-auto overflow-x-hidden"
  on:scroll={handleScroll}
>
  {#if produtos.length === 0}
    <div class="empty-state">
      <div class="empty-content">
        <div class="empty-icon" aria-hidden="true">
          <Receipt size={24} />
        </div>
        <h3 class="empty-title">{hasAnyProducts ? 'Nenhum produto encontrado' : 'Faça sua primeira venda'}</h3>
        <p class="empty-text">
          {hasAnyProducts
            ? 'Tente limpar a busca ou escolher outra categoria. Se quiser vender mesmo assim, use um item avulso.'
            : 'Cadastre seu primeiro produto para começar. É rápido: nome e preço.'}
        </p>
        <div class="empty-actions">
          {#if !hasAnyProducts && canCadastrarProduto}
            <button type="button" class="empty-primary" on:click={handleCadastrarProdutoClick}>
              <Plus size={18} aria-hidden="true" />
              <span>Cadastrar primeiro produto</span>
            </button>
          {/if}
          <button type="button" class="{!hasAnyProducts && canCadastrarProduto ? 'empty-secondary' : 'empty-primary'}" on:click={handleValorAvulsoClick}>
            {#if !hasAnyProducts}<Plus size={18} aria-hidden="true" />{/if}
            <span>{hasAnyProducts ? 'Testar com item avulso' : 'Ou venda avulsa'}</span>
          </button>
        </div>
        {#if !hasAnyProducts}
          <div class="empty-preview" aria-hidden="true">
            <div class="empty-preview-tile"></div>
            <div class="empty-preview-tile"></div>
            <div class="empty-preview-tile empty-preview-tile-third"></div>
          </div>
          <p class="empty-footnote">Seus produtos aparecerão aqui.</p>
        {/if}
      </div>
    </div>
  {:else}
  <!-- Container com altura total para scroll correto. Extra 96px para barra inferior no mobile. -->
  <div style="height: {totalHeight + 96}px; position: relative;">
    <!-- Grid posicionado com offset -->
    <div 
      class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 absolute w-full px-4"
      style="top: {offsetY}px;"
      role="grid"
      tabindex="0"
      on:keydown={handleKeydown}
    >
      {#each visibleProducts as produto (produto.id)}
        <button
          data-prod={produto.id}
          on:click={() => handleProdutoClick(produto)}
          class="group min-h-28 bg-slate-800/40 rounded-xl border border-slate-700/50 hover:border-sky-500/50 hover:bg-slate-800/80 focus:outline-hidden focus:ring-1 focus:ring-sky-500 transition-all duration-200 flex flex-col justify-between"
        >
          <div class="p-3 w-full text-left">
            <span class="text-xs font-bold text-slate-300 uppercase leading-snug wrap-break-word line-clamp-3 group-hover:text-white transition-colors">
              {produto.nome}
            </span>
          </div>
          
          <div class="px-3 pb-3 w-full text-right">
            <div class="flex items-baseline justify-end gap-0.5">
              <span class="text-[10px] font-bold text-sky-400">{produto.tipo_produto === 'pizza' ? 'A partir de R$' : 'R$'}</span>
              <span class="text-lg font-black text-white tracking-tighter tabular-nums">
                {formatMoneyNumber(produto.tipo_produto === 'pizza' ? pizzaStartingPrice(produto.pizza_config, produto.modifierGroups) : getPrecoTabela(produto, tabelaAtiva))}
              </span>
            </div>
          </div>
        </button>
      {/each}
      
      <!-- Botão Fixo: Valor Personalizado (Minimalista) -->
      {#if endIndex >= produtos.length}
        <button
          on:click={handleValorAvulsoClick}
          class="h-28 bg-slate-800/10 border border-dashed border-slate-700 hover:border-amber-500/50 hover:bg-amber-500/5 text-slate-500 hover:text-amber-400 rounded-lg transition-all"
        >
          <div class="p-4 flex flex-col justify-center items-center h-full">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 mb-1 opacity-50">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span class="text-[10px] font-black uppercase tracking-widest text-center">
              Item Avulso
            </span>
          </div>
        </button>
      {/if}
    </div>
  </div>
  {/if}
  
</div>

<style>
  /* Sem cartão ao redor (ver DESIGN_PATTERNS "Never nest cards" / pedido do
     dono): o conteúdo fica direto na página, alinhado mais para cima
     (padding-top ~10vh, não centralizado verticalmente) para as ações
     ficarem ao alcance do polegar no celular. */
  .empty-state {
    min-height: 100%;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 1rem;
    padding-top: 10vh;
  }

  .empty-content {
    width: 100%;
    max-width: 22rem;
    text-align: center;
    color: var(--text-main);
  }

  .empty-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto 16px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--primary) 14%, transparent);
    color: var(--primary);
  }

  .empty-title {
    margin: 0 0 8px;
    font-size: 1.25rem;
    font-weight: 700;
    text-wrap: balance;
    color: var(--text-main);
  }

  .empty-text {
    margin: 0;
    color: var(--text-label);
    font-size: 1rem;
    line-height: 1.5;
  }

  @media (min-width: 640px) {
    .empty-text {
      font-size: 0.9375rem;
    }
  }

  .empty-actions {
    display: grid;
    gap: 12px;
    margin-top: 24px;
  }

  .empty-primary,
  .empty-secondary {
    width: 100%;
    min-height: 52px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition-fast), border-color var(--transition-fast), transform 120ms ease;
  }

  .empty-primary {
    border: 0;
    background: var(--primary);
    color: var(--primary-text);
  }

  .empty-primary:hover {
    background: var(--primary-hover);
  }

  .empty-secondary {
    border: 1px solid var(--border-subtle);
    background: var(--bg-panel);
    color: var(--text-main);
  }

  .empty-secondary:hover {
    border-color: var(--text-muted);
  }

  .empty-primary:active,
  .empty-secondary:active {
    transform: scale(0.98);
  }

  .empty-primary:focus-visible,
  .empty-secondary:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .empty-primary,
    .empty-secondary {
      transition: none;
    }

    .empty-primary:active,
    .empty-secondary:active {
      transform: none;
    }
  }

  /* Prévia que ensina: 3 tiles fantasma no mesmo formato dos cards de
     produto da grade (min-h-28 / 12px de raio), sem conteúdo. */
  .empty-preview {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-top: 32px;
  }

  .empty-preview-tile {
    height: 7rem;
    border-radius: 12px;
    border: 1px dashed var(--border-subtle);
    background: transparent;
  }

  @media (max-width: 359px) {
    .empty-preview {
      grid-template-columns: repeat(2, 1fr);
    }

    .empty-preview-tile-third {
      display: none;
    }
  }

  .empty-footnote {
    margin: 12px 0 0;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
</style>

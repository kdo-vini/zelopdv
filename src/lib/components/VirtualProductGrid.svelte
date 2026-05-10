<!--
  Componente: VirtualProductGrid.svelte
  Descrição: Grid de produtos com virtualização para melhor performance
  Só renderiza os produtos visíveis + buffer, ideal para grandes volumes.
-->
<script>
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  /** @type {Array<{id: number, nome: string, preco: number, por_unidade?: boolean, controlar_estoque?: boolean, estoque_atual?: number}>} */
  export let produtos = [];

  /** @type {boolean} Differentiates first-use empty state from search/filter with no results. */
  export let hasAnyProducts = true;
  
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
      <div class="empty-card">
        <div class="empty-icon" aria-hidden="true">+</div>
        <h3>{hasAnyProducts ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado ainda'}</h3>
        <p>
          {hasAnyProducts
            ? 'Tente limpar a busca ou escolher outra categoria. Se quiser vender mesmo assim, use um item avulso.'
            : 'Para testar agora, use um item avulso. Depois você pode cadastrar seus produtos em Gestão → Produtos e eles aparecem aqui automaticamente.'}
        </p>
        <div class="empty-actions">
          <button type="button" class="empty-primary" on:click={handleValorAvulsoClick}>
            Testar com item avulso
          </button>
          {#if !hasAnyProducts}
            <a href="/gestao/produtos" class="empty-secondary">
              Cadastrar produtos
            </a>
          {/if}
        </div>
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
          class="group min-h-28 bg-slate-800/40 rounded-xl border border-slate-700/50 hover:border-sky-500/50 hover:bg-slate-800/80 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-all duration-200 flex flex-col justify-between"
        >
          <div class="p-3 w-full text-left">
            <span class="text-xs font-bold text-slate-300 uppercase leading-snug break-words line-clamp-3 group-hover:text-white transition-colors">
              {produto.nome}
            </span>
          </div>
          
          <div class="px-3 pb-3 w-full text-right">
            <div class="flex items-baseline justify-end gap-0.5">
              <span class="text-[10px] font-bold text-sky-400">R$</span>
              <span class="text-lg font-black text-white tracking-tighter">
                {Number(produto.preco).toFixed(2)}
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
  .empty-state {
    min-height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .empty-card {
    width: min(100%, 28rem);
    border: 1px solid var(--border-card);
    border-radius: 1rem;
    background: color-mix(in srgb, var(--bg-card) 82%, transparent);
    padding: 1.5rem;
    text-align: center;
    color: var(--text-main);
  }

  .empty-icon {
    width: 2.75rem;
    height: 2.75rem;
    margin: 0 auto 0.85rem;
    border-radius: 999px;
    display: grid;
    place-items: center;
    font-size: 1.5rem;
    font-weight: 800;
    background: color-mix(in srgb, var(--primary) 16%, transparent);
    color: var(--primary);
  }

  .empty-card h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    font-weight: 800;
  }

  .empty-card p {
    margin: 0;
    color: var(--text-label);
    font-size: 0.9rem;
    line-height: 1.55;
  }

  .empty-actions {
    display: grid;
    gap: 0.65rem;
    margin-top: 1.15rem;
  }

  .empty-primary,
  .empty-secondary {
    min-height: 2.75rem;
    border-radius: 0.75rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9rem;
    font-weight: 800;
    text-decoration: none;
  }

  .empty-primary {
    border: 0;
    background: var(--primary);
    color: var(--primary-text);
  }

  .empty-secondary {
    border: 1px solid var(--border-subtle);
    background: var(--bg-input);
    color: var(--text-main);
  }
</style>

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
  import { Receipt, Plus, ChevronUp } from 'lucide-svelte';
  import { estoqueDisponivel, produtoControlaEstoque } from '$lib/stock';
  import ProductTile from '$lib/components/zelo/ProductTile.svelte';

  const dispatch = createEventDispatcher();

  /** @type {Array<{id: number, nome: string, preco: number, preco_2?: number, preco_3?: number, por_unidade?: boolean, controlar_estoque?: boolean, estoque_atual?: number, tipo_produto?: string, pizza_config?: any}>} */
  export let produtos = [];

  /** @type {boolean} Differentiates first-use empty state from search/filter with no results. */
  export let hasAnyProducts = true;

  /** @type {boolean} Shows the "+ Cadastrar primeiro produto" CTA in the first-use empty state (hidden for sub-users without produtos.gerenciar). */
  export let canCadastrarProduto = true;

  /** @type {number} Tabela de preço ativa (1, 2 ou 3) */
  export let tabelaAtiva = 1;

  /** @type {number|string|null} First-use coachmark bound to this product tile (never a viewport overlay). */
  export let coachmarkProductId = null;
  
  /** @type {boolean} Zelo Design System tile (ProductTile). Legacy markup otherwise. */
  export let zelo = false;
  /** @type {Record<string, number>} Quantidade de cada produto na comanda (id_produto → qtd), só no modo Zelo. */
  export let cartQuantities = {};
  /** @type {number} Limite de "estoque baixo" exibido no tile Zelo (mesmo de app/+layout). */
  export let lowStockLimit = 5;
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
  $: gap = zelo ? 12 : 16;
  $: tileHeight = zelo ? 118 : itemHeight;
  $: rowHeight = tileHeight + gap; // altura + gap

  function lowStockOf(produto) {
    if (!produtoControlaEstoque(produto)) return null;
    const disponivel = estoqueDisponivel(produto);
    return Number.isFinite(disponivel) && disponivel < lowStockLimit ? Math.max(0, disponivel) : null;
  }
  function tilePrice(produto) {
    return produto.tipo_produto === 'pizza' ? pizzaStartingPrice(produto.pizza_config, produto.modifierGroups) : getPrecoTabela(produto, tabelaAtiva);
  }
  // +1 accounts for the always-present "Item Avulso" button at the end
  $: totalRows = Math.ceil((produtos.length + 1) / columns);
  $: totalHeight = totalRows * rowHeight;
  // Extra scroll room so a below-tile coachmark is not clipped by overflow.
  $: extraBottom = coachmarkProductId != null ? 160 : 96;
  
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
    if (zelo) {
      // Zelo tiles: ~168px minimum each, 12px gap (same rule as the approved mockup)
      columns = Math.max(2, Math.min(8, Math.floor((width + 12) / (168 + 12))));
      return;
    }
    
    // Mais colunas para aproveitar telas largas (Full HD+)
    if (width >= 1536) columns = 7;      // 2xl
    else if (width >= 1280) columns = 6; // xl
    else if (width >= 1024) columns = 5; // lg
    else if (width >= 768) columns = 4;  // md
    else if (width >= 640) columns = 3;  // sm
    else columns = 2;                    // default
  }
  
  // recompute when switching between legacy and Zelo layouts
  $: if (containerEl) { zelo; updateColumns(); }

  function handleResize() {
    if (containerEl) {
      containerHeight = containerEl.clientHeight;
      updateColumns();
    }
  }
  
  function handleProdutoClick(produto) {
    if (coachmarkProductId != null) dispatch('coachmarkDismiss');
    dispatch('produtoClick', produto);
  }

  function handleCoachmarkDismiss(event) {
    event?.stopPropagation?.();
    dispatch('coachmarkDismiss');
  }

  function isCoachmarkProduct(produto) {
    return coachmarkProductId != null && produto?.id != null
      && String(produto.id) === String(coachmarkProductId);
  }

  let lastScrolledCoachmarkId = null;

  async function ensureCoachmarkVisible(id) {
    if (id == null || id === lastScrolledCoachmarkId) return;
    lastScrolledCoachmarkId = id;
    await tick();
    const el = containerEl?.querySelector(`[data-prod="${id}"]`);
    if (!el) {
      lastScrolledCoachmarkId = null;
      return;
    }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  $: if (coachmarkProductId != null) {
    void ensureCoachmarkVisible(coachmarkProductId);
  } else {
    lastScrolledCoachmarkId = null;
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
    {#if !zelo}
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
    <!-- Zelo Design System (docs/design-system/mockups/06-onboarding.html, quadros 9/21). Same
         conditions/handlers as the legacy branch above; only the markup/CSS changes. -->
    <div class="zelo-empty">
      <div class="zelo-empty-content">
        <div class="zelo-empty-icon" aria-hidden="true">
          <Receipt size={24} strokeWidth={1.75} />
        </div>
        <h3 class="zelo-empty-title type-heading">{hasAnyProducts ? 'Nenhum produto encontrado' : 'Faça sua primeira venda'}</h3>
        <p class="zelo-empty-text type-body">
          {hasAnyProducts
            ? 'Tente limpar a busca ou escolher outra categoria. Se quiser vender mesmo assim, use um item avulso.'
            : 'Cadastre seu primeiro produto para começar. É rápido: nome e preço.'}
        </p>
        <div class="zelo-empty-actions">
          {#if !hasAnyProducts && canCadastrarProduto}
            <button type="button" class="zelo-empty-primary" on:click={handleCadastrarProdutoClick}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>Cadastrar primeiro produto</span>
            </button>
          {/if}
          <button type="button" class="{!hasAnyProducts && canCadastrarProduto ? 'zelo-empty-secondary' : 'zelo-empty-primary'}" on:click={handleValorAvulsoClick}>
            <span>{hasAnyProducts ? 'Testar com item avulso' : 'Ou venda avulsa'}</span>
          </button>
        </div>
        {#if !hasAnyProducts}
          <div class="zelo-empty-preview" aria-hidden="true">
            <div class="zelo-empty-preview-tile"></div>
            <div class="zelo-empty-preview-tile"></div>
            <div class="zelo-empty-preview-tile zelo-empty-preview-tile-third"></div>
          </div>
          <p class="zelo-empty-footnote type-caption">Seus produtos aparecerão aqui.</p>
        {/if}
      </div>
    </div>
    {/if}
  {:else}
  <!-- Container com altura total para scroll correto. extraBottom reserva a barra inferior e, no primeiro uso, a dica abaixo do tile. -->
  <div style="height: {totalHeight + extraBottom}px; position: relative;">
    <!-- Grid posicionado com offset -->
    <div 
      class="grid absolute w-full {zelo ? 'zelo-grid' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 px-4'}"
      style="top: {offsetY}px;{zelo ? ` --zelo-cols: ${columns};` : ''}"
      role="grid"
      tabindex="0"
      on:keydown={handleKeydown}
    >
      {#each visibleProducts as produto (produto.id)}
        <div class="prod-cell">
          {#if zelo}
            <!-- zelo tile + tip live in their own nested block (this {#if zelo} branch) so this
                 boolean, referenced directly here, is tracked as this block's own dependency —
                 unlike a plain isCoachmarkProduct(produto) call, which Svelte can't see closes
                 over coachmarkProductId. Kept out of the legacy branch below on purpose: that
                 branch must keep calling the shared helper exactly as before, unmodified. -->
            {@const isCoachmark = coachmarkProductId != null && produto?.id != null && String(produto.id) === String(coachmarkProductId)}
            <ProductTile
              data-prod={produto.id}
              aria-describedby={isCoachmark ? 'prod-coachmark-tip' : undefined}
              class={isCoachmark ? 'zelo-tile zelo-tile-hl' : 'zelo-tile'}
              name={produto.nome}
              meta={produto.tipo_produto === 'pizza' ? 'a partir de' : (produto.por_unidade ? 'por unidade' : '')}
              price={tilePrice(produto)}
              quantity={cartQuantities?.[produto.id] || 0}
              lowStock={lowStockOf(produto)}
              onclick={() => handleProdutoClick(produto)}
            />
            {#if isCoachmark}
              <!-- Zelo: bloco navy colado no tile, com o filete dos 8 s do timer real (o timeout
                   continua em app/+page.svelte; isto é só o desenho da barra). -->
              <div class="zc-tip">
                <span class="zc-arrow" aria-hidden="true">
                  <ChevronUp size={20} />
                </span>
                <p id="prod-coachmark-tip" class="zc-text type-body-strong" role="status">Toque no produto para somar na venda</p>
                <button
                  type="button"
                  class="zc-dismiss"
                  aria-label="Dispensar dica"
                  on:click={handleCoachmarkDismiss}
                >
                  Entendi
                </button>
                <i class="zc-bar" aria-hidden="true"></i>
              </div>
            {/if}
          {:else}
          {@const isCoachmark = isCoachmarkProduct(produto)}
          <button
            data-prod={produto.id}
            type="button"
            aria-describedby={isCoachmark ? 'prod-coachmark-tip' : undefined}
            on:click={() => handleProdutoClick(produto)}
            class="group min-h-28 w-full bg-slate-800/40 rounded-xl border border-slate-700/50 hover:border-sky-500/50 hover:bg-slate-800/80 focus:outline-hidden focus:ring-1 focus:ring-sky-500 transition-all duration-200 flex flex-col justify-between"
            class:prod-tile-highlight={isCoachmark}
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
          {#if isCoachmark}
            <div class="prod-coachmark">
              <span class="prod-coachmark-arrow" aria-hidden="true">
                <ChevronUp size={20} />
              </span>
              <p id="prod-coachmark-tip" class="prod-coachmark-text" role="status">Toque no produto para somar na venda</p>
              <button
                type="button"
                class="prod-coachmark-dismiss"
                aria-label="Dispensar dica"
                on:click={handleCoachmarkDismiss}
              >
                Entendi
              </button>
            </div>
          {/if}
          {/if}
        </div>
      {/each}
      
      <!-- Botão Fixo: Valor Personalizado -->
      {#if endIndex >= produtos.length}
        {#if zelo}
          <button type="button" class="zelo-avulso" on:click={handleValorAvulsoClick}>
            <span class="zelo-avulso-ic" aria-hidden="true"><Plus size={18} strokeWidth={1.75} /></span>
            <span><span class="zelo-avulso-nm">Valor avulso</span><span class="zelo-avulso-meta">Digite um valor livre</span></span>
          </button>
        {:else}
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
      {/if}
    </div>
  </div>
  {/if}
  
</div>

<style>
  /* ── Zelo Design System grid (docs/DESIGN_SYSTEM.md) ── */
  .zelo-grid { grid-template-columns: repeat(var(--zelo-cols, 4), minmax(0, 1fr)); gap: 12px; padding: 0 2px; }
  .prod-cell :global(.zelo-tile) { width: 100%; height: 118px; min-height: 0; }
  .zelo-avulso { height: 118px; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-start; padding: 14px; text-align: left; border-radius: var(--zelo-radius-card); border: 1.5px dashed var(--border-strong); color: var(--text-muted); transition: border-color var(--zelo-dur-fast), color var(--zelo-dur-fast), transform var(--zelo-dur-slow) var(--zelo-ease-spring); }
  .zelo-avulso:hover { border-color: var(--primary); color: var(--text-main); }
  .zelo-avulso:active { transform: scale(var(--zelo-press-scale)); transition-duration: var(--zelo-dur-fast); }
  .zelo-avulso:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--focus); }
  .zelo-avulso-ic { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; background: var(--bg-sunken); }
  .zelo-avulso-nm { display: block; font-weight: 500; font-size: 14.5px; color: inherit; }
  .zelo-avulso-meta { display: block; font-size: 12px; margin-top: 3px; }

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

    .prod-tile-highlight,
    .prod-coachmark {
      animation: none;
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

  /* First-use coachmark: bound to the product tile, never a centered overlay. */
  .prod-cell {
    position: relative;
    min-width: 0;
  }

  .prod-tile-highlight {
    border-color: var(--primary);
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    transform: translateY(-2px);
    animation: prod-tile-pop 280ms cubic-bezier(.22, 1, .36, 1);
  }

  @keyframes prod-tile-pop {
    from {
      transform: translateY(4px) scale(0.98);
    }
    to {
      transform: translateY(-2px) scale(1);
    }
  }

  .prod-coachmark {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    right: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.45rem 0.55rem 0.35rem;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: 0.55rem;
    pointer-events: auto;
    animation: prod-coachmark-pop 280ms cubic-bezier(.22, 1, .36, 1);
  }

  @keyframes prod-coachmark-pop {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .prod-coachmark-arrow {
    display: flex;
    color: var(--primary);
    margin-top: -0.1rem;
  }

  .prod-coachmark-text {
    margin: 0;
    text-align: center;
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1.35;
    color: var(--text-main);
    text-wrap: balance;
  }

  .prod-coachmark-dismiss {
    min-height: 44px;
    min-width: 44px;
    padding: 0.35rem 0.7rem;
    border: 0;
    border-radius: 0.45rem;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
  }

  .prod-coachmark-dismiss:hover {
    color: var(--text-main);
    background: color-mix(in srgb, var(--text-main) 6%, transparent);
  }

  .prod-coachmark-dismiss:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent);
  }

  /* ── Zelo empty state (docs/design-system/mockups/06-onboarding.html, quadros 9/21) ── */
  .zelo-empty {
    min-height: 100%;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 40px 8px 0;
  }

  .zelo-empty-content {
    width: 100%;
    max-width: 320px;
    text-align: center;
  }

  .zelo-empty-icon {
    width: 52px;
    height: 52px;
    margin: 0 auto 16px;
    border-radius: var(--zelo-radius-card);
    display: grid;
    place-items: center;
    background: var(--bg-panel);
    border: 1px solid var(--border-subtle);
    color: var(--text-main);
  }

  .zelo-empty-title {
    margin: 0 0 8px;
    color: var(--text-main);
    text-wrap: balance;
  }

  .zelo-empty-text {
    margin: 0 auto 24px;
    max-width: 300px;
    color: var(--text-label);
  }

  .zelo-empty-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .zelo-empty-primary,
  .zelo-empty-secondary {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 0;
    cursor: pointer;
    transition: background var(--zelo-dur-fast) var(--zelo-ease-out), transform var(--zelo-dur-slow) var(--zelo-ease-spring);
  }

  .zelo-empty-primary {
    height: 52px;
    border-radius: var(--zelo-radius-cta);
    background: var(--primary);
    color: var(--primary-text);
    font: var(--type-body-strong);
    letter-spacing: var(--type-body-strong-tracking);
    font-weight: 600;
    box-shadow: var(--elevation-float);
  }

  .zelo-empty-primary:hover { background: var(--primary-hover); }

  .zelo-empty-secondary {
    height: 48px;
    border-radius: var(--zelo-radius-control);
    background: transparent;
    color: var(--text-label);
    font: var(--type-label);
    letter-spacing: var(--type-label-tracking);
  }

  .zelo-empty-secondary:hover {
    color: var(--text-main);
    background: var(--bg-sunken);
  }

  .zelo-empty-primary:active,
  .zelo-empty-secondary:active {
    transform: scale(var(--zelo-press-scale));
    transition-duration: var(--zelo-dur-fast);
  }

  .zelo-empty-primary:focus-visible,
  .zelo-empty-secondary:focus-visible {
    outline: none;
    box-shadow: 0 0 0 4px var(--focus);
  }

  .zelo-empty-preview {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    width: 100%;
    margin: 32px 0 12px;
  }

  .zelo-empty-preview-tile {
    height: 64px;
    border-radius: var(--zelo-radius-card);
    border: 1.5px dashed var(--border-strong);
  }

  .zelo-empty-preview-tile-third { opacity: 0.5; }

  .zelo-empty-footnote {
    margin: 0;
    color: var(--text-muted);
  }

  @media (min-width: 640px) {
    .zelo-empty { padding-top: 70px; }
  }

  /* ── Zelo coachmark: tile ring + tip (quadros 11/23) ── */
  .prod-cell :global(.zelo-tile-hl) {
    border-color: var(--primary);
    /* ring drawn inside the border: the grid scroller clips anything above the first row */
    box-shadow: inset 0 0 0 1px var(--primary), var(--elevation-float);
  }

  .zc-tip {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    z-index: 5;
    width: min(330px, calc(200% + 12px));
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 12px 14px 14px;
    border-radius: var(--zelo-radius-card);
    background: var(--primary);
    color: var(--primary-text);
    box-shadow: var(--elevation-float);
    animation: zc-pop var(--zelo-dur-slow) var(--zelo-ease-spring);
  }

  .zc-tip::before {
    content: '';
    position: absolute;
    top: -6px;
    left: 24px;
    width: 12px;
    height: 12px;
    border-radius: 2px;
    background: var(--primary);
    transform: rotate(45deg);
  }

  /* Kept in the DOM (not removed) per docs/DESIGN_SYSTEM.md; the notch above replaces it visually. */
  .zc-arrow { display: none; }

  .zc-text {
    flex: 1;
    margin: 0;
    color: var(--primary-text);
    text-wrap: balance;
  }

  .zc-dismiss {
    flex: none;
    min-height: 44px;
    padding: 0 14px;
    border: 0;
    border-radius: var(--zelo-radius-control);
    background: color-mix(in srgb, var(--primary-text) 16%, transparent);
    color: var(--primary-text);
    font: var(--type-label);
    letter-spacing: var(--type-label-tracking);
    font-weight: 600;
    cursor: pointer;
  }

  .zc-dismiss:hover { background: color-mix(in srgb, var(--primary-text) 24%, transparent); }

  .zc-dismiss:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-text) 40%, transparent);
  }

  .zc-bar {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100%;
    height: 2px;
    background: color-mix(in srgb, var(--primary-text) 55%, transparent);
    transform-origin: left;
    /* Mirrors the real 8 s coachmark timeout owned by app/+page.svelte
       (fecharHelperPrimeiroClick / timeoutHelperPrimeiroClick) — this is only the
       visual filete, so it stays a plain 8s and is not tied to --zelo-dur-*. */
    animation: zc-bar 8s linear forwards;
  }

  @keyframes zc-pop {
    from { opacity: 0; transform: translateY(-6px) scale(0.98); }
  }

  @keyframes zc-bar {
    to { transform: scaleX(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .zelo-empty-primary:active,
    .zelo-empty-secondary:active {
      transform: none;
    }

    .zc-tip,
    .zc-bar {
      animation: none;
    }
  }
</style>

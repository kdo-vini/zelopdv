<!--
  Componente: ModalPagamento.svelte
  Descrição: Modal de finalização de venda com suporte a múltiplos pagamentos, fiado,
  plataformas dinâmicas (iFood, Rappi, etc.) e layout em 3 zonas visuais.
-->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { addToast } from '$lib/stores/ui';
  
  const dispatch = createEventDispatcher();
  
  /** @type {boolean} */
  export let open = false;
  
  /** @type {number} */
  export let totalComanda = 0;
  
  /** @type {Array<{id: number, id_produto?: number, nome: string, preco: number, quantidade: number}>} */
  export let comanda = [];
  
  /** @type {number | null} */
  export let idCaixaAberto = null;
  
  /** @type {Array<{id: number, nome: string}>} */
  export let produtos = [];

  /** @type {Array<{id: string, nome: string, taxa_pct: number, icone: string, ativo: boolean}>} */
  export let plataformasAtivas = [];

  /** @type {'retirada'|'delivery'} */
  export let tipoPedido = 'retirada';

  /** @type {number} */
  export let taxaEntrega = 0;

  /** @type {number} */
  export let subtotalProdutos = 0;
  
  // Estados locais
  let formaPagamento = null;
  let valorRecebido = 0;
  let salvandoVenda = false;
  let erroPagamento = '';
  let imprimirRecibo = false;
  
  // Múltiplos pagamentos
  let multiPag = false;
  let pagamentos = [];
  let novoPagForma = 'dinheiro';
  let novoPagValor = 0;
  let novoPagPessoaId = '';
  
  // Fiado
  let pessoasFiado = [];
  let pessoaFiadoId = '';
  
  // Desconto
  let descontoAtivo = false;
  let descontoTipo = 'valor';
  let descontoInput = 0;

  // Valor real cobrado na plataforma (digitado pelo usuário)
  let valorPlataforma = 0;
  
  // Derivados - Desconto
  $: valorDesconto = (() => {
    if (!descontoAtivo || !descontoInput || descontoInput <= 0) return 0;
    if (descontoTipo === 'percentual') {
      return Math.min(Number(totalComanda), Number(totalComanda) * (Number(descontoInput) / 100));
    }
    return Math.min(Number(totalComanda), Number(descontoInput));
  })();
  $: totalFinal = Math.max(0, Number(totalComanda) - valorDesconto);
  
  // Plataforma selecionada (se for forma de pagamento de plataforma)
  $: plataformaSelecionada = plataformasAtivas.find(p => p.id === formaPagamento) ?? null;
  $: taxaPlataformaValor = (plataformaSelecionada && valorPlataforma > 0)
      ? (valorPlataforma * plataformaSelecionada.taxa_pct / 100) : 0;
  $: liquidoPlataforma = valorPlataforma > 0 ? valorPlataforma - taxaPlataformaValor : 0;
  
  // Derivados - Pagamentos
  $: somaPagamentos = pagamentos.reduce((acc, p) => acc + Number(p?.valor || 0), 0);
  $: restantePagamento = Math.max(0, totalFinal - Number(somaPagamentos || 0));
  $: troco = formaPagamento === 'dinheiro' ? Math.max(0, Number(valorRecebido) - totalFinal) : 0;
  $: trocoPrevMulti = (() => {
    if (!multiPag) return 0;
    const somaOutros = pagamentos.filter(p => p.forma !== 'dinheiro').reduce((a, b) => a + Number(b.valor || 0), 0);
    const cashRec = Number((pagamentos.find(p => p.forma === 'dinheiro')?.valor) || 0);
    const requeridoDin = Math.max(0, totalFinal - somaOutros);
    return Math.max(0, cashRec - requeridoDin);
  })();

  // Formas padrão
  const FORMAS_PADRAO = [
    { id: 'dinheiro',       label: 'Dinheiro', icone: '💵', atalho: 'D' },
    { id: 'cartao_debito',  label: 'Débito',   icone: '💳', atalho: 'B' },
    { id: 'cartao_credito', label: 'Crédito',  icone: '💳', atalho: 'C' },
    { id: 'pix',            label: 'Pix',      icone: '📱', atalho: 'X' },
    { id: 'fiado',          label: 'Fiado',    icone: '📒', atalho: 'F' },
  ];
  
  async function carregarPessoasFiado() {
    if (pessoasFiado.length) return;
    try {
      const { data, error } = await supabase.from('pessoas').select('id, nome').order('nome');
      if (!error) pessoasFiado = data || [];
    } catch {}
  }
  
  function addPagamento() {
    const forma = novoPagForma;
    const valor = Number(novoPagValor || 0);
    if (!forma || valor <= 0) return;
    
    const total = totalFinal;
    const somaNaoDinheiroAtual = pagamentos.filter(p => p.forma !== 'dinheiro').reduce((a, b) => a + Number(b.valor || 0), 0);
    
    if (forma !== 'dinheiro') {
      const novoSomaNC = somaNaoDinheiroAtual + valor;
      if (novoSomaNC > total) {
        erroPagamento = 'Pagamentos não-dinheiro não podem exceder o total.';
        return;
      }
    }
    
    if (forma === 'fiado') {
      if (pagamentos.some(p => p.forma === 'fiado')) {
        erroPagamento = 'Use apenas uma linha de Fiado.';
        return;
      }
      if (!novoPagPessoaId) {
        erroPagamento = 'Selecione a pessoa para o Fiado.';
        return;
      }
      pagamentos = [...pagamentos, { forma, valor, pessoaId: novoPagPessoaId }];
      novoPagPessoaId = '';
    } else {
      pagamentos = [...pagamentos, { forma, valor }];
    }
    
    novoPagValor = Math.max(0, totalFinal - pagamentos.reduce((a, b) => a + Number(b.valor || 0), 0));
    erroPagamento = '';
  }
  
  function removerPagamento(idx) {
    pagamentos = pagamentos.filter((_, i) => i !== idx);
    novoPagValor = Math.max(0, totalFinal - pagamentos.reduce((a, b) => a + Number(b.valor || 0), 0));
  }

  function selecionarForma(id) {
    formaPagamento = id;
    valorPlataforma = 0;
    if (id === 'fiado') carregarPessoasFiado();
  }

  /** Build nome for display of a forma_pagamento id */
  function nomeForma(id) {
    const padrao = FORMAS_PADRAO.find(f => f.id === id);
    if (padrao) return padrao.label;
    const plat = plataformasAtivas.find(p => p.id === id);
    if (plat) return plat.nome;
    return id.replace(/_/g, ' ');
  }
  
  async function confirmarVenda() {
    try {
      erroPagamento = '';
      
      if (!multiPag) {
        if (!formaPagamento) {
          erroPagamento = 'Selecione a forma de pagamento.';
          return;
        }
        if (formaPagamento === 'dinheiro' && Number(valorRecebido) < totalFinal) {
          erroPagamento = 'Valor recebido insuficiente para cobrir o total.';
          return;
        }
        if (formaPagamento === 'fiado' && !pessoaFiadoId) {
          erroPagamento = 'Selecione a pessoa para lançar o fiado.';
          return;
        }
        if (plataformaSelecionada && (!valorPlataforma || valorPlataforma <= 0)) {
          erroPagamento = `Informe o valor cobrado no ${plataformaSelecionada.nome}.`;
          return;
        }
      } else {
        const soma = pagamentos.reduce((acc, p) => acc + Number(p?.valor || 0), 0);
        const total = totalFinal;
        const somaNaoDinheiro = pagamentos.filter(p => p.forma !== 'dinheiro').reduce((a, b) => a + Number(b.valor || 0), 0);
        
        if (soma <= 0) {
          erroPagamento = 'Adicione ao menos um pagamento.';
          return;
        }
        if (soma < total) {
          erroPagamento = 'A soma dos pagamentos é insuficiente para o total.';
          return;
        }
        if (somaNaoDinheiro > total) {
          erroPagamento = 'Pagamentos não-dinheiro não podem exceder o total.';
          return;
        }
        
        const fiados = pagamentos.filter(p => p.forma === 'fiado');
        if (fiados.length > 1) {
          erroPagamento = 'Use apenas uma linha para Fiado.';
          return;
        }
        if (fiados.length === 1 && !fiados[0]?.pessoaId) {
          erroPagamento = 'Selecione a pessoa para o Fiado.';
          return;
        }
      }
      
      if (comanda.length === 0) {
        erroPagamento = 'A comanda está vazia.';
        return;
      }
      
      // Cálculos para múltiplos pagamentos
      let insertForma = formaPagamento;
      let insertValorRecebido = formaPagamento === 'dinheiro' ? Number(valorRecebido) : null;
      let insertValorTroco = formaPagamento === 'dinheiro' ? Math.max(0, Number(valorRecebido) - totalFinal) : 0;
      let cashRecebidoMulti = 0;
      let trocoMulti = 0;
      
      if (multiPag) {
        insertForma = 'multiplo';
        const somaOutros = pagamentos.filter(p => p.forma !== 'dinheiro').reduce((a, b) => a + Number(b.valor || 0), 0);
        cashRecebidoMulti = Number((pagamentos.find(p => p.forma === 'dinheiro')?.valor) || 0);
        const requeridoEmDinheiro = Math.max(0, totalFinal - somaOutros);
        trocoMulti = Math.max(0, cashRecebidoMulti - requeridoEmDinheiro);
        insertValorRecebido = cashRecebidoMulti > 0 ? cashRecebidoMulti : null;
        insertValorTroco = trocoMulti;
      }
      
      // Cliente fiado
      let idClienteForVenda = null;
      if (!multiPag && formaPagamento === 'fiado') {
        idClienteForVenda = pessoaFiadoId || null;
      } else if (multiPag) {
        const pFiado = pagamentos.find(p => p.forma === 'fiado');
        if (pFiado) idClienteForVenda = pFiado.pessoaId || null;
      }
      
      dispatch('confirmar', {
        formaPagamento: insertForma,
        valorRecebido: insertValorRecebido,
        valorTroco: insertValorTroco,
        idCliente: idClienteForVenda,
        pagamentos: multiPag ? pagamentos : [],
        trocoMulti,
        cashRecebidoMulti,
        imprimirRecibo,
        pessoasFiado,
        valorDesconto,
        descontoTipo: descontoAtivo ? descontoTipo : null,
        totalOriginal: Number(totalComanda),
        totalFinal,
        valorLiquidoPlataforma: (plataformaSelecionada && liquidoPlataforma > 0) ? Number(liquidoPlataforma) : null,
      });
      
    } catch (err) {
      erroPagamento = err?.message ?? 'Erro ao confirmar a venda.';
      salvandoVenda = false;
    }
  }
  
  function handleClose() {
    erroPagamento = '';
    salvandoVenda = false;
    dispatch('close');
  }
  
  function handleKeydown(e) {
    const tag = (e.target?.tagName || '').toLowerCase();
    const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;
    
    if (e.key === 'Escape') {
      handleClose();
    } else if (!isTyping) {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        confirmarVenda();
      }
      if (!multiPag) {
        if (e.key.toLowerCase() === 'd') selecionarForma('dinheiro');
        if (e.key.toLowerCase() === 'x') selecionarForma('pix');
        if (e.key.toLowerCase() === 'b') selecionarForma('cartao_debito');
        if (e.key.toLowerCase() === 'c') selecionarForma('cartao_credito');
        if (e.key.toLowerCase() === 'f') selecionarForma('fiado');
      } else {
        if (e.key.toLowerCase() === 'm') multiPag = !multiPag;
        if (e.key.toLowerCase() === 'a') addPagamento();
      }
    }
  }
  
  export function resetState() {
    formaPagamento = null;
    valorRecebido = 0;
    multiPag = false;
    pagamentos = [];
    novoPagForma = 'dinheiro';
    novoPagValor = 0;
    novoPagPessoaId = '';
    pessoaFiadoId = '';
    erroPagamento = '';
    salvandoVenda = false;
    descontoAtivo = false;
    descontoTipo = 'valor';
    descontoInput = 0;
    valorPlataforma = 0;
  }

  export function setSalvando(val) {
    salvandoVenda = val;
  }
  
  export function setErro(msg) {
    erroPagamento = msg;
    salvandoVenda = false;
  }
  
  // Reset ao abrir
  $: if (open) {
    formaPagamento = null;
    valorRecebido = 0;
    multiPag = false;
    pagamentos = [];
    novoPagForma = 'dinheiro';
    novoPagValor = Number(totalComanda);
    novoPagPessoaId = '';
    pessoaFiadoId = '';
    erroPagamento = '';
    salvandoVenda = false;
    descontoAtivo = false;
    descontoTipo = 'valor';
    descontoInput = 0;
    valorPlataforma = 0;
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    aria-label="Fechar modal de pagamento"
    on:keydown={handleKeydown}
    on:click|self={handleClose}
  >
    <div class="modal-content payment-modal" role="dialog" aria-modal="true" aria-labelledby="titulo-pagamento">

      <!-- ═══════════ ZONA 1: RESUMO ═══════════ -->
      <div class="zone zone-summary">
        <h3 id="titulo-pagamento" class="zone-title">Finalizar Pagamento</h3>

        {#if tipoPedido === 'delivery' && taxaEntrega > 0}
          <div class="summary-row">
            <span class="summary-label">Subtotal (produtos)</span>
            <span class="summary-value">R$ {Number(subtotalProdutos || totalComanda - taxaEntrega).toFixed(2)}</span>
          </div>
          <div class="summary-row" style="color: #a78bfa; font-size: 0.85em;">
            <span>Taxa de entrega (entregador)</span>
            <span>+ R$ {Number(taxaEntrega).toFixed(2)}</span>
          </div>
          <div class="summary-divider"></div>
          <div class="summary-row">
            <span class="summary-label">Subtotal</span>
            <span class="summary-value">R$ {Number(totalComanda).toFixed(2)}</span>
          </div>
        {:else}
          <div class="summary-row">
            <span class="summary-label">Subtotal</span>
            <span class="summary-value">R$ {Number(totalComanda).toFixed(2)}</span>
          </div>
        {/if}

        <!-- Desconto colapsável -->
        <button type="button" class="discount-toggle" on:click={() => descontoAtivo = !descontoAtivo}>
          <span class="discount-toggle-icon">{descontoAtivo ? '▾' : '▸'}</span>
          <span>Aplicar desconto</span>
        </button>

        {#if descontoAtivo}
          <div class="discount-panel">
            <div class="discount-input-row">
              <input
                type="number"
                min="0"
                step="0.01"
                bind:value={descontoInput}
                class="discount-input"
                placeholder={descontoTipo === 'percentual' ? '10' : '6.00'}
              />
              <select bind:value={descontoTipo} class="discount-type-select">
                <option value="valor">R$</option>
                <option value="percentual">%</option>
              </select>
            </div>
            {#if valorDesconto > 0}
              <span class="discount-badge">−R$ {Number(valorDesconto).toFixed(2)}</span>
            {/if}
          </div>
        {/if}

        {#if valorDesconto > 0}
          <div class="summary-divider"></div>
        {/if}
        <div class="summary-row summary-total">
          <span class="summary-label">{valorDesconto > 0 ? 'Total c/ desconto' : (tipoPedido === 'delivery' && taxaEntrega > 0 ? 'Total (c/ entrega)' : 'Total')}</span>
          <span class="total-value {valorDesconto > 0 ? 'total-discounted' : ''}">R$ {Number(totalFinal).toFixed(2)}</span>
        </div>
      </div>

      <!-- ═══════════ ZONA 2: FORMA DE PAGAMENTO ═══════════ -->
      <div class="zone zone-payment">

        {#if !multiPag}
          <fieldset class="payment-fieldset">
            <legend class="zone-label">Forma de pagamento</legend>

            <!-- Formas padrão -->
            <div class="payment-grid">
              {#each FORMAS_PADRAO as forma}
                <button
                  type="button"
                  class="pay-btn"
                  class:pay-btn-active={formaPagamento === forma.id}
                  on:click={() => selecionarForma(forma.id)}
                >
                  <span class="pay-btn-icon">{forma.icone}</span>
                  <span class="pay-btn-label">{forma.label}</span>
                  <span class="pay-btn-shortcut">{forma.atalho}</span>
                </button>
              {/each}
            </div>

            <!-- Plataformas dinâmicas -->
            {#if plataformasAtivas.length > 0}
              <p class="section-sublabel">Plataformas</p>
              <div class="payment-grid">
                {#each plataformasAtivas as plat}
                  <button
                    type="button"
                    class="pay-btn pay-btn-platform"
                    class:pay-btn-active={formaPagamento === plat.id}
                    on:click={() => selecionarForma(plat.id)}
                  >
                    <span class="pay-btn-icon">{plat.icone}</span>
                    <span class="pay-btn-label">{plat.nome}</span>
                    <span class="pay-btn-tax">{plat.taxa_pct}%</span>
                  </button>
                {/each}
              </div>
            {/if}

            <!-- Atalhos -->
            <p class="shortcuts-hint">D Dinheiro · X Pix · B Débito · C Crédito · F Fiado · Ctrl+Enter Confirmar</p>
          </fieldset>

          <!-- Contexto: Dinheiro → troco -->
          {#if formaPagamento === 'dinheiro'}
            <div class="context-panel">
              <label class="context-label" for="valor-recebido">Valor recebido (R$)</label>
              <input id="valor-recebido" type="number" min="0" step="0.01" bind:value={valorRecebido} class="context-input" />
              {#if troco > 0}
                <div class="troco-display">
                  <span>Troco</span>
                  <strong>R$ {Number(troco).toFixed(2)}</strong>
                </div>
              {/if}
            </div>
          {/if}

          <!-- Contexto: Fiado → pessoa -->
          {#if formaPagamento === 'fiado'}
            <div class="context-panel">
              <label class="context-label" for="select-pessoa-fiado">Pessoa (Fiado)</label>
              <select id="select-pessoa-fiado" class="context-input" bind:value={pessoaFiadoId}>
                <option value="">-- selecione --</option>
                {#each pessoasFiado as p}
                  <option value={p.id}>{p.nome}</option>
                {/each}
              </select>
              <p class="context-hint">O valor será lançado no saldo de fiado desta pessoa.</p>
            </div>
          {/if}

          <!-- Contexto: Plataforma → valor cobrado + taxa -->
          {#if plataformaSelecionada}
            <div class="context-panel platform-tax-panel">
              <label class="context-label" for="valor-plataforma">
                Valor cobrado no {plataformaSelecionada.nome} (R$)
              </label>
              <input
                id="valor-plataforma"
                type="number"
                min="0.01"
                step="0.01"
                class="context-input"
                bind:value={valorPlataforma}
                placeholder="0,00"
              />
              {#if valorPlataforma > 0}
                <div class="tax-row">
                  <span class="tax-label">Taxa {plataformaSelecionada.nome} ({plataformaSelecionada.taxa_pct}%)</span>
                  <span class="tax-value">−R$ {Number(taxaPlataformaValor).toFixed(2)}</span>
                </div>
                <div class="tax-row tax-row-net">
                  <span class="tax-label">Líquido estimado</span>
                  <strong class="tax-net-value">R$ {Number(liquidoPlataforma).toFixed(2)}</strong>
                </div>
              {/if}
            </div>
          {/if}

          <!-- Botão dividir pagamento -->
          <button type="button" class="split-btn" on:click={() => { multiPag = true; novoPagValor = Number(totalComanda) - somaPagamentos; }}>
            ✂ Dividir pagamento
          </button>

        {:else}
          <!-- ──── UI de múltiplos pagamentos ──── -->
          <div class="multi-section">
            <div class="multi-header">
              <span class="zone-label">Múltiplos pagamentos</span>
              <button type="button" class="split-btn-back" on:click={() => multiPag = false}>← Voltar</button>
            </div>

            <div class="multi-form">
              <div class="multi-form-row">
                <div class="multi-field">
                  <label for="mp-forma" class="context-label">Forma</label>
                  <select id="mp-forma" class="context-input" bind:value={novoPagForma}>
                    {#each FORMAS_PADRAO as f}
                      <option value={f.id}>{f.icone} {f.label}</option>
                    {/each}
                    {#each plataformasAtivas as plat}
                      <option value={plat.id}>{plat.icone} {plat.nome} ({plat.taxa_pct}%)</option>
                    {/each}
                  </select>
                </div>
                <div class="multi-field">
                  <label for="mp-valor" class="context-label">{novoPagForma === 'dinheiro' ? 'Recebido (R$)' : 'Valor (R$)'}</label>
                  <input id="mp-valor" type="number" min="0.01" step="0.01" class="context-input" bind:value={novoPagValor} />
                  {#if novoPagForma === 'dinheiro'}
                    <div class="suggestion-row">
                      <button type="button" class="sugg-btn" on:click={() => novoPagValor = Math.max(0.01, Number(restantePagamento))}>Restante</button>
                      <button type="button" class="sugg-btn" on:click={() => novoPagValor = Number(novoPagValor || 0) + 5}>+5</button>
                      <button type="button" class="sugg-btn" on:click={() => novoPagValor = Number(novoPagValor || 0) + 10}>+10</button>
                    </div>
                  {/if}
                </div>
                {#if novoPagForma === 'fiado'}
                  <div class="multi-field">
                    <label for="mp-pessoa" class="context-label">Pessoa</label>
                    <select id="mp-pessoa" class="context-input" bind:value={novoPagPessoaId} on:focus={carregarPessoasFiado}>
                      <option value="">-- selecione --</option>
                      {#each pessoasFiado as p}
                        <option value={p.id}>{p.nome}</option>
                      {/each}
                    </select>
                  </div>
                {/if}
              </div>
              <button type="button" class="add-payment-btn" on:click={addPagamento}>+ Adicionar</button>
            </div>

            {#if pagamentos.length}
              <div class="payments-list">
                {#each pagamentos as p, i}
                  <div class="payment-item">
                    <div class="payment-item-info">
                      <span class="payment-item-name">{nomeForma(p.forma)}</span>
                      <span class="payment-item-value">R$ {Number(p.valor).toFixed(2)}</span>
                      {#if p.forma === 'fiado'}
                        <span class="payment-item-extra">{pessoasFiado.find(x => x.id === p.pessoaId)?.nome || ''}</span>
                      {/if}
                    </div>
                    <button type="button" class="remove-btn" on:click={() => removerPagamento(i)}>✕</button>
                  </div>
                {/each}
              </div>

              <div class="multi-totals">
                <div class="multi-total-row"><span>Soma</span><span>R$ {Number(somaPagamentos).toFixed(2)}</span></div>
                <div class="multi-total-row"><span>Restante</span><span class="{restantePagamento > 0 ? 'text-warning' : ''}">R$ {Number(restantePagamento).toFixed(2)}</span></div>
                {#if trocoPrevMulti > 0}
                  <div class="multi-total-row"><span>Troco</span><span>R$ {Number(trocoPrevMulti).toFixed(2)}</span></div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- ═══════════ ZONA 3: AÇÕES ═══════════ -->
      <div class="zone zone-actions">
        {#if erroPagamento}
          <div class="error-msg">{erroPagamento}</div>
        {/if}

        <label class="print-toggle">
          <input type="checkbox" bind:checked={imprimirRecibo} />
          <span>Imprimir recibo</span>
        </label>

        <div class="action-buttons">
          <button type="button" class="btn-cancel" on:click={handleClose}>Cancelar</button>
          <button type="button" class="btn-confirm" disabled={salvandoVenda} on:click={confirmarVenda}>
            {#if salvandoVenda}
              Salvando…
            {:else}
              ✓ Confirmar R$ {Number(plataformaSelecionada && valorPlataforma > 0 ? valorPlataforma : totalFinal).toFixed(2)}
            {/if}
          </button>
        </div>
      </div>

    </div>
  </div>
{/if}

<style>
  .payment-modal {
    max-width: 460px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  /* ─── Zones ─── */
  .zone {
    padding: 16px 20px;
  }
  .zone + .zone {
    border-top: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
  }
  .zone-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-main, #fff);
    margin: 0 0 12px 0;
  }
  .zone-label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-muted, #94a3b8);
    margin-bottom: 10px;
  }

  /* ─── Summary ─── */
  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .summary-label {
    font-size: 0.875rem;
    color: var(--text-label, #cbd5e1);
  }
  .summary-value {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-main, #fff);
  }
  .summary-total {
    margin-top: 4px;
    margin-bottom: 0;
  }
  .total-value {
    font-size: 1.375rem;
    font-weight: 700;
    color: var(--text-main, #fff);
  }
  .total-discounted {
    color: var(--success, #22c55e);
  }
  .summary-divider {
    border-top: 1px dashed var(--border-subtle, rgba(255,255,255,0.1));
    margin: 8px 0;
  }

  /* Discount */
  .discount-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    color: var(--text-muted, #94a3b8);
    font-size: 0.8rem;
    cursor: pointer;
    padding: 4px 0;
    margin-bottom: 4px;
  }
  .discount-toggle:hover {
    color: var(--text-label, #cbd5e1);
  }
  .discount-toggle-icon {
    font-size: 0.65rem;
  }
  .discount-panel {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
    flex-wrap: wrap;
  }
  .discount-input-row {
    display: flex;
    gap: 0;
    flex: 1;
    min-width: 140px;
  }
  .discount-input {
    flex: 1;
    background: var(--bg-input, #1e293b);
    color: var(--text-main, #fff);
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.1));
    border-right: none;
    border-radius: 6px 0 0 6px;
    padding: 6px 10px;
    font-size: 0.95rem;
  }
  .discount-type-select {
    width: 52px;
    background: var(--bg-input, #1e293b);
    color: var(--text-main, #fff);
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.1));
    border-radius: 0 6px 6px 0;
    padding: 6px 4px;
    font-size: 0.8rem;
    text-align: center;
  }
  .discount-badge {
    font-size: 0.8rem;
    font-weight: 600;
    color: #f87171;
    white-space: nowrap;
  }

  /* ─── Payment buttons ─── */
  .payment-fieldset {
    border: none;
    padding: 0;
    margin: 0;
  }
  .payment-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 8px;
    margin-bottom: 8px;
  }
  .pay-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 12px 6px 10px;
    border-radius: 12px;
    border: 1.5px solid var(--border-subtle, rgba(255,255,255,0.1));
    background: var(--bg-input, #1e293b);
    color: var(--text-label, #cbd5e1);
    cursor: pointer;
    transition: all 0.15s ease;
    position: relative;
  }
  .pay-btn:hover {
    border-color: var(--primary, #0ea5e9);
    background: color-mix(in srgb, var(--primary, #0ea5e9) 8%, var(--bg-input, #1e293b));
  }
  .pay-btn-active {
    border-color: var(--primary, #0ea5e9) !important;
    background: color-mix(in srgb, var(--primary, #0ea5e9) 15%, var(--bg-input, #1e293b)) !important;
    box-shadow: 0 0 0 1px var(--primary, #0ea5e9), 0 0 12px color-mix(in srgb, var(--primary, #0ea5e9) 25%, transparent);
  }
  .pay-btn-icon {
    font-size: 1.25rem;
    line-height: 1;
  }
  .pay-btn-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-main, #fff);
  }
  .pay-btn-shortcut {
    position: absolute;
    top: 4px;
    right: 6px;
    font-size: 0.55rem;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text-muted, #64748b);
    opacity: 0.6;
  }
  .pay-btn-tax {
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--warning, #f59e0b);
    background: color-mix(in srgb, var(--warning, #f59e0b) 15%, transparent);
    padding: 1px 6px;
    border-radius: 99px;
  }
  .section-sublabel {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-muted, #94a3b8);
    margin: 6px 0 8px;
  }
  .shortcuts-hint {
    font-size: 0.65rem;
    color: var(--text-muted, #64748b);
    opacity: 0.7;
    margin-top: 4px;
  }

  /* ─── Context panels ─── */
  .context-panel {
    margin-top: 12px;
    padding: 12px;
    border-radius: 10px;
    background: var(--bg-input, #1e293b);
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
  }
  .context-label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-label, #cbd5e1);
    margin-bottom: 6px;
  }
  .context-input {
    width: 100%;
    background: var(--bg-panel, #0f172a);
    color: var(--text-main, #fff);
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.1));
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 0.95rem;
  }
  .context-hint {
    font-size: 0.7rem;
    color: var(--text-muted, #64748b);
    margin-top: 6px;
  }
  .troco-display {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px dashed var(--border-subtle, rgba(255,255,255,0.1));
    font-size: 0.9rem;
    color: var(--text-label, #cbd5e1);
  }
  .troco-display strong {
    font-size: 1.1rem;
    color: var(--text-main, #fff);
  }

  /* Platform tax panel */
  .platform-tax-panel {
    background: color-mix(in srgb, var(--warning, #f59e0b) 6%, var(--bg-input, #1e293b));
    border-color: color-mix(in srgb, var(--warning, #f59e0b) 20%, transparent);
  }
  .tax-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.85rem;
  }
  .tax-row + .tax-row {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px dashed color-mix(in srgb, var(--warning, #f59e0b) 20%, transparent);
  }
  .tax-label { color: var(--text-label, #cbd5e1); }
  .tax-value { color: #f87171; font-weight: 600; }
  .tax-row-net .tax-label { font-weight: 600; }
  .tax-net-value { color: var(--success, #22c55e); font-size: 1rem; }

  /* Dividir pagamento */
  .split-btn {
    display: block;
    width: 100%;
    margin-top: 12px;
    padding: 8px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted, #94a3b8);
    background: none;
    border: 1px dashed var(--border-subtle, rgba(255,255,255,0.12));
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .split-btn:hover {
    color: var(--text-label, #cbd5e1);
    border-color: var(--text-muted, #94a3b8);
  }

  /* Multi payment */
  .multi-section { display: flex; flex-direction: column; gap: 12px; }
  .multi-header { display: flex; justify-content: space-between; align-items: center; }
  .split-btn-back {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted, #94a3b8);
    background: none;
    border: none;
    cursor: pointer;
  }
  .split-btn-back:hover { color: var(--text-label, #cbd5e1); }
  .multi-form {
    padding: 12px;
    border-radius: 10px;
    background: var(--bg-input, #1e293b);
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
  }
  .multi-form-row { display: grid; gap: 10px; margin-bottom: 10px; }
  .multi-field label { font-size: 0.75rem; }
  .suggestion-row {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }
  .sugg-btn {
    padding: 3px 10px;
    font-size: 0.7rem;
    border-radius: 6px;
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.1));
    background: var(--bg-panel, #0f172a);
    color: var(--text-label, #cbd5e1);
    cursor: pointer;
  }
  .sugg-btn:hover { border-color: var(--primary, #0ea5e9); }
  .add-payment-btn {
    width: 100%;
    padding: 8px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--primary, #0ea5e9);
    background: color-mix(in srgb, var(--primary, #0ea5e9) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--primary, #0ea5e9) 25%, transparent);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .add-payment-btn:hover { background: color-mix(in srgb, var(--primary, #0ea5e9) 15%, transparent); }

  .payments-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    border-radius: 10px;
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
    overflow: hidden;
  }
  .payment-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: var(--bg-input, #1e293b);
  }
  .payment-item + .payment-item {
    border-top: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
  }
  .payment-item-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .payment-item-name {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-main, #fff);
  }
  .payment-item-value {
    font-size: 0.75rem;
    color: var(--text-muted, #94a3b8);
  }
  .payment-item-extra {
    font-size: 0.7rem;
    color: var(--text-muted, #64748b);
  }
  .remove-btn {
    background: none;
    border: none;
    color: #f87171;
    font-size: 0.85rem;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: background 0.15s;
  }
  .remove-btn:hover {
    background: rgba(248,113,113,0.15);
  }
  .multi-totals {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .multi-total-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    color: var(--text-label, #cbd5e1);
  }
  .multi-total-row span:last-child {
    font-weight: 600;
  }
  .text-warning { color: var(--warning, #f59e0b) !important; }

  /* ─── Actions ─── */
  .error-msg {
    font-size: 0.8rem;
    color: #f87171;
    padding: 8px 12px;
    background: rgba(248,113,113,0.08);
    border: 1px solid rgba(248,113,113,0.2);
    border-radius: 8px;
    margin-bottom: 8px;
  }
  .print-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    color: var(--text-muted, #94a3b8);
    cursor: pointer;
    margin-bottom: 10px;
  }
  .print-toggle input { cursor: pointer; }
  .action-buttons {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }
  .btn-cancel {
    padding: 10px 20px;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-label, #cbd5e1);
    background: var(--bg-input, #1e293b);
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.1));
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-cancel:hover {
    background: var(--bg-panel, #0f172a);
  }
  .btn-confirm {
    padding: 10px 24px;
    font-size: 0.875rem;
    font-weight: 700;
    color: #fff;
    background: var(--primary, #0ea5e9);
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s;
    box-shadow: 0 2px 12px color-mix(in srgb, var(--primary, #0ea5e9) 30%, transparent);
  }
  .btn-confirm:hover:not(:disabled) {
    filter: brightness(1.1);
    transform: translateY(-1px);
  }
  .btn-confirm:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>

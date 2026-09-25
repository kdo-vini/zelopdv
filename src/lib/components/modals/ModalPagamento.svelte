<!--
  Componente: ModalPagamento.svelte
  Descrição: Modal de finalização de venda com suporte a múltiplos pagamentos, fiado,
  plataformas dinâmicas (iFood, Rappi, etc.) e layout em 3 zonas visuais.
-->
<script>
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { Check, ChevronLeft, ChevronRight, Plus, Scissors, X } from 'lucide-svelte';
  import { zeloSurface } from '$lib/theme/surface';
  import { Button } from '$lib/components/ui/button';
  import Kbd from '$lib/components/zelo/Kbd.svelte';
  import MoneyText from '$lib/components/zelo/MoneyText.svelte';
  import MorphButton from '$lib/components/zelo/MorphButton.svelte';
  import { supabase } from '$lib/supabaseClient';
  import { getOfflineContext, readOperationalSnapshot } from '$lib/offline/runtime';
  import { addToast } from '$lib/stores/ui';
  import { formatMoney } from '$lib/formatMoney';
  import PaymentMethodGrid from '$lib/components/payments/PaymentMethodGrid.svelte';
  import PaymentMethodSelect from '$lib/components/payments/PaymentMethodSelect.svelte';
  import {
    SELECTABLE_PAYMENT_METHODS,
    formatPaymentMethod,
    getPaymentMethod,
    getPaymentPlatform
  } from '$lib/finance/paymentMethods';
  
  const dispatch = createEventDispatcher();
  
  /** @type {boolean} */
  export let open = false;
  
  /** @type {number} */
  export let totalComanda = 0;
  
  /** @type {Array<{id: number, id_produto?: number, nome: string, preco: number, quantidade: number}>} */
  export let comanda = [];
  
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

  function focusOnMount(node) {
    void tick().then(() => {
      if (node.isConnected) node.focus();
    });
  }
  
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
  $: plataformasSelecionaveis = plataformasAtivas.filter((plataforma) => !getPaymentMethod(plataforma?.id));
  // X já era o atalho operacional de Pix neste modal; preservamos o contrato
  // de teclado enquanto o catálogo continua sendo a fonte dos demais metadados.
  $: formasPdv = SELECTABLE_PAYMENT_METHODS.map((metodo) => (
    metodo.id === 'pix' ? { ...metodo, shortcut: 'X' } : metodo
  ));
  $: formasMulti = [
    ...SELECTABLE_PAYMENT_METHODS,
    ...plataformasSelecionaveis.map((plataforma) => ({
      id: plataforma.id,
      label: plataforma.nome,
      icon: plataforma.icone || 'plataformas',
      taxPct: plataforma.taxa_pct,
    })),
  ];
  $: plataformaSelecionada = getPaymentPlatform(formaPagamento, plataformasAtivas);
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

  let pessoasOwner = null;
  async function carregarPessoasFiado() {
    const context = getOfflineContext();
    if (pessoasOwner === context?.ownerUserId && pessoasFiado.length) return;
    pessoasFiado = [];
    try {
      if (!context?.ownerUserId) throw new Error('Aguarde o carregamento da loja para selecionar o cliente.');
      const preparedPeople = await readOperationalSnapshot('pessoas.fiado', async () => {
        const people = [];
        for (let from = 0; ; from += 500) {
          const { data, error } = await supabase.from('pessoas').select('id, nome').eq('id_usuario', context.ownerUserId).order('nome').order('id').range(from, from + 499);
          if (error) throw error;
          people.push(...data);
          if (data.length < 500) return people;
        }
      });
      if (getOfflineContext()?.ownerUserId !== context.ownerUserId) return;
      pessoasOwner = context.ownerUserId;
      pessoasFiado = preparedPeople;
    } catch (error) { addToast('Clientes indisponíveis neste aparelho. Prepare os dados com internet.', 'warning'); }
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
      
      // Platform fees: 1 entry per platform line in the sale.
      // Single-pay: 1 entry (formaPagamento === plataforma_id).
      // Multi-pay: 1 entry per row whose forma matches a configured platform.
      const taxasPlataforma = [];
      if (!multiPag && plataformaSelecionada) {
        const grossBase = Number(valorPlataforma) > 0 ? Number(valorPlataforma) : totalFinal;
        const taxaPct = Number(plataformaSelecionada.taxa_pct || 0);
        if (grossBase > 0 && taxaPct > 0) {
          taxasPlataforma.push({
            plataforma_id: plataformaSelecionada.id,
            plataforma_nome: plataformaSelecionada.nome,
            taxa_pct: taxaPct,
            valor_bruto: grossBase
          });
        }
      } else if (multiPag) {
        for (const p of pagamentos) {
          const plat = getPaymentPlatform(p.forma, plataformasAtivas);
          if (plat) {
            const taxaPct = Number(plat.taxa_pct || 0);
            const grossBase = Number(p.valor || 0);
            if (grossBase > 0 && taxaPct > 0) {
              taxasPlataforma.push({
                plataforma_id: plat.id,
                plataforma_nome: plat.nome,
                taxa_pct: taxaPct,
                valor_bruto: grossBase
              });
            }
          }
        }
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
        taxasPlataforma,
      });
      
    } catch (err) {
      console.error('[ModalPagamento] confirmarVenda error:', err);
      erroPagamento = 'Não foi possível confirmar a venda. Verifique sua conexão e tente novamente.';
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
        if (e.key.toLowerCase() === 'v') selecionarForma('vale_refeicao');
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
    // O modal fica montado entre vendas (só alterna `open`); sem isto, uma pessoa
    // cadastrada depois da primeira vez que "fiado" foi aberto nesta sessão nunca
    // aparece, pois carregarPessoasFiado() pula o refetch quando já há cache local.
    pessoasFiado = [];
    pessoasOwner = null;
  }
</script>

{#if open}
  {#if $zeloSurface}
  <!--
    Zelo Design System (docs/DESIGN_SYSTEM.md → "Layout por superfície"). Same state,
    handlers and validations as the legacy branch below; only the markup changes.
    Desktop: centred sheet. ≤767px: bottom sheet with the footer (CTA) always visible.
  -->
  <dialog
    open
    class="zp-backdrop"
    aria-modal="true"
    aria-labelledby="titulo-pagamento"
    tabindex="-1"
    on:keydown={handleKeydown}
    on:click|self={handleClose}
  >
    <div class="zp-sheet">
      <header class="zp-head">
        <div>
          <p class="zp-eyebrow">Receber</p>
          <h3 id="titulo-pagamento" class="zp-title">Finalizar pagamento</h3>
        </div>
        <Button variant="quiet" size="icon-md" aria-label="Fechar" onclick={handleClose}>
          <X size={20} strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </header>

      <div class="zp-body">
        <!-- Resumo -->
        <section class="zp-summary" aria-label="Resumo da venda">
          {#if tipoPedido === 'delivery' && taxaEntrega > 0}
            <div class="zp-line"><span>Subtotal (produtos)</span><MoneyText value={subtotalProdutos || totalComanda - taxaEntrega} size="sm" /></div>
            <div class="zp-line"><span>Taxa de entrega (entregador)</span><span class="zp-num">+ <MoneyText value={taxaEntrega} size="sm" /></span></div>
            <div class="zp-line"><span>Subtotal</span><MoneyText value={totalComanda} size="sm" /></div>
          {:else}
            <div class="zp-line"><span>Subtotal</span><MoneyText value={totalComanda} size="sm" /></div>
          {/if}
          {#if valorDesconto > 0}
            <div class="zp-line"><span>Desconto{descontoTipo === 'percentual' ? ` (${descontoInput}%)` : ''}</span><span class="zp-num">− <MoneyText value={valorDesconto} size="sm" /></span></div>
          {/if}

          <button type="button" class="zp-disclosure" class:zp-disclosure-open={descontoAtivo} aria-expanded={descontoAtivo} use:focusOnMount on:click={() => descontoAtivo = !descontoAtivo}>
            <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>Aplicar desconto</span>
          </button>

          {#if descontoAtivo}
            <div class="zp-affix">
              <input
                type="number"
                min="0"
                step="0.01"
                bind:value={descontoInput}
                class="zp-affix-input"
                aria-label="Valor do desconto"
                placeholder={descontoTipo === 'percentual' ? '10' : '6.00'}
              />
              <select bind:value={descontoTipo} class="zp-affix-select" aria-label="Tipo de desconto">
                <option value="valor">R$</option>
                <option value="percentual">%</option>
              </select>
            </div>
          {/if}

          <div class="zp-total">
            <span>{valorDesconto > 0 ? 'Total c/ desconto' : (tipoPedido === 'delivery' && taxaEntrega > 0 ? 'Total (c/ entrega)' : 'Total')}</span>
            <MoneyText value={totalFinal} size="lg" class="zp-total-value" />
          </div>
        </section>

        <div class="zp-col-pay">
        {#if !multiPag}
          <fieldset class="zp-fieldset">
            <legend class="zp-label">Forma de pagamento</legend>
            <PaymentMethodGrid
              zelo
              methods={formasPdv}
              selectedId={formaPagamento}
              ariaLabel="Formas de pagamento"
              on:select={(event) => selecionarForma(event.detail)}
            />

            {#if plataformasSelecionaveis.length > 0}
              <p class="zp-label zp-label-sub">Plataformas</p>
              <PaymentMethodGrid
                zelo
                methods={formasMulti.slice(SELECTABLE_PAYMENT_METHODS.length)}
                selectedId={formaPagamento}
                showShortcuts={false}
                ariaLabel="Plataformas de pagamento"
                on:select={(event) => selecionarForma(event.detail)}
              />
            {/if}
          </fieldset>

          <button type="button" class="zp-split" on:click={() => { multiPag = true; novoPagValor = Number(totalFinal) - somaPagamentos; }}>
            <Scissors size={18} strokeWidth={1.75} aria-hidden="true" /> Dividir pagamento
          </button>
        {:else}
          <section class="zp-multi" aria-label="Pagamento dividido">
            <div class="zp-multi-head">
              <span class="zp-label">Pagamento dividido</span>
              <button type="button" class="zp-back" on:click={() => multiPag = false}><ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" /> Voltar</button>
            </div>

            <div class="zp-panel zp-multi-form">
              <div class="zp-multi-grid">
                <div>
                  <label for="mp-forma" class="zp-field-label">Forma</label>
                  <PaymentMethodSelect zelo id="mp-forma" methods={formasMulti} bind:value={novoPagForma} />
                </div>
                <div>
                  <label for="mp-valor" class="zp-field-label">{novoPagForma === 'dinheiro' ? 'Recebido' : 'Valor'}</label>
                  <div class="zp-money-field">
                    <span class="zp-prefix" aria-hidden="true">R$</span>
                    <input id="mp-valor" type="number" min="0.01" step="0.01" class="zp-input zp-input-num" bind:value={novoPagValor} />
                  </div>
                </div>
              </div>
              {#if novoPagForma === 'dinheiro'}
                <div class="zp-chips">
                  <button type="button" class="zp-chip" on:click={() => novoPagValor = Math.max(0.01, Number(restantePagamento))}>Restante</button>
                  <button type="button" class="zp-chip" on:click={() => novoPagValor = Number(novoPagValor || 0) + 5}>+5</button>
                  <button type="button" class="zp-chip" on:click={() => novoPagValor = Number(novoPagValor || 0) + 10}>+10</button>
                </div>
              {/if}
              {#if novoPagForma === 'fiado'}
                <div>
                  <label for="mp-pessoa" class="zp-field-label">Cliente do fiado</label>
                  <select id="mp-pessoa" class="zp-input zp-select" bind:value={novoPagPessoaId} on:focus={carregarPessoasFiado}>
                    <option value="">Selecione o cliente</option>
                    {#each pessoasFiado as p}
                      <option value={p.id}>{p.nome}</option>
                    {/each}
                  </select>
                </div>
              {/if}
              <Button variant="outlined" size="touch" class="w-full" onclick={addPagamento}>
                <Plus size={18} strokeWidth={1.75} aria-hidden="true" /> Adicionar
              </Button>
            </div>

            {#if pagamentos.length}
              <ul class="zp-pay-list">
                {#each pagamentos as p, i}
                  <li class="zp-pay-row">
                    <div class="zp-pay-info">
                      <span class="zp-pay-name">{formatPaymentMethod(p.forma, { platforms: plataformasAtivas })}</span>
                      {#if p.forma === 'fiado'}
                        <span class="zp-pay-extra">{pessoasFiado.find(x => x.id === p.pessoaId)?.nome || ''}</span>
                      {/if}
                    </div>
                    <MoneyText value={p.valor} size="sm" />
                    <button type="button" class="zp-remove" on:click={() => removerPagamento(i)} aria-label="Remover pagamento">
                      <X size={18} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </li>
                {/each}
              </ul>

              <div class="zp-multi-totals">
                <div class="zp-line zp-line-tight"><span>Soma</span><MoneyText value={somaPagamentos} size="sm" /></div>
                <div class="zp-line zp-line-tight" class:zp-warn={restantePagamento > 0}><span>Restante</span><MoneyText value={restantePagamento} size="sm" /></div>
                {#if trocoPrevMulti > 0}
                  <div class="zp-line zp-line-tight zp-line-strong"><span>Troco</span><MoneyText value={trocoPrevMulti} size="sm" /></div>
                {/if}
              </div>
            {/if}
          </section>
        {/if}
        </div>

        {#if !multiPag}
          <div class="zp-col-ctx">
          {#if !formaPagamento}
            <p class="zp-ctx-empty">Escolha a forma de pagamento. Troco, cliente do fiado e taxas aparecem aqui.</p>
          {/if}
          {#if formaPagamento === 'dinheiro'}
            <div class="zp-panel">
              <label class="zp-field-label" for="valor-recebido">Valor recebido</label>
              <div class="zp-money-field">
                <span class="zp-prefix" aria-hidden="true">R$</span>
                <input id="valor-recebido" type="number" min="0" step="0.01" bind:value={valorRecebido} class="zp-input zp-input-num" />
              </div>
              {#if troco > 0}
                <div class="zp-change" aria-live="polite">
                  <span>Troco</span>
                  <MoneyText value={troco} size="md" />
                </div>
              {/if}
            </div>
          {/if}

          {#if formaPagamento === 'fiado'}
            <div class="zp-panel">
              <label class="zp-field-label" for="select-pessoa-fiado">Cliente do fiado</label>
              <select id="select-pessoa-fiado" class="zp-input zp-select" bind:value={pessoaFiadoId}>
                <option value="">Selecione o cliente</option>
                {#each pessoasFiado as p}
                  <option value={p.id}>{p.nome}</option>
                {/each}
              </select>
              <p class="zp-hint">O valor será lançado no saldo de fiado desta pessoa.</p>
            </div>
          {/if}

          {#if plataformaSelecionada}
            <div class="zp-panel zp-panel-warn">
              <label class="zp-field-label" for="valor-plataforma">Valor cobrado no {plataformaSelecionada.nome}</label>
              <div class="zp-money-field">
                <span class="zp-prefix" aria-hidden="true">R$</span>
                <input
                  id="valor-plataforma"
                  type="number"
                  min="0.01"
                  step="0.01"
                  class="zp-input zp-input-num"
                  bind:value={valorPlataforma}
                  placeholder="0,00"
                />
              </div>
              {#if valorPlataforma > 0}
                <div class="zp-line zp-line-tight"><span>Taxa {plataformaSelecionada.nome} ({plataformaSelecionada.taxa_pct}%)</span><span class="zp-num">− <MoneyText value={taxaPlataformaValor} size="sm" /></span></div>
                <div class="zp-line zp-line-tight zp-line-strong"><span>Líquido estimado</span><MoneyText value={liquidoPlataforma} size="sm" /></div>
              {/if}
            </div>
          {/if}

          </div>
        {/if}
      </div>

      <footer class="zp-foot">
        {#if erroPagamento}
          <div class="zp-error" role="alert">{erroPagamento}</div>
        {/if}

        <div class="zp-foot-row">
        <label class="zp-switch">
          <input type="checkbox" role="switch" bind:checked={imprimirRecibo} />
          <span class="zp-switch-track" aria-hidden="true"></span>
          <span>Imprimir recibo</span>
        </label>

        <div class="zp-actions">
          <Button variant="outlined" class="zp-cancel" onclick={handleClose}>Cancelar</Button>
          <!-- Driven only by `salvandoVenda` (setSalvando / setErro / resetState): loading while the
               sale is being saved; the success check continues in ModalSucesso, which opens as this closes. -->
          <MorphButton
            state={salvandoVenda ? 'loading' : 'idle'}
            size="cta"
            align="start"
            class="zp-confirm"
            loadingLabel="Registrando venda…"
            onclick={confirmarVenda}
          >
            Confirmar<Kbd class="zp-confirm-kbd">Ctrl ↵</Kbd><MoneyText value={plataformaSelecionada && valorPlataforma > 0 ? valorPlataforma : totalFinal} class="zp-confirm-total" />
          </MorphButton>
        </div>
        </div>
      </footer>
    </div>
  </dialog>
  {:else}
  <dialog
    open
    class="modal-backdrop"
    aria-modal="true"
    aria-labelledby="titulo-pagamento"
    tabindex="-1"
    on:keydown={handleKeydown}
    on:click|self={handleClose}
  >
    <div class="modal-content payment-modal">

      <!-- ═══════════ ZONA 1: RESUMO ═══════════ -->
      <div class="zone zone-summary">
        <h3 id="titulo-pagamento" class="zone-title">Finalizar Pagamento</h3>

        {#if tipoPedido === 'delivery' && taxaEntrega > 0}
          <div class="summary-row">
            <span class="summary-label">Subtotal (produtos)</span>
            <span class="summary-value">{formatMoney(subtotalProdutos || totalComanda - taxaEntrega)}</span>
          </div>
          <div class="summary-row" style="color: var(--primary); font-size: 0.85em;">
            <span>Taxa de entrega (entregador)</span>
            <span>+ {formatMoney(taxaEntrega)}</span>
          </div>
          <div class="summary-divider"></div>
          <div class="summary-row">
            <span class="summary-label">Subtotal</span>
            <span class="summary-value">{formatMoney(totalComanda)}</span>
          </div>
        {:else}
          <div class="summary-row">
            <span class="summary-label">Subtotal</span>
            <span class="summary-value">{formatMoney(totalComanda)}</span>
          </div>
        {/if}

        <!-- Desconto colapsável -->
        <button type="button" class="discount-toggle" use:focusOnMount on:click={() => descontoAtivo = !descontoAtivo}>
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
              <span class="discount-badge">−{formatMoney(valorDesconto)}</span>
            {/if}
          </div>
        {/if}

        {#if valorDesconto > 0}
          <div class="summary-divider"></div>
        {/if}
        <div class="summary-row summary-total">
          <span class="summary-label">{valorDesconto > 0 ? 'Total c/ desconto' : (tipoPedido === 'delivery' && taxaEntrega > 0 ? 'Total (c/ entrega)' : 'Total')}</span>
          <span class="total-value {valorDesconto > 0 ? 'total-discounted' : ''}">{formatMoney(totalFinal)}</span>
        </div>
      </div>

      <!-- ═══════════ ZONA 2: FORMA DE PAGAMENTO ═══════════ -->
      <div class="zone zone-payment">

        {#if !multiPag}
          <fieldset class="payment-fieldset">
            <legend class="zone-label">Forma de pagamento</legend>

            <PaymentMethodGrid
              methods={formasPdv}
              selectedId={formaPagamento}
              ariaLabel="Formas de pagamento"
              on:select={(event) => selecionarForma(event.detail)}
            />

            <!-- Plataformas dinâmicas -->
            {#if plataformasSelecionaveis.length > 0}
              <p class="section-sublabel">Plataformas</p>
              <PaymentMethodGrid
                methods={formasMulti.slice(SELECTABLE_PAYMENT_METHODS.length)}
                selectedId={formaPagamento}
                showShortcuts={false}
                ariaLabel="Plataformas de pagamento"
                on:select={(event) => selecionarForma(event.detail)}
              />
            {/if}

            <!-- Atalhos -->
            <p class="shortcuts-hint">D Dinheiro · X Pix · V Vale-Refeição · B Débito · C Crédito · F Fiado · Ctrl+Enter Confirmar</p>
          </fieldset>

          <!-- Contexto: Dinheiro → troco -->
          {#if formaPagamento === 'dinheiro'}
            <div class="context-panel">
              <label class="context-label" for="valor-recebido">Valor recebido (R$)</label>
              <input id="valor-recebido" type="number" min="0" step="0.01" bind:value={valorRecebido} class="context-input" />
              {#if troco > 0}
                <div class="troco-display">
                  <span>Troco</span>
                  <strong>{formatMoney(troco)}</strong>
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
                  <span class="tax-value">−{formatMoney(taxaPlataformaValor)}</span>
                </div>
                <div class="tax-row tax-row-net">
                  <span class="tax-label">Líquido estimado</span>
                  <strong class="tax-net-value">{formatMoney(liquidoPlataforma)}</strong>
                </div>
              {/if}
            </div>
          {/if}

          <!-- Botão dividir pagamento -->
          <button type="button" class="split-btn" on:click={() => { multiPag = true; novoPagValor = Number(totalFinal) - somaPagamentos; }}>
            <Scissors class="size-4" aria-hidden="true" /> Dividir pagamento
          </button>

        {:else}
          <!-- ──── UI de múltiplos pagamentos ──── -->
          <div class="multi-section">
            <div class="multi-header">
              <span class="zone-label">Múltiplos pagamentos</span>
              <button type="button" class="split-btn-back" on:click={() => multiPag = false}><ChevronLeft class="size-4" aria-hidden="true" /> Voltar</button>
            </div>

            <div class="multi-form">
              <div class="multi-form-row">
                <div class="multi-field">
                  <label for="mp-forma" class="context-label">Forma</label>
                  <PaymentMethodSelect id="mp-forma" methods={formasMulti} bind:value={novoPagForma} />
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
                      <span class="payment-item-name">{formatPaymentMethod(p.forma, { platforms: plataformasAtivas })}</span>
                      <span class="payment-item-value">{formatMoney(p.valor)}</span>
                      {#if p.forma === 'fiado'}
                        <span class="payment-item-extra">{pessoasFiado.find(x => x.id === p.pessoaId)?.nome || ''}</span>
                      {/if}
                    </div>
                    <button type="button" class="remove-btn" on:click={() => removerPagamento(i)} aria-label="Remover pagamento">
                      <X class="size-4" aria-hidden="true" />
                    </button>
                  </div>
                {/each}
              </div>

              <div class="multi-totals">
                <div class="multi-total-row"><span>Soma</span><span>{formatMoney(somaPagamentos)}</span></div>
                <div class="multi-total-row"><span>Restante</span><span class="{restantePagamento > 0 ? 'text-warning' : ''}">{formatMoney(restantePagamento)}</span></div>
                {#if trocoPrevMulti > 0}
                  <div class="multi-total-row"><span>Troco</span><span>{formatMoney(trocoPrevMulti)}</span></div>
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
          <input class="themed-checkbox" type="checkbox" bind:checked={imprimirRecibo} />
          <span>Imprimir recibo</span>
        </label>

        <div class="action-buttons">
          <button type="button" class="btn-cancel" on:click={handleClose}>Cancelar</button>
          <button type="button" class="btn-confirm" disabled={salvandoVenda} on:click={confirmarVenda}>
            {#if salvandoVenda}
              Salvando…
            {:else}
              <Check class="size-4" aria-hidden="true" /> Confirmar {formatMoney(plataformaSelecionada && valorPlataforma > 0 ? valorPlataforma : totalFinal)}
            {/if}
          </button>
        </div>
      </div>

    </div>
  </dialog>
  {/if}
{/if}

<style>
  .modal-backdrop {
    width: auto;
    max-width: none;
    height: auto;
    margin: 0;
    border: 0;
    padding: 0;
  }

  .modal-backdrop::backdrop {
    background: transparent;
  }

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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    margin-top: 12px;
    min-height: 44px;
    padding: 10px;
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
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 8px 14px;
    font-size: 0.8rem;
    border-radius: 8px;
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.1));
    background: var(--bg-panel, #0f172a);
    color: var(--text-label, #cbd5e1);
    cursor: pointer;
  }
  .sugg-btn:hover { border-color: var(--primary, #0ea5e9); }
  .add-payment-btn {
    width: 100%;
    min-height: 44px;
    padding: 10px;
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    min-height: 44px;
    padding: 10px 24px;
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--primary-text, #0f172a);
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

  @media (prefers-reduced-motion: reduce) {
    .split-btn, .add-payment-btn, .remove-btn, .btn-cancel, .btn-confirm {
      transition: none;
      animation: none;
    }
    .btn-confirm:hover:not(:disabled) {
      transform: none;
    }
  }

  /* ═══════════ Zelo Design System (only rendered when $zeloSurface) ═══════════
     Colour only through tokens; see docs/DESIGN_SYSTEM.md → "Regras de código". */
  .zp-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1150; /* above MobileBottomNav (1100): on phones the sheet covers the nav */
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    border: 0;
    padding: 24px;
    background: color-mix(in srgb, var(--shadow-color) 42%, transparent);
    color: var(--text-main);
    font-family: var(--zelo-font-ui);
  }
  .zp-sheet {
    display: flex;
    flex-direction: column;
    width: min(520px, 100%);
    max-height: min(92vh, 920px);
    overflow: hidden;
    border-radius: var(--zelo-radius-sheet);
    background: var(--bg-panel);
    box-shadow: var(--shadow-modal);
  }
  .zp-head {
    flex: none;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 20px 20px 8px 24px;
  }
  .zp-eyebrow, .zp-label {
    display: block;
    margin: 0;
    padding: 0;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .zp-title {
    margin: 4px 0 0;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--text-main);
  }
  .zp-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 8px 24px 20px;
  }

  /* Resumo */
  .zp-summary {
    padding: 14px 16px 16px;
    border-radius: var(--zelo-radius-card);
    background: var(--bg-sunken);
  }
  .zp-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 28px;
    font-size: 13.5px;
    color: var(--text-label);
  }
  .zp-line-tight { min-height: 24px; }
  .zp-line-strong { font-weight: 600; color: var(--text-main); }
  .zp-warn { color: var(--status-warning-text); }
  .zp-num {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    font-family: var(--zelo-font-num);
  }
  .zp-disclosure {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    margin: 2px 0 4px -6px;
    padding: 0 8px 0 6px;
    border-radius: var(--zelo-radius-seg);
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
  }
  .zp-disclosure:hover { color: var(--text-main); }
  .zp-disclosure:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--focus); }
  .zp-disclosure :global(svg) { transition: transform var(--zelo-dur-fast) var(--zelo-ease-out); }
  .zp-disclosure-open :global(svg) { transform: rotate(90deg); }
  .zp-affix {
    display: flex;
    height: 48px;
    margin-bottom: 6px;
    overflow: hidden;
    border: 1px solid var(--border-subtle);
    border-radius: var(--zelo-radius-control);
    background: var(--bg-input);
  }
  .zp-affix:focus-within { border-color: var(--primary); box-shadow: 0 0 0 4px var(--focus); }
  .zp-affix-input {
    flex: 1;
    min-width: 0;
    padding: 0 14px;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--text-main);
    font: 500 17px var(--zelo-font-num);
    font-variant-numeric: tabular-nums;
  }
  .zp-affix-select {
    width: 64px;
    padding: 0 10px;
    border: 0;
    border-left: 1px solid var(--border-subtle);
    outline: none;
    background: var(--bg-sunken);
    color: var(--text-main);
    font: 500 14px var(--zelo-font-ui);
    text-align: center;
  }
  .zp-total {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-top: 4px;
    padding-top: 10px;
    border-top: 1px solid var(--border-subtle);
  }
  .zp-total > span:first-child { font-size: 14px; font-weight: 600; color: var(--text-main); }
  .zp-total :global(.zp-total-value) { font-size: 34px; }

  /* Forma de pagamento + painéis de contexto */
  .zp-fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
  .zp-fieldset > .zp-label { margin-bottom: 10px; }
  .zp-label-sub { margin: 14px 0 10px; }
  .zp-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px;
    border: 1px solid var(--border-card);
    border-radius: var(--zelo-radius-card);
    background: var(--bg-card);
  }
  .zp-panel-warn { border-color: var(--status-warning-border); background: var(--status-warning-bg); }
  .zp-field-label { display: block; margin-bottom: 6px; font-size: 12.5px; font-weight: 500; color: var(--text-label); }
  .zp-panel > .zp-field-label { margin-bottom: 0; }
  .zp-input {
    width: 100%;
    height: 48px;
    padding: 0 14px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--zelo-radius-control);
    outline: none;
    background: var(--bg-input);
    color: var(--text-main);
    font: 400 15px var(--zelo-font-ui);
  }
  .zp-input:focus { border-color: var(--primary); box-shadow: 0 0 0 4px var(--focus); }
  .zp-select { font-weight: 500; }
  .zp-money-field { position: relative; display: flex; align-items: center; }
  .zp-prefix {
    position: absolute;
    left: 14px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
    pointer-events: none;
  }
  .zp-input-num {
    padding-left: 42px;
    font: 500 20px var(--zelo-font-num);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }
  .zp-hint { margin: 0; font-size: 12px; color: var(--text-muted); }
  .zp-change {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 2px;
    padding: 10px 14px;
    border-radius: var(--zelo-radius-control);
    background: var(--bg-sunken);
    font-size: 14px;
    font-weight: 600;
    color: var(--text-main);
  }
  .zp-change :global(.money) { font-size: 24px; }
  .zp-split {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 48px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--zelo-radius-control);
    font-size: 14px;
    font-weight: 500;
    color: var(--text-label);
  }
  .zp-split:hover { border-color: var(--primary); color: var(--text-main); }
  .zp-split:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--focus); }

  /* Pagamento dividido */
  .zp-multi { display: flex; flex-direction: column; gap: 12px; }
  .zp-multi-head { display: flex; align-items: center; justify-content: space-between; }
  .zp-back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 32px;
    padding: 0 10px 0 6px;
    border-radius: var(--zelo-radius-seg);
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
  }
  .zp-back:hover { background: var(--bg-sunken); color: var(--text-main); }
  .zp-back:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--focus); }
  .zp-multi-form { gap: 12px; }
  .zp-multi-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .zp-chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .zp-chip {
    height: 40px;
    padding: 0 14px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--zelo-radius-seg);
    background: var(--bg-panel);
    font-size: 13px;
    font-weight: 500;
    color: var(--text-label);
  }
  .zp-chip:hover { border-color: var(--border-strong); color: var(--text-main); }
  .zp-chip:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--focus); }
  .zp-pay-list {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow: hidden;
    border: 1px solid var(--border-card);
    border-radius: var(--zelo-radius-card);
  }
  .zp-pay-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    padding: 8px 8px 8px 14px;
    background: var(--bg-card);
  }
  .zp-pay-row + .zp-pay-row { border-top: 1px solid var(--border-subtle); }
  .zp-pay-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .zp-pay-name { font-size: 14px; font-weight: 500; color: var(--text-main); }
  .zp-pay-extra { font-size: 12px; color: var(--text-muted); }
  .zp-remove {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: var(--zelo-radius-seg);
    color: var(--text-muted);
  }
  .zp-remove:hover { background: var(--status-error-bg); color: var(--status-error-text); }
  .zp-remove:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--focus); }
  .zp-multi-totals { padding: 0 4px; }

  /* Rodapé */
  .zp-foot {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 24px 20px;
    border-top: 1px solid var(--border-subtle);
    background: var(--bg-panel);
  }
  .zp-error {
    padding: 10px 12px;
    border: 1px solid var(--status-error-border);
    border-radius: var(--zelo-radius-control);
    background: var(--status-error-bg);
    color: var(--status-error-text);
    font-size: 13.5px;
    font-weight: 500;
  }
  .zp-switch {
    position: relative;
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: 10px;
    min-height: 32px;
    font-size: 13.5px;
    font-weight: 500;
    color: var(--text-label);
    cursor: pointer;
  }
  .zp-switch input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  .zp-switch-track {
    position: relative;
    flex: none;
    width: 36px;
    height: 22px;
    border-radius: var(--zelo-radius-pill);
    background: var(--border-strong);
    transition: background var(--zelo-dur-fast) var(--zelo-ease-out);
  }
  .zp-switch-track::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--bg-panel);
    transition: transform var(--zelo-dur-fast) var(--zelo-ease-out);
  }
  .zp-switch input:checked + .zp-switch-track { background: var(--primary); }
  .zp-switch input:checked + .zp-switch-track::after { transform: translateX(14px); background: var(--primary-text); }
  .zp-switch input:focus-visible + .zp-switch-track { box-shadow: 0 0 0 4px var(--focus); }
  .zp-actions {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
  }
  .zp-actions :global(.zp-cancel) {
    height: 64px;
    padding: 0 22px;
    border-radius: var(--zelo-radius-cta);
    font-size: 15px;
    font-weight: 600;
  }
  .zp-actions :global(.zp-confirm-total) { margin-left: auto; font-size: 19px; }
  .zp-actions :global(.zp-confirm-total small) { color: inherit; opacity: 0.72; }

  .zp-input-num, .zp-affix-input { appearance: textfield; -moz-appearance: textfield; }
  .zp-input-num::-webkit-inner-spin-button, .zp-input-num::-webkit-outer-spin-button,
  .zp-affix-input::-webkit-inner-spin-button, .zp-affix-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .zp-col-ctx { display: flex; flex-direction: column; gap: 12px; }
  .zp-ctx-empty {
    display: none;
    margin: 0;
    padding: 16px;
    border: 1px dashed var(--border-subtle);
    border-radius: var(--zelo-radius-card);
    font-size: 13px;
    line-height: 1.45;
    color: var(--text-muted);
  }
  .zp-foot-row { display: flex; flex-direction: column; gap: 10px; }

  /* <1024px: one column in reading order — resumo, formas, contexto, dividir */
  @media (max-width: 1023px) {
    .zp-col-pay { display: contents; }
    .zp-summary { order: 0; }
    .zp-fieldset, .zp-multi { order: 1; }
    .zp-col-ctx { order: 2; }
    .zp-split { order: 3; }
    .zp-col-ctx:empty { display: none; }
  }

  /* ≥1024px: formas à esquerda; resumo, troco e CTA alinhados à direita */
  @media (min-width: 1024px) {
    .zp-sheet { width: min(900px, 100%); }
    .zp-body {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
      grid-template-rows: auto 1fr;
      grid-template-areas: "pay sum" "pay ctx";
      align-items: start;
      column-gap: 24px;
      row-gap: 12px;
    }
    .zp-summary { grid-area: sum; }
    .zp-col-pay { grid-area: pay; display: flex; flex-direction: column; gap: 14px; }
    .zp-col-ctx { grid-area: ctx; }
    .zp-ctx-empty { display: block; }
    .zp-switch { align-self: center; }
    .zp-foot-row {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
      align-items: center;
      column-gap: 24px;
    }
  }

  /* ≤767px: bottom sheet; header + footer fixed, content scrolls, CTA always reachable */
  @media (max-width: 767px) {
    .zp-backdrop { align-items: flex-end; padding: 0; }
    .zp-sheet {
      width: 100%;
      max-height: calc(100dvh - 12px);
      border-radius: var(--zelo-radius-sheet) var(--zelo-radius-sheet) 0 0;
    }
    .zp-sheet::before {
      content: '';
      flex: none;
      align-self: center;
      width: 36px;
      height: 4px;
      margin-top: 8px;
      border-radius: var(--zelo-radius-pill);
      background: var(--border-strong);
    }
    .zp-head { align-items: center; padding: 4px 8px 2px 16px; }
    .zp-eyebrow { display: none; }
    .zp-title { margin: 0; font-size: 18px; }
    .zp-body { gap: 12px; padding: 4px 16px 14px; }
    .zp-summary { padding: 8px 14px 12px; }
    .zp-line { min-height: 24px; }
    .zp-disclosure { height: 30px; margin: 0 0 2px -6px; }
    .zp-total { margin-top: 2px; padding-top: 8px; }
    .zp-total :global(.zp-total-value) { font-size: 28px; }
    .zp-label-sub { margin: 10px 0 8px; }
    .zp-fieldset > .zp-label { margin-bottom: 8px; }
    .zp-panel { padding: 12px; }
    .zp-foot { gap: 10px; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); }
    .zp-actions :global(.zp-cancel) { height: 56px; padding: 0 16px; }
    .zp-actions :global(.zp-confirm) { --mb-h: 56px; }
    .zp-actions :global(.zp-confirm-kbd) { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .zp-disclosure :global(svg), .zp-switch-track, .zp-switch-track::after { transition: none; }
  }
</style>

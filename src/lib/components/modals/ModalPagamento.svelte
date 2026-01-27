<!--
  Componente: ModalPagamento.svelte
  Descrição: Modal de finalização de venda com suporte a múltiplos pagamentos, fiado, etc.
  Este é o modal mais complexo do PDV.
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
  
  // Estados locais
  let formaPagamento = null; // 'dinheiro' | 'cartao_debito' | 'cartao_credito' | 'pix' | 'fiado'
  let valorRecebido = 0;
  let salvandoVenda = false;
  let erroPagamento = '';
  let imprimirRecibo = false;
  
  // Múltiplos pagamentos
  let multiPag = false;
  let pagamentos = []; // { forma, valor, pessoaId? }
  let novoPagForma = 'dinheiro';
  let novoPagValor = 0;
  let novoPagPessoaId = '';
  
  // Fiado
  let pessoasFiado = [];
  let pessoaFiadoId = '';
  
  // Derivados
  $: somaPagamentos = pagamentos.reduce((acc, p) => acc + Number(p?.valor || 0), 0);
  $: restantePagamento = Math.max(0, Number(totalComanda) - Number(somaPagamentos || 0));
  $: troco = formaPagamento === 'dinheiro' ? Math.max(0, Number(valorRecebido) - Number(totalComanda)) : 0;
  $: trocoPrevMulti = (() => {
    if (!multiPag) return 0;
    const somaOutros = pagamentos.filter(p => p.forma !== 'dinheiro').reduce((a, b) => a + Number(b.valor || 0), 0);
    const cashRec = Number((pagamentos.find(p => p.forma === 'dinheiro')?.valor) || 0);
    const requeridoDin = Math.max(0, Number(totalComanda) - somaOutros);
    return Math.max(0, cashRec - requeridoDin);
  })();
  
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
    
    const total = Number(totalComanda);
    const somaNaoDinheiroAtual = pagamentos.filter(p => p.forma !== 'dinheiro').reduce((a, b) => a + Number(b.valor || 0), 0);
    
    if (forma !== 'dinheiro') {
      const novoSomaNC = somaNaoDinheiroAtual + valor;
      if (novoSomaNC > total) {
        erroPagamento = 'Pagamentos não-dinheiro não podem exceder o total da comanda.';
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
    
    novoPagValor = Math.max(0, total - pagamentos.reduce((a, b) => a + Number(b.valor || 0), 0));
    erroPagamento = '';
  }
  
  function removerPagamento(idx) {
    pagamentos = pagamentos.filter((_, i) => i !== idx);
    novoPagValor = Math.max(0, Number(totalComanda) - pagamentos.reduce((a, b) => a + Number(b.valor || 0), 0));
  }
  
  async function confirmarVenda() {
    try {
      erroPagamento = '';
      
      // Validações de pagamento (single vs múltiplo)
      if (!multiPag) {
        if (!formaPagamento) {
          erroPagamento = 'Selecione a forma de pagamento.';
          return;
        }
        if (formaPagamento === 'dinheiro' && Number(valorRecebido) < Number(totalComanda)) {
          erroPagamento = 'Valor recebido insuficiente para cobrir o total.';
          return;
        }
        if (formaPagamento === 'fiado' && !pessoaFiadoId) {
          erroPagamento = 'Selecione a pessoa para lançar o fiado.';
          return;
        }
      } else {
        const soma = pagamentos.reduce((acc, p) => acc + Number(p?.valor || 0), 0);
        const total = Number(totalComanda);
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
          erroPagamento = 'Pagamentos não-dinheiro não podem exceder o total da comanda.';
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
      
      
      // Estado de salvando agora é controlado pelo componente pai via setSalvando()
      // NÃO setar salvandoVenda = true aqui para evitar loop infinito
      
      // Pre-abre janela de impressão
      let printWin = null;
      if (imprimirRecibo) {
        try {
          printWin = window.open('', '_blank', 'width=320,height=600');
          if (printWin) {
            printWin.document.open();
            printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo</title></head><body style="font-family:sans-serif;padding:12px;font-size:12px;">Preparando recibo...<script>
window.addEventListener('message', function(e){
  try {
    if (e && e.data && e.data.type === 'RECIBO_HTML' && typeof e.data.html === 'string') {
      document.open();
      document.write(e.data.html);
      document.close();
    }
  } catch(err){}
});
<\/script></body></html>`);
            printWin.document.close();
          }
        } catch (e) {
          addToast('Popup de impressão bloqueado. Verifique as permissões do navegador.', 'warning');
          printWin = null;
        }
      }
      
      // Cálculos para múltiplos pagamentos
      let insertForma = formaPagamento;
      let insertValorRecebido = formaPagamento === 'dinheiro' ? Number(valorRecebido) : null;
      let insertValorTroco = formaPagamento === 'dinheiro' ? Math.max(0, Number(valorRecebido) - Number(totalComanda)) : 0;
      let cashRecebidoMulti = 0;
      let trocoMulti = 0;
      
      if (multiPag) {
        insertForma = 'multiplo';
        const somaOutros = pagamentos.filter(p => p.forma !== 'dinheiro').reduce((a, b) => a + Number(b.valor || 0), 0);
        cashRecebidoMulti = Number((pagamentos.find(p => p.forma === 'dinheiro')?.valor) || 0);
        const requeridoEmDinheiro = Math.max(0, Number(totalComanda) - somaOutros);
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
      
      // Dispatch para o componente pai fazer a persistência
      dispatch('confirmar', {
        formaPagamento: insertForma,
        valorRecebido: insertValorRecebido,
        valorTroco: insertValorTroco,
        idCliente: idClienteForVenda,
        pagamentos: multiPag ? pagamentos : [],
        trocoMulti,
        cashRecebidoMulti,
        imprimirRecibo,
        printWin,
        pessoasFiado
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
        if (e.key.toLowerCase() === 'd') formaPagamento = 'dinheiro';
        if (e.key.toLowerCase() === 'x') formaPagamento = 'pix';
        if (e.key.toLowerCase() === 'b') formaPagamento = 'cartao_debito';
        if (e.key.toLowerCase() === 'c') formaPagamento = 'cartao_credito';
        if (e.key.toLowerCase() === 'f') { formaPagamento = 'fiado'; carregarPessoasFiado(); }
      } else {
        if (e.key.toLowerCase() === 'm') multiPag = !multiPag;
        if (e.key.toLowerCase() === 'a') addPagamento();
      }
    }
  }
  
  // Expor método para o pai resetar estado após venda bem sucedida
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
  }
  
  // Expor método para setar estado de salvando (usado pelo pai)
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
  }
</script>

{#if open}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    aria-label="Fechar modal de pagamento"
    on:keydown={handleKeydown}
    on:click|self={handleClose}
  >
    <div class="modal-content text-gray-900 dark:text-gray-100" role="dialog" aria-modal="true" aria-labelledby="titulo-pagamento">
      <h3 id="titulo-pagamento" class="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100 mb-4">
        Finalizar Pagamento
      </h3>
      <div class="space-y-4">
        <div class="flex justify-between items-center">
          <span class="text-gray-600 dark:text-gray-300">Total da Comanda</span>
          <span class="text-2xl font-bold dark:text-gray-100">R$ {Number(totalComanda).toFixed(2)}</span>
        </div>

        <div class="flex items-center justify-between">
          <label class="inline-flex items-center gap-2 text-sm dark:text-gray-200">
            <input type="checkbox" bind:checked={imprimirRecibo} /> Imprimir recibo ao confirmar
          </label>
          <label class="inline-flex items-center gap-2 text-sm dark:text-gray-200">
            <input type="checkbox" bind:checked={multiPag} on:change={() => { if (multiPag && novoPagValor <= 0) novoPagValor = Number(totalComanda) - somaPagamentos; }} /> Múltiplos pagamentos
          </label>
        </div>

        {#if !multiPag}
          <div>
            <fieldset>
              <legend class="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Forma de Pagamento</legend>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="btn-secondary" class:selected={formaPagamento === 'dinheiro'} on:click={() => formaPagamento='dinheiro'}>Dinheiro</button>
                <button type="button" class="btn-secondary" class:selected={formaPagamento === 'cartao_debito'} on:click={() => formaPagamento='cartao_debito'}>Cartão (Débito)</button>
                <button type="button" class="btn-secondary" class:selected={formaPagamento === 'cartao_credito'} on:click={() => formaPagamento='cartao_credito'}>Cartão (Crédito)</button>
                <button type="button" class="btn-secondary" class:selected={formaPagamento === 'pix'} on:click={() => formaPagamento='pix'}>Pix</button>
                <button type="button" class="btn-secondary" class:selected={formaPagamento === 'fiado'} on:click={async() => { formaPagamento='fiado'; await carregarPessoasFiado(); }}>Fiado</button>
              </div>
              <p class="text-xs text-slate-500 mt-1">Atalhos: D=Dinheiro, X=Pix, B=Débito, C=Crédito, F=Fiado | Ctrl+Enter=Confirmar | Esc=Cancelar</p>
            </fieldset>
          </div>

          {#if formaPagamento === 'dinheiro'}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div>
                <label for="valor-recebido" class="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Valor Recebido (R$)</label>
                <input id="valor-recebido" type="number" min="0" step="0.01" bind:value={valorRecebido} class="input-form" />
              </div>
              <div>
                <div class="text-sm text-gray-600 dark:text-gray-300 mb-1">Troco</div>
                <div class="text-xl font-semibold dark:text-gray-100">R$ {Number(troco).toFixed(2)}</div>
              </div>
            </div>
          {/if}

          {#if formaPagamento === 'fiado'}
            <div class="grid grid-cols-1 gap-3">
              <div>
                <label for="select-pessoa-fiado" class="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Pessoa (Fiado)</label>
                <select id="select-pessoa-fiado" class="input-form" bind:value={pessoaFiadoId}>
                  <option value="">-- selecione --</option>
                  {#each pessoasFiado as p}
                    <option value={p.id}>{p.nome}</option>
                  {/each}
                </select>
                <p class="text-xs text-gray-500 mt-1">O valor será lançado no saldo de fiado desta pessoa.</p>
              </div>
            </div>
          {/if}
        {:else}
          <!-- UI de múltiplos pagamentos -->
          <div class="space-y-3">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <label for="mp-forma" class="block text-sm font-medium mb-1">Forma</label>
                <select id="mp-forma" class="input-form" bind:value={novoPagForma}>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="pix">Pix</option>
                  <option value="cartao_debito">Cartão (Débito)</option>
                  <option value="cartao_credito">Cartão (Crédito)</option>
                  <option value="fiado">Fiado</option>
                </select>
              </div>
              <div>
                <label for="mp-valor" class="block text-sm font-medium mb-1">{novoPagForma === 'dinheiro' ? 'Valor Recebido (R$)' : 'Valor (R$)'}</label>
                <input id="mp-valor" type="number" min="0.01" step="0.01" class="input-form" bind:value={novoPagValor} />
                {#if novoPagForma === 'dinheiro'}
                  <div class="flex flex-wrap items-center gap-2 mt-2 text-sm">
                    <span class="text-gray-600">Sugestões:</span>
                    <button type="button" class="px-2 py-1 rounded border" on:click={() => novoPagValor = Math.max(0.01, Number(restantePagamento))}>Restante</button>
                    <button type="button" class="px-2 py-1 rounded border" on:click={() => novoPagValor = Number(novoPagValor || 0) + 5}>+5,00</button>
                    <button type="button" class="px-2 py-1 rounded border" on:click={() => novoPagValor = Number(novoPagValor || 0) + 10}>+10,00</button>
                  </div>
                {/if}
              </div>
              {#if novoPagForma === 'fiado'}
                <div>
                  <label for="mp-pessoa" class="block text-sm font-medium mb-1">Pessoa (Fiado)</label>
                  <select id="mp-pessoa" class="input-form" bind:value={novoPagPessoaId} on:focus={carregarPessoasFiado}>
                    <option value="">-- selecione --</option>
                    {#each pessoasFiado as p}
                      <option value={p.id}>{p.nome}</option>
                    {/each}
                  </select>
                </div>
              {/if}
            </div>
            <div class="flex justify-end">
              <button type="button" class="btn-secondary" on:click={addPagamento}>Adicionar pagamento</button>
            </div>

            {#if pagamentos.length}
              <div class="border rounded-md divide-y">
                {#each pagamentos as p, i}
                  <div class="flex items-center justify-between p-2">
                    <div class="text-sm">
                      <div class="font-medium capitalize">{p.forma.replace('_',' ')}</div>
                      <div class="text-gray-600">R$ {Number(p.valor).toFixed(2)}{p.forma === 'dinheiro' && trocoPrevMulti > 0 ? ` (troco prev.: R$ ${Number(trocoPrevMulti).toFixed(2)})` : ''}</div>
                      {#if p.forma === 'fiado'}
                        <div class="text-xs text-gray-500">Pessoa: {pessoasFiado.find(x => x.id === p.pessoaId)?.nome || p.pessoaId}</div>
                      {/if}
                    </div>
                    <button type="button" class="text-red-600 hover:underline" on:click={() => removerPagamento(i)}>remover</button>
                  </div>
                {/each}
              </div>
            {/if}

            <div class="grid grid-cols-2 gap-3">
              <div class="text-sm text-gray-700 dark:text-gray-300">Soma dos pagamentos</div>
              <div class="text-right font-semibold">R$ {Number(somaPagamentos).toFixed(2)}</div>
              <div class="text-sm text-gray-700 dark:text-gray-300">Restante</div>
              <div class="text-right font-semibold">R$ {Number(restantePagamento).toFixed(2)}</div>
              <div class="text-sm text-gray-700 dark:text-gray-300">Troco (previsto)</div>
              <div class="text-right font-semibold">R$ {Number(trocoPrevMulti).toFixed(2)}</div>
            </div>
          </div>
        {/if}

        {#if erroPagamento}
          <div class="text-sm text-red-600">{erroPagamento}</div>
        {/if}

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" on:click={handleClose}>Cancelar</button>
          <button type="button" class="btn-primary" disabled={salvandoVenda} on:click={confirmarVenda}>
            {salvandoVenda ? 'Salvando...' : (imprimirRecibo ? 'Confirmar e imprimir' : 'Confirmar venda')}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

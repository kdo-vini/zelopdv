<!-- 
  Arquivo: src/routes/app/+page.svelte
  Stack: SvelteKit + Tailwind CSS + Supabase
  Descrição: Frente de Caixa (PDV) movida para /app para que a landing fique em /
-->

<script context="module">
  // Força renderização somente no cliente para evitar 500 na primeira navegação pós-login
  export const ssr = false;
</script>

<script>
  // A S V E L T E K I T
  // Ajuste: Removido o ".js" da importação para deixar o bundler resolver.
  import { supabase } from '$lib/supabaseClient';
  import { onMount, onDestroy } from 'svelte';
  import { waitAuthReady } from '$lib/authStore';
  import { buildReceiptHTML } from '$lib/receipt';
  import { ensureActiveSubscription } from '$lib/guards';
  import { withTimeout } from '$lib/utils';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import { pdvCache } from '$lib/stores/pdvCache';
  
  // Modais componentizados
  import ModalAbrirCaixa from '$lib/components/modals/ModalAbrirCaixa.svelte';
  import ModalQuantidade from '$lib/components/modals/ModalQuantidade.svelte';
  import ModalValorAvulso from '$lib/components/modals/ModalValorAvulso.svelte';
  import ModalMovCaixa from '$lib/components/modals/ModalMovCaixa.svelte';
  import ModalPagamento from '$lib/components/modals/ModalPagamento.svelte';
  
  // Grid virtualizado para performance
  import VirtualProductGrid from '$lib/components/VirtualProductGrid.svelte';

  // Modo Offline (IndexedDB)
  import { atualizarCacheProdutos, salvarVendaOffline, syncVendasPendentes } from '$lib/offlineDb';

  export let params;

  // --- 1. ESTADO DO PDV ---
  let produtos = [];
  let categorias = [];
  let categoriaAtiva = null; // ID da categoria selecionada
  let subcategorias = [];
  let subcategoriaAtiva = null; // ID da subcategoria selecionada (ou null para todas)
  let busca = '';
  let loading = true;
  let errorMessage = '';
  let gridEl;
  let buscaInputEl;

  // Atalho: '/' foca a busca quando o modal de pagamento não está aberto e o usuário não está digitando em um campo
  function onKeyGlobal(e) {
    try {
      const tag = (e.target?.tagName || '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
      if (!modalPagamentoAberto && !isTyping && e.key === '/') {
        e.preventDefault();
        if (buscaInputEl && typeof buscaInputEl.focus === 'function') buscaInputEl.focus();
      }
    } catch {}
  }

  // O "Carrinho de Compras"
  // Cada item terá: { id, nome, preco, quantidade }
  let comanda = [];

  // --- 2. ESTADO DOS MODAIS (Fluxos Especiais) ---
  
  // Fluxo de quantidade por modal (para itens marcados como "Por unidade")
  let modalQuantidadeAberto = false;
  let produtoQuantidadeSelecionado = null; // produto atual para inserir quantidade
  let quantidadeInput = 1;

  // Módulo 1.3 - Fluxo B (Item Avulso/Valor Personalizado)
  let modalValorAberto = false;
  let valorInput = 0.00;
  let nomeInput = 'Item Avulso';

  // Módulo 1.4 - Pagamento (Ainda não implementado, só a chamada)
  let modalPagamentoAberto = false;
  let formaPagamento = null; // 'dinheiro' | 'cartao_debito' | 'cartao_credito' | 'pix' | 'fiado'
  let valorRecebido = 0;
  let salvandoVenda = false;
  let erroPagamento = '';
  // Opção: imprimir recibo ao confirmar
  let imprimirRecibo = false;
  // Múltiplos pagamentos (split)
  let multiPag = false;
  let pagamentos = []; // { forma: 'dinheiro'|'pix'|'cartao_debito'|'cartao_credito'|'fiado'|'outro', valor: number, pessoaId?: string }
  let novoPagForma = 'dinheiro';
  let novoPagValor = 0;
  let novoPagPessoaId = '';
  // Fiado
  let pessoasFiado = [];
  let pessoaFiadoId = '';
  async function carregarPessoasFiado(){
    if (pessoasFiado.length) return;
    try {
      const { data, error } = await supabase.from('pessoas').select('id, nome').order('nome');
      if (!error) pessoasFiado = data || [];
    } catch {}
  }

  // Módulo 1.5 - Movimentação de Caixa (Entrada/Saída)
  let modalMovCaixaAberto = false;
  let tipoMovCaixa = 'saida'; // 'entrada' | 'saida'  (saida = sangria, entrada = suprimento)
  let valorMovCaixa = 0.00;
  let motivoMovCaixa = '';
  let imprimirReciboMovFlag = true; // default imprime
  let salvandoMovCaixa = false;
  let erroMovCaixa = '';

  // Módulo 1.1 - Controle de Caixa (Simplificado por enquanto)
  let caixaAberto = true; // será verificado no banco
  let modalAbrirCaixaAberto = false;
  let trocoInicialInput = 0.00;
  let idCaixaAberto = null;
  let saldoCaixa = 0; // saldo atual em dinheiro no caixa
  let carregandoSaldo = false;
  
  // Referência ao componente ModalPagamento
  let modalPagamentoRef;

  // Derivados e helpers de múltiplos pagamentos
  $: somaPagamentos = pagamentos.reduce((acc, p) => acc + Number(p?.valor || 0), 0);
  $: restantePagamento = Math.max(0, Number(totalComanda) - Number(somaPagamentos || 0));
  $: trocoPrevMulti = (() => {
    if (!multiPag) return 0;
    const somaOutros = pagamentos.filter(p => p.forma !== 'dinheiro').reduce((a, b) => a + Number(b.valor || 0), 0);
    const cashRec = Number((pagamentos.find(p => p.forma === 'dinheiro')?.valor) || 0);
    const requeridoDin = Math.max(0, Number(totalComanda) - somaOutros);
    return Math.max(0, cashRec - requeridoDin);
  })();

  function addPagamento() {
    const forma = novoPagForma;
    const valor = Number(novoPagValor || 0);
    if (!forma || valor <= 0) return;
    const total = Number(totalComanda);
    const somaNaoDinheiroAtual = pagamentos.filter(p => p.forma !== 'dinheiro').reduce((a,b)=>a+Number(b.valor||0),0);
    if (forma !== 'dinheiro') {
      const novoSomaNC = somaNaoDinheiroAtual + valor;
      if (novoSomaNC > total) {
        erroPagamento = 'Pagamentos não-dinheiro não podem exceder o total da comanda.';
        return;
      }
    }
    if (forma === 'fiado') {
      // permite apenas 1 linha de fiado
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
    // Sugere próximo valor = restante
    novoPagValor = Math.max(0, total - pagamentos.reduce((a,b)=>a+Number(b.valor||0),0));
    erroPagamento = '';
  }

  function removerPagamento(idx) {
    pagamentos = pagamentos.filter((_, i) => i !== idx);
    // Ajusta sugestão do próximo valor
    novoPagValor = Math.max(0, Number(totalComanda) - pagamentos.reduce((a,b)=>a+Number(b.valor||0),0));
  }

  // --- 3. CARREGAMENTO DE DADOS ---

  // Efeito: quando o app monta, verifica sessão, caixa e carrega dados do PDV
  onMount(async () => {
    window.addEventListener('keydown', onKeyGlobal);
    window.addEventListener('online', handleSyncOnline);
    await waitAuthReady();
    // Bloqueio: exige assinatura ativa antes de carregar o PDV
    const ok = await ensureActiveSubscription({ requireProfile: true });
    if (!ok) return;
    // Verifica login e carrega dados do PDV
    if (!supabase) {
      errorMessage = 'Configuração do Supabase ausente. Defina as variáveis no .env e reinicie.';
      return;
    }
    const getSessionWithTimeout = (ms = 4000) =>
      Promise.race([
        supabase.auth.getSession(),
        new Promise((resolve) => setTimeout(() => resolve({ data: { session: null }, error: null }), ms))
      ]);
    const { data } = await getSessionWithTimeout(4000);
    if (data?.session?.user) {
      await withTimeout(verificarCaixaAberto(data.session.user.id));
      await withTimeout(carregarCategorias());
      await withTimeout(carregarProdutos());
      await withTimeout(carregarSubcategorias());
      await withTimeout(atualizarSaldoCaixa());
      loading = false;
    } else {
      window.location.href = '/login';
      return;
    }

    // Auth state changes são tratados pelo authStore.js e +layout.svelte centralmente
    // Removido listener duplicado que causava queries redundantes (otimização de performance)
  });

  onDestroy(() => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onKeyGlobal);
        window.removeEventListener('online', handleSyncOnline);
      }
    });

  /** Sincroniza vendas pendentes quando volta a internet */
  async function handleSyncOnline() {
    addToast('Conexão restabelecida. Sincronizando vendas...', 'info');
    const logs = await syncVendasPendentes(supabase);
    if (logs.success > 0) {
      addToast(`${logs.success} venda(s) sincronizada(s) com sucesso.`, 'success');
      await atualizarSaldoCaixa();
    }
  }

  /**
   * Verifica no banco se há um caixa aberto (sem data_fechamento) para o usuário.
   * Seta flags locais para permitir/impedir finalizar vendas.
   */
  async function verificarCaixaAberto(userId) {
    // Verifica no Supabase se o usuário tem um caixa aberto (sem data_fechamento)
    const { data, error } = await supabase
      .from('caixas')
      .select('id, data_abertura, data_fechamento')
      .eq('id_usuario', userId)
      .is('data_fechamento', null)
      .order('data_abertura', { ascending: false })
      .limit(1);

    if (error) {
      addToast('Erro ao verificar caixa: ' + error.message, 'error');
      caixaAberto = false;
      modalAbrirCaixaAberto = true;
      idCaixaAberto = null;
      return;
    }

    if (data && data.length > 0) {
      caixaAberto = true;
      modalAbrirCaixaAberto = false;
      idCaixaAberto = data[0].id;
    } else {
      caixaAberto = false;
      modalAbrirCaixaAberto = true;
      idCaixaAberto = null;
    }
  }

  /** Atualiza o saldo de caixa (dinheiro) do caixa aberto. */
  async function atualizarSaldoCaixa() {
    try {
      if (!caixaAberto || !idCaixaAberto) { saldoCaixa = 0; return; }
      carregandoSaldo = true;
      const pCaixa = supabase.from('caixas').select('valor_inicial').eq('id', idCaixaAberto).single();
      const pVendasDoCaixa = supabase
        .from('vendas')
        .select('id, forma_pagamento, valor_total, valor_recebido, valor_troco')
        .eq('id_caixa', idCaixaAberto);
      const pMovs = supabase
        .from('caixa_movimentacoes')
        .select('valor, tipo')
        .eq('id_caixa', idCaixaAberto);

      const [{ data: cx, error: e1 }, { data: vendasAll, error: e2 }, { data: movs, error: e3 }] = await Promise.all([pCaixa, pVendasDoCaixa, pMovs]);
      if (e1) throw e1; if (e2) throw e2; if (e3) throw e3;

      const valorInicial = Number(cx?.valor_inicial || 0);
      // Dinheiro de vendas simples: valor_recebido - troco (não usar valor_total - troco, pois subconta quando há troco)
      const dinheiroLegacy = Array.isArray(vendasAll)
        ? vendasAll.filter(v => v?.forma_pagamento === 'dinheiro').reduce((acc, v) => {
            const recebido = Number(v?.valor_recebido || v?.valor_total || 0);
            const troco = Number(v?.valor_troco || 0);
            const liquido = Math.max(0, recebido - troco);
            return acc + liquido;
          }, 0)
        : 0;
      let dinheiroMultiplo = 0;
      const ids = Array.isArray(vendasAll) ? vendasAll.map(v => v.id) : [];
      if (ids.length) {
        const { data: pags, error: e4 } = await supabase
          .from('vendas_pagamentos')
          .select('id_venda, forma_pagamento, valor')
          .in('id_venda', ids);
        if (!e4 && Array.isArray(pags)) {
          dinheiroMultiplo = pags.filter(p => p?.forma_pagamento === 'dinheiro').reduce((acc, p) => acc + Number(p?.valor || 0), 0);
        }
      }

      let totalSangria = 0, totalSuprimento = 0;
      if (Array.isArray(movs)) {
        for (const m of movs) {
          const val = Number(m?.valor || 0);
          if (m?.tipo === 'sangria') totalSangria += val;
          else if (m?.tipo === 'suprimento') totalSuprimento += val;
        }
      }
      saldoCaixa = valorInicial + dinheiroLegacy + dinheiroMultiplo - totalSangria + totalSuprimento;
    } catch (err) {
      console.warn('Falha ao atualizar saldo do caixa:', err?.message || err); // Keep log for debug, maybe toast if critical? Let's keep log for background update.
    } finally {
      carregandoSaldo = false;
    }
  }

  /** Carrega categorias ordenadas e define a primeira como ativa. Usa cache de 5 min. */
  async function carregarCategorias(forceRefresh = false) {
    try {
      const data = await pdvCache.getCategorias(forceRefresh);
      categorias = data || [];
      // Seleciona a primeira categoria automaticamente se nenhuma estiver ativa
      if (categorias.length > 0 && !categoriaAtiva) {
        categoriaAtiva = categorias[0].id;
      }
    } catch (err) {
      errorMessage = err?.message || 'Erro ao carregar categorias';
    }
  }

  /** Carrega subcategorias ordenadas. Usa cache de 5 min. */
  async function carregarSubcategorias(forceRefresh = false) {
    try {
      const data = await pdvCache.getSubcategorias(forceRefresh);
      subcategorias = data || [];
    } catch (err) {
      addToast('Erro ao carregar subcategorias: ' + (err?.message || err), 'error');
    }
  }

  /** Carrega produtos visíveis no PDV, ordenados por nome. Usa cache de 5 min. */
  async function carregarProdutos(forceRefresh = false) {
    try {
      const data = await pdvCache.getProdutos(forceRefresh);
      produtos = data || [];
      // Atualiza cache offline
      if (produtos.length) {
        atualizarCacheProdutos(produtos).catch(e => console.warn('Falha ao cachear produtos offline:', e));
      }
    } catch (err) {
      errorMessage = err?.message || 'Erro ao carregar produtos';
    }
  }
  
  // --- 4. LÓGICA DA COMANDA (Módulo 1.2) ---

  // Reset de subcategoria ao trocar de categoria
  $: if (categoriaAtiva != null) { subcategoriaAtiva = subcategoriaAtiva && subcategorias.some(s => s.id === subcategoriaAtiva && s.id_categoria === categoriaAtiva) ? subcategoriaAtiva : null; }

  // Filtros
  $: buscaLower = (busca || '').trim().toLowerCase();
  $: subcatsDaCat = subcategorias.filter((s) => s.id_categoria === categoriaAtiva);

  // Filtra os produtos por categoria, subcategoria (opcional) e busca por nome
  $: produtosFiltrados = produtos.filter((p) => {
    if (p.id_categoria !== categoriaAtiva) return false;
    if (subcategoriaAtiva && p.id_subcategoria !== subcategoriaAtiva) return false;
    if (buscaLower && !String(p.nome || '').toLowerCase().includes(buscaLower)) return false;
    return true;
  });

  // Navegação por teclado no grid de produtos
  function gridMoveFocus(delta, byRow = false) {
    if (!gridEl) return;
    const btns = Array.from(gridEl.querySelectorAll('button[data-prod]'));
    if (!btns.length) return;
    const active = document.activeElement;
    let idx = btns.findIndex(b => b === active);
    if (idx < 0) idx = 0;
    let step = delta;
    if (byRow) {
      try {
        const cs = getComputedStyle(gridEl);
        const cols = (cs.gridTemplateColumns || '').split(' ').filter(Boolean).length || 1;
        step = cols * (delta > 0 ? 1 : -1);
      } catch { step = delta; }
    }
    let next = idx + step;
    if (next < 0) next = 0;
    if (next >= btns.length) next = btns.length - 1;
    btns[next].focus();
  }

  // Calcula o total da comanda
  $: totalComanda = comanda.reduce(
    (acc, item) => acc + item.preco * item.quantidade,
    0
  );

  /**
   * Adiciona um produto na comanda.
   * Esta função decide qual fluxo seguir (Normal, Quantidade ou Valor).
   */
  /** Decide qual fluxo usar ao clicar num produto (quantidade para por-unidade, valor avulso, ou normal). */
  function adicionarProduto(produto) {
    if (!caixaAberto) {
      modalAbrirCaixaAberto = true;
      return;
    }

    // Se é marcado como "Por unidade", abre modal para informar a quantidade
    if (produto?.eh_item_por_unidade) {
      produtoQuantidadeSelecionado = produto;
      quantidadeInput = 1;
      modalQuantidadeAberto = true;
      return;
    }

    // Caso padrão: adiciona 1 unidade diretamente (com checagem de estoque)
    if (produto?.id && produto?.controlar_estoque) {
      const existente = comanda.find((i) => i.id_produto === produto.id);
      const qtdAtual = existente?.quantidade || 0;
      const disponivel = Number(produto.estoque_atual || 0);
      if (qtdAtual + 1 > disponivel) {
        addToast(`Estoque insuficiente para "${produto.nome}". Restam ${disponivel} unidade(s).`, 'error');
        return;
      }
    }
    adicionarItemNaComanda(produto, 1, produto.preco);
  }

  /**
   * Ação final dos modais ou do clique normal.
   * Adiciona ou incrementa o item na comanda.
   */
  /**
   * Adiciona (ou incrementa) um item na comanda.
   * Aceita itens de banco (com id) ou avulsos (sem id).
   */
  function adicionarItemNaComanda(item, qtd, preco) {
    // 'item' pode ser um produto do DB ou um item avulso
    
    // Se o item NÃO TEM ID (é avulso), damos um ID temporário (timestamp)
    const idUnico = item.id ?? Date.now();

    const itemExistente = comanda.find((i) => i.id === idUnico);

    if (itemExistente) {
      // Se existe, incrementa a quantidade
      itemExistente.quantidade += qtd;
      // Atualiza o array para forçar reatividade do Svelte
      comanda = [...comanda]; 
    } else {
      // Se é novo, adiciona nova linha
      comanda = [
        ...comanda,
        {
          id: idUnico,
          id_produto: item.id || null, // ID real do produto no DB
          nome: item.nome,
          preco: preco,
          quantidade: qtd,
        },
      ];
    }
    
    // Fecha modais de adição (se algum estiver aberto)
    modalValorAberto = false;
  }

  // Funções dos botões + e - da comanda
  /** Incrementa a quantidade de um item da comanda. */
  function incrementarItem(id) {
    const item = comanda.find((i) => i.id === id);
    if (item) {
      // Regra de estoque no + da comanda
      if (item.id_produto) {
        const prod = produtos.find((p) => p.id === item.id_produto);
        if (prod?.controlar_estoque) {
          const disponivel = Number(prod.estoque_atual || 0);
          if ((item.quantidade + 1) > disponivel) {
            addToast(`Estoque insuficiente para "${item.nome}". Restam ${disponivel} unidade(s).`, 'error');
            return;
          }
        }
      }
      item.quantidade++;
      comanda = [...comanda];
    }
  }

  /** Decrementa a quantidade; remove o item se chegar a zero. */
  function decrementarItem(id) {
    const item = comanda.find((i) => i.id === id);
    if (item) {
      item.quantidade--;
      if (item.quantidade <= 0) {
        // Remove se chegar a zero
        comanda = comanda.filter((i) => i.id !== id);
      } else {
        comanda = [...comanda];
      }
    }
  }
  
  /** Limpa toda a comanda mediante confirmação. */
  async function limparComanda() {
    if (await confirmAction('Limpar Comanda', 'Tem certeza que deseja remover todos os itens?')) {
      comanda = [];
    }
  }

  // --- Movimentação de Caixa (Entrada/Saída) ---
  function abrirModalMovCaixa() {
    if (!caixaAberto) {
      modalAbrirCaixaAberto = true;
      return;
    }
    tipoMovCaixa = 'saida';
    valorMovCaixa = 0.00;
    motivoMovCaixa = '';
    erroMovCaixa = '';
    salvandoMovCaixa = false;
    modalMovCaixaAberto = true;
  }

  async function confirmarMovCaixa() {
    try {
      erroMovCaixa = '';
      if (!caixaAberto || !idCaixaAberto) {
        erroMovCaixa = 'É necessário um caixa aberto.';
        return;
      }
      const v = Number(valorMovCaixa);
      if (!Number.isFinite(v) || v <= 0) {
        erroMovCaixa = 'Informe um valor válido (maior que 0).';
        return;
      }
      // Atualiza o saldo e impede SAÍDA maior que o disponível
      await atualizarSaldoCaixa();
      if (tipoMovCaixa === 'saida' && v > Number(saldoCaixa || 0)) {
        erroMovCaixa = `Valor maior que o saldo em caixa (R$ ${Number(saldoCaixa).toFixed(2)}).`;
        return;
      }
      salvandoMovCaixa = true;
      const { data: userData } = await supabase.auth.getUser();
      const id_usuario = userData?.user?.id ?? null;
      if (!id_usuario) {
        throw new Error('Sessão inválida. Faça login novamente.');
      }
      // Persiste a movimentação de caixa
      const { data, error } = await supabase
        .from('caixa_movimentacoes')
        .insert({
          id_caixa: idCaixaAberto,
          id_usuario,
          tipo: tipoMovCaixa === 'saida' ? 'sangria' : 'suprimento',
          valor: v,
          motivo: motivoMovCaixa || null
        })
        .select('id, created_at')
        .single();
      if (error) throw new Error(error.message);

      // Sucesso: recibo opcional
      const movInfo = {
        idMov: data?.id,
        idCaixa: idCaixaAberto,
        tipo: tipoMovCaixa, // 'entrada' | 'saida'
        valor: v,
        motivo: motivoMovCaixa || null,
        created_at: data?.created_at
      };
      modalMovCaixaAberto = false;

  if (imprimirReciboMovFlag) {
        try {
          await imprimirReciboMovCaixa(movInfo);
        } catch (e) {
          console.warn('Falha ao imprimir recibo de movimentação:', e?.message || e);
        }
      }
      addToast('Movimentação registrada com sucesso.', 'success');
      await atualizarSaldoCaixa();
    } catch (e) {
      erroMovCaixa = e?.message || 'Falha ao registrar a movimentação.';
    } finally {
      salvandoMovCaixa = false;
    }
  }
  
  // --- 5. AÇÕES DOS MODAIS ---

  // Módulo 1.1 (Simplificado)
  /** Abre um caixa com o troco inicial para o usuário autenticado. */
  async function handleAbrirCaixa() {
    if (trocoInicialInput < 0) return;
    const { data: userData } = await supabase.auth.getUser();
    const id_usuario = userData?.user?.id ?? null;
    if (!id_usuario) {
      addToast('Sessão inválida. Faça login novamente.', 'error');
      return;
    }
    const { data, error } = await supabase
      .from('caixas')
      .insert({
        data_abertura: new Date().toISOString(),
        valor_inicial: Number(trocoInicialInput),
        id_usuario
      })
      .select('id')
      .single();
    if (error) {
      addToast('Erro ao abrir caixa: ' + error.message, 'error');
      return;
    }
    idCaixaAberto = data.id;
    caixaAberto = true;
    modalAbrirCaixaAberto = false;
    await atualizarSaldoCaixa();
  }

  // Removido: Fluxo de quantidade por modal (click adiciona diretamente)

  // Módulo 1.3 - Fluxo B (Valor Avulso)
  /** Fluxo B: adiciona item avulso com nome/valor definidos no modal. */
  function handleAdicionarPorValor() {
    if (valorInput <= 0) return;
    
    adicionarItemNaComanda(
      {
        id: null, // Sem ID de produto
        nome: nomeInput || 'Item Avulso'
      },
      1,
      valorInput
    );
    
    // Reseta o formulário do modal
    valorInput = 0;
    nomeInput = 'Item Avulso';
  }

  // Fluxo: Adicionar por quantidade (itens por unidade)
  function handleAdicionarPorQuantidade() {
    const prod = produtoQuantidadeSelecionado;
    if (!prod) return;
    const qtd = Number(quantidadeInput);
    const qtdInt = Math.floor(qtd);
    if (!Number.isFinite(qtd) || qtdInt <= 0) return;

    // Checagem de estoque levando em conta quantidade já na comanda
    if (prod.id && prod.controlar_estoque) {
      const existente = comanda.find((i) => i.id_produto === prod.id);
      const qtdAtual = existente?.quantidade || 0;
      const disponivel = Number(prod.estoque_atual || 0);
      if (qtdInt + qtdAtual > disponivel) {
        addToast(`Estoque insuficiente para "${prod.nome}". Restam ${disponivel} unidade(s).`, 'error');
        return;
      }
    }

    adicionarItemNaComanda(prod, qtdInt, prod.preco);
    // Reset/fechar modal
    modalQuantidadeAberto = false;
    produtoQuantidadeSelecionado = null;
    quantidadeInput = 1;
  }
  
  // Módulo 1.4 - Início da Fase 4
  /** Abre o modal de pagamento após validar que há itens. */
  function handleFinalizarVenda() {
    if (comanda.length === 0) {
      addToast('A comanda está vazia.', 'warning');
      return;
    }
    
    // Abre o modal de pagamento
    // O modal de pagamento cuidará da Fase 4 e 5
    modalPagamentoAberto = true;
    formaPagamento = null;
    valorRecebido = 0;
    multiPag = false;
    pagamentos = [];
    novoPagForma = 'dinheiro';
    novoPagValor = Number(totalComanda);
    novoPagPessoaId = '';
    erroPagamento = '';
    salvandoVenda = false; // garante reset visual ao tentar novamente
  }

  /**
   * Handler para o evento 'confirmar' do ModalPagamento.
   * Recebe os dados do modal e executa a persistência da venda.
   */
  async function handleVendaConfirmada(event) {
    const { 
      formaPagamento: forma, 
      valorRecebido: valRec, 
      valorTroco,
      idCliente, 
      pagamentos: pags, 
      trocoMulti: tMulti, 
      cashRecebidoMulti,
      imprimirRecibo: printRecibo,
      printWin,
      pessoasFiado: pessoasList
    } = event.detail;
    
    // Atualiza estados locais que serão usados pela função confirmarVenda
    formaPagamento = forma === 'multiplo' ? forma : forma;
    valorRecebido = valRec || 0;
    imprimirRecibo = printRecibo;
    multiPag = forma === 'multiplo';
    if (pags?.length) pagamentos = pags;
    if (pessoasList?.length) pessoasFiado = pessoasList;
    if (idCliente) pessoaFiadoId = idCliente;
    
    // Chama a função de persistência existente
    await confirmarVenda();
  }

  // Módulos 1.4 e 1.5 - Confirmar e persistir a venda
  $: troco = formaPagamento === 'dinheiro' ? Math.max(0, Number(valorRecebido) - Number(totalComanda)) : 0;

  /**
   * Persiste a venda e itens; faz baixa de estoque simples (MVP).
   * Em produção, prefira uma RPC transacional para atomicidade.
   */
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
        // múltiplos pagamentos
        const soma = pagamentos.reduce((acc, p) => acc + Number(p?.valor || 0), 0);
        const total = Number(totalComanda);
        const somaNaoDinheiro = pagamentos.filter(p => p.forma !== 'dinheiro').reduce((a,b)=>a+Number(b.valor||0),0);
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
        // Regras: no máximo 1 linha de fiado, e obrigar pessoa
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

      salvandoVenda = true;

      // Se for imprimir, abra a janela imediatamente para não ser bloqueada por popup blockers
      let printWin = null;
      if (imprimirRecibo) {
        try {
          printWin = window.open('', '_blank', 'width=320,height=600');
          if (printWin) {
            printWin.document.open();
            printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Recibo</title></head><body style="font-family:sans-serif;padding:12px;font-size:12px;">Preparando recibo...<script>
window.addEventListener('message', function(e){
  try {
    if (e && e.data && e.data.type === 'RECIBO_HTML' && typeof e.data.html === 'string') {
      document.open();
      document.write(e.data.html);
      document.close();
    }
  } catch(err){ console.warn('[ReciboPlaceholder] replace via postMessage falhou:', (err && err.message) || err); }
});
<\/script></body></html>`);
            printWin.document.close();
          }
        } catch (e) {
          addToast('Popup de impressão bloqueado. Verifique as permissões do navegador.', 'warning');
          printWin = null;
        }
      }

      // Usuário autenticado
      const { data: userData } = await supabase.auth.getUser();
      const id_usuario = userData?.user?.id ?? null;

      // Validação de estoque (refresco em tempo real antes de inserir a venda)
      try {
        const idsProdutos = [...new Set(comanda.filter(i => i.id_produto).map(i => i.id_produto))];
        if (idsProdutos.length) {
          const { data: prodsInfo, error: prodErr } = await supabase
            .from('produtos')
            .select('id, nome, controlar_estoque, estoque_atual')
            .in('id', idsProdutos);
          if (!prodErr && prodsInfo) {
            const mapInfo = new Map(prodsInfo.map(p => [p.id, p]));
            // mesma lógica de extrair quantidade efetiva (para nomes como "56x Produto")
            const extrairQuantidadeEfetiva = (item) => {
              if (item?.id_produto && typeof item?.nome === 'string') {
                const m = item.nome.match(/^(\d+)x\s/i);
                if (m) return parseInt(m[1], 10);
              }
              return item.quantidade || 1;
            };
            // Soma quantidade requerida por produto
            const requeridos = new Map();
            for (const it of comanda) {
              if (!it.id_produto) continue;
              const qtdEf = extrairQuantidadeEfetiva(it);
              requeridos.set(it.id_produto, (requeridos.get(it.id_produto) || 0) + Number(qtdEf));
            }
            // Checa insuficiências
            const insuficientes = [];
            for (const [idProd, qtdNec] of requeridos.entries()) {
              const info = mapInfo.get(idProd);
              if (info?.controlar_estoque) {
                const disp = Number(info.estoque_atual || 0);
                if (qtdNec > disp) {
                  insuficientes.push(`${info.nome} (disp: ${disp}, ped: ${qtdNec})`);
                }
              }
            }
            if (insuficientes.length) {
              erroPagamento = `Estoque insuficiente para: ${insuficientes.join(', ')}`;
              salvandoVenda = false;
              return;
            }
          }
        }
      } catch (chkErr) {
        console.warn('Falha ao validar estoque pré-venda (prossegue):', chkErr?.message || chkErr);
      }

      // Inserir a venda
      // Determina payload de pagamento para a venda (single ou múltiplo)
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

      // Determina cliente vinculado caso seja Fiado (Single ou Multi)
      let idClienteForVenda = null;
      if (!multiPag && formaPagamento === 'fiado') {
        idClienteForVenda = pessoaFiadoId || null;
      } else if (multiPag) {
         const pFiado = pagamentos.find(p => p.forma === 'fiado');
         if (pFiado) idClienteForVenda = pFiado.pessoaId || null;
      }

      const dadosVenda = {
        valor_total: Number(totalComanda),
        forma_pagamento: insertForma,
        valor_recebido: insertValorRecebido,
        valor_troco: insertValorTroco,
        id_usuario,
        id_caixa: idCaixaAberto,
        id_cliente: idClienteForVenda
      };

      // Tenta inserir no Supabase, senão salva localmente
      let vendaId = null;
      let isOffline = false;

      try {
        const { data: venda, error: vendaError } = await supabase
          .from('vendas')
          .insert(dadosVenda)
          .select('id')
          .single();

        if (vendaError) throw vendaError;
        vendaId = venda.id;
      } catch (connErr) {
        console.warn('Falha na conexão, salvando venda offline:', connErr);
        isOffline = true;
        // Salva localmente com os itens e pagamentos
        const itemObj = comanda.map(i => ({
          id_usuario,
          id_produto: i.id_produto ?? null,
          quantidade: i.quantidade,
          nome_produto_na_venda: i.nome,
          preco_unitario_na_venda: Number(i.preco)
        }));
        
        await salvarVendaOffline({
          ...dadosVenda,
          itens: itemObj,
          pagamentos: multiPag ? pagamentos : []
        });
        vendaId = `offline-${Date.now()}`;
      }

      // Se estiver online, continua com itens e estoque
      if (!isOffline) {
        // Função auxiliar: extrai quantidade efetiva quando o nome vier como "56x Produto"
        const extrairQuantidadeEfetiva = (item) => {
          if (item?.id_produto && typeof item?.nome === 'string') {
            const m = item.nome.match(/^(\d+)x\s/i);
            if (m) return parseInt(m[1], 10);
          }
          return item.quantidade || 1;
        };

        const itens = comanda.map((i) => {
          const qtdEfetiva = extrairQuantidadeEfetiva(i);
          const precoUnit = Number(i.preco);
          return {
            id_usuario,
            id_venda: vendaId,
            id_produto: i.id_produto ?? null,
            quantidade: qtdEfetiva,
            nome_produto_na_venda: i.nome,
            preco_unitario_na_venda: Number(precoUnit)
          };
        });

        const { error: itensError } = await supabase.from('vendas_itens').insert(itens);
        if (itensError) {
          await supabase.from('vendas').delete().eq('id', vendaId);
          throw new Error(itensError.message);
        }

        // Lançar débito no fiado
        if (!multiPag && formaPagamento === 'fiado' && pessoaFiadoId) {
          supabase.rpc('fiado_lancar_debito', { p_id_pessoa: pessoaFiadoId, p_valor: Number(totalComanda) }).catch(() => {});
        } else if (multiPag) {
          const fiado = pagamentos.find(p => p.forma === 'fiado');
          if (fiado && fiado.pessoaId && Number(fiado.valor) > 0) {
            supabase.rpc('fiado_lancar_debito', { p_id_pessoa: fiado.pessoaId, p_valor: Number(fiado.valor) }).catch(() => {});
          }
        }

        // Pagamentos
        if (multiPag && pagamentos.length) {
          const linhas = pagamentos.map(p => ({
            id_venda: vendaId,
            id_usuario,
            forma_pagamento: p.forma,
            valor: p.forma === 'dinheiro' ? Math.max(0, Number(p.valor || 0) - Number(trocoMulti)) : Number(p.valor || 0)
          }));
          await supabase.from('vendas_pagamentos').insert(linhas);
        }

        // Baixa de estoque
        try {
          const updates = [];
          for (const item of comanda) {
            if (!item.id_produto) continue;
            const prod = produtos.find(p => p.id === item.id_produto);
            if (prod?.controlar_estoque) {
              const novoEstoque = Number(prod.estoque_atual || 0) - (extrairQuantidadeEfetiva(item));
              updates.push(supabase.from('produtos').update({ estoque_atual: novoEstoque }).eq('id', item.id_produto));
            }
          }
          Promise.allSettled(updates);
        } catch {}
      }

      // Sucesso
      modalPagamentoAberto = false;
      comanda = [];
      formaPagamento = null;
      valorRecebido = 0;
      multiPag = false;
      pagamentos = [];
      
      if (isOffline) {
        addToast('Venda salva localmente (Modo Offline). Será sincronizada ao detectar internet.', 'warning');
      } else {
        addToast('Venda registrada com sucesso!', 'success');
        await atualizarSaldoCaixa();
      }

      // Impressão (Placeholder simples para offline)
      if (imprimirRecibo) {
        const payloadRecibo = {
          idVenda: vendaId,
          formaPagamento: insertForma,
          total: Number(totalComanda),
          valorRecebido: insertValorRecebido,
          troco: insertValorTroco,
          itens: comanda.map(i => ({ ...i, preco_unitario_na_venda: i.preco })), // aproximado
          pagamentos: multiPag ? pagamentos : []
        };
        setTimeout(() => imprimirReciboVenda(payloadRecibo, printWin), 60);
      }
    } catch (err) {
      erroPagamento = err?.message ?? 'Erro ao salvar a venda.';
    } finally {
      salvandoVenda = false;
    }
  }

  /**
   * Imprime recibo/nota estilo profissional (iFood-like)
   * Busca dados do perfil (empresa_perfil) do usuário autenticado automaticamente
   * Mostra logo, dados da empresa (somente os preenchidos), itens, totais e forma de pagamento
   */
  async function imprimirReciboVenda({ idVenda, formaPagamento, total, valorRecebido, troco, itens, pagamentos }, targetWin = null) {
  console.groupCollapsed('%c[Recibo] imprimirReciboVenda', 'color:#0a7');
    console.log('[Recibo] params:', { idVenda, formaPagamento, total, valorRecebido, troco, itensCount: itens?.length || 0, pagamentosCount: pagamentos?.length || 0 });
    let perfil = null;
    let logoUrl = null;
    let larguraBobina = '80mm';
    // Busca perfil com timeout para evitar travar o placeholder "Preparando recibo..."
    const withTimeout = (p, ms, label='op') => Promise.race([
      p,
      new Promise((resolve) => setTimeout(() => resolve({ __timeout: true, label }), ms))
    ]);
    try {
      console.time('[Recibo] getUser');
      const userRes = await withTimeout(supabase.auth.getUser(), 800, 'getUser');
      console.timeEnd('[Recibo] getUser');
      if (!userRes?.__timeout) {
        const userId = userRes?.data?.user?.id;
        console.log('[Recibo] userId:', userId);
        if (userId) {
          console.time('[Recibo] fetch perfil');
          const perfilRes = await withTimeout(
            supabase.from('empresa_perfil').select('*').eq('user_id', userId).limit(1).single(),
            800,
            'perfil'
          );
          console.timeEnd('[Recibo] fetch perfil');
          if (!perfilRes?.__timeout && !perfilRes?.error) {
            perfil = perfilRes.data;
            larguraBobina = perfil?.largura_bobina || '80mm';
            console.log('[Recibo] perfil carregado:', perfil);
            // Prefer profile's stored public URL; fallback to conventional storage path
            if (perfil.logo_url) {
              logoUrl = perfil.logo_url;
            } else {
              const pUrl = supabase.storage.from('logos').getPublicUrl(`${userId}.png`);
              logoUrl = pUrl?.data?.publicUrl || null;
            }
            console.log('[Recibo] logoUrl:', logoUrl);
          } else {
            console.warn('[Recibo] perfil não carregado (timeout/erro):', perfilRes?.error?.message || perfilRes?.label || 'timeout');
          }
        } else {
          console.warn('[Recibo] Sem userId — perfil não será carregado');
        }
      } else {
        console.warn('[Recibo] getUser timeout — seguindo com defaults');
      }
    } catch (e) {
      console.warn('[Recibo] Exceção ao montar perfil/logo:', e?.message || e);
    }

    const estabelecimento = {
      nome_exibicao: perfil?.nome_exibicao || 'Zelo PDV',
      documento: perfil?.documento || null,
      contato: perfil?.contato || null,
      endereco: perfil?.endereco || null,
      largura_bobina: larguraBobina,
      logoUrl
    };
    let venda = { idVenda, formaPagamento, total, valorRecebido, troco, itens, pagamentos };
    // Fallback: caso multiplo sem pagamentos no payload, tenta buscar do banco
    if (formaPagamento === 'multiplo' && (!Array.isArray(pagamentos) || pagamentos.length === 0) && idVenda) {
      try {
        const { data: pagsDb, error: pagsErr } = await supabase
          .from('vendas_pagamentos')
          .select('forma_pagamento, valor')
          .eq('id_venda', idVenda)
          .limit(50);
        if (!pagsErr && Array.isArray(pagsDb)) {
          venda.pagamentos = pagsDb.map(p => ({ forma: p.forma_pagamento, valor: Number(p.valor || 0) }));
        }
      } catch {}
    }
    console.log('[Recibo] normalizado:', { estabelecimento, venda });

  const html = buildReceiptHTML({ estabelecimento, venda });

    let w = targetWin;
    if (!w || w.closed) {
      w = window.open('', '_blank', `width=${larguraBobina === '58mm' ? '280' : '380'},height=700`);
    }
    if (!w) {
      addToast('Não foi possível abrir janela de impressão.', 'error');
      console.groupEnd();
      return;
    }
    try {
      // Tenta sobrescrever conteúdo existente (ex: placeholder "Preparando recibo...")
      w.focus();
      // 1) Envia via postMessage para o placeholder realizar a troca de forma confiável
      try {
        w.postMessage({ type: 'RECIBO_HTML', html }, '*');
      } catch (pmErr) {
        console.warn('[Recibo] postMessage falhou (seguirá com write/Blob):', pmErr?.message || pmErr);
      }
      try {
        w.document.open();
        w.document.write(html);
        w.document.close();
      } catch (writeErr) {
        console.warn('[Recibo] write falhou, tentando via Blob URL:', writeErr?.message || writeErr);
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        w.location.replace(url);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      // 2) Verificação tardia: se ainda estiver com placeholder, força troca via Blob URL
      setTimeout(() => {
        try {
          const stillPlaceholder = !!w && !w.closed && w.document && /Preparando\s+recibo/i.test(w.document.body?.innerText || '');
          if (stillPlaceholder) {
            console.warn('[Recibo] placeholder ainda presente; aplicando fallback Blob URL');
            const blob2 = new Blob([html], { type: 'text/html' });
            const url2 = URL.createObjectURL(blob2);
            w.location.replace(url2);
            setTimeout(() => URL.revokeObjectURL(url2), 5000);
          }
        } catch (chkErr) {
          console.warn('[Recibo] verificação placeholder falhou:', chkErr?.message || chkErr);
        }
      }, 150);
    } catch (e) {
      addToast('Falha ao escrever recibo na janela.', 'error');
    } finally {
      console.groupEnd();
    }
  }

  /**
   * Imprime recibo simples para Sangria de Caixa
   */
  async function imprimirReciboMovCaixa({ idMov, idCaixa, tipo, valor, motivo, created_at }) {
    let perfil = null;
    let logoUrl = null;
    let larguraBobina = '80mm';
    try {
      const { data: ures } = await supabase.auth.getUser();
      const userId = ures?.user?.id || null;
      if (userId) {
        const { data: perfilRes } = await supabase
          .from('empresa_perfil')
          .select('*')
          .eq('user_id', userId)
          .limit(1)
          .single();
        perfil = perfilRes || null;
        larguraBobina = perfil?.largura_bobina || '80mm';
        if (perfil?.logo_url) {
          logoUrl = perfil.logo_url;
        } else if (userId) {
          const pUrl = supabase.storage.from('logos').getPublicUrl(`${userId}.png`);
          logoUrl = pUrl?.data?.publicUrl || null;
        }
      }
    } catch {}

    const nome = perfil?.nome_exibicao || 'Zelo PDV';
    const doc = perfil?.documento || '';
    const contato = perfil?.contato || '';
    const end = perfil?.endereco || '';
    const dt = created_at ? new Date(created_at) : new Date();
    const dtStr = dt.toLocaleString();

    const titulo = tipo === 'saida' ? 'Sangria de Caixa' : 'Suprimento de Caixa';
    const rotuloValor = tipo === 'saida' ? 'Valor retirado' : 'Valor adicionado';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>${titulo}</title>
    </head><body style="font-family:sans-serif;padding:8px;font-size:12px;width:${larguraBobina};">
      ${logoUrl ? `<img src="${logoUrl}" alt="logo" style="max-width:100%;max-height:60px;display:block;margin:0 auto 6px auto;"/>` : ''}
      <div style="text-align:center;">
        <div style="font-size:14px;font-weight:700;">${nome}</div>
        ${doc ? `<div style=\"color:#555\">${doc}</div>` : ''}
        ${contato ? `<div style=\"color:#555\">${contato}</div>` : ''}
        ${end ? `<div style=\"color:#555\">${end}</div>` : ''}
      </div>
      <div style="border-top:1px dashed #999;margin:8px 0"></div>
      <div style="text-align:center;"><strong>${titulo}</strong></div>
      <div>Movimentação: #${idMov ?? '-'} | Caixa: #${idCaixa ?? '-'}</div>
      <div>Data/Hora: ${dtStr}</div>
      ${motivo ? `<div>Motivo: ${motivo}</div>` : ''}
      <div style="border-top:1px dashed #999;margin:8px 0"></div>
      <div style="font-size:14px;font-weight:700">${rotuloValor}: R$ ${Number(valor).toFixed(2)}</div>
      <div style="border-top:1px dashed #999;margin:8px 0"></div>
      <div style="text-align:center;color:#555;">Obrigado</div>
      <script>window.onload=function(){setTimeout(()=>{try{window.print()}catch(e){}},100)}<\/script>
    </body></html>`;

    let w = window.open('', '_blank', `width=${larguraBobina === '58mm' ? '280' : '380'},height=600`);
    if (!w) return;
    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch (e) {
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      w.location.replace(url);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }

</script>

<!-- --- 6. LAYOUT (HTML com Tailwind CSS) --- -->

<!-- Barra de status e Saldo integrada (Minimalista) -->
<div class="mx-4 mt-3 mb-2 px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg flex items-center justify-between">
  <div class="flex items-center gap-3">
    <div class="flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-md">
      <span class="text-xs text-slate-400 font-medium">Caixa:</span>
      <span class="text-green-400 font-bold">R$ {Number(saldoCaixa).toFixed(2)}</span>
    </div>
  </div>
  <div class="flex items-center gap-4">
    {#if carregandoSaldo}
      <span class="text-[10px] text-slate-500 animate-pulse">Sincronizando...</span>
    {:else}
      <button 
        class="text-[10px] text-slate-400 hover:text-indigo-400 transition-colors uppercase tracking-wider font-semibold" 
        on:click={atualizarSaldoCaixa}
      >
        Atualizar
      </button>
    {/if}
  </div>
</div>

<!-- Fundo principal do PDV: ocupa a largura disponível, sem forçar barras -->
<!-- Fundo principal do PDV: ocupa a largura disponível -->
<div class="flex w-full h-[calc(100vh-140px)] bg-transparent overflow-hidden gap-4">

  <!-- Coluna 1: Categorias (Slim Sidebar Rounded) -->
  <nav class="w-24 bg-slate-900/50 border border-slate-800 rounded-2xl flex-shrink-0 flex flex-col justify-between py-2 ml-4">
    <div class="overflow-y-auto flex-1 px-2 space-y-2 scrollbar-none">
      {#each categorias as cat (cat.id)}
        <button
          on:click={() => (categoriaAtiva = cat.id)}
          class="w-full aspect-square p-1 flex flex-col items-center justify-center text-center transition-all duration-200 group rounded-xl border {categoriaAtiva === cat.id ? 'bg-indigo-600 shadow-lg shadow-indigo-500/30 text-white border-transparent' : 'text-slate-400 hover:bg-slate-800 border-slate-700'}"
        >
          <div class="text-[9px] font-bold uppercase tracking-tight leading-tight group-hover:scale-105 transition-transform break-words w-full">
            {cat.nome}
          </div>
        </button>
      {/each}
    </div>

    <!-- Admin na base: discreto e ergonômico -->
    <div class="px-2 pt-2 border-t border-slate-700/50">
      <a 
        href="/admin" 
        class="flex flex-col items-center justify-center p-2 rounded-lg text-slate-500 hover:text-indigo-400 hover:bg-slate-800/50 transition-all group"
        title="Painel Admin"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 group-hover:rotate-12 transition-transform">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
        </svg>
        <span class="text-[9px] uppercase mt-1 font-bold">Admin</span>
      </a>
    </div>
  </nav>

  <!-- Coluna 2: Produtos (Scrollável) -->
  <main class="flex-1 p-4 overflow-y-auto">
    {#if loading}
      <p class="text-main">Carregando produtos...</p>
    {:else}
      <!-- Barra de busca e subcategorias -->
      <div class="flex flex-col gap-3 mb-4">
        <div>
          <label for="busca-prod" class="block text-sm font-medium text-main mb-1">Buscar produto</label>
          <input id="busca-prod" type="text" class="input-form" placeholder="Digite um nome..." bind:value={busca} bind:this={buscaInputEl} />
        </div>
        {#if subcatsDaCat.length}
          <div class="flex flex-col gap-2">
            <span class="text-xs font-semibold text-muted uppercase tracking-wider ml-1">Subcategorias</span>
            <div class="flex items-center gap-2 overflow-x-auto py-1 px-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
              <button 
                type="button" 
                class="group relative px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-1 {subcategoriaAtiva === null ? 'btn-primary' : 'btn-secondary'}"
                on:click={() => subcategoriaAtiva = null}
              >
                <span class="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                  </svg>
                  Todas
                </span>
              </button>
              
              {#each subcatsDaCat as sc (sc.id)}
                <button 
                  type="button" 
                  class="group relative px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-1 {subcategoriaAtiva === sc.id ? 'btn-primary' : 'btn-secondary'}"
                  on:click={() => subcategoriaAtiva = sc.id}
                >
                  {sc.nome}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Grid de Produtos Virtualizado -->
      <VirtualProductGrid
        produtos={produtosFiltrados}
        on:produtoClick={(e) => adicionarProduto(e.detail)}
        on:valorAvulsoClick={() => modalValorAberto = true}
      />
    {/if}
  </main>

  <!-- Coluna 3: Comanda (Clean & Integrated - Rounded) -->
  <aside class="w-96 bg-slate-900/90 border border-slate-800 rounded-l-2xl flex-shrink-0 flex flex-col shadow-2xl backdrop-blur-sm mr-0">
    <!-- Cabeçalho da Comanda -->
    <div class="px-6 py-4 border-b border-slate-800">
      <h2 class="text-lg font-bold text-white uppercase tracking-widest">Comanda</h2>
    </div>

    <!-- Lista de Itens (Minimalista) -->
    <div class="flex-1 px-4 py-2 overflow-y-auto">
      {#if comanda.length === 0}
        <div class="flex flex-col items-center justify-center h-full text-slate-500 opacity-50">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12 mb-2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
          </svg>
          <p class="text-xs uppercase font-bold tracking-tight">Vazio</p>
        </div>
      {:else}
        <ul class="space-y-1">
          {#each comanda as item (item.id)}
            <li class="p-3 bg-slate-800/30 rounded-lg flex items-center gap-3 group transition-colors hover:bg-slate-800/50">
              <!-- Detalhes do Item -->
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-slate-100 truncate leading-tight">{item.nome}</p>
                <p class="text-[11px] text-slate-400">R$ {Number(item.preco).toFixed(2)}</p>
              </div>
              
              <!-- Controles de Quantidade: Minimalistas -->
              <div class="flex items-center gap-1 bg-slate-900/50 p-1 rounded-md border border-slate-700/50">
                <button 
                  on:click={() => decrementarItem(item.id)}
                  class="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5"><path fill-rule="evenodd" d="M3 10a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 10z" clip-rule="evenodd" /></svg>
                </button>
                <span class="w-6 text-center text-xs font-bold text-slate-200">
                  {item.quantidade}
                </span>
                <button 
                  on:click={() => incrementarItem(item.id)}
                  class="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-green-400 hover:bg-green-500/10 rounded transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
                </button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Rodapé da Comanda (Flat & Dark) -->
    <div class="p-6 border-t border-slate-800 bg-slate-900/80 space-y-4">
      <div class="flex justify-between items-end">
        <span class="text-xs uppercase font-black text-slate-500 tracking-widest">Total</span>
        <span class="text-4xl font-black text-white tracking-tighter">
          <span class="text-sm font-bold text-indigo-400 mr-1">R$</span>{Number(totalComanda).toFixed(2)}
        </span>
      </div>
      
      <div class="grid grid-cols-4 gap-2">
        <button 
          on:click={abrirModalMovCaixa}
          class="col-span-1 p-3 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center"
          title="Movimentação"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
        </button>
        <button 
          on:click={limparComanda}
          class="col-span-1 p-3 bg-slate-800 text-slate-300 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition-colors flex items-center justify-center"
          title="Limpar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.34 6.65m-2.88 0-.34-6.65m-3.08-4.11L6.91 10.75a7.5 7.5 0 1 0 10.18 0l-1.47-5.86m-9.52 0H6.25m9.5 0h.25" />
          </svg>
        </button>
        <button
          on:click={handleFinalizarVenda}
          disabled={!caixaAberto || comanda.length === 0}
          class="col-span-2 btn-primary py-3 font-black uppercase text-xs tracking-widest rounded-lg shadow-lg disabled:opacity-20 transition-all active:scale-95"
        >
          Pagar
        </button>
      </div>
    </div>
  </aside>

</div>

<!-- --- 7. MODAIS (Componentizados) --- -->

<!-- Modal: Abrir Caixa -->
<ModalAbrirCaixa 
  open={modalAbrirCaixaAberto}
  on:submit={async (e) => {
    trocoInicialInput = e.detail.trocoInicial;
    await handleAbrirCaixa();
  }}
  on:close={() => {}}
/>

<!-- Modal: Quantidade (produtos por unidade) -->
<ModalQuantidade
  open={modalQuantidadeAberto}
  produto={produtoQuantidadeSelecionado}
  on:confirm={(e) => {
    const { produto, quantidade } = e.detail;
    // Checagem de estoque
    if (produto?.id && produto?.controlar_estoque) {
      const existente = comanda.find((i) => i.id_produto === produto.id);
      const qtdAtual = existente?.quantidade || 0;
      const disponivel = Number(produto.estoque_atual || 0);
      if (quantidade + qtdAtual > disponivel) {
        addToast(`Estoque insuficiente para "${produto.nome}". Restam ${disponivel} unidade(s).`, 'error');
        return;
      }
    }
    adicionarItemNaComanda(produto, quantidade, produto.preco);
    modalQuantidadeAberto = false;
    produtoQuantidadeSelecionado = null;
  }}
  on:close={() => {
    modalQuantidadeAberto = false;
    produtoQuantidadeSelecionado = null;
  }}
/>

<!-- Modal: Valor Avulso -->
<ModalValorAvulso
  open={modalValorAberto}
  on:adicionar={(e) => {
    const { nome, valor } = e.detail;
    adicionarItemNaComanda({ id: null, nome }, 1, valor);
    modalValorAberto = false;
  }}
  on:close={() => modalValorAberto = false}
/>

<!-- Modal: Pagamento -->
<ModalPagamento
  bind:this={modalPagamentoRef}
  open={modalPagamentoAberto}
  {totalComanda}
  {comanda}
  {idCaixaAberto}
  {produtos}
  on:confirmar={handleVendaConfirmada}
  on:close={() => {
    modalPagamentoAberto = false;
  }}
/>

<!-- Modal: Movimentação de Caixa -->
<ModalMovCaixa
  open={modalMovCaixaAberto}
  idCaixa={idCaixaAberto}
  {saldoCaixa}
  on:sucesso={async (e) => {
    modalMovCaixaAberto = false;
    if (e.detail.imprimirRecibo) {
      try {
        await imprimirReciboMovCaixa(e.detail);
      } catch (err) {
        console.warn('Falha ao imprimir recibo de movimentação:', err?.message || err);
      }
    }
    await atualizarSaldoCaixa();
  }}
  on:close={() => modalMovCaixaAberto = false}
/>

<!-- Estilos removidos: usamos classes globais definidas em src/app.css -->


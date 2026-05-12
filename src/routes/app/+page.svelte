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
  import { printVenda, printMovCaixa } from '$lib/printService';
  import { ensureActiveSubscription } from '$lib/guards';
  import { withTimeout } from '$lib/utils';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import { getFriendlyErrorMessage } from '$lib/errorUtils';
  import { pdvCache } from '$lib/stores/pdvCache';
  import { money, validatePaymentCoverage } from '$lib/finance/caixa';
  import { buildVendaPayload } from '$lib/finance/saleOps';
  import { estoqueDisponivel, produtoControlaEstoque, somarQuantidadePorEstoque } from '$lib/stock';
  
  // Modais componentizados
  import ModalAbrirCaixa from '$lib/components/modals/ModalAbrirCaixa.svelte';
  import ModalQuantidade from '$lib/components/modals/ModalQuantidade.svelte';
  import ModalValorAvulso from '$lib/components/modals/ModalValorAvulso.svelte';
  import ModalMovCaixa from '$lib/components/modals/ModalMovCaixa.svelte';
  import ModalPagamento from '$lib/components/modals/ModalPagamento.svelte';
  import ModalSucesso from '$lib/components/modals/ModalSucesso.svelte'; // [NEW]
  
  // Grid virtualizado para performance
  import VirtualProductGrid from '$lib/components/VirtualProductGrid.svelte';

  // Modo Offline (IndexedDB)
  import { atualizarCacheProdutos, salvarVendaOffline, syncVendasPendentes, limparVendasAntigas } from '$lib/offlineDb';

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

  // [NEW] Estado Modal Sucesso
  let modalSucessoAberto = false;
  let vendaConcluida = null;

  // [NEW] Mobile State
  let showMobileCart = false;
  // [NEW] Dados da Empresa
  let dadosEmpresa = null;

  // Plataformas de pagamento ativas (derivado de dadosEmpresa)
  $: plataformasAtivas = (dadosEmpresa?.plataformas_pagamento ?? [])
    .filter(p => p.ativo)
    .map(p => ({ id: p.id, nome: p.nome, icone: p.icone || '📦', taxa_pct: Number(p.taxa_pct || 0) }));

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

  // Tipo de pedido e taxa de entrega
  let tipoPedido = 'retirada'; // 'retirada' | 'delivery'
  let taxaEntregaInput = 0;

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
  
  // Desconto (recebido do modal)
  let valorDescontoVenda = 0;
  let descontoTipoVenda = null; // 'valor' | 'percentual' | null
  let totalFinalVenda = null;
  let taxasPlataformaVenda = [];
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
    try {
      const saved = sessionStorage.getItem('zelo_comanda');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) comanda = parsed;
      }
    } catch {}
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

    // [NEW] Carrega dados da empresa para recibos (WhatsApp/Impressão)
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
         const { data } = await supabase.from('empresa_perfil').select('*').eq('user_id', user.id).single();
         dadosEmpresa = data;
      }
    } catch (e) { console.error('Error fetching company profile:', e); }

    // Cleanup stuck offline records older than 30 days
    limparVendasAntigas(30).catch(() => {});

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
  // Total com taxa de entrega incluída
  $: totalComandaComEntrega = Number(totalComanda) + (tipoPedido === 'delivery' ? Number(taxaEntregaInput || 0) : 0);

  // Persiste a comanda em sessionStorage para sobreviver a recarregamentos
  $: if (typeof sessionStorage !== 'undefined') {
    try { sessionStorage.setItem('zelo_comanda', JSON.stringify(comanda)); } catch {}
  }

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
    if (produto?.id && produtoControlaEstoque(produto)) {
      const existente = comanda.find((i) => i.id_produto === produto.id);
      const qtdAtual = existente?.quantidade || 0;
      const disponivel = estoqueDisponivel(produto);
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
        if (produtoControlaEstoque(prod)) {
          const disponivel = estoqueDisponivel(prod);
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
      try { sessionStorage.removeItem('zelo_comanda'); } catch {}
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
    if (prod.id && produtoControlaEstoque(prod)) {
      const existente = comanda.find((i) => i.id_produto === prod.id);
      const qtdAtual = existente?.quantidade || 0;
      const disponivel = estoqueDisponivel(prod);
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
      pessoasFiado: pessoasList,
      valorDesconto,
      descontoTipo,
      totalOriginal,
      totalFinal,
      taxasPlataforma,
    } = event.detail;

    // Atualiza estados locais que serão usados pela função confirmarVenda
    formaPagamento = forma === 'multiplo' ? forma : forma;
    valorRecebido = valRec || 0;
    imprimirRecibo = printRecibo;
    multiPag = forma === 'multiplo';
    if (pags?.length) pagamentos = pags;
    if (pessoasList?.length) pessoasFiado = pessoasList;
    if (idCliente) pessoaFiadoId = idCliente;

    // Dados de desconto
    valorDescontoVenda = valorDesconto || 0;
    descontoTipoVenda = descontoTipo || null;
    totalFinalVenda = Number(totalFinal ?? totalComandaComEntrega);
    taxasPlataformaVenda = Array.isArray(taxasPlataforma) ? taxasPlataforma : [];

    // Ativa estado de salvando no modal via referência
    modalPagamentoRef?.setSalvando?.(true);

    // Chama a função de persistência existente
    await confirmarVenda();
  }

  // Módulos 1.4 e 1.5 - Confirmar e persistir a venda
  $: troco = formaPagamento === 'dinheiro' ? Math.max(0, Number(valorRecebido) - Number(totalFinalVenda ?? totalComandaComEntrega)) : 0;

  /**
   * Persiste a venda e itens; faz baixa de estoque simples (MVP).
   * Em produção, prefira uma RPC transacional para atomicidade.
   */
  async function confirmarVenda() {
    try {
      erroPagamento = '';
      const totalCobradoVenda = money(totalFinalVenda ?? totalComandaComEntrega);
      // Validações de pagamento (single vs múltiplo)
      if (!multiPag) {
        const erro = validatePaymentCoverage({
          formaPagamento,
          valorRecebido,
          totalFinal: totalCobradoVenda
        });
        if (erro) {
          erroPagamento = erro;
          return;
        }
        if (formaPagamento === 'fiado' && !pessoaFiadoId) {
          erroPagamento = 'Selecione a pessoa para lançar o fiado.';
          return;
        }
      } else {
        // múltiplos pagamentos
        const erro = validatePaymentCoverage({
          formaPagamento: 'multiplo',
          pagamentos,
          totalFinal: totalCobradoVenda
        });
        if (erro) {
          erroPagamento = erro;
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

      // Usuário autenticado
      const { data: userData } = await supabase.auth.getUser();
      const id_usuario = userData?.user?.id ?? null;

      // Validação de estoque (refresco em tempo real antes de inserir a venda)
      let freshStockMap = new Map();
      try {
        const idsProdutos = [...new Set(comanda.filter(i => i.id_produto).map(i => i.id_produto))];
        if (idsProdutos.length) {
          const { data: prodsInfo, error: prodErr } = await supabase
            .from('produtos')
            .select('id, nome, id_categoria, controlar_estoque, estoque_atual, categorias(id, nome, controlar_estoque_compartilhado, estoque_compartilhado_atual)')
            .in('id', idsProdutos);
          if (!prodErr && prodsInfo) {
            const mapInfo = new Map(prodsInfo.map(p => [p.id, p]));
            freshStockMap = mapInfo;
            // mesma lógica de extrair quantidade efetiva (para nomes como "56x Produto")
            const extrairQuantidadeEfetiva = (item) => {
              if (item?.id_produto && typeof item?.nome === 'string') {
                const m = item.nome.match(/^(\d+)x\s/i);
                if (m) return parseInt(m[1], 10);
              }
              return item.quantidade || 1;
            };
            const itensComInfo = comanda
              .filter((it) => it.id_produto)
              .map((it) => ({
                ...mapInfo.get(it.id_produto),
                id_produto: it.id_produto,
                nome: mapInfo.get(it.id_produto)?.nome || it.nome,
                quantidade: extrairQuantidadeEfetiva(it)
              }));
            // Checa insuficiências
            const insuficientes = somarQuantidadePorEstoque(itensComInfo, itensComInfo)
              .filter((item) => item.quantidade > item.disponivel)
              .map((item) => `${item.nome} (disp: ${item.disponivel}, ped: ${item.quantidade})`);
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

      // Build payload único — usado tanto online (RPC atômica) quanto offline (replay no sync).
      const { payload, settlement } = buildVendaPayload({
        formaPagamento: multiPag ? 'multiplo' : formaPagamento,
        valorRecebido,
        pagamentos,
        totalFinal: totalCobradoVenda,
        valorDesconto: valorDescontoVenda,
        descontoTipo: descontoTipoVenda,
        taxaEntrega: tipoPedido === 'delivery' ? Number(taxaEntregaInput || 0) : 0,
        tipoPedido,
        idCaixa: idCaixaAberto,
        idCliente: !multiPag && formaPagamento === 'fiado' ? pessoaFiadoId : null,
        itens: comanda,
        taxasPlataforma: taxasPlataformaVenda
      });

      const insertForma = settlement.formaPagamento;
      const insertValorRecebido = settlement.valorRecebido;
      const insertValorTroco = settlement.valorTroco;

      // Tenta RPC atômica online; em caso de falha de rede, salva offline pra sync depois.
      let vendaId = null;
      let venda = null;
      let isOffline = false;

      try {
        const { data, error: rpcError } = await supabase.rpc('criar_venda_completa', {
          p_payload: payload
        });
        if (rpcError) throw rpcError;
        venda = { id: data?.id, numero_venda: data?.numero_venda };
        vendaId = venda.id;
      } catch (connErr) {
        console.warn('Falha na RPC de venda, salvando offline:', connErr?.message || connErr);
        isOffline = true;
        await salvarVendaOffline({
          payload,
          createdAt: new Date().toISOString()
        });
        vendaId = `offline-${Date.now()}`;
      }

      // [NEW] Update Success Modal State
      vendaConcluida = {
          ...(venda || {}),
          itens: comanda,
          pagamentos: multiPag ? settlement.paymentRows : [],
          total: totalCobradoVenda,
          forma_pagamento: insertForma,
          subtotal: Number(totalComanda),
          valor_recebido: insertValorRecebido,
          valor_troco: insertValorTroco,
          taxa_entrega: tipoPedido === 'delivery' ? Number(taxaEntregaInput || 0) : 0,
          tipo_pedido: tipoPedido,
          desconto: valorDescontoVenda || 0
      };
      
      addToast('Venda realizada com sucesso!', 'success');
      
      // [CHANGE] Instead of full reset, open success modal
      modalPagamentoAberto = false;
      modalSucessoAberto = true;
      
      // Impressão (Legacy functionality - keep it passing logic)
      if (imprimirRecibo) {
          const payloadRecibo = {
          idVenda: vendaId,
          numeroVenda: vendaConcluida.numero_venda,
          formaPagamento: insertForma,
          total: totalCobradoVenda,
          subtotal: Number(totalComanda),
          desconto: valorDescontoVenda || 0,
          taxaEntrega: tipoPedido === 'delivery' ? Number(taxaEntregaInput || 0) : 0,
          tipoPedido,
          valorRecebido: insertValorRecebido,
          troco: insertValorTroco,
          itens: comanda.map(i => ({ ...i, preco_unitario_na_venda: i.preco })),
          pagamentos: multiPag ? settlement.paymentRows : []
        };
        setTimeout(() => imprimirReciboVenda(payloadRecibo), 60);
      }
      
      if (isOffline) {
          await atualizarSaldoCaixa(); 
      } else {
         await atualizarSaldoCaixa();
      }

    } catch (e) {
      console.error(e);
      const friendlyMsg = getFriendlyErrorMessage(e);
      modalPagamentoRef?.setErro?.(friendlyMsg);
    } finally {
      salvandoVenda = false;
      modalPagamentoRef?.setSalvando?.(false);
    }
  }

  function finalizarFluxoSucesso() {
      modalSucessoAberto = false;
      vendaConcluida = null;
      // Reset Comanda & Pagamento
      comanda = [];
      try { sessionStorage.removeItem('zelo_comanda'); } catch {}
      modalPagamentoRef?.resetState?.();
      // Reset local payment state
      formaPagamento = null;
      valorRecebido = 0;
      multiPag = false;
      pagamentos = [];
      tipoPedido = 'retirada';
      taxaEntregaInput = 0;
      addToast('Pronto para próxima venda', 'info');
  }

  function abrirModalPagamento() {
    if (comanda.length === 0) return;
    modalPagamentoAberto = true;
  }

  // ── Helpers compartilhados de perfil ──────────────────────────────────────

  async function fetchPerfil() {
    const race = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r({ __timeout: true }), ms))]);
    try {
      const userRes = await race(supabase.auth.getUser(), 800);
      if (userRes?.__timeout) return null;
      const userId = userRes?.data?.user?.id;
      if (!userId) return null;
      const perfilRes = await race(
        supabase.from('empresa_perfil').select('*').eq('user_id', userId).limit(1).single(),
        800
      );
      if (perfilRes?.__timeout || perfilRes?.error) return null;
      const perfil = perfilRes.data;
      if (!perfil.logo_url) {
        const pUrl = supabase.storage.from('logos').getPublicUrl(`${userId}.png`);
        perfil.logoUrl = pUrl?.data?.publicUrl || null;
      } else {
        perfil.logoUrl = perfil.logo_url;
      }
      return perfil;
    } catch { return null; }
  }

  function perfilToEstabelecimento(perfil) {
    return {
      nome_exibicao: perfil?.nome_exibicao || 'Zelo PDV',
      documento: perfil?.documento || null,
      contato: perfil?.contato || null,
      endereco: perfil?.endereco || null,
      largura_bobina: perfil?.largura_bobina || '58mm',
      rodape_recibo: perfil?.rodape_recibo || 'Obrigado pela preferência!',
      logoUrl: perfil?.logoUrl || null,
    };
  }

  // ── Impressão de venda ─────────────────────────────────────────────────────

  async function imprimirReciboVenda({ idVenda, numeroVenda, formaPagamento, total, subtotal, valorRecebido, troco, itens, pagamentos, taxaEntrega = 0, tipoPedido: tipoPed = 'retirada' }) {
    const perfil = await fetchPerfil();
    const estabelecimento = perfilToEstabelecimento(perfil);
    let pags = pagamentos || [];
    if (formaPagamento === 'multiplo' && (!Array.isArray(pags) || !pags.length) && idVenda) {
      try {
        const { data: pagsDb } = await supabase
          .from('vendas_pagamentos').select('forma_pagamento, valor').eq('id_venda', idVenda).limit(50);
        if (Array.isArray(pagsDb)) pags = pagsDb.map(p => ({ forma: p.forma_pagamento, valor: Number(p.valor || 0) }));
      } catch {}
    }
    await printVenda({
      estabelecimento,
      venda: { idVenda, numeroVenda, formaPagamento, total, subtotal: subtotal ?? total, taxaEntrega, tipoPedido: tipoPed, valorRecebido, troco, itens, pagamentos: pags },
    });
  }

  // ── Impressão de movimentação de caixa ────────────────────────────────────

  async function imprimirReciboMovCaixa({ idMov, idCaixa, tipo, valor, motivo, created_at }) {
    const perfil = await fetchPerfil();
    const estabelecimento = perfilToEstabelecimento(perfil);
    await printMovCaixa({ estabelecimento, mov: { idMov, idCaixa, tipo, valor, motivo, created_at } });
  }

</script>

<!-- --- 6. LAYOUT (HTML com Tailwind CSS) --- -->
<div class="flex flex-col h-full overflow-hidden">

<!-- Barra de status e Saldo integrada (Minimalista) -->
<div class="mx-4 mt-3 mb-2 px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg flex items-center justify-between">
  <div class="flex items-center gap-3">
    <div class="flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-md">
      <span class="text-xs text-slate-400 font-medium">Caixa:</span>
      <span class="text-green-400 font-bold">R$ {Number(saldoCaixa).toFixed(2)}</span>
    </div>
  </div>

  <!-- Movimentação de Caixa — mobile only (on desktop it lives in the cart sidebar footer) -->
  <button
    class="md:hidden p-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 hover:text-white rounded-md border border-slate-700/50 transition-colors"
    on:click={() => modalMovCaixaAberto = true}
    title="Movimentação de Caixa"
    aria-label="Movimentação de Caixa"
  >
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  </button>

  <div class="flex items-center gap-4">
    {#if carregandoSaldo}
      <span class="text-[10px] text-slate-500 animate-pulse">Sincronizando...</span>
    {:else}
      <button
        class="text-[10px] text-slate-400 hover:text-sky-400 transition-colors uppercase tracking-wider font-semibold"
        on:click={atualizarSaldoCaixa}
      >
        Atualizar
      </button>
    {/if}
  </div>
</div>

<!-- Fundo principal do PDV: Layout Responsivo -->
<!-- Desktop: flex-row (produtos + comanda). Sidebar agora vem do layout -->
<div class="flex flex-col md:flex-row w-full flex-1 bg-transparent overflow-hidden relative">

  <!-- Coluna Principal: Produtos (Main Content) -->
  <main class="flex-1 flex flex-col p-4 overflow-hidden pb-0">
    {#if loading}
      <p class="text-main">Carregando produtos...</p>
    {:else}
      <!-- Header: Título + Busca + Botão Avulso -->
      <div class="flex-shrink-0 flex flex-col gap-3 mb-4">
        <div class="flex items-center justify-between gap-3">
          <h1 class="text-lg md:text-xl font-bold" style="color: var(--text-main);">Frente de Caixa</h1>
          <div class="flex gap-2 flex-1 max-w-xl">
            <div class="flex-1">
              <input id="busca-prod" data-testid="product-search" type="text" class="input-form h-10 md:h-12" placeholder="Buscar produto..." bind:value={busca} bind:this={buscaInputEl} />
            </div>
            <button
              data-testid="btn-avulso"
              on:click={() => modalValorAberto = true}
              class="btn-primary h-10 md:h-12 px-3 md:px-4 flex items-center gap-2 whitespace-nowrap shadow-sm rounded-lg"
              style="background: var(--accent); color: white;"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              <span class="text-sm font-bold hidden md:inline">Novo Item Avulso</span>
            </button>
          </div>
        </div>

        <!-- Categorias: Tabs horizontais (estilo underline) -->
        <div class="flex items-center gap-6 overflow-x-auto py-1 scrollbar-none border-b" style="border-color: var(--border-subtle);" role="tablist" aria-label="Categorias">
          {#each categorias as cat (cat.id)}
            <button
              data-testid="category-tab"
              type="button"
              role="tab"
              aria-selected={categoriaAtiva === cat.id}
              class="flex-shrink-0 pb-2 font-semibold text-sm transition-colors whitespace-nowrap relative"
              style="
                color: {categoriaAtiva === cat.id ? 'var(--text-main)' : 'var(--text-muted)'};
                border-bottom: 2px solid {categoriaAtiva === cat.id ? 'var(--primary)' : 'transparent'};
                margin-bottom: -1px;
              "
              on:click={() => (categoriaAtiva = cat.id)}
            >
              {cat.nome}
            </button>
          {/each}
        </div>

        <!-- Subcategorias: Pills (quando existem) -->
        {#if subcatsDaCat.length}
          <div class="flex items-center gap-2 overflow-x-auto py-1 px-1 scrollbar-none">
              <button
                type="button"
                class="flex-shrink-0 px-3 py-1.5 rounded-full font-medium text-xs transition-colors"
                style="
                  background: {subcategoriaAtiva === null ? 'var(--primary)' : 'var(--bg-panel)'};
                  color: {subcategoriaAtiva === null ? 'white' : 'var(--text-muted)'};
                  border: 1px solid {subcategoriaAtiva === null ? 'transparent' : 'var(--border-subtle)'};
                "
                on:click={() => subcategoriaAtiva = null}
              >
                Todas
              </button>
              {#each subcatsDaCat as sc (sc.id)}
                <button
                  type="button"
                  class="flex-shrink-0 px-3 py-1.5 rounded-full font-medium text-xs transition-colors"
                  style="
                    background: {subcategoriaAtiva === sc.id ? 'var(--primary)' : 'var(--bg-panel)'};
                    color: {subcategoriaAtiva === sc.id ? 'white' : 'var(--text-muted)'};
                    border: 1px solid {subcategoriaAtiva === sc.id ? 'transparent' : 'var(--border-subtle)'};
                  "
                  on:click={() => subcategoriaAtiva = sc.id}
                >
                  {sc.nome}
                </button>
              {/each}
          </div>
        {/if}
      </div>

      <div data-testid="product-grid" class="flex-1 flex flex-col min-h-0">
        <VirtualProductGrid
          produtos={produtosFiltrados}
          hasAnyProducts={produtos.length > 0}
          on:produtoClick={(e) => adicionarProduto(e.detail)}
          on:valorAvulsoClick={() => modalValorAberto = true}
        />
      </div>
    {/if}
  </main>

  <!-- Coluna 3: Comanda (Desktop Sidebar / Mobile Drawer) -->
  <aside data-testid="cart" class="
    fixed inset-0 z-50 md:static md:z-auto
    bg-slate-900/95 md:bg-slate-900/90 backdrop-blur-md md:backdrop-blur-sm
    w-full md:w-96 
    flex flex-col 
    transition-transform duration-300 ease-in-out
    {showMobileCart ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}
    md:border md:border-slate-800 md:rounded-l-2xl md:shadow-2xl md:mr-0
  ">
    <!-- Header Comanda (Mobile has close button) -->
    <div class="px-4 py-3 md:px-6 md:py-4 border-b border-slate-800 flex justify-between items-center">
      <h2 class="text-lg font-bold text-white uppercase tracking-widest">Comanda</h2>
      <!-- Mobile Close Button -->
      <button class="md:hidden p-2 text-slate-400" on:click={() => showMobileCart = false}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>

    <!-- Lista de Itens -->
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
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-slate-100 truncate leading-tight">{item.nome}</p>
                <p class="text-[11px] text-slate-400">R$ {Number(item.preco).toFixed(2)}</p>
              </div>
              
              <div class="flex items-center gap-1 bg-slate-900/50 p-1 rounded-md border border-slate-700/50">
                <button 
                  on:click={() => decrementarItem(item.id)}
                  class="w-8 h-8 md:w-6 md:h-6 flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 md:w-3.5 md:h-3.5"><path fill-rule="evenodd" d="M3 10a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 10z" clip-rule="evenodd" /></svg>
                </button>
                <span class="w-6 text-center text-sm md:text-xs font-bold text-slate-200">{item.quantidade}</span>
                <button 
                  on:click={() => incrementarItem(item.id)}
                  class="w-8 h-8 md:w-6 md:h-6 flex items-center justify-center text-slate-400 hover:text-green-400 hover:bg-green-500/10 rounded transition-all"
                >
                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 md:w-3.5 md:h-3.5"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
                </button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Footer da Comanda -->
    <div class="p-4 bg-slate-900 border-t border-slate-800 space-y-3">
      <!-- Tipo de Pedido -->
      <div class="flex gap-2">
        {#each [{ id: 'retirada', label: 'Retirada', icon: '🛍️' }, { id: 'delivery', label: 'Delivery', icon: '🛵' }] as tipo}
          <button
            type="button"
            on:click={() => { tipoPedido = tipo.id; if (tipo.id !== 'delivery') taxaEntregaInput = 0; }}
            class="flex-1 px-2 py-1.5 rounded-full font-medium text-xs transition-colors border flex items-center justify-center gap-1 {tipoPedido === tipo.id ? 'bg-sky-600 text-white border-transparent' : 'bg-slate-800 text-slate-400 border-slate-700'}"
          >
            <span>{tipo.icon}</span>
            <span>{tipo.label}</span>
          </button>
        {/each}
      </div>

      <!-- Taxa de Entrega (só quando Delivery) -->
      {#if tipoPedido === 'delivery'}
        <div class="flex items-center gap-2">
          <label for="taxa-entrega-input" class="text-xs text-slate-400 whitespace-nowrap">Taxa entrega (R$)</label>
          <input
            id="taxa-entrega-input"
            type="number"
            min="0"
            step="0.01"
            bind:value={taxaEntregaInput}
            class="flex-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500"
            placeholder="0,00"
          />
        </div>
      {/if}

      <div class="flex justify-between items-center px-1">
        <span class="text-xs text-slate-400 font-medium">Subtotal</span>
        <span class="text-sm font-bold text-slate-200">R$ {Number(totalComanda).toFixed(2)}</span>
      </div>
      {#if tipoPedido === 'delivery' && Number(taxaEntregaInput) > 0}
        <div class="flex justify-between items-center px-1">
          <span class="text-xs text-purple-400 font-medium">Taxa entrega</span>
          <span class="text-sm font-bold text-purple-400">+ R$ {Number(taxaEntregaInput).toFixed(2)}</span>
        </div>
      {/if}
      
      <!-- Botões de Ação -->
      <div class="grid grid-cols-4 gap-2">
        <!-- Movimentação (Sangria/Suprimento) -->
        <button 
          on:click={() => modalMovCaixaAberto = true}
          class="col-span-1 h-12 md:h-10 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center border border-slate-700/50"
          title="Movimentação de Caixa"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
        </button>

        <!-- Limpar Comanda -->
        <button 
          on:click={async () => {
            if (await confirmAction('Limpar comanda?', 'Tem certeza que deseja remover todos os itens?')) {
              comanda = [];
              addToast('Comanda limpa', 'info');
            }
          }}
          class="col-span-1 h-12 md:h-10 bg-slate-800 text-slate-300 rounded-lg hover:bg-red-900/20 hover:text-red-400 hover:border-red-900/30 transition-colors flex items-center justify-center border border-slate-700/50"
          title="Limpar Comanda"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </button>

        <!-- Botão Receber (Maior destaque) -->
        <button
          data-testid="btn-cobrar"
          disabled={comanda.length === 0}
          on:click={abrirModalPagamento}
          class="col-span-2 h-12 md:h-10 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold rounded-lg shadow-lg shadow-green-900/20 text-sm uppercase tracking-wide transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <span>Receber</span>
          <span class="bg-black/20 px-2 py-0.5 rounded text-xs">R$ {Number(totalComandaComEntrega).toFixed(2)}</span>
        </button>
      </div>
    </div>
  </aside>


  <!-- [NEW] Mobile Bottom Bar (Sticky) -->
  {#if !showMobileCart && comanda.length > 0}
    <div class="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 p-3 flex items-center justify-between z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)]">
        <div class="flex flex-col">
            <span class="text-xs text-slate-400">{comanda.reduce((a,i)=>a+i.quantidade,0)} itens</span>
            <span class="text-lg font-bold text-white">R$ {Number(totalComanda).toFixed(2)}</span>
        </div>
        <button 
            class="bg-sky-600 text-white px-6 py-2.5 rounded-lg font-bold shadow-lg active:scale-95 transition-transform"
            on:click={() => showMobileCart = true}
        >
            Ver Comanda
        </button>
    </div>
  {/if}

</div>
</div> <!-- /flex-col h-full -->

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
    if (produto?.id && produtoControlaEstoque(produto)) {
      const existente = comanda.find((i) => i.id_produto === produto.id);
      const qtdAtual = existente?.quantidade || 0;
      const disponivel = estoqueDisponivel(produto);
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
  totalComanda={totalComandaComEntrega}
  subtotalProdutos={totalComanda}
  {tipoPedido}
  taxaEntrega={tipoPedido === 'delivery' ? Number(taxaEntregaInput || 0) : 0}
  {comanda}
  {idCaixaAberto}
  {produtos}
  {plataformasAtivas}
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

<!-- Modal: Sucesso -->
<ModalSucesso
  open={modalSucessoAberto}
  venda={vendaConcluida}
  empresa={dadosEmpresa}
  on:close={finalizarFluxoSucesso}
  on:novaVenda={finalizarFluxoSucesso}
  on:imprimir={() => {
    if (!vendaConcluida) return;
    imprimirReciboVenda({
      idVenda: vendaConcluida.id,
      numeroVenda: vendaConcluida.numero_venda,
      formaPagamento: vendaConcluida.forma_pagamento,
      total: vendaConcluida.total,
      subtotal: vendaConcluida.subtotal,
      desconto: vendaConcluida.desconto,
      taxaEntrega: vendaConcluida.taxa_entrega || 0,
      tipoPedido: vendaConcluida.tipo_pedido || 'retirada',
      valorRecebido: vendaConcluida.valor_recebido,
      troco: vendaConcluida.valor_troco,
      itens: vendaConcluida.itens?.map(i => ({ ...i, preco_unitario_na_venda: i.preco })) || [],
      pagamentos: vendaConcluida.pagamentos || []
    });
  }}
/>

<!-- Estilos removidos: usamos classes globais definidas em src/app.css -->

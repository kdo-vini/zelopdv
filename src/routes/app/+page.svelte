<!-- 
  Arquivo: src/routes/app/+page.svelte
  Stack: SvelteKit + Tailwind CSS + Supabase
  Descrição: Frente de Caixa (PDV) movida para /app para que a landing fique em /
-->

<script>
  // A S V E L T E K I T
  // Ajuste: Removido o ".js" da importação para deixar o bundler resolver.
  import { supabase } from '$lib/supabaseClient';
  import { onMount, onDestroy, tick } from 'svelte';
  import { waitAuthReady } from '$lib/authStore';
  import { printVenda, printMovCaixa } from '$lib/printService';
  import { ensureActiveSubscription } from '$lib/guards';
  import { getAccessContext, logAuditAction } from '$lib/accessControl';
  import { withTimeout } from '$lib/utils';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import { getFriendlyErrorMessage } from '$lib/errorUtils';
  import { resolveAppIcon } from '$lib/icons/appIcons';
  import { pdvCache } from '$lib/stores/pdvCache';
  import { isNetworkError } from '$lib/netStatus';
  import { money, validatePaymentCoverage, getPrecoTabela } from '$lib/finance/caixa';
  import { formatMoney, formatMoneyNumber } from '$lib/formatMoney';
  import { abrirCaixaIdempotente } from '$lib/finance/caixaOps';
  import { buildVendaPayload } from '$lib/finance/saleOps';
  import { createClientSaleId } from '$lib/finance/saleOps';
  import { startOfflineRuntime, getOfflineContext, isOfflineWriteActive, submitOfflineOperation, runOfflineSync, readOperationalSnapshot, onOfflineChange, markOfflineReadiness, claimPrimaryDevice } from '$lib/offline/runtime';
  import { readSnapshot, saveSnapshot, readDraft, saveDraft, listOperations } from '$lib/offline/operations';
  import { projectStockProducts } from '$lib/finance/offlineProjection';
  import { validateLocalCartStock, selectCheckoutSubmission, restoreCheckoutFormState } from '$lib/finance/offlineCheckout';
  import { atualizarCatalogoOffline } from '$lib/offlineDb';
  import { loadCashSnapshot } from '$lib/finance/offlineCash';
  import { calculatePaymentSummary, calculateMovementSummary, calculateExpectedDrawer } from '$lib/finance/caixa';
  import { estoqueDisponivel, produtoControlaEstoque, somarQuantidadePorEstoque } from '$lib/stock';
  import { buildCartItemKey, formatSelectedModifierGroups, hasActiveModifierGroups } from '$lib/zelomenuModifiers';
  import { buildPizzaSignature, pizzaStockRequirements } from '$lib/pizza';
  import {
    isFirstUseNoCaixa as computeIsFirstUseNoCaixa,
    shouldAutoOpenCaixaModal,
    shouldBlockAddToCart
  } from '$lib/pdv/firstUseCaixaGate';
  import { capturePostHogEvent } from '$lib/posthogClient';

  // Modais componentizados
  import ModalAbrirCaixa from '$lib/components/modals/ModalAbrirCaixa.svelte';
  import ModalQuantidade from '$lib/components/modals/ModalQuantidade.svelte';
  import ModalValorAvulso from '$lib/components/modals/ModalValorAvulso.svelte';
  import ModalMovCaixa from '$lib/components/modals/ModalMovCaixa.svelte';
  import ModalPagamento from '$lib/components/modals/ModalPagamento.svelte';
  import ModalSucesso from '$lib/components/modals/ModalSucesso.svelte'; // [NEW]
  import ModalProdutoMontavel from '$lib/components/modals/ModalProdutoMontavel.svelte';
  import ModalNovoProduto from '$lib/components/modals/ModalNovoProduto.svelte';
  import InlineHelper from '$lib/components/ui/InlineHelper.svelte';
  
  // Grid virtualizado para performance
  import VirtualProductGrid from '$lib/components/VirtualProductGrid.svelte';
  import { zeloSurface } from '$lib/theme/surface';
  import { Button } from '$lib/components/ui/button';
  import { Kbd, MoneyText, StatusPill, Segmented, UnderlineTabs, Stepper, SearchField, ZeloMark } from '$lib/components/zelo';
  import { blurSwap, rise } from '$lib/motion/transitions.js';
  import { companyNameStore } from '$lib/stores/session';
  import { ArrowLeftRight, Bike, ChevronUp, CloudUpload, Plus, RefreshCw, ShoppingBag, ShoppingCart, Trash2, X } from 'lucide-svelte';

  // Modo Offline (IndexedDB)
  import {
    atualizarCacheProdutos,
    buscarProdutosLocal,
    atualizarCacheCategorias,
    buscarCategoriasLocal,
    atualizarCacheSubcategorias,
    buscarSubcategoriasLocal,
    contarVendasPendentes,
    listarItensPizzaPendentes,
    contarVendasSemTitular,
    recuperarVendasSemTitular,
    salvarVendaOffline,
    shouldQueueVendaOffline,
    syncVendasPendentes
  } from '$lib/offlineDb';


  // --- 1. ESTADO DO PDV ---
  let produtos = [];
  let checkoutIntent = null;
  let checkoutSubmission = null;
  let catalogRefreshing = false;
  let refreshingOfflineView = false;
  let draftReady = false;
  let draftPersisting = Promise.resolve();
  let unsubscribeOffline = null;
  let pizzasPendentes = [];
  let pizzaEditItem = null;
  let pizzaPendingOwner = null;
  let categorias = [];
  let categoriaAtiva = null; // ID da categoria selecionada
  let subcategorias = [];
  let subcategoriaAtiva = null; // ID da subcategoria selecionada (ou null para todas)
  let busca = '';
  let loading = true;
  let ownerUserId = null;
  let isSubUser = false;
  let operadorUserId = null;
  let errorMessage = '';
  // Sincronização offline: contador de vendas aguardando e estado do retry.
  let vendasPendentesCount = 0;
  let vendasSemTitularCount = 0;
  let verificandoPendenciasAntigas = false;
  let resultadoPendenciasAntigas = '';
  let sincronizandoPendentes = false;
  let pendentesInterval = null;
  let gridEl;
  let buscaInputEl;

  // [NEW] Estado Modal Sucesso
  let modalSucessoAberto = false;
  let vendaConcluida = null;
  let modalProdutoMontavelAberto = false;
  let produtoMontavelSelecionado = null;
  // Cadastro rápido de produto a partir do estado vazio da grade (sem produto cadastrado)
  let modalNovoProdutoAberto = false;
  let canGerenciarProdutos = true;
  let mostrarHelperPrimeiroClick = false;
  let helperPrimeiroClickProdutoId = null;
  let timeoutHelperPrimeiroClick = null;

  // [NEW] Mobile State
  let showMobileCart = false;
  // [NEW] Dados da Empresa
  let dadosEmpresa = null;
  let tabelaAtiva = 1;
  $: tabelasPrecoAtivo = !!dadosEmpresa?.tabelas_preco_ativo;
  $: nomesTabelas = [
    dadosEmpresa?.tabela_preco_1_nome || 'Tabela 1',
    dadosEmpresa?.tabela_preco_2_nome || 'Tabela 2',
    dadosEmpresa?.tabela_preco_3_nome || 'Tabela 3',
  ];
  // Se o toggle for desligado em runtime, força volta para tabela 1
  $: if (!tabelasPrecoAtivo && tabelaAtiva !== 1) tabelaAtiva = 1;

  // Plataformas de pagamento ativas (derivado de dadosEmpresa)
  $: plataformasAtivas = (dadosEmpresa?.plataformas_pagamento ?? [])
    .filter(p => p.ativo)
    .map(p => ({ id: p.id, nome: p.nome, icone: p.icone || 'plataformas', taxa_pct: Number(p.taxa_pct || 0) }));

  // Permission gates — owners have all permissions; sub-users check their role
  // Initialized to true (owners); onMount overwrites for sub-users after loading permissions from API
  let canVender = true;
  let canReceber = true;
  let canDesconto = true;
  let canCancelar = true;
  let canAbrirCaixa = true;
  let canMovimentarCaixa = true;

  $: pdvReceiveHint = !canVender
    ? 'Seu perfil não tem permissão para registrar vendas.'
    : !canReceber
      ? 'Seu perfil não tem permissão para receber pagamentos.'
      : comanda.length === 0
        ? 'Adicione um item à comanda para liberar o recebimento.'
        : '';

  // Atalho: '/' foca a busca quando o modal de pagamento não está aberto e o usuário não está digitando em um campo
  function onKeyGlobal(e) {
    try {
      const tag = (e.target?.tagName || '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
      if (!modalPagamentoAberto && !isTyping && e.key === '/') {
        e.preventDefault();
        if (buscaInputEl && typeof buscaInputEl.focus === 'function') buscaInputEl.focus();
      }
      // Atalhos do Design System Zelo (F2 busca, F4 item avulso, F9 receber) — só na superfície nova
      if ($zeloSurface && ['F2', 'F4', 'F9'].includes(e.key)) {
        const algumModalAberto = modalPagamentoAberto || modalValorAberto || modalQuantidadeAberto || modalMovCaixaAberto
          || modalAbrirCaixaAberto || modalSucessoAberto || modalProdutoMontavelAberto || modalNovoProdutoAberto;
        if (!algumModalAberto) {
          e.preventDefault();
          if (e.key === 'F2') buscaInputEl?.focus?.();
          if (e.key === 'F4') modalValorAberto = true;
          if (e.key === 'F9' && comanda.length > 0 && canVender && canReceber) void abrirModalPagamento();
        }
      }
      // Ctrl+T: cicla entre tabelas de preço (igual ao sistema anterior do João)
      if (e.ctrlKey && e.key.toLowerCase() === 't' && tabelasPrecoAtivo) {
        e.preventDefault();
        tabelaAtiva = tabelaAtiva === 3 ? 1 : tabelaAtiva + 1;
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
      pessoasFiado = await readOperationalSnapshot('pessoas.fiado', async () => {
        const rows = [];
        for (let from = 0; ; from += 500) {
          const { data, error } = await supabase.from('pessoas').select('id, nome').eq('id_usuario', ownerUserId).order('nome').order('id').range(from, from + 499);
          if (error) throw error;
          rows.push(...data); if (data.length < 500) return rows;
        }
      });
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
  let abrindoCaixa = false;
  let idCaixaAberto = null;
  let numeroCaixaAberto = null;
  let saldoCaixa = 0; // saldo atual em dinheiro no caixa
  let carregandoSaldo = false;

  // Barreira de "conta nova sem caixa aberto": titular que nunca abriu um
  // caixa não vê o modal Abrir Caixa automaticamente no carregamento; a
  // barreira só aparece na hora de pagar. Ver src/lib/pdv/firstUseCaixaGate.js.
  // hasEverOpenedCaixa: false = detectado "nunca abriu" (count head em `caixas`);
  // true = já abriu alguma vez; null = desconhecido (falha, offline, subusuário
  // ou ainda não checado) — mantém o comportamento atual.
  let hasEverOpenedCaixa = null;
  // true enquanto aguardamos a abertura do caixa (disparada pela barreira de
  // pagamento) para então seguir automaticamente para o ModalPagamento.
  let pendingPaymentAfterCaixa = false;
  // Presentation only (zelo): true when the payment sheet is opening right after the caixa
  // sheet in the same first-use flow, so ModalPagamento can play a content-only blur-in
  // instead of its normal entrance. Reset in abrirModalPagamento() so it never leaks into
  // a payment opened any other way. Ver seguirParaPagamentoSePendente().
  let pagamentoContinuaDoCaixa = false;
  $: isFirstUseNoCaixa = computeIsFirstUseNoCaixa({ hasEverOpenedCaixa, isSubUser, caixaAberto });
  
  // Referência ao componente ModalPagamento
  let modalPagamentoRef;

  // --- 3. CARREGAMENTO DE DADOS ---

  // Efeito: quando o app monta, verifica sessão, caixa e carrega dados do PDV
  onMount(async () => {
    window.addEventListener('keydown', onKeyGlobal);
    window.addEventListener('online', handleSyncOnline);

    await waitAuthReady();
    // Bloqueio: exige assinatura ativa antes de carregar o PDV
    const authCtx = await ensureActiveSubscription({ requireProfile: true });
    if (!authCtx) return;
    ownerUserId = authCtx.ownerUserId;
    pdvCache.setUserId(ownerUserId);
    isSubUser = authCtx.isSubUser;
    operadorUserId = authCtx.userId;
    if (isSubUser) {
      const perms = authCtx.permissions || {};
      canVender = !!perms['pdv.vender']; canReceber = !!perms['pdv.receber']; canDesconto = !!perms['pdv.desconto'];
      canCancelar = !!perms['pdv.cancelar']; canAbrirCaixa = !!perms['caixa.abrir']; canMovimentarCaixa = !!perms['caixa.movimentar'];
      canGerenciarProdutos = !!perms['produtos.gerenciar'];
    }
    await startOfflineRuntime(authCtx);
    const draft = await readDraft(ownerUserId, operadorUserId, 'pdv').catch(() => null);
    if (draft?.items?.length) { comanda = draft.items; checkoutIntent = draft.intent || null; checkoutSubmission = draft.submission || null; }
    draftReady = true;
    unsubscribeOffline = onOfflineChange(() => { void refreshOfflineView(); });
    // Verifica login e carrega dados do PDV
    if (!supabase) {
      errorMessage = 'Configuração do Supabase ausente. Defina as variáveis no .env e reinicie.';
      return;
    }
    {
      await withTimeout(verificarCaixaAberto(ownerUserId));
      await withTimeout(carregarCategorias());
      await withTimeout(carregarProdutos());
      await withTimeout(carregarSubcategorias());
      await withTimeout(atualizarSaldoCaixa());
      loading = false;
      void refreshCatalogInBackground();
    }

    // Auth state changes são tratados pelo authStore.js e +layout.svelte centralmente
    // Removido listener duplicado que causava queries redundantes (otimização de performance)

    // [NEW] Carrega dados da empresa para recibos (WhatsApp/Impressão)
    try {
      if (ownerUserId) {
        dadosEmpresa = await readOperationalSnapshot('empresa.perfil', async () => {
        const { data, error } = await supabase
          .from('empresa_perfil')
          .select('id, nome_exibicao, documento, endereco, contato, logo_url, rodape_recibo, largura_bobina, tabelas_preco_ativo, tabela_preco_1_nome, tabela_preco_2_nome, tabela_preco_3_nome, plataformas_pagamento')
          .eq('user_id', ownerUserId)
          .single();
        if (error) throw error;
        return data;
        });
      }
    } catch (e) { console.error('Error fetching company profile:', e); }

    // Load sub-user permissions
    if (isSubUser) {
      // Sub-users start with no permissions; only grant what's explicitly allowed
      canVender = false; canReceber = false; canDesconto = false;
      canCancelar = false; canAbrirCaixa = false; canMovimentarCaixa = false;
      canGerenciarProdutos = false;
      try {
        const ctx = await getAccessContext();
        if (ctx?.permissions) {
          canVender = !!ctx.permissions['pdv.vender'];
          canReceber = !!ctx.permissions['pdv.receber'];
          canDesconto = !!ctx.permissions['pdv.desconto'];
          canCancelar = !!ctx.permissions['pdv.cancelar'];
          canAbrirCaixa = !!ctx.permissions['caixa.abrir'];
          canMovimentarCaixa = !!ctx.permissions['caixa.movimentar'];
          canGerenciarProdutos = !!ctx.permissions['produtos.gerenciar'];
        }
      } catch (e) { console.warn('[PDV] Failed to load permissions:', e?.message); }
    }

    // Estado inicial do contador de pendentes + retry periódico.
    // O evento `online` é pouco confiável em rede oscilante (dispara mas a rede
    // ainda está ruim), então tentamos reenviar de tempos em tempos enquanto
    // houver fila — não só quando o navegador acha que voltou.
    await atualizarPendentesCount();
    pendentesInterval = setInterval(() => {
      tentarSincronizarPendentes({ silencioso: true });
    }, 30000);

  });

  onDestroy(() => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onKeyGlobal);
        window.removeEventListener('online', handleSyncOnline);
      }
    if (pendentesInterval) clearInterval(pendentesInterval);
    unsubscribeOffline?.();
    if (timeoutHelperPrimeiroClick) clearTimeout(timeoutHelperPrimeiroClick);
    });

  /** Atualiza o contador de vendas aguardando sincronização. */
  async function atualizarPendentesCount() {
    const requestedOwner = ownerUserId;
    try {
      const pendingItems = await listarItensPizzaPendentes(requestedOwner);
      if (ownerUserId !== requestedOwner) return;
      pizzasPendentes = pendingItems;
      pizzaPendingOwner = requestedOwner;
    } catch { pizzaPendingOwner = null; }
    try {
      vendasPendentesCount = await contarVendasPendentes(ownerUserId);
      if (getOfflineContext()?.enabled) vendasPendentesCount += (await listOperations(ownerUserId)).filter(o => o.type === 'sale.create' && o.status !== 'acked').length;
      vendasSemTitularCount = isSubUser ? 0 : await contarVendasSemTitular();
    } catch {
      // contagem é só indicador; ignora falha
    }
  }

  async function verificarPendenciasAntigas() {
    if (verificandoPendenciasAntigas || isSubUser) return;
    verificandoPendenciasAntigas = true;
    try {
      const result = await recuperarVendasSemTitular(supabase, ownerUserId);
      resultadoPendenciasAntigas = result.recovered > 0
        ? `${result.recovered} venda(s) identificada(s) como desta loja e liberada(s) para sincronização.`
        : 'Não foi possível comprovar que essas pendências pertencem a esta loja.';
      if (result.unresolved > 0) {
        resultadoPendenciasAntigas += ' As demais continuam salvas. Procure o suporte neste computador; não limpe os dados do navegador.';
      }
    } catch {
      resultadoPendenciasAntigas = 'Não foi possível verificar agora. Conecte-se à internet e entre como titular. As vendas continuam salvas.';
    } finally {
      verificandoPendenciasAntigas = false;
      await atualizarPendentesCount();
    }
  }

  /**
   * Tenta sincronizar a fila offline. Reutilizado pelo evento `online`, pelo
   * retry periódico e pelo botão manual.
   * @param {{ silencioso?: boolean }} opts silencioso = sem toasts de "sincronizando"
   */
  async function tentarSincronizarPendentes({ silencioso = false } = {}) {
    if (getOfflineContext()?.enabled) { await runOfflineSync(); return; }
    if (sincronizandoPendentes) return;
    await atualizarPendentesCount();
    if (vendasPendentesCount === 0) return;
    // Sem rede declarada: não adianta tentar (evita ruído e timeouts).
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    sincronizandoPendentes = true;
    try {
      if (!silencioso) addToast('Sincronizando vendas pendentes...', 'info');
      const logs = await syncVendasPendentes(supabase, {
        ownerUserId,
        operatorUserId: operadorUserId
      });
      if (logs.success > 0) {
        addToast(`${logs.success} venda(s) sincronizada(s) com sucesso.`, 'success');
        pdvCache.invalidateProdutos();
        await carregarProdutos(true);
        await atualizarSaldoCaixa({ showLoading: false });
      } else if (!silencioso && logs.fail > 0) {
        addToast('Não foi possível sincronizar agora. Tentaremos novamente.', 'warning');
      }
    } finally {
      sincronizandoPendentes = false;
      await atualizarPendentesCount();
    }
  }

  /** Dispara quando o navegador sinaliza que a internet voltou. */
  async function handleSyncOnline() {
    await tentarSincronizarPendentes({ silencioso: false });
  }

  /**
   * Verifica no banco se há um caixa aberto (sem data_fechamento) para o usuário.
   * Seta flags locais para permitir/impedir finalizar vendas.
   */
  async function verificarCaixaAberto(userId) {
    const cached = await readSnapshot(userId, 'caixa.aberto').catch(() => null);
    if (getOfflineContext()?.enabled && cached) {
      caixaAberto = !cached.data_fechamento;
      idCaixaAberto = caixaAberto ? cached.id : null;
      numeroCaixaAberto = caixaAberto ? (cached.numero_caixa ?? null) : null;
      modalAbrirCaixaAberto = !caixaAberto;
      return;
    }
    // Verifica no Supabase se o usuário tem um caixa aberto (sem data_fechamento)
    const { data, error } = await supabase
      .from('caixas')
      .select('id, numero_caixa, data_abertura, data_fechamento, valor_inicial')
      .eq('id_usuario', userId)
      .is('data_fechamento', null)
      .order('data_abertura', { ascending: false })
      .limit(1);

    if (error) {
      if (isNetworkError(error) && cached && !cached.data_fechamento) {
        caixaAberto = true; idCaixaAberto = cached.id; numeroCaixaAberto = cached.numero_caixa ?? null; modalAbrirCaixaAberto = false; return;
      }
      console.error('[PDV] verificarCaixaAberto error:', error);
      addToast('Não foi possível verificar o caixa. Verifique sua conexão e tente novamente.', 'error');
      caixaAberto = false;
      modalAbrirCaixaAberto = true;
      idCaixaAberto = null;
      numeroCaixaAberto = null;
      return;
    }

    if (data && data.length > 0) {
      await saveSnapshot(userId, 'caixa.aberto', data[0]);
      caixaAberto = true;
      modalAbrirCaixaAberto = false;
      idCaixaAberto = data[0].id;
      numeroCaixaAberto = data[0].numero_caixa ?? null;
    } else {
      await saveSnapshot(userId, 'caixa.aberto', null);
      caixaAberto = false;
      idCaixaAberto = null;
      numeroCaixaAberto = null;
      await detectHasEverOpenedCaixa(userId);
      modalAbrirCaixaAberto = shouldAutoOpenCaixaModal({
        caixaAberto,
        isFirstUseNoCaixa: computeIsFirstUseNoCaixa({ hasEverOpenedCaixa, isSubUser, caixaAberto })
      });
    }
  }

  /**
   * "Conta nova" = titular que nunca abriu um caixa (zero linhas em `caixas`).
   * Consulta barata (count head); falha ou subusuário mantém hasEverOpenedCaixa
   * desconhecido (null), preservando o comportamento atual da barreira.
   */
  async function detectHasEverOpenedCaixa(userId) {
    if (isSubUser) return;
    try {
      const { count, error } = await supabase
        .from('caixas')
        .select('id', { count: 'exact', head: true })
        .eq('id_usuario', userId);
      if (error) return;
      hasEverOpenedCaixa = count !== 0;
    } catch {
      // desconhecido: mantém comportamento atual (hasEverOpenedCaixa = null)
    }
  }

  /** Atualiza o saldo de caixa (dinheiro) do caixa aberto. */
  let cashWarmup = null;
  let saldoRequestId = 0;
  function warmCashSnapshotCache() {
    if (cashWarmup) return cashWarmup;
    cashWarmup = loadCashSnapshot(supabase, ownerUserId, { timeoutMs: 8000 })
      .then(snapshot => { if (!snapshot.provisional) void markOfflineReadiness('cash'); })
      .catch(() => {})
      .finally(() => { cashWarmup = null; });
    return cashWarmup;
  }

  /**
   * @param {{ showLoading?: boolean }} [opts]
   * showLoading=false for background refreshes (offline notify / pós-venda) so
   * the header does not flicker Atualizar ↔ Sincronizando.
   */
  async function atualizarSaldoCaixa({ showLoading = true } = {}) {
    const requestId = ++saldoRequestId;
    try {
      if ((!caixaAberto || !idCaixaAberto) && !getOfflineContext()?.enabled) { saldoCaixa = 0; return; }
      if (showLoading && requestId === saldoRequestId) carregandoSaldo = true;
      if (getOfflineContext()?.enabled) {
        const snapshot = await loadCashSnapshot(supabase, ownerUserId);
        if (requestId !== saldoRequestId) return;
        if (!salvandoVenda && !checkoutSubmission) {
          caixaAberto = !!snapshot.caixa && !snapshot.caixa.data_fechamento;
          idCaixaAberto = caixaAberto ? snapshot.caixa.id : null;
          numeroCaixaAberto = caixaAberto ? (snapshot.caixa.numero_caixa ?? null) : null;
          modalAbrirCaixaAberto = shouldAutoOpenCaixaModal({
            caixaAberto,
            isFirstUseNoCaixa: computeIsFirstUseNoCaixa({ hasEverOpenedCaixa, isSubUser, caixaAberto })
          });
        }
        const payments = calculatePaymentSummary(snapshot.vendas, snapshot.pagamentos);
        const movements = calculateMovementSummary(snapshot.movs);
        saldoCaixa = calculateExpectedDrawer({ valorInicial: snapshot.caixa?.valor_inicial || 0, dinheiroLiquido: payments.dinheiro, sangria: movements.sangria, suprimento: movements.suprimento });
        return;
      }
      // Keeps the full cash snapshot warm in the background so this device
      // qualifies for offline operation without ever running "Preparar este
      // aparelho". loadCashSnapshot has its own 15s reuse window, so this
      // does not add a request on every call, and never blocks the numbers
      // below, which stay on the existing lightweight query.
      if (idCaixaAberto) void warmCashSnapshotCache();
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
      if (requestId !== saldoRequestId) return;
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
      if (requestId !== saldoRequestId) return;
      saldoCaixa = valorInicial + dinheiroLegacy + dinheiroMultiplo - totalSangria + totalSuprimento;
    } catch (err) {
      console.warn('Falha ao atualizar saldo do caixa:', err?.message || err); // Keep log for debug, maybe toast if critical? Let's keep log for background update.
    } finally {
      if (requestId === saldoRequestId) carregandoSaldo = false;
    }
  }
  /** Carrega categorias ordenadas e define a primeira como ativa. Usa cache de 5 min. */
  async function carregarCategorias(forceRefresh = false) {
    try {
      if (!forceRefresh) {
        const local = await buscarCategoriasLocal(ownerUserId);
        if (local.length) { categorias = local; categoriaAtiva ||= local[0].id; return; }
      }
      const data = await pdvCache.getCategorias(forceRefresh);
      categorias = data;
      atualizarCacheCategorias(data, ownerUserId).catch((e) => console.warn('Falha ao cachear categorias offline:', e));
      // Seleciona a primeira categoria automaticamente se nenhuma estiver ativa
      if (categorias.length > 0 && !categoriaAtiva) {
        categoriaAtiva = categorias[0].id;
      }
    } catch (err) {
      // Erro de rede: tenta o cache local antes de desistir.
      const local = isNetworkError(err) ? await buscarCategoriasLocal(ownerUserId).catch(() => []) : [];
      if (local.length) {
        categorias = local;
        if (!categoriaAtiva) categoriaAtiva = categorias[0].id;
      } else {
        categorias = [];
        console.error('[PDV] carregarCategorias error:', err);
        errorMessage = 'Não foi possível carregar as categorias. Verifique sua conexão e tente novamente.';
      }
    }
  }

  /** Carrega subcategorias ordenadas. Usa cache de 5 min, com fallback IndexedDB. */
  async function carregarSubcategorias(forceRefresh = false) {
    try {
      if (!forceRefresh) {
        const local = await buscarSubcategoriasLocal(ownerUserId);
        if (local.length) { subcategorias = local; return; }
      }
      const data = await pdvCache.getSubcategorias(forceRefresh);
      subcategorias = data;
      atualizarCacheSubcategorias(data, ownerUserId).catch((e) => console.warn('Falha ao cachear subcategorias offline:', e));
    } catch (err) {
      const local = isNetworkError(err) ? await buscarSubcategoriasLocal(ownerUserId).catch(() => []) : [];
      subcategorias = local;
      if (!local.length) {
        console.error('[PDV] carregarSubcategorias error:', err);
        addToast('Não foi possível carregar as subcategorias. Verifique sua conexão e tente novamente.', 'error');
      }
    }
  }

  /** Carrega produtos visíveis no PDV, ordenados por nome. Usa cache de 5 min, com fallback IndexedDB. */
  async function carregarProdutos(forceRefresh = false) {
    try {
      if (!forceRefresh) {
        const local = await buscarProdutosLocal('', ownerUserId);
        if (local.length) {
          const included = await readSnapshot(ownerUserId, 'catalog.includedOperations') || [];
          produtos = projectStockProducts(local, await listOperations(ownerUserId), included);
          void markOfflineReadiness('catalog');
          return;
        }
      }
      const before = await listOperations(ownerUserId);
      const included = before.filter(o => o.status === 'acked').map(o => o.operationId);
      const data = await pdvCache.getProdutos(forceRefresh);
      const saved = await atualizarCatalogoOffline(data, ownerUserId, included, before.map(o => o.operationId));
      if (!saved) { const local = await buscarProdutosLocal('', ownerUserId); produtos = projectStockProducts(local, await listOperations(ownerUserId), await readSnapshot(ownerUserId, 'catalog.includedOperations') || []); return; }
      produtos = projectStockProducts(data, await listOperations(ownerUserId), included);
      // Every PDV visit already warms this cache; marking readiness here is
      // what lets a device qualify for offline operation with no setup screen.
      void markOfflineReadiness('catalog');
    } catch (err) {
      // Erro de rede no carregamento: não deixa a tela sem produtos se há cache.
      const local = isNetworkError(err) ? await buscarProdutosLocal('', ownerUserId).catch(() => []) : [];
      produtos = local;
      if (!local.length) {
        console.error('[PDV] carregarProdutos error:', err);
        errorMessage = 'Não foi possível carregar os produtos. Verifique sua conexão e tente novamente.';
      }
    }
  }

  async function refreshCatalogInBackground() {
    if (catalogRefreshing || globalThis.navigator?.onLine === false || comanda.length || (await listOperations(ownerUserId)).some(o => o.status !== 'acked')) return;
    catalogRefreshing = true;
    try { await Promise.all([carregarProdutos(true), carregarCategorias(true), carregarSubcategorias(true)]); }
    finally { catalogRefreshing = false; }
  }

  async function refreshOfflineView() {
    if (refreshingOfflineView || !draftReady || !getOfflineContext()?.enabled) return;
    refreshingOfflineView = true;
    try {
      await atualizarPendentesCount();
      // Prepared devices stay `enabled` while online. Bootstrap probes and
      // count refreshes notify often; a full catalog/cash reload on every
      // notify made the header flicker Atualizar ↔ Sincronizando even with
      // a healthy connection. Only rebuild the local projection when this
      // device is actually in an offline write turn (or truly offline).
      if (globalThis.navigator?.onLine !== false && !isOfflineWriteActive()) return;
      await Promise.all([carregarProdutos(), atualizarSaldoCaixa({ showLoading: false })]);
    } finally {
      refreshingOfflineView = false;
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
  // Diferencia o estado vazio de "conta sem nenhum produto cadastrado" do de
  // "busca/filtro sem resultado" (VirtualProductGrid usa isso para a copy).
  $: hasAnyProducts = produtos.length > 0;

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
  // Derivados usados pelo layout do Design System Zelo
  $: itensNaComanda = comanda.reduce((acc, i) => acc + Number(i.quantidade || 0), 0);
  $: qtyPorProduto = comanda.reduce((acc, i) => {
    if (i.id_produto != null) acc[i.id_produto] = (acc[i.id_produto] || 0) + Number(i.quantidade || 0);
    return acc;
  }, {});
  $: contagemPorCategoria = produtos.reduce((acc, p) => {
    acc[p.id_categoria] = (acc[p.id_categoria] || 0) + 1;
    return acc;
  }, {});
  // Retirada zera a taxa (o layout novo usa bind no seletor; o antigo zerava no clique)
  $: if (tipoPedido !== 'delivery' && Number(taxaEntregaInput)) taxaEntregaInput = 0;

  $: totalComandaComEntrega = Number(totalComanda) + (tipoPedido === 'delivery' ? Number(taxaEntregaInput || 0) : 0);

  function persistCart(items, intent, submission) {
    const draft = structuredClone({ items, intent, submission });
    const owner = ownerUserId, operator = operadorUserId;
    draftPersisting = draftPersisting.catch(() => {}).then(() => saveDraft(owner, operator, 'pdv', draft));
    draftPersisting.catch(() => { errorMessage = 'Não foi possível salvar o rascunho neste aparelho.'; });
  }
  $: if (draftReady && !modalSucessoAberto) persistCart(comanda, checkoutIntent, checkoutSubmission);

  /**
   * Adiciona um produto na comanda.
   * Esta função decide qual fluxo seguir (Normal, Quantidade ou Valor).
   */
  /** Decide qual fluxo usar ao clicar num produto (quantidade para por-unidade, valor avulso, ou normal). */
  function adicionarProduto(produto) {
    if (checkoutSubmission || salvandoVenda) { addToast('Finalize a confirmação pendente antes de alterar esta venda.', 'info'); return; }
    if (shouldBlockAddToCart({ caixaAberto, isFirstUseNoCaixa })) {
      modalAbrirCaixaAberto = true;
      return;
    }

    if (produto?.tipo_produto === 'pizza' || hasActiveModifierGroups(produto?.modifierGroups)) {
      pizzaEditItem = null;
      produtoMontavelSelecionado = produto;
      modalProdutoMontavelAberto = true;
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
      const qtdAtual = comanda
        .filter((i) => i.id_produto === produto.id)
        .reduce((acc, i) => acc + i.quantidade, 0);
      const disponivel = estoqueDisponivel(produto);
      if (qtdAtual + 1 > disponivel) {
        addToast(`Estoque insuficiente para "${produto.nome}". Restam ${disponivel} unidade(s).`, 'error');
        return;
      }
    }
    adicionarItemNaComanda(produto, 1, getPrecoTabela(produto, tabelaAtiva));
  }

  /**
   * Ação final dos modais ou do clique normal.
   * Adiciona ou incrementa o item na comanda.
   */
  /**
   * Adiciona (ou incrementa) um item na comanda.
   * Aceita itens de banco (com id) ou avulsos (sem id).
   */
  function adicionarItemNaComanda(item, qtd, preco, selectedOptions = null, modifiers = null, pizza = null) {
    if (checkoutSubmission || salvandoVenda) return;
    // Chave inclui o preço: trocar de tabela cria linha nova em vez de
    // incrementar a linha do preço antigo.
    const idUnico = item.id != null
      ? `${buildCartItemKey(item.id, selectedOptions)}::pizza:${buildPizzaSignature(pizza)}::notes:${JSON.stringify(pizza?.notes || '')}::price:${Number(preco).toFixed(2)}`
      : Date.now();

    const itemExistente = comanda.find((i) => i.id === idUnico);

    if (itemExistente) {
      itemExistente.quantidade += qtd;
      comanda = [...comanda];
    } else {
      comanda = [
        ...comanda,
        {
          id: idUnico,
          id_produto: item.id || null,
          nome: item.nome,
          preco: preco,
          quantidade: qtd,
          ...(pizza ? { pizza } : {}),
          ...(selectedOptions?.length ? { selectedOptions } : {}),
          ...(modifiers?.length ? { modifiers, resumoMontagem: formatSelectedModifierGroups(modifiers) } : {})
        },
      ];
    }

    modalValorAberto = false;
  }

  // Funções dos botões + e - da comanda
  /** Incrementa a quantidade de um item da comanda. */
  function incrementarItem(id) {
    if (checkoutSubmission || salvandoVenda) return;
    const item = comanda.find((i) => i.id === id);
    if (item) {
      // Regra de estoque: soma todas as linhas do mesmo produto (tabelas distintas).
      if (item.pizza) {
        if (!validarEstoqueMontagem([...comanda, { ...item, quantidade: 1 }])) return;
      } else if (item.id_produto) {
        const prod = produtos.find((p) => p.id === item.id_produto);
        if (produtoControlaEstoque(prod)) {
          const disponivel = estoqueDisponivel(prod);
          const qtdTotal = comanda
            .filter((i) => i.id_produto === item.id_produto)
            .reduce((acc, i) => acc + i.quantidade, 0);
          if ((qtdTotal + 1) > disponivel) {
            addToast(`Estoque insuficiente para "${item.nome}". Restam ${disponivel} unidade(s).`, 'error');
            return;
          }
        }
      }
      item.quantidade++;
      comanda = [...comanda];
    }
  }

  function validarEstoqueMontagem(itens) {
    if (pizzaPendingOwner !== ownerUserId) {
      addToast('Não foi possível conferir as pizzas pendentes neste dispositivo. Reabra o PDV antes de vender.', 'error');
      return false;
    }
    const allProducts = [...produtos, ...produtos.flatMap((product) => product.pizzaStockProducts || [])];
    const insufficient = somarQuantidadePorEstoque([...pizzasPendentes, ...itens], allProducts).find((stock) => stock.quantidade > stock.disponivel);
    if (!insufficient) return true;
    addToast(`Estoque insuficiente para "${insufficient.nome}". Restam ${insufficient.disponivel} unidade(s).`, 'error');
    return false;
  }

  function editarPizza(item) {
    if (checkoutSubmission || salvandoVenda) return;
    const product = produtos.find((candidate) => candidate.id === item.id_produto);
    if (!product?.pizza_config) { addToast('Atualize o catálogo para editar esta pizza.', 'error'); return; }
    pizzaEditItem = item;
    produtoMontavelSelecionado = product;
    modalProdutoMontavelAberto = true;
  }

  /** Decrementa a quantidade; remove o item se chegar a zero. */
  function decrementarItem(id) {
    if (checkoutSubmission || salvandoVenda) return;
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
  
  /** Remove a linha inteira da comanda (mesmas travas do decremento). */
  function removerItem(id) {
    if (checkoutSubmission || salvandoVenda) return;
    comanda = comanda.filter((i) => i.id !== id);
  }

  /** Limpa toda a comanda mediante confirmação. */
  async function limparComanda() {
    if (checkoutSubmission || salvandoVenda) { addToast('Finalize a confirmação pendente antes de limpar esta venda.', 'info'); return; }
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
        erroMovCaixa = `Valor maior que o saldo em caixa (${formatMoney(saldoCaixa)}).`;
        return;
      }
      salvandoMovCaixa = true;
      const id_usuario = ownerUserId;
      if (!id_usuario) {
        throw new Error('Sessão inválida. Faça login novamente.');
      }
      // Persiste a movimentação de caixa
      let data;
      if (isOfflineWriteActive()) {
        const op = await submitOfflineOperation('caixa.move', idCaixaAberto, {
          id_caixa: idCaixaAberto, tipo: tipoMovCaixa === 'saida' ? 'sangria' : 'suprimento', valor: v, motivo: motivoMovCaixa || null
        }, { dependencies: (await listOperations(ownerUserId)).filter(o => o.type === 'caixa.open' && o.entityId === String(idCaixaAberto)).map(o => o.operationId) });
        data = { id: op.operationId, created_at: op.occurredAt };
      } else {
      const response = await supabase
        .from('caixa_movimentacoes')
        .insert({
          id_caixa: idCaixaAberto,
          id_usuario,
          id_operador: operadorUserId,
          tipo: tipoMovCaixa === 'saida' ? 'sangria' : 'suprimento',
          valor: v,
          motivo: motivoMovCaixa || null
        })
        .select('id, created_at')
        .single();
      if (response.error) throw new Error(response.error.message);
      data = response.data;
      }

      // Sucesso: recibo opcional
      const movInfo = {
        idMov: data?.id,
        idCaixa: idCaixaAberto,
        numeroCaixa: numeroCaixaAberto,
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
      if (isSubUser) {
        logAuditAction({ ownerUserId, action: 'caixa.movimentado', entityType: 'caixa_movimentacao', entityId: data?.id ? String(data.id) : null, details: { tipo: tipoMovCaixa, valor: v } });
      }
      addToast('Movimentação registrada com sucesso.', 'success');
      await atualizarSaldoCaixa();
    } catch (e) {
      console.error('[PDV] registrarMovCaixa error:', e);
      erroMovCaixa = 'Não foi possível registrar a movimentação. Tente novamente.';
    } finally {
      salvandoMovCaixa = false;
    }
  }
  
  // --- 5. AÇÕES DOS MODAIS ---

  // Módulo 1.1 (Simplificado)
  /**
   * Abre um caixa com o troco inicial para o usuário autenticado.
   * Idempotente: se já houver caixa aberto (outra aba/dispositivo, retry
   * após falha de rede), adota o existente em vez de criar um duplicado.
   */
  async function handleAbrirCaixa() {
    if (abrindoCaixa) return;
    if (trocoInicialInput < 0) return;
    const id_usuario = ownerUserId;
    if (!id_usuario) {
      addToast('Sessão inválida. Faça login novamente.', 'error');
      return;
    }
    abrindoCaixa = true;
    try {
      if (isOfflineWriteActive()) {
        const existing = await readSnapshot(ownerUserId, 'caixa.aberto');
        if (existing && !existing.data_fechamento) {
          idCaixaAberto = existing.id;
          numeroCaixaAberto = existing.numero_caixa ?? null;
        } else {
          const id = crypto.randomUUID();
          const caixa = { id, data_abertura: new Date().toISOString(), data_fechamento: null, valor_inicial: Number(trocoInicialInput) };
          await submitOfflineOperation('caixa.open', id, { clientCaixaId: id, valor_inicial: caixa.valor_inicial }, { operationId: id, projection: { key: 'caixa.aberto', value: caixa } });
          idCaixaAberto = id;
          numeroCaixaAberto = null;
        }
        caixaAberto = true; modalAbrirCaixaAberto = false;
        await atualizarSaldoCaixa();
        seguirParaPagamentoSePendente();
        return;
      }
      const { caixa, jaExistia, error } = await abrirCaixaIdempotente(supabase, {
        ownerUserId: id_usuario,
        operadorUserId,
        valorInicial: Number(trocoInicialInput)
      });
      if (error || !caixa) {
        if (error) console.error('[PDV] abrirCaixaIdempotente error:', error);
        addToast('Não foi possível abrir o caixa. Verifique sua conexão e tente novamente.', 'error');
        return;
      }
      idCaixaAberto = caixa.id;
      numeroCaixaAberto = caixa.numero_caixa ?? null;
      caixaAberto = true;
      modalAbrirCaixaAberto = false;
      // This device just opened the till online: it becomes the primary
      // device for offline caixa turns, no manual designation needed.
      void claimPrimaryDevice();
      if (jaExistia) {
        addToast('Já havia um caixa aberto. Continuando nele.', 'info');
      } else if (isSubUser) {
        logAuditAction({ ownerUserId, action: 'caixa.aberto', entityType: 'caixa', entityId: String(caixa.id), details: { valor_inicial: Number(trocoInicialInput) } });
      }
      await atualizarSaldoCaixa();
      seguirParaPagamentoSePendente();
    } finally {
      abrindoCaixa = false;
    }
  }

  /**
   * Depois que o caixa abre (disparado pela barreira de pagamento de conta
   * nova em primeiro uso), segue automaticamente para o ModalPagamento com a
   * comanda intacta. Ver abrirModalPagamento().
   */
  function seguirParaPagamentoSePendente() {
    if (!pendingPaymentAfterCaixa) return;
    pendingPaymentAfterCaixa = false;
    pagamentoContinuaDoCaixa = true;
    modalPagamentoAberto = true;
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

    // Checagem de estoque levando em conta quantidade já na comanda (todas as tabelas)
    if (prod.id && produtoControlaEstoque(prod)) {
      const qtdAtual = comanda
        .filter((i) => i.id_produto === prod.id)
        .reduce((acc, i) => acc + i.quantidade, 0);
      const disponivel = estoqueDisponivel(prod);
      if (qtdInt + qtdAtual > disponivel) {
        addToast(`Estoque insuficiente para "${prod.nome}". Restam ${disponivel} unidade(s).`, 'error');
        return;
      }
    }

    adicionarItemNaComanda(prod, qtdInt, getPrecoTabela(prod, tabelaAtiva));
    // Reset/fechar modal
    modalQuantidadeAberto = false;
    produtoQuantidadeSelecionado = null;
    quantidadeInput = 1;
  }
  
  /**
   * Handler para o evento 'confirmar' do ModalPagamento.
   * Recebe os dados do modal e executa a persistência da venda.
   */
  async function handleVendaConfirmada(event) {
    if (salvandoVenda || modalSucessoAberto) return;
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
    if (salvandoVenda || modalSucessoAberto) return;
    salvandoVenda = true;
    try {
      if (!canVender || !canReceber) throw new Error('Seu cargo não tem permissão para registrar e receber esta venda.');
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
      if (getOfflineContext()?.enabled && !checkoutSubmission) {
        const stockError = validateLocalCartStock(comanda, produtos);
        if (stockError) { erroPagamento = stockError; return; }
      }
      if (!checkoutSubmission && comanda.some((item) => item.pizza) && !validarEstoqueMontagem(comanda)) { salvandoVenda = false; return; }

      // Validação de estoque (refresco em tempo real antes de inserir a venda)
      let freshStockMap = new Map();
      try {
        const idsProdutos = [...new Set(comanda.flatMap((item) => pizzaStockRequirements({ productId: item.id_produto, quantity: item.quantidade, pizza: item.pizza, modifiers: item.modifiers }).map((requirement) => requirement.id_produto)))];
        if (idsProdutos.length && !getOfflineContext()?.enabled && !checkoutSubmission) {
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
                ...it,
                ...mapInfo.get(it.id_produto),
                id_produto: it.id_produto,
                nome: mapInfo.get(it.id_produto)?.nome || it.nome,
                quantidade: extrairQuantidadeEfetiva(it)
              }));
            // Checa insuficiências
            const insuficientes = somarQuantidadePorEstoque(itensComInfo, prodsInfo)
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
      checkoutIntent ||= createClientSaleId();
      await draftPersisting;
      const candidate = buildVendaPayload({
        clientSaleId: checkoutIntent,
        createdAt: checkoutSubmission?.payload?.created_at || new Date().toISOString(),
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
        taxasPlataforma: taxasPlataformaVenda,
        operadorId: operadorUserId
      });
      candidate.formState = structuredClone({ items: comanda, formaPagamento, valorRecebido, multiPag, pagamentos, pessoaFiadoId, totalFinalVenda, valorDescontoVenda, descontoTipoVenda, tipoPedido, taxaEntregaInput, taxasPlataformaVenda });
      checkoutSubmission = selectCheckoutSubmission(candidate, checkoutSubmission);
      await draftPersisting;
      await saveDraft(ownerUserId, operadorUserId, 'pdv', { items: comanda, intent: checkoutIntent, submission: checkoutSubmission });
      const { payload, settlement } = checkoutSubmission;

      const insertForma = settlement.formaPagamento;
      const insertValorRecebido = settlement.valorRecebido;
      const insertValorTroco = settlement.valorTroco;

      // Tenta RPC atômica online; em caso de falha de rede, salva offline pra sync depois.
      let vendaId = null;
      let venda = null;
      let isOffline = false;

      if (isOfflineWriteActive()) {
        const pending = await listOperations(ownerUserId);
        const turn = pending.find(o => o.type === 'caixa.open' && o.entityId === String(idCaixaAberto));
        await submitOfflineOperation('sale.create', checkoutIntent, payload, {
          operationId: checkoutIntent,
          dependencies: turn ? [turn.operationId] : [],
          clearDraft: { operatorId: operadorUserId, key: 'pdv' }
        });
        isOffline = true;
        vendaId = checkoutIntent;
        venda = { numero_venda: `LOCAL-${checkoutIntent.slice(-8).toUpperCase()}` };
      } else try {
        const { data, error: rpcError } = await supabase.rpc('criar_venda_completa', {
          p_payload: payload
        });
        if (rpcError) throw rpcError;
        if (!data?.id) throw new Error('Servidor não confirmou a identificação da venda. Confira antes de repetir.');
        venda = { id: data?.id, numero_venda: data?.numero_venda };
        vendaId = venda.id;
      } catch (connErr) {
        if (!shouldQueueVendaOffline(connErr)) throw connErr;
        console.warn('Falha de conexão na RPC de venda, salvando offline:', connErr?.message || connErr);
        isOffline = true;
        if (getOfflineContext()?.enabled) {
          // A device prepared for offline operation owns one queue, not two:
          // sending this sale to the legacy queue would order it independently
          // of the caixa turn already sitting in the durable one.
          const pending = await listOperations(ownerUserId);
          const turn = pending.find(o => o.type === 'caixa.open' && o.entityId === String(idCaixaAberto));
          await submitOfflineOperation('sale.create', checkoutIntent, payload, {
            operationId: checkoutIntent,
            dependencies: turn ? [turn.operationId] : [],
            clearDraft: { operatorId: operadorUserId, key: 'pdv' }
          });
          vendaId = checkoutIntent;
          venda = { numero_venda: `LOCAL-${checkoutIntent.slice(-8).toUpperCase()}` };
        } else {
          await salvarVendaOffline({
            payload,
            createdAt: new Date().toISOString(),
            ownerUserId,
            operatorUserId: operadorUserId
          });
          vendaId = `offline-${Date.now()}`;
          await atualizarPendentesCount();
        }
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
      
      addToast(isOffline ? 'Venda salva neste aparelho.' : 'Venda realizada com sucesso!', 'success');
      
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
          await carregarProdutos();
          void atualizarSaldoCaixa({ showLoading: false });
      } else {
         pdvCache.invalidateProdutos();
         await carregarProdutos(true);
         await atualizarSaldoCaixa({ showLoading: false });
      }

    } catch (e) {
      console.error(e);
      if (!modalSucessoAberto && ['P0001', '42501', '23503', '23514', '22023'].includes(e?.code)) {
        checkoutSubmission = null; checkoutIntent = null;
      }
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
      checkoutIntent = null;
      checkoutSubmission = null;
      try { sessionStorage.removeItem('zelo_comanda'); } catch {}
      modalPagamentoRef?.resetState?.();
      // Reset local payment state
      formaPagamento = null;
      valorRecebido = 0;
      multiPag = false;
      pagamentos = [];
      tipoPedido = 'retirada';
      taxaEntregaInput = 0;
      showMobileCart = false;
      addToast('Pronto para próxima venda', 'info');
  }

  async function abrirModalPagamento() {
    // Reseta a continuidade visual do sheet Abrir caixa → Pagamento: só fica true quando
    // seguirParaPagamentoSePendente() acabou de defini-la, um instante antes de reabrir
    // este mesmo modal de pagamento por fora deste fluxo (Receber normal, retomada etc.).
    pagamentoContinuaDoCaixa = false;
    // Retomada de confirmação pendente: reload/outra sessão trouxe do rascunho
    // uma comanda travada com checkoutSubmission.formState (venda já enviada
    // para a RPC com confirmação incerta). Precisa reaproveitar exatamente o
    // mesmo payload — se a pessoa escolhesse um pagamento novo aqui,
    // selectCheckoutSubmission divergiria do candidate anterior e lançaria
    // "Há uma confirmação pendente...", travando a venda. Isso roda ANTES de
    // qualquer outra barreira, inclusive a de conta nova (isFirstUseNoCaixa):
    // uma venda pendente de confirmação nunca pode cair no fluxo de abrir caixa.
    if (checkoutSubmission?.formState && !salvandoVenda) {
      const restored = restoreCheckoutFormState(checkoutSubmission);
      if (restored) {
        comanda = restored.items;
        formaPagamento = restored.formaPagamento;
        valorRecebido = restored.valorRecebido;
        multiPag = restored.multiPag;
        pagamentos = restored.pagamentos;
        pessoaFiadoId = restored.pessoaFiadoId;
        totalFinalVenda = restored.totalFinalVenda;
        valorDescontoVenda = restored.valorDescontoVenda;
        descontoTipoVenda = restored.descontoTipoVenda;
        tipoPedido = restored.tipoPedido;
        taxaEntregaInput = restored.taxaEntregaInput;
        taxasPlataformaVenda = restored.taxasPlataformaVenda;
        idCaixaAberto = restored.idCaixaAberto;
        imprimirRecibo = restored.imprimirRecibo;
        modalPagamentoAberto = true;
        addToast('Retomando a confirmação com os dados salvos desta venda.', 'info');
        // O modal reseta seu próprio estado interno (inclusive `salvandoVenda`)
        // na reação a `open` — precisa existir e já ter processado essa reação
        // antes de forçarmos o estado de salvando, senão o reset o sobrescreve.
        await tick();
        modalPagamentoRef?.setSalvando?.(true);
        void confirmarVenda();
        return;
      }
    }
    if (comanda.length === 0) return;
    // Conta nova em primeiro uso: a barreira do caixa foi adiada até aqui.
    // Abre o Abrir Caixa e, quando ele fechar com sucesso (handleAbrirCaixa),
    // segue automaticamente para o pagamento com a comanda intacta. Para
    // qualquer outra conta este ramo nunca é alcançado (caixaAberto já é
    // true nesse ponto), então o comportamento delas não muda.
    if (isFirstUseNoCaixa && !caixaAberto) {
      pendingPaymentAfterCaixa = true;
      void capturePostHogEvent('pdv_first_use_caixa_prompted', { trigger: 'payment' });
      modalAbrirCaixaAberto = true;
      return;
    }
    modalPagamentoAberto = true;
  }

  // ── Cadastro rápido de produto (estado vazio da grade) ─────────────────────

  /** Abre o ModalNovoProduto a partir do CTA "+ Cadastrar primeiro produto" do estado vazio. */
  function abrirModalNovoProdutoRapido() {
    if (!canGerenciarProdutos) return;
    modalNovoProdutoAberto = true;
  }

  function fecharHelperPrimeiroClick() {
    if (timeoutHelperPrimeiroClick) clearTimeout(timeoutHelperPrimeiroClick);
    timeoutHelperPrimeiroClick = null;
    mostrarHelperPrimeiroClick = false;
    helperPrimeiroClickProdutoId = null;
  }

  /** Depois que o ModalNovoProduto cria o produto: recarrega o catálogo do PDV e fecha o modal. */
  async function produtoRapidoCriado(event) {
    // event.detail é o produto criado (spread) + categoriaCriada ({id, nome} ou null)
    // quando o ModalNovoProduto também criou uma categoria nova no mesmo submit.
    const { categoriaCriada, ...createdProduct } = event.detail;
    const eraEstadoVazio = produtos.length === 0;
    modalNovoProdutoAberto = false;
    void capturePostHogEvent('pdv_quick_product_created', { was_first_product: eraEstadoVazio });
    // ModalNovoProduto.svelte já invalidou o pdvCache de produtos (e de categorias,
    // se aplicável) antes de disparar 'created'.
    if (categoriaCriada) {
      // Força refresh (ignora cache/local) para a aba da categoria nova aparecer.
      await carregarCategorias(true);
    }
    await carregarProdutos(true);
    // Garante que o produto recém-criado fique visível na grade (categoria/subcategoria/busca ativas).
    busca = '';
    if (createdProduct?.id_categoria != null) categoriaAtiva = createdProduct.id_categoria;

    // Se era o primeiro produto (estado vazio), destaca o tile e cola a dica nele.
    const createdId = createdProduct?.id ?? produtos[0]?.id ?? null;
    if (eraEstadoVazio && isFirstUseNoCaixa && createdId != null) {
      if (timeoutHelperPrimeiroClick) clearTimeout(timeoutHelperPrimeiroClick);
      helperPrimeiroClickProdutoId = createdId;
      mostrarHelperPrimeiroClick = true;
      timeoutHelperPrimeiroClick = setTimeout(() => {
        fecharHelperPrimeiroClick();
      }, 8000);
    }
  }

  // ── Helpers compartilhados de perfil ──────────────────────────────────────

  async function fetchPerfil() {
    const race = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r({ __timeout: true }), ms))]);
    try {
      const userId = ownerUserId;
      if (!userId) return null;
      const perfilRes = await race(
        supabase
          .from('empresa_perfil')
          .select('id, nome_exibicao, documento, endereco, contato, logo_url, rodape_recibo, largura_bobina')
          .eq('user_id', userId)
          .limit(1)
          .single(),
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
      largura_bobina: perfil?.largura_bobina || '80mm',
      rodape_recibo: perfil?.rodape_recibo || 'Obrigado pela preferência!',
      logoUrl: perfil?.logoUrl || null,
    };
  }

  // ── Impressão de venda ─────────────────────────────────────────────────────

  async function imprimirReciboVenda({ idVenda, numeroVenda, formaPagamento, total, subtotal, desconto = 0, valorRecebido, troco, itens, pagamentos, taxaEntrega = 0, tipoPedido: tipoPed = 'retirada' }) {
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
      venda: { idVenda, numeroVenda, formaPagamento, total, subtotal: subtotal ?? total, desconto, taxaEntrega, tipoPedido: tipoPed, valorRecebido, troco, itens, pagamentos: pags },
    });
  }

  // ── Impressão de movimentação de caixa ────────────────────────────────────

  async function imprimirReciboMovCaixa({ idMov, idCaixa, numeroCaixa, tipo, valor, motivo, created_at }) {
    const perfil = await fetchPerfil();
    const estabelecimento = perfilToEstabelecimento(perfil);
    await printMovCaixa({ estabelecimento, mov: { idMov, idCaixa, numeroCaixa: numeroCaixa ?? numeroCaixaAberto, tipo, valor, motivo, created_at } });
  }

</script>

<!-- --- 6a. LAYOUT — Zelo Design System (superfície app; mockup aprovado: docs/design-system/reference/zelopdv-app-light.html) --- -->
{#if $zeloSurface}
<div class="fc">
  <main class="fc-main">
    <div class="fc-mhead" data-surface="brand">
      <span class="fc-mhead-mark" aria-hidden="true"><ZeloMark size={22} /></span>
      <div class="fc-mhead-title">
        <p>Frente de Caixa</p>
        <span>{$companyNameStore || 'Zelo PDV'}{#if caixaAberto && numeroCaixaAberto} · Caixa #{numeroCaixaAberto}{/if}</span>
      </div>
      <button type="button" class="fc-mhead-cash" on:click={() => atualizarSaldoCaixa()} aria-label="Saldo do caixa: {formatMoney(saldoCaixa)}. Toque para atualizar">
        <span class="fc-mhead-dot" class:off={!caixaAberto} aria-hidden="true"></span>{formatMoneyNumber(saldoCaixa)}
      </button>
    </div>
    <div class="fc-body">
    <header class="fc-top">
      <div class="fc-title">
        <p class="fc-crumb">PDV / Frente de Caixa</p>
        <h1>Frente de Caixa</h1>
      </div>
      <div class="fc-status">
        {#if vendasPendentesCount > 0}
          <StatusPill tone="warn">
            <CloudUpload size={16} strokeWidth={1.75} aria-hidden="true" />
            {vendasPendentesCount} venda{vendasPendentesCount > 1 ? 's' : ''} offline
            <button type="button" class="fc-link" on:click={() => tentarSincronizarPendentes({ silencioso: false })} disabled={sincronizandoPendentes} title="Vendas registradas offline aguardando envio ao servidor">
              {sincronizandoPendentes ? 'Enviando…' : 'Sincronizar'}
            </button>
          </StatusPill>
        {/if}
        <StatusPill dot={caixaAberto} tone={caixaAberto ? 'neutral' : 'warn'}>
          {#if caixaAberto}Caixa{#if numeroCaixaAberto}&nbsp;<b class="fc-num">#{numeroCaixaAberto}</b>{/if} aberto{:else}Caixa fechado{/if}
          <span class="fc-sep" aria-hidden="true"></span>
          <MoneyText value={saldoCaixa} size="sm" class="fc-saldo" />
          <button type="button" class="fc-refresh" on:click={() => atualizarSaldoCaixa()} disabled={carregandoSaldo} aria-label="Atualizar saldo do caixa" title="Atualizar saldo">
            <RefreshCw size={14} strokeWidth={1.75} class={carregandoSaldo ? 'fc-spin' : ''} />
          </button>
        </StatusPill>
      </div>
    </header>

    {#if !canMovimentarCaixa}
      <InlineHelper id="pdv-top-movement-hint" compact message="Seu perfil não tem permissão para movimentar o caixa." />
    {/if}
    {#if !isSubUser && (vendasSemTitularCount > 0 || resultadoPendenciasAntigas)}
      <div class="fc-helper-row">
        <InlineHelper tone="warning" message={resultadoPendenciasAntigas || 'Há vendas antigas neste navegador sem loja identificada. Elas continuam salvas. Verifique a titularidade antes de sincronizar.'} />
        {#if vendasSemTitularCount > 0}
          <Button variant="outlined" size="md" onclick={verificarPendenciasAntigas} disabled={verificandoPendenciasAntigas}>
            {verificandoPendenciasAntigas ? 'Verificando…' : 'Verificar pendências antigas'}
          </Button>
        {/if}
      </div>
    {/if}

    {#if loading}
      <p class="fc-loading">Carregando produtos…</p>
    {:else}
      <div class="fc-tools">
        <div class="fc-search">
          <SearchField id="busca-prod" data-testid="product-search" placeholder="Buscar produto" shortcut="F2" bind:value={busca} bind:inputRef={buscaInputEl} autocomplete="off" />
        </div>
        {#if tabelasPrecoAtivo}
          <Segmented label="Tabela de preço (Ctrl+T)" size="lg" bind:value={tabelaAtiva} options={nomesTabelas.map((nome, i) => ({ value: i + 1, label: nome }))} class="fc-tabelas" />
        {/if}
        <Button variant="outlined" size="touch" data-testid="btn-avulso" aria-label="Item avulso" onclick={() => (modalValorAberto = true)}>
          <Plus strokeWidth={1.75} /><span class="fc-avulso-label">Item avulso</span><Kbd>F4</Kbd>
        </Button>
      </div>

      {#if categorias.length > 0}
        <UnderlineTabs label="Categorias" bind:value={categoriaAtiva} tabs={categorias.map((cat) => ({ value: cat.id, label: cat.nome, count: contagemPorCategoria[cat.id] || 0 }))} class="fc-cats" />
      {/if}
      {#if subcatsDaCat.length}
        <div class="fc-subcats" role="group" aria-label="Subcategorias">
          <button type="button" class:on={subcategoriaAtiva === null} on:click={() => (subcategoriaAtiva = null)}>Todas</button>
          {#each subcatsDaCat as sc (sc.id)}
            <button type="button" class:on={subcategoriaAtiva === sc.id} on:click={() => (subcategoriaAtiva = sc.id)}>{sc.nome}</button>
          {/each}
        </div>
      {/if}

      <div data-testid="product-grid" class="fc-grid">
        <VirtualProductGrid
          zelo
          cartQuantities={qtyPorProduto}
          produtos={produtosFiltrados}
          {hasAnyProducts}
          canCadastrarProduto={canGerenciarProdutos}
          tabelaAtiva={tabelaAtiva}
          coachmarkProductId={mostrarHelperPrimeiroClick ? helperPrimeiroClickProdutoId : null}
          on:produtoClick={(e) => adicionarProduto(e.detail)}
          on:coachmarkDismiss={fecharHelperPrimeiroClick}
          on:valorAvulsoClick={() => {
            if (!hasAnyProducts) void capturePostHogEvent('pdv_empty_state_cta_clicked', { cta: 'avulso' });
            modalValorAberto = true;
          }}
          on:cadastrarProdutoClick={() => {
            void capturePostHogEvent('pdv_empty_state_cta_clicked', { cta: 'cadastrar_produto' });
            abrirModalNovoProdutoRapido();
          }}
        />
      </div>
    {/if}
    </div>
  </main>

  <!-- Comanda: coluna fixa no desktop, sheet no mobile -->
  {#if showMobileCart}<button type="button" class="fc-scrim" aria-label="Fechar comanda" on:click={() => (showMobileCart = false)}></button>{/if}
  <aside data-testid="cart" class="fc-cart" class:open={showMobileCart} aria-label="Comanda">
    <span class="fc-handle" aria-hidden="true"></span>
    <div class="fc-cart-head">
      <div class="fc-cart-row">
        <h2>Comanda{#if itensNaComanda > 0}<span class="fc-count">{itensNaComanda} {itensNaComanda === 1 ? 'item' : 'itens'}</span>{/if}</h2>
        <button type="button" class="fc-icon-btn fc-mobile-only" aria-label="Fechar comanda" on:click={() => (showMobileCart = false)}><X size={18} strokeWidth={1.75} /></button>
      </div>
      <Segmented label="Tipo de pedido" size="lg" bind:value={tipoPedido} options={[{ value: 'retirada', label: 'Retirada', icon: ShoppingBag }, { value: 'delivery', label: 'Delivery', icon: Bike }]} class="fc-tipo" />
      {#if tipoPedido === 'delivery'}
        <label class="fc-taxa">
          <span>Taxa de entrega</span>
          <span class="fc-taxa-input"><small>R$</small><input id="taxa-entrega-input" type="number" min="0" step="0.01" inputmode="decimal" bind:value={taxaEntregaInput} placeholder="0,00" /></span>
        </label>
      {/if}
    </div>

    <div class="fc-items">
      <!-- the list stays mounted so the first and last line animate too (blurSwap is local to its block) -->
      {#if comanda.length === 0}
        <div class="fc-empty" in:blurSwap out:blurSwap>
          <ShoppingCart size={28} strokeWidth={1.5} aria-hidden="true" />
          <p>Toque em um produto para começar a venda</p>
        </div>
      {/if}
      <ul>
          {#each comanda as item (item.id)}
            <li class="fc-item" in:blurSwap={{ collapse: true }} out:blurSwap={{ collapse: true }}>
              <div class="fc-item-info">
                <p class="fc-item-name">{item.nome}</p>
                {#if item.resumoMontagem}<p class="fc-item-sub">{item.resumoMontagem}</p>{/if}
                {#if item.pizza}<button type="button" class="fc-link" on:click={() => editarPizza(item)}>Editar pizza</button>{/if}
                <p class="fc-item-unit">{formatMoney(item.preco)} × {item.quantidade}</p>
                <Stepper value={item.quantidade} label="Quantidade de {item.nome}" size="sm" ondecrement={() => decrementarItem(item.id)} onincrement={() => incrementarItem(item.id)} />
              </div>
              <div class="fc-item-side">
                <span class="fc-item-total">{formatMoney(item.preco * item.quantidade)}</span>
                <button type="button" class="fc-remove" on:click={() => removerItem(item.id)} aria-label="Remover {item.nome}">Remover</button>
              </div>
            </li>
          {/each}
        </ul>
    </div>

    <div class="fc-cart-foot">
      <div class="fc-line"><span>Subtotal · {itensNaComanda} {itensNaComanda === 1 ? 'item' : 'itens'}</span><span class="fc-num">{formatMoney(totalComanda)}</span></div>
      {#if tipoPedido === 'delivery' && Number(taxaEntregaInput) > 0}
        <div class="fc-line"><span>Taxa de entrega</span><span class="fc-num">+ {formatMoney(taxaEntregaInput)}</span></div>
      {/if}
      <div class="fc-total"><span>Total</span><MoneyText value={totalComandaComEntrega} size="lg" animate /></div>
      <div class="fc-acts">
        <Button variant="outlined" size="touch" onclick={abrirModalMovCaixa} disabled={!canMovimentarCaixa} aria-describedby={!canMovimentarCaixa ? 'pdv-action-movement-hint' : undefined}>
          <ArrowLeftRight strokeWidth={1.75} />Movimentar caixa
        </Button>
        <Button variant="danger" size="touch" onclick={limparComanda} disabled={!canCancelar || comanda.length === 0} aria-describedby={!canCancelar ? 'pdv-action-cancel-hint' : undefined}>
          <Trash2 strokeWidth={1.75} />Limpar
        </Button>
      </div>
      <Button variant="primary" size="cta" class="on-action" data-testid="btn-cobrar" disabled={comanda.length === 0 || !canVender || !canReceber} aria-describedby={pdvReceiveHint ? 'pdv-receive-hint' : undefined} onclick={abrirModalPagamento}>
        Receber<Kbd>F9</Kbd><MoneyText value={totalComandaComEntrega} class="fc-cta-total" animate />
      </Button>
      {#if !canMovimentarCaixa}<InlineHelper id="pdv-action-movement-hint" compact message="Seu perfil não tem permissão para movimentar o caixa." />{/if}
      {#if !canCancelar}<InlineHelper id="pdv-action-cancel-hint" compact message="Seu perfil não tem permissão para limpar a comanda." />{/if}
      {#if pdvReceiveHint}
        <InlineHelper id="pdv-receive-hint" compact message={pdvReceiveHint} />
      {:else}
        <p class="fc-hint">Dinheiro, Pix, cartão ou fiado · pagamento dividido</p>
      {/if}
    </div>
  </aside>

  <!-- Barra da comanda (mobile) -->
  {#if !showMobileCart && comanda.length > 0}
    <button type="button" class="fc-cartbar" in:rise out:rise on:click={() => (showMobileCart = true)}>
      <span class="fc-cartbar-count">{itensNaComanda}</span>
      <span class="fc-cartbar-label">Ver comanda<small>{tipoPedido === 'delivery' ? 'Delivery' : 'Retirada'} · {comanda.length} {comanda.length === 1 ? 'produto' : 'produtos'}</small></span>
      <MoneyText value={totalComandaComEntrega} class="fc-cartbar-total" animate />
      <span class="fc-cartbar-chev" aria-hidden="true"><ChevronUp size={20} strokeWidth={1.75} /></span>
    </button>
  {/if}
</div>
{:else}
<!-- --- 6. LAYOUT (HTML com Tailwind CSS) --- -->
<div class="flex flex-col h-full overflow-hidden">

<!-- Barra de status e Saldo integrada (Minimalista) -->
<div class="mx-4 mt-3 mb-2 px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg flex items-center justify-between">
  <div class="flex items-center gap-3">
    <div class="flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-md">
      <span class="text-xs text-slate-400 font-medium">Caixa:</span>
      <span class="text-green-400 font-bold tabular-nums">{formatMoney(saldoCaixa)}</span>
    </div>

    {#if vendasPendentesCount > 0}
      <button
        class="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-md text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-60 disabled:cursor-wait"
        on:click={() => tentarSincronizarPendentes({ silencioso: false })}
        disabled={sincronizandoPendentes}
        title="Vendas registradas offline aguardando envio ao servidor"
      >
        <span class="text-xs font-semibold">
          {vendasPendentesCount} venda{vendasPendentesCount > 1 ? 's' : ''} a sincronizar
        </span>
        <span class="text-[10px] uppercase tracking-wider font-bold">
          {sincronizandoPendentes ? 'Enviando...' : 'Sincronizar'}
        </span>
      </button>
    {/if}
  </div>

  <!-- Movimentação de Caixa — mobile only (on desktop it lives in the cart sidebar footer) -->
  <button
    class="md:hidden p-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 hover:text-white rounded-md border border-slate-700/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    on:click={() => modalMovCaixaAberto = true}
    disabled={!canMovimentarCaixa}
    aria-describedby={!canMovimentarCaixa ? 'pdv-top-movement-hint' : undefined}
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
{#if !canMovimentarCaixa}
  <div class="mx-4 mb-2">
    <InlineHelper id="pdv-top-movement-hint" compact message="Seu perfil não tem permissão para movimentar o caixa." />
  </div>
{/if}

{#if !isSubUser && (vendasSemTitularCount > 0 || resultadoPendenciasAntigas)}
  <div class="mx-4 mb-2 flex flex-wrap items-center gap-2">
    <InlineHelper tone="warning" message={resultadoPendenciasAntigas || 'Há vendas antigas neste navegador sem loja identificada. Elas continuam salvas. Verifique a titularidade antes de sincronizar.'} />
    {#if vendasSemTitularCount > 0}
      <button class="btn-secondary" on:click={verificarPendenciasAntigas} disabled={verificandoPendenciasAntigas}>
        {verificandoPendenciasAntigas ? 'Verificando...' : 'Verificar pendências antigas'}
      </button>
    {/if}
  </div>
{/if}

<!-- Fundo principal do PDV: Layout Responsivo -->
<!-- Desktop: flex-row (produtos + comanda). Sidebar agora vem do layout -->
<div class="flex flex-col md:flex-row w-full flex-1 bg-transparent overflow-hidden relative">

  <!-- Coluna Principal: Produtos (Main Content) -->
  <main class="flex-1 flex flex-col p-4 overflow-hidden pb-0">
    {#if loading}
      <p class="text-main">Carregando produtos...</p>
    {:else}
      <!-- Header: Título + Busca + Botão Avulso -->
      <div class="shrink-0 flex flex-col gap-3 mb-4">
        <div class="flex flex-col gap-4 border-b border-slate-800/70 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="text-[10px] font-bold uppercase tracking-[0.2em] mb-1" style="color: var(--text-muted);">Vendas / Frente de Caixa</p>
            <h1 class="text-xl font-bold text-slate-100 tracking-tight">Frente de Caixa</h1>
          </div>
          <div class="flex gap-2 flex-1 max-w-xl">
            <div class="flex-1">
              <input id="busca-prod" data-testid="product-search" type="text" class="input-form h-10 md:h-12" placeholder="Buscar produto..." bind:value={busca} bind:this={buscaInputEl} />
            </div>
            <button
              data-testid="btn-avulso"
              on:click={() => modalValorAberto = true}
              class="btn-primary h-10 md:h-12 px-3 md:px-4 flex items-center gap-2 whitespace-nowrap shadow-xs rounded-lg"
              style="background: var(--accent); color: white;"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              <span class="text-sm font-bold hidden md:inline">Novo Item Avulso</span>
            </button>
          </div>
        </div>

        {#if tabelasPrecoAtivo}
          <div class="flex items-center gap-4 overflow-x-auto pb-1 scrollbar-none">
            {#each nomesTabelas as nome, i}
              <button
                type="button"
                class="shrink-0 pb-1 text-xs font-semibold whitespace-nowrap transition-colors md:text-sm"
                style="
                  color: {tabelaAtiva === i + 1 ? 'var(--primary)' : 'var(--text-muted)'};
                  border-bottom: 1.5px solid {tabelaAtiva === i + 1 ? 'var(--primary)' : 'transparent'};
                "
                on:click={() => tabelaAtiva = i + 1}
              >{nome}</button>
            {/each}
          </div>
        {/if}

        {#if categorias.length > 0}
          <div class="flex items-center gap-6 overflow-x-auto pb-1 scrollbar-none border-b" style="border-color: var(--border-subtle);" role="tablist" aria-label="Categorias">
            {#each categorias as cat (cat.id)}
              <button
                data-testid="category-tab"
                type="button"
                role="tab"
                aria-selected={categoriaAtiva === cat.id}
                class="shrink-0 pb-2 font-semibold text-base transition-colors whitespace-nowrap relative"
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
        {/if}

        <!-- Subcategorias: Pills (quando existem) -->
        {#if subcatsDaCat.length}
          <div class="flex items-center gap-2 overflow-x-auto py-1 px-1 scrollbar-none">
            <button
              type="button"
              class="shrink-0 px-3 py-1.5 rounded-full font-medium text-xs transition-colors"
              style="
                background: {subcategoriaAtiva === null ? 'color-mix(in srgb, var(--primary) 16%, transparent)' : 'var(--bg-panel)'};
                color: {subcategoriaAtiva === null ? 'var(--primary)' : 'var(--text-muted)'};
                border: 1px solid {subcategoriaAtiva === null ? 'color-mix(in srgb, var(--primary) 40%, var(--border-subtle))' : 'var(--border-subtle)'};
              "
              on:click={() => subcategoriaAtiva = null}
            >
              Todas
            </button>
            {#each subcatsDaCat as sc (sc.id)}
              <button
                type="button"
                class="shrink-0 px-3 py-1.5 rounded-full font-medium text-xs transition-colors"
                style="
                  background: {subcategoriaAtiva === sc.id ? 'color-mix(in srgb, var(--primary) 16%, transparent)' : 'var(--bg-panel)'};
                  color: {subcategoriaAtiva === sc.id ? 'var(--primary)' : 'var(--text-muted)'};
                  border: 1px solid {subcategoriaAtiva === sc.id ? 'color-mix(in srgb, var(--primary) 40%, var(--border-subtle))' : 'var(--border-subtle)'};
                "
                on:click={() => subcategoriaAtiva = sc.id}
              >
                {sc.nome}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <div data-testid="product-grid" class="flex-1 flex flex-col min-h-0" style="position: relative;">
        <VirtualProductGrid
          produtos={produtosFiltrados}
          {hasAnyProducts}
          canCadastrarProduto={canGerenciarProdutos}
          tabelaAtiva={tabelaAtiva}
          coachmarkProductId={mostrarHelperPrimeiroClick ? helperPrimeiroClickProdutoId : null}
          on:produtoClick={(e) => adicionarProduto(e.detail)}
          on:coachmarkDismiss={fecharHelperPrimeiroClick}
          on:valorAvulsoClick={() => {
            if (!hasAnyProducts) void capturePostHogEvent('pdv_empty_state_cta_clicked', { cta: 'avulso' });
            modalValorAberto = true;
          }}
          on:cadastrarProdutoClick={() => {
            void capturePostHogEvent('pdv_empty_state_cta_clicked', { cta: 'cadastrar_produto' });
            abrirModalNovoProdutoRapido();
          }}
        />
      </div>
    {/if}
  </main>

  <!-- Coluna 3: Comanda (Desktop Sidebar / Mobile Drawer) -->
  <aside data-testid="cart" class="
    fixed inset-0 z-50 md:static md:z-auto
    bg-slate-900/95 md:bg-slate-900/90 backdrop-blur-md md:backdrop-blur-xs
    w-full md:w-96 
    flex flex-col 
    transition-transform duration-300 ease-in-out
    {showMobileCart ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}
    md:border md:border-slate-800 md:rounded-l-2xl md:shadow-2xl md:mr-0
  " style="bottom: var(--mobile-bottom-nav-offset);">
    <!-- Header Comanda (Mobile has close button) -->
    <div class="px-4 py-3 md:px-6 md:py-4 border-b border-slate-800 flex justify-between items-center">
      <h2 class="text-lg font-bold text-white uppercase tracking-widest">Comanda</h2>
      <!-- Mobile Close Button -->
      <button class="md:hidden p-2 text-slate-400" aria-label="Fechar comanda" on:click={() => showMobileCart = false}>
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
                {#if item.resumoMontagem}
                  <p class="text-[11px] text-sky-300 leading-snug mt-1">{item.resumoMontagem}</p>
                {/if}
                {#if item.pizza}<button type="button" class="pizza-edit" on:click={() => editarPizza(item)}>Editar pizza</button>{/if}
                <p class="text-[11px] text-slate-400 tabular-nums">{formatMoney(item.preco)}</p>
              </div>
              
              <div class="flex items-center gap-1 bg-slate-900/50 p-1 rounded-md border border-slate-700/50">
                <button
                  on:click={() => decrementarItem(item.id)}
                  aria-label="Diminuir quantidade"
                  class="w-11 h-11 md:w-10 md:h-10 flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 md:w-3.5 md:h-3.5"><path fill-rule="evenodd" d="M3 10a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 10z" clip-rule="evenodd" /></svg>
                </button>
                <span class="w-6 text-center text-sm md:text-xs font-bold text-slate-200">{item.quantidade}</span>
                <button
                  on:click={() => incrementarItem(item.id)}
                  aria-label="Aumentar quantidade"
                  class="w-11 h-11 md:w-10 md:h-10 flex items-center justify-center text-slate-400 hover:text-green-400 hover:bg-green-500/10 rounded-md transition-all"
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
        {#each [{ id: 'retirada', label: 'Retirada', icon: 'retirada' }, { id: 'delivery', label: 'Delivery', icon: 'delivery' }] as tipo}
          <button
            type="button"
            on:click={() => { tipoPedido = tipo.id; if (tipo.id !== 'delivery') taxaEntregaInput = 0; }}
            class="flex-1 px-2 py-1.5 rounded-full font-medium text-xs transition-colors border flex items-center justify-center gap-1 {tipoPedido === tipo.id ? 'bg-sky-600 text-white border-transparent' : 'bg-slate-800 text-slate-400 border-slate-700'}"
          >
            <svelte:component this={resolveAppIcon(tipo.icon)} class="size-3.5" aria-hidden="true" />
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
            class="flex-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-hidden focus:border-sky-500"
            placeholder="0,00"
          />
        </div>
      {/if}

      <div class="flex justify-between items-center px-1">
        <span class="text-xs text-slate-400 font-medium">Subtotal</span>
        <span class="text-sm font-bold text-slate-200 tabular-nums">{formatMoney(totalComanda)}</span>
      </div>
      {#if tipoPedido === 'delivery' && Number(taxaEntregaInput) > 0}
        <div class="flex justify-between items-center px-1">
          <span class="text-xs text-sky-400 font-medium">Taxa entrega</span>
          <span class="text-sm font-bold text-sky-400 tabular-nums">+ {formatMoney(taxaEntregaInput)}</span>
        </div>
      {/if}
      
      <!-- Botões de Ação -->
      <div class="grid grid-cols-4 gap-2">
        <!-- Movimentação (Sangria/Suprimento) -->
        <button
          on:click={() => modalMovCaixaAberto = true}
          disabled={!canMovimentarCaixa}
          aria-describedby={!canMovimentarCaixa ? 'pdv-action-movement-hint' : undefined}
          aria-label="Movimentação de caixa"
          class="col-span-1 h-12 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center border border-slate-700/50 disabled:opacity-40 disabled:cursor-not-allowed"
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
          aria-label="Limpar comanda"
          disabled={!canCancelar}
          aria-describedby={!canCancelar ? 'pdv-action-cancel-hint' : undefined}
          class="col-span-1 h-12 bg-slate-800 text-slate-300 rounded-lg hover:bg-red-900/20 hover:text-red-400 hover:border-red-900/30 transition-colors flex items-center justify-center border border-slate-700/50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </button>

        <!-- Botão Receber (Maior destaque) -->
        <button
          data-testid="btn-cobrar"
          disabled={comanda.length === 0 || !canVender || !canReceber}
          aria-describedby={pdvReceiveHint ? 'pdv-receive-hint' : undefined}
          on:click={abrirModalPagamento}
          class="col-span-2 h-12 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold rounded-lg shadow-lg shadow-green-900/20 text-sm uppercase tracking-wide transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <span>Receber</span>
          <span class="bg-black/20 px-2 py-0.5 rounded-sm text-xs tabular-nums">{formatMoney(totalComandaComEntrega)}</span>
        </button>
      </div>
      <div class="flex flex-col gap-1.5 mt-2">
        {#if !canMovimentarCaixa}
          <InlineHelper id="pdv-action-movement-hint" compact message="Seu perfil não tem permissão para movimentar o caixa." />
        {/if}
        {#if !canCancelar}
          <InlineHelper id="pdv-action-cancel-hint" compact message="Seu perfil não tem permissão para limpar a comanda." />
        {/if}
        {#if pdvReceiveHint}
          <InlineHelper id="pdv-receive-hint" compact message={pdvReceiveHint} />
        {/if}
      </div>
    </div>
  </aside>


  <!-- [NEW] Mobile Bottom Bar (Sticky) -->
  {#if !showMobileCart && comanda.length > 0}
    <div
      class="md:hidden fixed left-0 right-0 bg-slate-900 border-t border-slate-800 p-3 flex items-center justify-between z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)]"
      style="bottom: var(--mobile-bottom-nav-offset);"
    >
        <div class="flex flex-col">
            <span class="text-xs text-slate-400">{comanda.reduce((a,i)=>a+i.quantidade,0)} itens</span>
            <span class="text-lg font-bold text-white tabular-nums">{formatMoney(totalComanda)}</span>
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
{/if}

<!-- --- 7. MODAIS (Componentizados) --- -->

<!-- Modal: Abrir Caixa -->
<ModalAbrirCaixa
  open={modalAbrirCaixaAberto}
  busy={abrindoCaixa}
  beforePayment={pendingPaymentAfterCaixa}
  on:submit={async (e) => {
    if (!canAbrirCaixa) { addToast('Sem permissão para abrir caixa.', 'error'); return; }
    trocoInicialInput = e.detail.trocoInicial;
    await handleAbrirCaixa();
  }}
  on:close={() => { pendingPaymentAfterCaixa = false; }}
/>

<!-- Modal: Quantidade (produtos por unidade) -->
<ModalQuantidade
  open={modalQuantidadeAberto}
  produto={produtoQuantidadeSelecionado}
  on:confirm={(e) => {
    const { produto, quantidade } = e.detail;
    // Checagem de estoque (soma todas as tabelas no carrinho)
    if (produto?.id && produtoControlaEstoque(produto)) {
      const qtdAtual = comanda
        .filter((i) => i.id_produto === produto.id)
        .reduce((acc, i) => acc + i.quantidade, 0);
      const disponivel = estoqueDisponivel(produto);
      if (quantidade + qtdAtual > disponivel) {
        addToast(`Estoque insuficiente para "${produto.nome}". Restam ${disponivel} unidade(s).`, 'error');
        return;
      }
    }
    adicionarItemNaComanda(produto, quantidade, getPrecoTabela(produto, tabelaAtiva));
    modalQuantidadeAberto = false;
    produtoQuantidadeSelecionado = null;
  }}
  on:close={() => {
    modalQuantidadeAberto = false;
    produtoQuantidadeSelecionado = null;
  }}
/>

<ModalProdutoMontavel
  open={modalProdutoMontavelAberto}
  produto={produtoMontavelSelecionado}
  initialPizza={pizzaEditItem?.pizza || null}
  initialSelections={pizzaEditItem?.selectedOptions || []}
  editing={!!pizzaEditItem}
  precoBase={produtoMontavelSelecionado ? getPrecoTabela(produtoMontavelSelecionado, tabelaAtiva) : 0}
  on:confirm={(e) => {
    const { produto, preco, selectedOptions, modifiers, pizza } = e.detail;
    const nextModifiers = modifiers;
    const quantity = pizzaEditItem?.quantidade || 1;
    const otherItems = pizzaEditItem ? comanda.filter((item) => item.id !== pizzaEditItem.id) : comanda;
    if (pizza) {
      if (!validarEstoqueMontagem([...otherItems, { id_produto: produto.id, quantidade: quantity, pizza, modifiers }])) return;
    } else if (produto?.id && produtoControlaEstoque(produto)) {
      const qtdAtual = comanda
        .filter((i) => i.id_produto === produto.id)
        .reduce((acc, i) => acc + i.quantidade, 0);
      const disponivel = estoqueDisponivel(produto);
      if (qtdAtual + 1 > disponivel) {
        addToast(`Estoque insuficiente para "${produto.nome}". Restam ${disponivel} unidade(s).`, 'error');
        return;
      }
    }
    if (pizzaEditItem) comanda = otherItems;
    adicionarItemNaComanda(produto, quantity, preco, selectedOptions, nextModifiers, pizza);
    pizzaEditItem = null;
    modalProdutoMontavelAberto = false;
    produtoMontavelSelecionado = null;
  }}
  on:close={() => {
    modalProdutoMontavelAberto = false;
    produtoMontavelSelecionado = null;
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

<!-- Modal: Novo Produto (cadastro rápido a partir do estado vazio da grade) -->
<ModalNovoProduto
  open={modalNovoProdutoAberto}
  {ownerUserId}
  {categorias}
  {subcategorias}
  tabelasPreco={{ ativo: tabelasPrecoAtivo, nomes: nomesTabelas }}
  defaultCategoriaId={categoriaAtiva}
  compact
  on:close={() => { modalNovoProdutoAberto = false; }}
  on:created={produtoRapidoCriado}
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
  {plataformasAtivas}
  continuing={pagamentoContinuaDoCaixa}
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

<style>
  .pizza-edit { min-height: 44px; padding: .4rem .2rem; color: var(--primary); background: transparent; border: 0; font-size: .875rem; cursor: pointer; }
  .pizza-edit:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }


  /* ── Frente de Caixa · Zelo Design System (superfície app) ─────────────────
     Mockup aprovado: docs/design-system/reference/zelopdv-app-light.html.
     Só tokens (docs/DESIGN_SYSTEM.md → Regras de código). */
  .fc { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 384px; background: var(--bg-app); color: var(--text-main); font-family: var(--zelo-font-ui); }
  .fc-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .fc-body { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 0 24px; }
  .fc-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 84px; flex-wrap: wrap; flex: none; }
  .fc-crumb { margin: 0 0 6px; font: var(--type-eyebrow); letter-spacing: var(--type-eyebrow-tracking); text-transform: uppercase; color: var(--text-muted); white-space: nowrap; }
  .fc-top h1 { margin: 0; font: var(--type-title); letter-spacing: var(--type-title-tracking); white-space: nowrap; }
  .fc-status { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .fc-link { font-weight: 600; text-decoration: underline; text-underline-offset: 2px; color: inherit; }
  .fc-link:disabled { opacity: 0.6; }
  .fc-num { font-family: var(--zelo-font-num); font-variant-numeric: tabular-nums; font-weight: 500; color: var(--text-main); }
  .fc-sep { width: 1px; height: 14px; background: var(--border-subtle); }
  .fc :global(.fc-saldo) { color: var(--text-main); }
  .fc-refresh { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 6px; color: var(--text-muted); }
  .fc-refresh:hover { color: var(--text-main); background: var(--bg-sunken); }
  .fc :global(.fc-spin) { animation: fc-spin 900ms linear infinite; }
  @keyframes fc-spin { to { transform: rotate(360deg); } }
  .fc-helper-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; }
  .fc-loading { color: var(--text-muted); }
  .fc-tools { display: flex; align-items: center; gap: 10px; margin-top: 4px; flex: none; }
  .fc-search { flex: 1; min-width: 0; }
  .fc :global(.fc-cats) { margin-top: 18px; flex: none; }
  .fc-subcats { display: flex; gap: 8px; margin-top: 12px; overflow-x: auto; scrollbar-width: none; flex: none; }
  .fc-subcats button { height: 32px; padding: 0 12px; border-radius: var(--zelo-radius-pill); border: 1px solid var(--border-subtle); background: var(--bg-panel); color: var(--text-muted); font-size: 13px; font-weight: 500; white-space: nowrap; transition: background var(--zelo-dur-fast), color var(--zelo-dur-fast), border-color var(--zelo-dur-fast), transform var(--zelo-dur-slow) var(--zelo-ease-spring); }
  /* press squash (docs/DESIGN_SYSTEM.md → Movimento): quick in, springs back on release */
  .fc-subcats button:active, .fc-icon-btn:active, .fc-mhead-cash:active, .fc-cartbar:active { transform: scale(var(--zelo-press-scale)); transition-duration: var(--zelo-dur-fast); }
  .fc-subcats button.on { background: var(--primary); border-color: var(--primary); color: var(--primary-text); }
  .fc-subcats button:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--focus); }
  .fc-grid { flex: 1; min-height: 0; display: flex; flex-direction: column; padding-top: 16px; position: relative; }

  .fc-cart { display: flex; flex-direction: column; min-height: 0; background: var(--bg-panel); border-left: 1px solid var(--border-subtle); }
  .fc-handle { display: none; }
  .fc-cart-head { padding: 20px 20px 0; flex: none; }
  .fc-cart-row { display: flex; align-items: center; justify-content: space-between; }
  .fc-cart h2 { margin: 0; font: var(--type-heading); letter-spacing: var(--type-heading-tracking); display: flex; align-items: baseline; gap: 8px; }
  .fc-count { font: var(--type-num-sm); letter-spacing: var(--type-num-sm-tracking); font-variant-numeric: tabular-nums; color: var(--text-muted); }
  .fc-icon-btn { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; color: var(--text-label); background: var(--bg-sunken); transition: transform var(--zelo-dur-slow) var(--zelo-ease-spring); }
  .fc-mobile-only { display: none; }
  .fc :global(.fc-tipo) { display: flex; width: 100%; margin-top: 14px; }
  .fc-taxa { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; font-size: 13.5px; color: var(--text-label); }
  .fc-taxa-input { display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 12px; border-radius: var(--zelo-radius-control); border: 1px solid var(--border-subtle); background: var(--bg-input); }
  .fc-taxa-input:focus-within { border-color: var(--primary); box-shadow: 0 0 0 4px var(--focus); }
  .fc-taxa-input small { font-size: 11px; color: var(--text-muted); }
  .fc-taxa-input input { width: 88px; border: 0; outline: 0; background: none; text-align: right; font: var(--type-num-md); letter-spacing: var(--type-num-md-tracking); font-variant-numeric: tabular-nums; color: var(--text-main); }
  .fc-items { position: relative; flex: 1; min-height: 0; overflow-y: auto; padding: 8px 12px; }
  .fc-items ul { list-style: none; margin: 0; padding: 0; }
  .fc-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle); }
  .fc-item:last-child { border-bottom: 0; }
  .fc-item-info { min-width: 0; }
  .fc-item-name { margin: 0; font: var(--type-body-strong); letter-spacing: var(--type-body-strong-tracking); overflow-wrap: anywhere; }
  .fc-item-sub { margin: 2px 0 0; font: var(--type-caption); letter-spacing: var(--type-caption-tracking); color: var(--text-muted); }
  .fc-item-unit { margin: 2px 0 6px; font: var(--type-num-sm); letter-spacing: var(--type-num-sm-tracking); font-variant-numeric: tabular-nums; font-weight: 400; color: var(--text-muted); }
  .fc-item-side { display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end; }
  .fc-item-total { font: var(--type-num-md); letter-spacing: var(--type-num-md-tracking); font-variant-numeric: tabular-nums; }
  .fc-remove { font: var(--type-caption); letter-spacing: var(--type-caption-tracking); color: var(--text-muted); }
  .fc-remove:hover { color: var(--status-error-text); }
  .fc-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center; color: var(--text-muted); padding: 24px; }
  .fc-empty p { margin: 0; font: var(--type-caption); letter-spacing: var(--type-caption-tracking); max-width: 200px; }
  .fc-cart-foot { flex: none; padding: 16px 20px 20px; border-top: 1px solid var(--border-subtle); }
  .fc-line { display: flex; justify-content: space-between; align-items: center; height: 26px; font-size: 13.5px; color: var(--text-label); }
  .fc-total { display: flex; justify-content: space-between; align-items: baseline; margin: 10px 0 16px; }
  .fc-total > span:first-child { font-weight: 600; font-size: 14px; }
  .fc-acts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
  .fc-acts :global(button) { width: 100%; justify-content: center; }
  .fc :global(.fc-cta-total) { margin-left: auto; font-size: 19px; }
  .fc :global(.fc-cta-total small) { color: inherit; opacity: 0.72; }
  .fc-hint { margin: 10px 0 0; font: var(--type-caption); letter-spacing: var(--type-caption-tracking); color: var(--text-muted); text-align: center; }
  .fc-cart-foot :global([id^='pdv-']) { margin-top: 8px; }
  .fc-scrim, .fc-cartbar { display: none; }
  .fc-mhead { display: none; }

  @media (max-width: 767px) {
    .fc { grid-template-columns: minmax(0, 1fr); background: var(--zelo-navy); }
    .fc-body { padding: 0 16px; margin-top: -22px; border-radius: 22px 22px 0 0; background: var(--bg-app); position: relative; }
    /* navy header (mockup mobile): brand surface nested, content sheet overlaps it */
    .fc-mhead { display: flex; align-items: center; gap: 12px; padding: 14px 16px 36px; background: var(--bg-app); color: var(--text-main); }
    .fc-mhead-mark { width: 38px; height: 38px; flex: none; border-radius: 11px; display: grid; place-items: center; background: var(--bg-sunken); }
    .fc-mhead-title { min-width: 0; }
    .fc-mhead-title p { margin: 0; font: var(--type-heading); letter-spacing: var(--type-heading-tracking); }
    .fc-mhead-title span { display: block; margin-top: 2px; font: var(--type-caption); letter-spacing: var(--type-caption-tracking); color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fc-mhead-cash { margin-left: auto; flex: none; display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 11px; border-radius: var(--zelo-radius-pill); background: var(--bg-sunken); color: var(--text-main); font: var(--type-num-sm); letter-spacing: var(--type-num-sm-tracking); font-variant-numeric: tabular-nums; transition: transform var(--zelo-dur-slow) var(--zelo-ease-spring); }
    .fc-mhead-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--status-success-text); }
    .fc-mhead-dot.off { background: var(--status-warning-text); }
    .fc-top { display: none; }
    .fc-tools { flex-wrap: wrap; margin-top: 14px; }
    .fc-tools :global(.kbd), .fc-cart :global(.kbd), .fc-avulso-label { display: none; }
    .fc-search { flex-basis: 100%; }
    .fc :global(.fc-tabelas) { flex: 1; }
    .fc-cart { position: fixed; left: 0; right: 0; bottom: var(--mobile-bottom-nav-offset); top: 56px; z-index: 60; border-left: 0; border-radius: var(--zelo-radius-sheet) var(--zelo-radius-sheet) 0 0; box-shadow: var(--elevation-float); transform: translateY(105%); transition: transform var(--zelo-dur-slow) var(--zelo-ease-spring); }
    .fc-cart.open { transform: none; }
    .fc-handle { display: block; width: 40px; height: 5px; border-radius: 3px; background: var(--border-strong); margin: 9px auto 0; }
    .fc-cart-head { padding-top: 10px; }
    .fc-mobile-only { display: grid; }
    .fc-scrim { display: block; position: fixed; inset: 0; z-index: 55; background: color-mix(in srgb, var(--zelo-navy) 42%, transparent); }
    .fc-cartbar { display: flex; align-items: center; gap: 12px; position: fixed; left: 12px; right: 12px; bottom: calc(var(--mobile-bottom-nav-offset) + 12px); height: 62px; padding: 0 10px; border-radius: 18px; background: var(--primary); color: var(--primary-text); box-shadow: var(--elevation-float); z-index: 40; text-align: left; transition: transform var(--zelo-dur-slow) var(--zelo-ease-spring); }
    .fc-cartbar-count { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; background: color-mix(in srgb, var(--primary-text) 12%, transparent); font: var(--type-num-md); letter-spacing: var(--type-num-md-tracking); font-variant-numeric: tabular-nums; flex: none; }
    .fc-cartbar-label { font-weight: 600; font-size: 16px; white-space: nowrap; }
    .fc-cartbar-label small { display: block; font: var(--type-caption); letter-spacing: var(--type-caption-tracking); opacity: 0.62; margin-top: 2px; }
    .fc :global(.fc-cartbar-total) { margin-left: auto; font-size: 18px; white-space: nowrap; }
    .fc :global(.fc-cartbar-total small) { color: inherit; opacity: 0.72; }
    .fc-cartbar-chev { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: color-mix(in srgb, var(--primary-text) 12%, transparent); flex: none; }
  }
  @media (prefers-reduced-motion: reduce) { .fc-cart { transition: none; } .fc :global(.fc-spin) { animation: none; } }
</style>

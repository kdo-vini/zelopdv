<script>
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabaseClient';
  import { ensureActiveSubscription, hasOrderingReviewAccess, bounceSubUserMissingAddon } from '$lib/guards';
  import { hasPermission as hasAccessPermission } from '$lib/accessControl';
  import { pdvCache } from '$lib/stores/pdvCache';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import { getFriendlyErrorMessage } from '$lib/errorUtils';
  import { buildVendaPayload } from '$lib/finance/saleOps';
  import { printOrder } from '$lib/printService';
  import { detectZeloImpressao, getZeloImpressaoFriendlyMessage } from '$lib/zeloImpressaoClient.js';
  import { createPrintedOrderStore } from '$lib/orderAutoPrint.js';
  import {
    canonicalFulfillmentMode,
    canonicalPaymentMethod,
    isCanonicalOrderPermissionError,
    itemModifierGroups,
    subscribeCanonicalOrderUpdates,
    transitionCanonicalOrder,
    closeCanonicalOrder
  } from '$lib/onlineOrders';
  import { getOrderDeliveryPresentation, getOrderPaymentPresentation } from '$lib/orderPresentation.js';
  import {
    ifoodCanCancel,
    ifoodHandoffCodes,
    ifoodHasPendingCommand,
    ifoodIntentLabel,
    ifoodIntentPermission,
    ifoodScheduleState,
    ifoodUnmappedItemCount,
    ifoodWaitingLabel,
    isIfoodOrder,
    resolveQueueAdvance
  } from '$lib/orders/ifoodPresentation.js';
  import {
    fetchIfoodCancellationReasons,
    fetchIfoodSyncState,
    sendIfoodCommand
  } from '$lib/orders/ifoodCommandsClient.js';
  import { findNewArrivalOrders, playOrderArrivalChime, unlockOrderArrivalSound } from '$lib/orders/ifoodArrivalSound.js';
  import OrderSourceBadge from '$lib/components/orders/OrderSourceBadge.svelte';
  import IfoodSyncState from '$lib/components/orders/IfoodSyncState.svelte';
  import { CheckCircle2, CreditCard, MapPin, Printer, X } from 'lucide-svelte';
  import InlineHelper from '$lib/components/ui/InlineHelper.svelte';
  import ModalPedidoManual from '$lib/components/modals/ModalPedidoManual.svelte';
  import { startOfflineRuntime, onOfflineChange } from '$lib/offline/runtime.js';
  import { readSnapshot, saveSnapshot } from '$lib/offline/operations.js';
  import { loadLocalOrders, refreshOrderSnapshot } from '$lib/offline/orders.js';

  let manualOpen = false;
  let unsubscribeOffline = null;
  let queueUnavailable = false;

  let ready = false;
  let loading = true;
  let orderingReviewActive = false;
  let userId = '';
  let ownerUserId = '';
  let operadorUserId = '';
  let isSubUser = false;
  let canCancelOrders = true;
  let canReceiveOrders = true;
  let canKitchenOrders = true;
  // iFood: sanitized sync state per order id, live clock and cancellation dialog.
  let ifoodSync = {};
  let nowTick = Date.now();
  let clockTimer = null;
  let ifoodSyncTimer = null;
  let ifoodCancelOrder = null;
  let ifoodCancelReasons = [];
  let ifoodCancelCode = '';
  let ifoodCancelLoading = false;
  let ifoodCancelError = '';
  let ifoodVerifyOrder = null;
  let ifoodVerifyCode = '';
  let ifoodVerifyError = '';
  let ifoodSending = false;
  let filaBaselinePronta = false;
  let pedidos = [];
  let pedidoSelecionadoId = null;
  let dadosEmpresa = null;
  let idCaixaAberto = null;
  let fechandoPedido = false;
  let pollTimer = null;
  let printerStatusTimer = null;
  let realtimeRefreshTimer = null;
  let realtimeChannel = null;
  let printerStatusRequest = null;
  let printerConnected = false;
  let printedOrderStore = null;
  let reimprimindo = false;
  let polling = false;
  let recoveringOrderSession = false;
  let mobileDetailOpen = false;

  $: pedidoSelecionado = pedidos.find((p) => p.id === pedidoSelecionadoId) || pedidos[0] || null;
  $: itensSelecionados = (pedidoSelecionado?.pedido_itens || []).map((item) => ({
    id: item.id,
    id_produto: item.id_produto,
    nome: item.nome,
    preco: Number(item.preco_unitario || 0),
    quantidade: Number(item.quantidade || 0),
    modifierGroups: itemModifierGroups(item)
  }));
  $: totalPedido = Number(pedidoSelecionado?.total || 0);
  $: entregaSelecionada = getOrderDeliveryPresentation(pedidoSelecionado);
  $: pagamentoSelecionado = getOrderPaymentPresentation(pedidoSelecionado);
  $: selecionadoIfood = isIfoodOrder(pedidoSelecionado);
  $: syncSelecionado = pedidoSelecionado ? ifoodSync[pedidoSelecionado.id] || null : null;
  $: avancoSelecionado = pedidoSelecionado ? resolveQueueAdvance(pedidoSelecionado) : { kind: 'none' };
  $: codigosSelecionados = ifoodHandoffCodes(pedidoSelecionado);
  $: agendaSelecionada = ifoodScheduleState(pedidoSelecionado, nowTick);
  $: itensSemVinculo = ifoodUnmappedItemCount(pedidoSelecionado);
  $: ifoodComandoPendente = ifoodHasPendingCommand(syncSelecionado);
  $: ifoodIntentPermitido = avancoSelecionado.kind !== 'ifood_command' || ifoodPermissionAllowed(avancoSelecionado.intent);

  onMount(async () => {
    const auth = await ensureActiveSubscription({ requireProfile: true });
    if (!auth?.userId) return;

    userId = auth.userId;
    ownerUserId = auth.ownerUserId || auth.userId;
    operadorUserId = auth.userId;
    await startOfflineRuntime({ ...auth, ownerUserId });
    const unlockAudio = () => {
      void unlockOrderArrivalSound();
      window.removeEventListener('pointerdown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    isSubUser = auth.isSubUser;
    if (isSubUser && !(await hasAccessPermission('pedidos.acessar'))) {
      addToast('Seu cargo não tem acesso à fila de pedidos.', 'warning');
      goto('/app');
      return;
    }
    if (isSubUser) {
      [canCancelOrders, canReceiveOrders, canKitchenOrders] = await Promise.all([
        hasAccessPermission('pedidos.cancelar'),
        hasAccessPermission('pedidos.receber'),
        hasAccessPermission('pedidos.cozinha')
      ]);
    }
    pdvCache.setUserId(ownerUserId);
    orderingReviewActive = await hasOrderingReviewAccess(ownerUserId);
    if (bounceSubUserMissingAddon({ addonActive: orderingReviewActive, isSubUser, addonLabel: 'ZeloMenu' })) return;
    ready = true;

    if (!orderingReviewActive) {
      loading = false;
      return;
    }

    dadosEmpresa = await readSnapshot(ownerUserId, 'empresa.perfil');
    pedidos = await loadLocalOrders(ownerUserId);
    loading = false;
    unsubscribeOffline = onOfflineChange(() => { void atualizarFilaLocal(); });
    await carregarEmpresa();
    await carregarPedidos();
    printedOrderStore = createPrintedOrderStore();
    void atualizarStatusImpressora();
    printerStatusTimer = setInterval(atualizarStatusImpressora, 20000);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    realtimeChannel = subscribeCanonicalOrderUpdates(supabase, dadosEmpresa?.id, () => {
      if (realtimeRefreshTimer) return;
      realtimeRefreshTimer = setTimeout(() => {
        realtimeRefreshTimer = null;
        void carregarPedidos();
      }, 150);
    });
    pollTimer = setInterval(carregarPedidos, 30000);
    clockTimer = setInterval(() => { nowTick = Date.now(); }, 15000);
    // Command state lives server-side and does not fire zelo_orders realtime,
    // so refresh it on a short interval while an iFood command is in flight.
    ifoodSyncTimer = setInterval(() => {
      if (Object.values(ifoodSync).some((state) => ifoodHasPendingCommand(state))) void atualizarIfoodSync();
    }, 8000);
  });

  onDestroy(() => {
    unsubscribeOffline?.();
    if (pollTimer) clearInterval(pollTimer);
    if (clockTimer) clearInterval(clockTimer);
    if (ifoodSyncTimer) clearInterval(ifoodSyncTimer);
    if (printerStatusTimer) clearInterval(printerStatusTimer);
    if (realtimeRefreshTimer) clearTimeout(realtimeRefreshTimer);
    if (realtimeChannel) void supabase.removeChannel(realtimeChannel);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', handleVisibilityChange);
  });

  async function atualizarStatusImpressora() {
    if (printerStatusRequest) return printerStatusRequest;
    printerStatusRequest = detectZeloImpressao()
      .then((detection) => {
        printerConnected = Boolean(detection?.running && detection?.paired);
        return printerConnected;
      })
      .catch(() => {
        printerConnected = false;
        return false;
      })
      .finally(() => {
        printerStatusRequest = null;
      });
    return printerStatusRequest;
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== 'visible') return;
    void atualizarStatusImpressora();
    void carregarPedidos();
  }

  /**
   * Reimpressão manual: ignora o dedupe de 48h de propósito (o caso de uso é
   * justamente a via que não saiu). Em caso de sucesso, reserva o pedido no
   * store para a reconciliação não imprimir uma terceira via sozinha.
   * Pedidos iFood também podem ser reimpressos manualmente aqui — a política
   * `print_owner` da Task 13 só governa a impressão automática global.
   */
  async function reimprimirPedido(pedido) {
    if (!pedido || reimprimindo) return;
    reimprimindo = true;
    try {
      await printOrder(
        pedido,
        dadosEmpresa?.nome_exibicao || dadosEmpresa?.razao_social || 'Zelo PDV',
        ownerUserId,
      );
      printedOrderStore?.reserve(pedido.id);
      printerConnected = true;
      addToast('Pedido enviado para a impressora.', 'success');
    } catch (error) {
      printerConnected = false;
      console.error('[printer] reimpressão falhou para pedido', pedido.id, error);
      addToast(getZeloImpressaoFriendlyMessage(error), 'error');
    } finally {
      reimprimindo = false;
    }
  }

  async function carregarEmpresa() {
    if (dadosEmpresa?.id || navigator.onLine === false) return;
    const controller = new AbortController();
    let timer;
    try {
      const query = supabase
        .from('empresa_perfil')
        .select('id, nome_exibicao, razao_social')
        .eq('user_id', ownerUserId || userId)
        .maybeSingle().abortSignal(controller.signal);
      const { data, error } = await Promise.race([query, new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Conexão indisponível.')); }, 3000);
      })]);
      if (!error && data) {
        dadosEmpresa = data;
        await saveSnapshot(ownerUserId, 'empresa.perfil', { ...(await readSnapshot(ownerUserId, 'empresa.perfil')), ...data });
      }
    } catch {} finally { clearTimeout(timer); }
  }

  async function carregarCaixaAberto() {
    const { data, error } = await supabase
      .from('caixas')
      .select('id')
      .eq('id_usuario', ownerUserId || userId)
      .is('data_fechamento', null)
      .order('data_abertura', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      addToast('Não foi possível verificar o caixa. Verifique sua conexão e tente novamente.', 'error');
      return;
    }
    idCaixaAberto = data?.id || null;
  }

  async function carregarPedidos() {
    return carregarPedidosComRecuperacao(true);
  }

  async function atualizarFilaLocal() {
    const owner = ownerUserId;
    const rows = await loadLocalOrders(owner);
    if (owner !== ownerUserId) return;
    pedidos = rows;
  }

  async function pedidoCriado(event) {
    manualOpen = false;
    await atualizarFilaLocal();
    pedidoSelecionadoId = event.detail?.id || event.detail?.order?.id || pedidos.at(-1)?.id;
    addToast('Pedido salvo neste aparelho. A sincronização é automática quando há conexão.', 'success');
  }

  async function carregarPedidosComRecuperacao(tentarRecuperarSessao) {
    if (polling || fechandoPedido || !userId) return;
    polling = true;
    try {
      const proximosPedidos = await refreshOrderSnapshot(supabase, ownerUserId, dadosEmpresa?.id);
      queueUnavailable = navigator.onLine === false;
      if (filaBaselinePronta && findNewArrivalOrders(pedidos, proximosPedidos).length > 0) {
        playOrderArrivalChime();
      }
      filaBaselinePronta = true;
      pedidos = proximosPedidos;
      if (!pedidos.some((p) => p.id === pedidoSelecionadoId)) {
        pedidoSelecionadoId = pedidos[0]?.id || null;
      }
      void atualizarIfoodSync();
    } catch (err) {
      queueUnavailable = true;
      await atualizarFilaLocal();
      if (navigator.onLine !== false && !isCanonicalOrderPermissionError(err)) {
        addToast('Erro ao carregar pedidos: ' + getFriendlyErrorMessage(err), 'error');
      }
      if (tentarRecuperarSessao && isCanonicalOrderPermissionError(err)) {
        const sessionState = await recuperarSessaoParaPedidos();
        polling = false;
        if (sessionState === 'refreshed') {
          await carregarPedidosComRecuperacao(false);
          return;
        }
        if (sessionState === 'missing') {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          addToast('Sua sessão expirou. Entre novamente para carregar os pedidos.', 'warning');
          goto('/login?msg=session_expired');
          return;
        }
        addToast('Não foi possível validar o acesso aos pedidos. Tente recarregar a página.', 'error');
        return;
      }
    } finally {
      loading = false;
      polling = false;
    }
  }

  async function recuperarSessaoParaPedidos() {
    if (recoveringOrderSession) return 'missing';
    recoveringOrderSession = true;
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) return 'valid';

      const { data: refreshed } = await supabase.auth.refreshSession();
      return refreshed?.session ? 'refreshed' : 'missing';
    } catch (error) {
      console.warn('[Pedidos] não foi possível recuperar a sessão:', error?.message || error);
      return 'missing';
    } finally {
      recoveringOrderSession = false;
    }
  }

  function selecionarPedido(id) {
    pedidoSelecionadoId = id;
    if (window.matchMedia('(max-width: 860px)').matches) {
      mobileDetailOpen = true;
    }
  }

  async function excluirPedido(pedido) {
    if (!canCancelOrders) {
      addToast('Seu cargo não pode cancelar ou rejeitar pedidos.', 'warning');
      return;
    }
    if (isIfoodOrder(pedido)) return abrirCancelamentoIfood(pedido);
    return cancelarPedidoCanonico(pedido);
  }

  function ifoodPermissionAllowed(intent) {
    const permission = ifoodIntentPermission(intent);
    if (permission === 'pedidos.cozinha') return canKitchenOrders;
    if (permission === 'pedidos.cancelar') return canCancelOrders;
    // pedidos.acessar is already required to open this page.
    return Boolean(permission);
  }

  async function atualizarIfoodSync() {
    const ids = pedidos.filter((p) => isIfoodOrder(p) && !p.localOnly).map((p) => p.id);
    if (ids.length === 0) {
      ifoodSync = {};
      return;
    }
    ifoodSync = await fetchIfoodSyncState(supabase, ids);
  }

  async function enviarComandoIfood(pedido, intent, extra = {}) {
    if (navigator.onLine === false) {
      addToast('Sem conexão. Reconecte para falar com o iFood.', 'info');
      return false;
    }
    if (!ifoodPermissionAllowed(intent)) {
      addToast('Seu cargo não pode fazer esta ação.', 'warning');
      return false;
    }
    ifoodSending = true;
    try {
      const result = await sendIfoodCommand(supabase, pedido, intent, extra);
      if (!result.ok) {
        addToast(result.message, result.status === 409 ? 'warning' : 'error');
        if (result.status === 409) await carregarPedidos();
        return false;
      }
      // The order status only changes when iFood confirms by event.
      addToast(`Enviado ao iFood: ${(ifoodIntentLabel(intent) || 'ação').toLowerCase()}.`, 'info');
      await atualizarIfoodSync();
      return true;
    } finally {
      ifoodSending = false;
    }
  }

  async function abrirCancelamentoIfood(pedido) {
    if (navigator.onLine === false) {
      addToast('Sem conexão. Reconecte para cancelar este pedido.', 'info');
      return;
    }
    ifoodCancelOrder = pedido;
    ifoodCancelReasons = [];
    ifoodCancelCode = '';
    ifoodCancelError = '';
    ifoodCancelLoading = true;
    const result = await fetchIfoodCancellationReasons(supabase, pedido.id);
    ifoodCancelLoading = false;
    if (!result.ok) {
      ifoodCancelError = result.message;
      return;
    }
    ifoodCancelReasons = result.reasons;
    if (ifoodCancelReasons.length === 0) ifoodCancelError = 'O iFood não informou motivos para este pedido. Use o Portal do Parceiro.';
  }

  function fecharCancelamentoIfood() {
    if (ifoodSending) return;
    ifoodCancelOrder = null;
  }

  function codigoEntregaIfood(pedido) {
    const codes = ifoodHandoffCodes(pedido);
    const delivery = codes.find((item) => item.kind === 'delivery');
    return delivery?.value || pedido?.ifood?.deliveryCode || '';
  }

  function abrirVerificacaoEntregaIfood(pedido) {
    ifoodVerifyOrder = pedido;
    ifoodVerifyCode = codigoEntregaIfood(pedido);
    ifoodVerifyError = '';
  }

  function fecharVerificacaoEntregaIfood() {
    if (ifoodSending) return;
    ifoodVerifyOrder = null;
    ifoodVerifyError = '';
  }

  async function confirmarEntregaIfood() {
    const code = ifoodVerifyCode.trim();
    if (!ifoodVerifyOrder) return;
    if (!code) {
      ifoodVerifyError = 'Peça o código de entrega no app iFood do cliente (ou o localizador do comprovante).';
      return;
    }
    const ok = await enviarComandoIfood(ifoodVerifyOrder, 'verify_delivery_code', { code });
    if (ok) ifoodVerifyOrder = null;
  }

  async function confirmarCancelamentoIfood() {
    const reason = ifoodCancelReasons.find((item) => item.code === ifoodCancelCode);
    if (!ifoodCancelOrder || !reason) return;
    const ok = await enviarComandoIfood(ifoodCancelOrder, 'cancel', {
      cancellationCode: reason.code,
      reason: reason.description
    });
    if (ok) ifoodCancelOrder = null;
  }

  function statusLabel(status) {
    const labels = {
      pending_payment: 'Aguardando pagamento', pending_review: 'Revisar', accepted: 'Aceito',
      preparing: 'Preparando', ready: 'Pronto', out_for_delivery: 'Saiu para entrega',
      delivered: 'Entregue', rejected: 'Rejeitado', cancelled: 'Cancelado'
    };
    return labels[status] || status;
  }

  function canonicalActionLabel(pedido) {
    if (isIfoodOrder(pedido)) {
      const advance = resolveQueueAdvance(pedido);
      if (advance.kind === 'ifood_command') return ifoodIntentLabel(advance.intent);
      return ifoodWaitingLabel(pedido) || 'Aguardando o iFood';
    }
    if (pedido.status === 'pending_review') return 'Aceitar pedido';
    if (pedido.status === 'accepted') return 'Iniciar preparo';
    if (pedido.status === 'preparing') return 'Marcar como pronto';
    if (pedido.status === 'ready' && canonicalFulfillmentMode(pedido) === 'delivery') return 'Saiu para entrega';
    if (pedido.status === 'ready' || pedido.status === 'out_for_delivery') return 'Concluir pedido';
    return 'Aguardando pagamento';
  }

  async function avancarPedidoCanonico(pedido) {
    // Only two things actually stop this: an order that has not reached the
    // server yet, and a browser with no network. A "degraded" reading is a hint
    // about the last request, not proof the next one fails — gating on it left
    // connected devices unable to accept or advance a single order.
    if (pedido.localOnly) {
      addToast('Pedido salvo neste aparelho. Ele avança assim que a sincronização terminar.', 'info');
      return;
    }
    if (navigator.onLine === false) {
      addToast('Sem conexão. Reconecte para atualizar o andamento do pedido.', 'info');
      return;
    }
    if (pedido.status === 'pending_payment') return;
    const advance = resolveQueueAdvance(pedido);
    if (advance.kind === 'ifood_command') {
      if (ifoodHasPendingCommand(ifoodSync[pedido.id])) return;
      if (advance.intent === 'verify_delivery_code') {
        abrirVerificacaoEntregaIfood(pedido);
        return;
      }
      await enviarComandoIfood(pedido, advance.intent);
      return;
    }
    if (advance.kind === 'none') return;
    const action = advance.kind === 'close' ? 'close' : advance.action;
    if (action === 'close' && !canReceiveOrders) {
      addToast('Seu cargo não pode receber ou concluir pedidos.', 'warning');
      return;
    }
    fechandoPedido = true;
    try {
      if (action === 'close') {
        if (!idCaixaAberto) await carregarCaixaAberto();
        if (!idCaixaAberto) {
          addToast('Abra o caixa antes de concluir pedidos online.', 'warning');
          return;
        }
        const { payload } = buildVendaPayload({
          formaPagamento: canonicalPaymentMethod(pedido),
          // TODO(ZeloMenu): coletar o valor entregue pelo cliente e calcular o troco no checkout do ZeloMenu.
          // O PDV recebe apenas a forma declarada e mantém o fallback de pagamento exato até esse contrato chegar.
          valorRecebido: pedido.total,
          pagamentos: [], totalFinal: pedido.total, valorDesconto: 0, descontoTipo: null,
          taxaEntrega: Number(pedido.delivery_fee || 0),
          tipoPedido: canonicalFulfillmentMode(pedido), idCaixa: idCaixaAberto,
          idCliente: null, itens: itensSelecionados, taxasPlataforma: [], operadorId: operadorUserId
        });
        await closeCanonicalOrder(supabase, pedido, payload, operadorUserId);
      }
      else await transitionCanonicalOrder(supabase, pedido, action, operadorUserId);
      addToast(`Pedido #${pedido.numero_pedido} atualizado.`, 'success');
      mobileDetailOpen = false;
      await carregarPedidos();
    } catch (err) {
      addToast('Erro: ' + getFriendlyErrorMessage(err), 'error');
      await carregarPedidos();
    } finally {
      fechandoPedido = false;
    }
  }

  async function cancelarPedidoCanonico(pedido) {
    if (pedido.localOnly) {
      addToast('Pedido ainda salvo neste aparelho. Aguarde a sincronização para cancelar.', 'info');
      return;
    }
    if (navigator.onLine === false) {
      addToast('Sem conexão. Reconecte para cancelar este pedido.', 'info');
      return;
    }
    const action = pedido.status === 'pending_review' ? 'reject' : 'cancel';
    const ok = await confirmAction(action === 'reject' ? 'Rejeitar pedido' : 'Cancelar pedido', 'Esta ação será registrada no histórico do pedido.');
    if (!ok) return;
    try {
      await transitionCanonicalOrder(supabase, pedido, action, operadorUserId);
      addToast(`Pedido #${pedido.numero_pedido} ${action === 'reject' ? 'rejeitado' : 'cancelado'}.`, 'success');
      await carregarPedidos();
    } catch (err) {
      addToast('Erro: ' + getFriendlyErrorMessage(err), 'error');
      await carregarPedidos();
    }
  }

  function formatMoney(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatTime(value) {
    if (!value) return '--:--';
    return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function clienteLabel(pedido) {
    return (pedido?.nome_cliente || '').trim() || `Pedido #${pedido?.numero_pedido}`;
  }
</script>

<ModalPedidoManual open={manualOpen} {ownerUserId} operatorId={operadorUserId}
  on:close={() => manualOpen = false} on:created={pedidoCriado} />

{#if ifoodCancelOrder}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="ifood-modal-overlay" on:click|self={fecharCancelamentoIfood}>
    <div class="ifood-modal" role="dialog" aria-modal="true" aria-labelledby="ifood-cancel-title">
      <header class="ifood-modal-head">
        <div>
          <OrderSourceBadge order={ifoodCancelOrder} />
          <h2 id="ifood-cancel-title">Cancelar pedido no iFood</h2>
        </div>
        <button type="button" class="ifood-modal-close" on:click={fecharCancelamentoIfood} aria-label="Fechar" disabled={ifoodSending}>
          <X class="size-4" aria-hidden="true" />
        </button>
      </header>

      <p class="ifood-modal-lead">
        Escolha o motivo. O pedido só aparece como cancelado depois que o iFood confirmar.
      </p>

      {#if ifoodCancelLoading}
        <p class="ifood-modal-state">Carregando motivos do iFood...</p>
      {:else if ifoodCancelError}
        <InlineHelper tone="warning" message={ifoodCancelError} />
      {:else}
        <fieldset class="ifood-reasons">
          <legend class="sr-only">Motivo do cancelamento</legend>
          {#each ifoodCancelReasons as reason (reason.code)}
            <label class="ifood-reason" class:selected={ifoodCancelCode === reason.code}>
              <input type="radio" name="ifood-cancel-reason" value={reason.code} bind:group={ifoodCancelCode} />
              <span>{reason.description}</span>
            </label>
          {/each}
        </fieldset>
      {/if}

      <footer class="ifood-modal-actions">
        <button type="button" class="btn-secondary" on:click={fecharCancelamentoIfood} disabled={ifoodSending}>Voltar</button>
        <button
          type="button"
          class="btn-danger"
          on:click={confirmarCancelamentoIfood}
          disabled={ifoodSending || ifoodCancelLoading || !ifoodCancelCode}
        >
          {ifoodSending ? 'Enviando ao iFood...' : 'Pedir cancelamento'}
        </button>
      </footer>
    </div>
  </div>
{/if}

{#if ifoodVerifyOrder}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="ifood-modal-overlay" on:click|self={fecharVerificacaoEntregaIfood}>
    <div class="ifood-modal" role="dialog" aria-modal="true" aria-labelledby="ifood-verify-title">
      <header class="ifood-modal-head">
        <div>
          <OrderSourceBadge order={ifoodVerifyOrder} />
          <h2 id="ifood-verify-title">Confirmar entrega no iFood</h2>
        </div>
        <button type="button" class="ifood-modal-close" on:click={fecharVerificacaoEntregaIfood} aria-label="Fechar" disabled={ifoodSending}>
          <X class="size-4" aria-hidden="true" />
        </button>
      </header>

      <p class="ifood-modal-lead">
        Peça o código de entrega no aplicativo iFood do cliente, ou use o localizador impresso no comprovante. Sem esse código o iFood mantém o pedido em rota.
      </p>

      <label class="ifood-verify-label" for="ifood-verify-code">Código de entrega</label>
      <input
        id="ifood-verify-code"
        class="ifood-verify-input"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        bind:value={ifoodVerifyCode}
        placeholder="Código do cliente"
        disabled={ifoodSending}
      />
      {#if ifoodVerifyError}
        <InlineHelper tone="warning" message={ifoodVerifyError} />
      {/if}

      <footer class="ifood-modal-actions">
        <button type="button" class="btn-secondary" on:click={fecharVerificacaoEntregaIfood} disabled={ifoodSending}>Voltar</button>
        <button type="button" class="btn-success" on:click={confirmarEntregaIfood} disabled={ifoodSending || !ifoodVerifyCode.trim()}>
          {ifoodSending ? 'Enviando ao iFood...' : 'Confirmar entrega'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<svelte:head>
  <title>Pedidos - Caixa | Zelo PDV</title>
</svelte:head>

<div class="pedidos-page">
  {#if !ready}
    <div class="state-card">
      <p>Carregando...</p>
    </div>
  {:else if !orderingReviewActive}
    <section class="upsell">
      <p class="eyebrow">ZeloMenu</p>
      <h1>Fila de Pedidos</h1>
      <p>Ative o ZeloMenu para receber e gerenciar pedidos online.</p>
      <a href="/gestao/extensoes">Ver extensões</a>
    </section>
  {:else}
    <header class="page-header">
      <div class="title-block">
        <p class="eyebrow">Vendas / Pedidos</p>
        <h1>Pedidos</h1>
        <span class="subtitle">{pedidos.length} {pedidos.length === 1 ? 'pedido na fila' : 'pedidos na fila'}</span>
      </div>
      <div class="header-actions">
        {#if canReceiveOrders}
          <button type="button" class="btn-secondary" on:click={() => manualOpen = true}>Criar pedido</button>
        {/if}
        <button type="button" class="btn-secondary" on:click={carregarPedidos} disabled={loading || polling} aria-label="Atualizar fila">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="icon"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992V4.356M19.5 15a7.5 7.5 0 11-2.197-5.303l3.722 3.722M3 12a9 9 0 0114.85-6.85"/></svg>
          <span>Atualizar</span>
        </button>
      </div>
    </header>

    {#if queueUnavailable}
      <InlineHelper compact message="Exibindo os pedidos salvos neste aparelho. Você pode criar pedidos; o andamento e os pedidos de outros aparelhos serão atualizados quando a conexão voltar." />
    {/if}

    {#if !canCancelOrders}
      <InlineHelper id="pedidos-cancel-hint" compact message="Seu cargo não pode cancelar pedidos. Peça essa ação ao responsável pela operação." />
    {/if}

    {#if loading}
      <div class="state-card">Carregando pedidos...</div>
    {:else if pedidos.length === 0}
      <div class="empty-state">
        <div class="empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h10.5M8.25 12h10.5M8.25 17.25h10.5M3.75 6.75h.008v.008H3.75V6.75Zm0 5.25h.008v.008H3.75V12Zm0 5.25h.008v.008H3.75v-.008Z"/></svg>
        </div>
        <h2>Nenhum pedido na fila</h2>
        <p>Pedidos do ZeloMenu aparecem aqui automaticamente.</p>
      </div>
    {:else}
      <div class="queue-layout" class:detail-open={mobileDetailOpen}>
        <section class="queue-list" aria-label="Fila de pedidos">
          {#each pedidos as pedido (pedido.id)}
            {@const totalCard = Number(pedido.total || 0)}
            {@const qtdItens = (pedido.pedido_itens || []).reduce((acc, item) => acc + Number(item.quantidade || 0), 0)}
            {@const entregaCard = getOrderDeliveryPresentation(pedido)}
            {@const pagamentoCard = getOrderPaymentPresentation(pedido)}
            <div class="queue-card">
              <button
                type="button"
                class="queue-item"
                class:selected={pedido.id === pedidoSelecionado?.id}
                aria-pressed={pedido.id === pedidoSelecionado?.id}
                on:click={() => selecionarPedido(pedido.id)}
              >
                <div class="qi-top">
                  {#if isIfoodOrder(pedido)}
                    <OrderSourceBadge order={pedido} />
                  {:else}
                    <span class="order-num">#{pedido.numero_pedido}</span>
                  {/if}
                  {#if pedido.localOnly}<span class="subtitle">{['needs_review', 'needs_auth'].includes(pedido.syncStatus) ? 'Conferir sincronização' : 'Salvo neste aparelho'}</span>{/if}
                  <span class="status-pill" data-status={pedido.status} aria-label="Status: {statusLabel(pedido.status)}">{statusLabel(pedido.status)}</span>
                </div>
                {#if isIfoodOrder(pedido)}
                  <IfoodSyncState order={pedido} syncState={ifoodSync[pedido.id] || null} now={nowTick} compact />
                {/if}
                <div class="qi-mid">
                  <div class="qi-cliente-row">
                    <strong class="qi-cliente">{clienteLabel(pedido)}</strong>
                  </div>
                  <span class="qi-meta">{formatTime(pedido.criado_em)}</span>
                </div>
                <div class="qi-highlights" aria-label="Endereço, bairro e forma de pagamento">
                  <span class="qi-address" title={entregaCard.address || 'Endereço não informado'}>
                    <span class="qi-highlight-icon" aria-hidden="true"><MapPin size={14} strokeWidth={2} /></span>
                    <span>{entregaCard.address || 'Endereço não informado'}</span>
                  </span>
                  <div class="qi-secondary-info">
                    <span title={entregaCard.neighborhood || 'Bairro não informado'}>{entregaCard.neighborhood || 'Bairro não informado'}</span>
                    <span><span class="qi-highlight-icon" aria-hidden="true"><CreditCard size={14} strokeWidth={2} /></span>{pagamentoCard.label}</span>
                  </div>
                </div>
                <div class="qi-foot">
                  <span>{qtdItens} {qtdItens === 1 ? 'item' : 'itens'}</span>
                  <strong>{formatMoney(totalCard)}</strong>
                </div>
              </button>
              <div class="queue-actions">
                <button
                  type="button"
                  class="action-btn action-btn-danger"
                  aria-label="Cancelar pedido #{pedido.numero_pedido}"
                  aria-describedby={!canCancelOrders ? 'pedidos-cancel-hint' : undefined}
                  disabled={!canCancelOrders || (isIfoodOrder(pedido) && !ifoodCanCancel(pedido))}
                  on:click|stopPropagation={() => excluirPedido(pedido)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
          {/each}
        </section>

        <section class="details-panel">
          {#if pedidoSelecionado}
            <button type="button" class="back-btn" on:click={() => mobileDetailOpen = false} aria-label="Voltar para fila">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="icon"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/></svg>
              <span>Voltar para fila</span>
            </button>
            <div class="details-head">
              <div>
                {#if selecionadoIfood}
                  <OrderSourceBadge order={pedidoSelecionado} />
                {:else}
                  <p class="eyebrow">Pedido #{pedidoSelecionado.numero_pedido}</p>
                {/if}
                <h2>{clienteLabel(pedidoSelecionado)}</h2>
                <span class="details-meta">{formatTime(pedidoSelecionado.criado_em)}</span>
                {#if pedidoSelecionado.fulfillment?.scheduledAt}
                  <span class="details-meta">Previsto: {new Date(pedidoSelecionado.fulfillment.scheduledAt).toLocaleString('pt-BR')}</span>
                {/if}
                {#if agendaSelecionada.scheduled}
                  <span class="details-meta">
                    Agendado{#if agendaSelecionada.windowStart}: entrega entre {formatTime(agendaSelecionada.windowStart)} e {formatTime(agendaSelecionada.windowEnd)}{/if}
                    {#if agendaSelecionada.preparationStartAt} · preparo a partir de {formatTime(agendaSelecionada.preparationStartAt)}{/if}
                  </span>
                {/if}
              </div>
              <div class="details-head-actions">
                <span class="status-pill" data-status={pedidoSelecionado.status}>{statusLabel(pedidoSelecionado.status)}</span>
                <button
                  type="button"
                  class="btn-secondary btn-reprint"
                  on:click={() => reimprimirPedido(pedidoSelecionado)}
                  disabled={reimprimindo}
                  title="Enviar o pedido novamente para a impressora"
                >
                  <Printer class="size-4" aria-hidden="true" />
                  <span>{reimprimindo ? 'Imprimindo...' : 'Reimprimir'}</span>
                </button>
              </div>
            </div>

            {#if selecionadoIfood}
              <div class="ifood-detail-strip">
                <IfoodSyncState order={pedidoSelecionado} syncState={syncSelecionado} now={nowTick} />
                {#if codigosSelecionados.length}
                  <dl class="handoff-codes" aria-label="Códigos do iFood">
                    {#each codigosSelecionados as codigo (codigo.kind)}
                      <div>
                        <dt>{codigo.label}</dt>
                        <dd>{codigo.value}</dd>
                      </div>
                    {/each}
                  </dl>
                {/if}
                {#if itensSemVinculo > 0}
                  <InlineHelper compact message={itensSemVinculo === 1
                    ? '1 item ainda não está vinculado a um produto do Zelo. O pedido segue normalmente, sem baixa de estoque desse item.'
                    : `${itensSemVinculo} itens ainda não estão vinculados a produtos do Zelo. O pedido segue normalmente, sem baixa de estoque desses itens.`} />
                {/if}
              </div>
            {/if}

            <div class="order-info-grid" aria-label="Informações principais do pedido">
              <section class="order-info-card" aria-labelledby="delivery-info-title">
                <div class="info-card-head">
                  <span class="info-card-icon"><MapPin size={18} strokeWidth={2} aria-hidden="true" /></span>
                  <div>
                    <span class="info-card-kicker">Entrega</span>
                    <h3 id="delivery-info-title">Endereço</h3>
                  </div>
                </div>

                <div class="delivery-copy">
                  <strong>{entregaSelecionada.address || 'Não informado'}</strong>
                  <span><b>Bairro</b> {entregaSelecionada.neighborhood || 'Não informado'}</span>
                </div>
              </section>

              <section class="order-info-card" aria-labelledby="payment-info-title">
                <div class="info-card-head">
                  <span class="info-card-icon payment-icon"><CreditCard size={18} strokeWidth={2} aria-hidden="true" /></span>
                  <div>
                    <span class="info-card-kicker">Pagamento</span>
                    <h3 id="payment-info-title">{pagamentoSelecionado.label}</h3>
                  </div>
                </div>

                {#if pagamentoSelecionado.isCash}
                  <div class="payment-breakdown">
                    <span><strong>Troco</strong></span>
                    <strong class="change-value">{pagamentoSelecionado.change === null ? '(Não informado)' : formatMoney(pagamentoSelecionado.change)}</strong>
                  </div>
                {/if}
              </section>
            </div>

            {#if pedidoSelecionado.observacoes}
              <div class="note">
                <strong>Observações</strong>
                <p>{pedidoSelecionado.observacoes}</p>
              </div>
            {/if}

            <ul class="items-list">
              {#each itensSelecionados as item (item.id)}
                <li>
                  <div class="item-info">
                    <strong>{item.quantidade}× {item.nome}</strong>
                    {#if item.modifierGroups.length}
                      <ul class="item-modifiers">
                        {#each item.modifierGroups as grupo (grupo.groupName)}
                          <li><span class="modifier-group">{grupo.groupName}:</span> {grupo.optionNames.join(', ')}</li>
                        {/each}
                      </ul>
                    {/if}
                    <span>{formatMoney(item.preco)} cada</span>
                  </div>
                  <strong class="item-total">{formatMoney(item.preco * item.quantidade)}</strong>
                </li>
              {/each}
            </ul>

            <footer class="checkout-bar">
              <div class="checkout-total">
                <span>Total</span>
                <strong>{formatMoney(totalPedido)}</strong>
              </div>
              {#if selecionadoIfood}
                <button
                  type="button"
                  class="btn-success"
                  on:click={() => avancarPedidoCanonico(pedidoSelecionado)}
                  disabled={ifoodSending || ifoodComandoPendente || avancoSelecionado.kind !== 'ifood_command' || !ifoodIntentPermitido || pedidoSelecionado.localOnly}
                  aria-describedby={!ifoodIntentPermitido ? 'pedidos-ifood-permission-hint' : undefined}
                >
                  {#if ifoodSending}
                    Enviando ao iFood...
                  {:else if ifoodComandoPendente}
                    Aguardando o iFood...
                  {:else}
                    <CheckCircle2 class="size-4" aria-hidden="true" />
                    <span>{canonicalActionLabel(pedidoSelecionado)}</span>
                  {/if}
                </button>
                {#if !ifoodIntentPermitido}
                  <InlineHelper id="pedidos-ifood-permission-hint" compact message="Seu cargo não pode fazer esta etapa do pedido. Peça ao responsável pela operação." />
                {/if}
              {:else}
                <button type="button" class="btn-success" on:click={() => avancarPedidoCanonico(pedidoSelecionado)} disabled={fechandoPedido || pedidoSelecionado.status === 'pending_payment' || (['ready', 'out_for_delivery'].includes(pedidoSelecionado.status) && !canReceiveOrders)} aria-describedby={['ready', 'out_for_delivery'].includes(pedidoSelecionado.status) && !canReceiveOrders ? 'pedidos-receive-hint' : undefined}>
                  {#if fechandoPedido}
                    Confirmando...
                  {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="icon"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <span>{canonicalActionLabel(pedidoSelecionado)}</span>
                  {/if}
                </button>
                {#if ['ready', 'out_for_delivery'].includes(pedidoSelecionado.status) && !canReceiveOrders}
                  <InlineHelper id="pedidos-receive-hint" compact message="Seu cargo não pode concluir pedidos. Peça essa ação ao responsável pela operação." />
                {/if}
              {/if}
            </footer>
          {:else}
            <div class="empty-detail">
              <p>Selecione um pedido na fila para ver os detalhes.</p>
            </div>
          {/if}
        </section>
      </div>
    {/if}
  {/if}
</div>

<style>
  .pedidos-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: clamp(14px, 2.5vw, 28px);
    background: var(--bg-app);
    color: var(--text-main);
  }

  .page-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .title-block h1 {
    margin: 0;
    font-size: clamp(1.5rem, 4vw, 2rem);
    font-weight: 900;
    color: var(--text-main);
  }

  .subtitle {
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .eyebrow {
    margin: 0 0 4px;
    color: var(--accent);
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .header-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

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
    transition: background 160ms ease, transform 80ms ease;
  }

  .upsell a {
    background: var(--primary);
    color: var(--primary-text);
  }
  .upsell a:hover { background: var(--primary-hover); }

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

  button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .icon { width: 18px; height: 18px; flex-shrink: 0; }

  .queue-layout {
    display: grid;
    grid-template-columns: minmax(280px, 400px) minmax(0, 1fr);
    gap: 16px;
    align-items: stretch;
    flex: 1;
    min-height: 0;
  }

  .queue-list,
  .details-panel,
  .state-card,
  .empty-state,
  .upsell {
    border: 1px solid var(--border-card);
    border-radius: 12px;
    background: var(--bg-panel);
  }

  .queue-list {
    display: grid;
    gap: 8px;
    align-content: start;
    padding: 12px;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--border-strong) transparent;
  }
  .queue-list::-webkit-scrollbar {
    width: 8px;
  }
  .queue-list::-webkit-scrollbar-track {
    background: transparent;
  }
  .queue-list::-webkit-scrollbar-thumb {
    background: var(--border-strong);
    border-radius: 999px;
  }

  .queue-card {
    position: relative;
  }
  .queue-card:hover .queue-actions,
  .queue-card:focus-within .queue-actions {
    opacity: 1;
    pointer-events: auto;
  }

  .queue-item {
    display: grid;
    gap: 8px;
    width: 100%;
    border: 1px solid var(--border-card);
    background: var(--bg-card);
    color: var(--text-main);
    border-radius: 10px;
    padding: 14px;
    padding-right: 64px;
    text-align: left;
    cursor: pointer;
    transition: border-color 140ms ease, background 140ms ease, transform 80ms ease;
  }
  .queue-item:hover {
    border-color: var(--accent);
    background: var(--bg-input);
  }
  .queue-item.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-light);
    background: var(--bg-input);
  }

  .queue-actions {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    gap: 4px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 140ms ease;
  }
  .action-btn {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-panel);
    color: var(--text-muted);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    cursor: pointer;
    padding: 0;
    transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  }
  .action-btn svg { width: 14px; height: 14px; }
  .action-btn:hover {
    background: var(--bg-card);
    color: var(--text-main);
    border-color: var(--border-strong);
  }
  .action-btn-danger:hover {
    background: rgba(239, 68, 68, 0.1);
    color: var(--error);
    border-color: rgba(239, 68, 68, 0.4);
  }
  /* Em telas touch (mobile): sempre visível e maior para toque */
  @media (hover: none) {
    .queue-actions { opacity: 1; pointer-events: auto; }
    .action-btn {
      width: 36px;
      height: 36px;
    }
    .action-btn svg { width: 16px; height: 16px; }
  }

  .qi-top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .order-num {
    font-size: 1.1rem;
    font-weight: 900;
    color: var(--accent);
  }

  .qi-mid {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .qi-cliente-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .qi-cliente {
    font-size: 1rem;
    font-weight: 800;
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .qi-meta {
    color: var(--text-muted);
    font-size: 0.78rem;
    font-weight: 600;
  }

  .qi-highlights {
    display: grid;
    gap: 4px;
    min-width: 0;
    color: var(--text-muted);
    font-size: 0.78rem;
  }
  .qi-address,
  .qi-secondary-info,
  .qi-secondary-info > span {
    display: flex;
    align-items: center;
    min-width: 0;
  }
  .qi-address,
  .qi-secondary-info > span {
    gap: 5px;
  }
  .qi-address > span,
  .qi-secondary-info > span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .qi-secondary-info {
    justify-content: space-between;
    gap: 8px;
  }
  .qi-secondary-info > span:last-child {
    flex-shrink: 0;
    color: var(--text-label);
    font-weight: 700;
  }
  .qi-highlight-icon {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
    color: var(--accent);
  }

  .qi-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--text-muted);
    font-size: 0.88rem;
  }
  .qi-foot strong {
    color: var(--success);
    font-size: 1.05rem;
    font-weight: 900;
  }

  .status-pill {
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 0.7rem;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    background: var(--status-warning-bg);
    color: var(--status-warning-text);
    border: 1px solid var(--status-warning-border);
    white-space: nowrap;
  }
  .status-pill[data-status='pronto'] {
    background: var(--status-success-bg);
    color: var(--status-success-text);
    border-color: var(--status-success-border);
  }

  .details-panel {
    padding: 22px;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--border-strong) transparent;
  }
  .details-panel::-webkit-scrollbar {
    width: 8px;
  }
  .details-panel::-webkit-scrollbar-track {
    background: transparent;
  }
  .details-panel::-webkit-scrollbar-thumb {
    background: var(--border-strong);
    border-radius: 999px;
  }

  .back-btn {
    display: none;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 0;
    color: var(--accent);
    font-weight: 800;
    padding: 0 0 10px;
    cursor: pointer;
    align-self: flex-start;
  }

  .details-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .details-head h2 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 900;
    color: var(--text-main);
    word-break: break-word;
  }
  .details-meta {
    color: var(--text-muted);
    font-size: 0.85rem;
    font-weight: 600;
  }
  .details-head-actions {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    flex-shrink: 0;
  }
  .btn-reprint {
    font-size: 0.82rem;
    padding: 7px 12px;
  }

  .order-info-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-top: 16px;
  }
  .order-info-card {
    display: grid;
    gap: 14px;
    min-width: 0;
    padding: 16px;
    border: 1px solid var(--border-card);
    border-radius: 12px;
    background: var(--bg-card);
  }
  .info-card-head {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .info-card-icon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    border-radius: 12px;
    background: var(--accent-light);
    color: var(--accent);
  }
  .info-card-kicker {
    display: block;
    margin-bottom: 2px;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .info-card-head h3 {
    margin: 0;
    color: var(--text-main);
    font-size: 1rem;
    font-weight: 900;
  }
  .delivery-copy {
    display: grid;
    gap: 5px;
    min-width: 0;
    line-height: 1.45;
  }
  .delivery-copy strong {
    color: var(--text-main);
    font-size: 0.95rem;
    overflow-wrap: anywhere;
  }
  .delivery-copy span {
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  .delivery-copy b {
    color: var(--text-label);
    font-weight: 700;
  }
  .payment-breakdown {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border-subtle);
    color: var(--text-muted);
    font-size: 0.875rem;
  }
  .payment-breakdown strong {
    color: var(--text-label);
    font-weight: 700;
  }
  .payment-breakdown .change-value {
    color: var(--success);
    font-size: 1rem;
    font-weight: 900;
    white-space: nowrap;
  }

  .note {
    margin: 16px 0 0;
    border-left: 3px solid var(--warning);
    border-radius: 8px;
    background: var(--status-warning-bg);
    color: var(--text-main);
    padding: 10px 14px;
  }
  .note strong {
    color: var(--status-warning-text);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 900;
  }
  .note p { margin: 4px 0 0; color: var(--text-main); }

  .items-list {
    display: grid;
    gap: 0;
    padding: 0;
    margin: 16px 0 0;
    list-style: none;
  }
  .items-list > li {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 0;
    border-bottom: 1px solid var(--border-subtle);
  }
  .items-list > li:last-child { border-bottom: 0; }
  .item-info { display: grid; gap: 4px; min-width: 0; }
  .item-info strong { color: var(--text-main); font-weight: 700; }
  .item-info > span { color: var(--text-muted); font-size: 0.82rem; }

  /* Montagem do item (grupos de modificadores do ZeloMenu). */
  .item-modifiers {
    display: grid;
    gap: 2px;
    margin: 2px 0 0;
    padding: 0 0 0 12px;
    list-style: none;
    border-left: 2px solid var(--border-strong);
    color: var(--text-main);
    font-size: 0.85rem;
  }
  .modifier-group {
    color: var(--text-muted);
    font-weight: 700;
  }
  .item-total { color: var(--text-main); font-weight: 800; }

  .checkout-bar {
    margin-top: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding-top: 18px;
    border-top: 1px solid var(--border-subtle);
  }
  .checkout-total { display: grid; gap: 2px; }
  .checkout-total span { color: var(--text-muted); font-size: 0.85rem; }
  .checkout-total strong { color: var(--text-main); font-size: 1.7rem; font-weight: 900; }
  .checkout-bar .btn-success {
    flex: 1;
    max-width: 280px;
    font-size: 1.05rem;
    padding: 14px 20px;
  }

  .empty-detail {
    margin: auto;
    color: var(--text-muted);
    text-align: center;
    padding: 40px 20px;
  }

  .state-card,
  .empty-state,
  .upsell {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 12px;
    padding: 40px 24px;
  }
  .empty-state h2,
  .upsell h1 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 900;
    color: var(--text-main);
  }
  .empty-state p,
  .upsell p { margin: 0; color: var(--text-muted); }
  .empty-icon {
    width: 56px; height: 56px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 14px;
    background: var(--accent-light);
    color: var(--accent);
  }
  .empty-icon svg { width: 28px; height: 28px; }

  /* Mobile-first: single column, drill-down */
  @media (max-width: 860px) {
    .pedidos-page {
      overflow-y: auto;
    }
    .queue-layout {
      grid-template-columns: 1fr;
      gap: 12px;
      flex: none;
      min-height: auto;
    }
    .queue-list {
      overflow: visible;
    }
    .order-info-grid { grid-template-columns: 1fr; }
    .details-panel {
      display: none;
      min-height: 0;
      padding: 16px;
      overflow: visible;
    }
    .queue-layout.detail-open .queue-list { display: none; }
    .queue-layout.detail-open .details-panel { display: flex; }
    .back-btn { display: inline-flex; }

    .checkout-bar {
      position: sticky;
      bottom: 0;
      flex-direction: column;
      align-items: stretch;
      background: var(--bg-panel);
      margin: 18px -16px -16px;
      padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
      border-top: 1px solid var(--border-subtle);
    }
    .checkout-total {
      flex-direction: row;
      display: flex;
      align-items: baseline;
      justify-content: space-between;
    }
    .checkout-bar .btn-success { max-width: none; width: 100%; }
  }

  @media (max-width: 480px) {
    .header-actions { width: 100%; }
    .header-actions .btn-secondary { flex: 1; }
  }

  /* iFood (Task 11) */
  .ifood-detail-strip {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .handoff-codes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0;
  }

  .handoff-codes div {
    padding: 0.4rem 0.7rem;
    border: 1px solid var(--border-strong);
    border-radius: 0.5rem;
    background: var(--bg-card);
  }

  .handoff-codes dt {
    color: var(--text-muted);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .handoff-codes dd {
    margin: 0;
    color: var(--text-main);
    font-size: 1rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.08em;
  }

  .ifood-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
  }

  .ifood-modal {
    width: 100%;
    max-width: 460px;
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    padding: 1.25rem;
    border: 1px solid var(--border-card);
    border-radius: 14px;
    background: var(--bg-card);
    color: var(--text-main);
  }

  .ifood-modal-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .ifood-modal-head h2 {
    margin: 0.4rem 0 0;
    font-size: 1rem;
    font-weight: 700;
  }

  .ifood-modal-close {
    display: inline-grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  .ifood-modal-lead,
  .ifood-modal-state {
    margin: 0.75rem 0;
    color: var(--text-muted);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .ifood-verify-label {
    display: block;
    margin-top: 0.5rem;
    color: var(--text-label);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .ifood-verify-input {
    width: 100%;
    margin-top: 0.35rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
    background: var(--bg-input);
    color: var(--text-main);
    font-size: 1rem;
    letter-spacing: 0.08em;
  }

  .ifood-reasons {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .ifood-reason {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
    color: var(--text-label);
    font-size: 0.85rem;
    cursor: pointer;
  }

  .ifood-reason.selected {
    border-color: var(--primary);
    color: var(--text-main);
  }

  .ifood-reason input {
    accent-color: var(--primary);
  }

  .ifood-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }
</style>

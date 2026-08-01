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
  import { detectZeloImpressao } from '$lib/zeloImpressaoClient.js';
  import { createPrintedOrderStore, selectOrdersToAutoPrint } from '$lib/orderAutoPrint.js';
  import {
    canonicalFulfillmentMode,
    canonicalPaymentMethod,
    isCanonicalOrderPermissionError,
    itemModifierGroups,
    loadCanonicalOrders,
    subscribeCanonicalOrderUpdates,
    transitionCanonicalOrder,
    closeCanonicalOrder
  } from '$lib/onlineOrders';
  import { Printer } from 'lucide-svelte';
  import InlineHelper from '$lib/components/ui/InlineHelper.svelte';

  let ready = false;
  let loading = true;
  let orderingReviewActive = false;
  let userId = '';
  let ownerUserId = '';
  let operadorUserId = '';
  let isSubUser = false;
  let canCancelOrders = true;
  let canReceiveOrders = true;
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
  let autoPrintRetryIds = new Set();
  let reimprimindo = false;
  let orderBaselineReady = false;
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

  onMount(async () => {
    const auth = await ensureActiveSubscription({ requireProfile: true });
    if (!auth?.userId) return;

    userId = auth.userId;
    ownerUserId = auth.ownerUserId || auth.userId;
    operadorUserId = auth.userId;
    isSubUser = auth.isSubUser;
    if (isSubUser && !(await hasAccessPermission('pedidos.acessar'))) {
      addToast('Seu cargo não tem acesso à fila de pedidos.', 'warning');
      goto('/app');
      return;
    }
    if (isSubUser) {
      [canCancelOrders, canReceiveOrders] = await Promise.all([
        hasAccessPermission('pedidos.cancelar'),
        hasAccessPermission('pedidos.receber')
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

    await Promise.all([carregarEmpresa(), carregarCaixaAberto()]);
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
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
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

  async function imprimirPedidoAutomaticamente(pedido) {
    if (!pedido?.canonical || !printedOrderStore) return;
    if (!(await atualizarStatusImpressora())) {
      autoPrintRetryIds.add(pedido.id);
      return;
    }
    if (!printedOrderStore.reserve(pedido.id)) {
      autoPrintRetryIds.delete(pedido.id);
      return;
    }

    try {
      await printOrder(
        pedido,
        dadosEmpresa?.nome_exibicao || dadosEmpresa?.razao_social || 'Zelo PDV',
        dadosEmpresa?.id,
      );
      autoPrintRetryIds.delete(pedido.id);
    } catch (error) {
      printedOrderStore.release(pedido.id);
      autoPrintRetryIds.add(pedido.id);
      printerConnected = false;
      console.error('[printer] auto-print falhou para pedido', pedido.id, error);
      addToast('Não consegui imprimir o pedido automaticamente. Verifique a impressora.', 'warning');
    }
  }

  /**
   * Reimpressão manual: ignora o dedupe de 48h de propósito (o caso de uso é
   * justamente a via que não saiu). Em caso de sucesso, reserva o pedido no
   * store para a reconciliação não imprimir uma terceira via sozinha.
   */
  async function reimprimirPedido(pedido) {
    if (!pedido || reimprimindo) return;
    reimprimindo = true;
    try {
      await printOrder(
        pedido,
        dadosEmpresa?.nome_exibicao || dadosEmpresa?.razao_social || 'Zelo PDV',
        dadosEmpresa?.id,
      );
      printedOrderStore?.reserve(pedido.id);
      autoPrintRetryIds.delete(pedido.id);
      printerConnected = true;
      addToast('Pedido enviado para a impressora.', 'success');
    } catch (error) {
      printerConnected = false;
      console.error('[printer] reimpressão falhou para pedido', pedido.id, error);
      addToast('Não consegui imprimir o pedido. Verifique a impressora.', 'error');
    } finally {
      reimprimindo = false;
    }
  }

  function reconciliarImpressaoAutomatica(proximosPedidos) {
    if (!orderBaselineReady) {
      orderBaselineReady = true;
      return;
    }

    const autoPrintOptions = {
      maxAgeMs: 15 * 60 * 1000,
      now: Date.now(),
    };
    const novosPedidos = selectOrdersToAutoPrint(pedidos, proximosPedidos, autoPrintOptions);
    const pedidosParaRetry = selectOrdersToAutoPrint(
      [],
      proximosPedidos.filter((pedido) => autoPrintRetryIds.has(pedido.id)),
      autoPrintOptions,
    );
    const candidatos = new Map([...novosPedidos, ...pedidosParaRetry].map((pedido) => [pedido.id, pedido]));
    for (const pedido of candidatos.values()) void imprimirPedidoAutomaticamente(pedido);
  }

  async function carregarEmpresa() {
    try {
      const { data } = await supabase
        .from('empresa_perfil')
        .select('*')
        .eq('user_id', ownerUserId || userId)
        .maybeSingle();
      dadosEmpresa = data;
    } catch {}
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
      addToast('Erro ao verificar caixa: ' + error.message, 'error');
      return;
    }
    idCaixaAberto = data?.id || null;
  }

  async function carregarPedidos() {
    return carregarPedidosComRecuperacao(true);
  }

  async function carregarPedidosComRecuperacao(tentarRecuperarSessao) {
    if (polling || fechandoPedido || !userId) return;
    polling = true;
    try {
      const proximosPedidos = await loadCanonicalOrders(supabase, dadosEmpresa?.id);
      reconciliarImpressaoAutomatica(proximosPedidos);
      pedidos = proximosPedidos;
      if (!pedidos.some((p) => p.id === pedidoSelecionadoId)) {
        pedidoSelecionadoId = pedidos[0]?.id || null;
      }
    } catch (err) {
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
      addToast('Erro ao carregar pedidos: ' + getFriendlyErrorMessage(err), 'error');
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
    return cancelarPedidoCanonico(pedido);
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
    if (pedido.status === 'pending_review') return 'Aceitar pedido';
    if (pedido.status === 'accepted') return 'Iniciar preparo';
    if (pedido.status === 'preparing') return 'Marcar como pronto';
    if (pedido.status === 'ready' && canonicalFulfillmentMode(pedido) === 'delivery') return 'Saiu para entrega';
    if (pedido.status === 'ready' || pedido.status === 'out_for_delivery') return 'Concluir pedido';
    return 'Aguardando pagamento';
  }

  async function avancarPedidoCanonico(pedido) {
    if (pedido.status === 'pending_payment') return;
    const actionByStatus = {
      pending_review: 'accept', accepted: 'start_preparing', preparing: 'mark_ready',
      ready: canonicalFulfillmentMode(pedido) === 'delivery' ? 'dispatch' : 'close',
      out_for_delivery: 'close'
    };
    const action = actionByStatus[pedido.status];
    if (!action) return;
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
        <button type="button" class="btn-secondary" on:click={carregarPedidos} disabled={loading || polling} aria-label="Atualizar fila">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="icon"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992V4.356M19.5 15a7.5 7.5 0 11-2.197-5.303l3.722 3.722M3 12a9 9 0 0114.85-6.85"/></svg>
          <span>Atualizar</span>
        </button>
      </div>
    </header>

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
            <div class="queue-card">
              <button
                type="button"
                class="queue-item"
                class:selected={pedido.id === pedidoSelecionado?.id}
                aria-pressed={pedido.id === pedidoSelecionado?.id}
                on:click={() => selecionarPedido(pedido.id)}
              >
                <div class="qi-top">
                  <span class="order-num">#{pedido.numero_pedido}</span>
                  <span class="status-pill" data-status={pedido.status} aria-label="Status: {statusLabel(pedido.status)}">{statusLabel(pedido.status)}</span>
                </div>
                <div class="qi-mid">
                  <div class="qi-cliente-row">
                    <strong class="qi-cliente">{clienteLabel(pedido)}</strong>
                  </div>
                  <span class="qi-meta">{formatTime(pedido.criado_em)}</span>
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
                  disabled={!canCancelOrders}
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
                <p class="eyebrow">Pedido #{pedidoSelecionado.numero_pedido}</p>
                <h2>{clienteLabel(pedidoSelecionado)}</h2>
                <span class="details-meta">{formatTime(pedidoSelecionado.criado_em)}</span>
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
    overflow-y: auto;
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
    grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
    gap: 16px;
    align-items: start;
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
    padding: 10px;
    max-height: calc(100dvh - 140px);
    overflow-y: auto;
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
    min-height: 540px;
    display: flex;
    flex-direction: column;
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
    .queue-layout {
      grid-template-columns: 1fr;
      gap: 12px;
    }
    .queue-list { max-height: none; }
    .details-panel {
      display: none;
      min-height: 0;
      padding: 16px;
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
</style>

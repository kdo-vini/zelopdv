<script>
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabaseClient';
  import { ensureActiveSubscription, hasPedidosAddon, hasZeloMenuAccess, hasOrderingReviewAccess, bounceSubUserMissingAddon } from '$lib/guards';
  import { hasPermission as hasAccessPermission } from '$lib/accessControl';
  import { pdvCache } from '$lib/stores/pdvCache';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import { getFriendlyErrorMessage } from '$lib/errorUtils';
  import { logAuditAction } from '$lib/accessControl';
  import ModalPagamento from '$lib/components/modals/ModalPagamento.svelte';
  import { money } from '$lib/finance/caixa';
  import { buildVendaPayload } from '$lib/finance/saleOps';
  import { somarQuantidadePorEstoque } from '$lib/stock';
  import {
    canonicalFulfillmentMode,
    canonicalPaymentMethod,
    loadCanonicalOrders,
    subscribeCanonicalOrderUpdates,
    transitionCanonicalOrder,
    closeCanonicalOrder
  } from '$lib/onlineOrders';

  let ready = false;
  let loading = true;
  let addonActive = false;
  let menuActive = false;
  let orderingReviewActive = false;
  let userId = '';
  let ownerUserId = '';
  let operadorUserId = '';
  let isSubUser = false;
  let canCancelOrders = true;
  let canReceiveOrders = true;
  let pedidos = [];
  let pedidoSelecionadoId = null;
  let produtos = [];
  let dadosEmpresa = null;
  let idCaixaAberto = null;
  let modalPagamentoAberto = false;
  let fechandoPedido = false;
  let erroPagamento = '';
  let pollTimer = null;
  let realtimeRefreshTimer = null;
  let realtimeChannel = null;
  let polling = false;
  let modalPagamentoRef;
  let mobileDetailOpen = false;
  // Snapshot do pedido no momento de abrir o modal — protege contra o poll
  // trocar a seleção enquanto o caixa confirma o pagamento.
  let pedidoEmFechamento = null;
  let totalEmFechamento = 0;
  let itensEmFechamento = [];

  $: pedidoSelecionado = pedidos.find((p) => p.id === pedidoSelecionadoId) || pedidos[0] || null;
  $: itensSelecionados = (pedidoSelecionado?.pedido_itens || []).map((item) => ({
    id: item.id,
    id_produto: item.id_produto,
    nome: item.nome,
    preco: Number(item.preco_unitario || 0),
    quantidade: Number(item.quantidade || 0)
  }));
  $: totalPedido = pedidoSelecionado?.canonical
    ? Number(pedidoSelecionado.total || 0)
    : itensSelecionados.reduce((acc, item) => acc + item.preco * item.quantidade, 0);
  $: plataformasAtivas = (dadosEmpresa?.plataformas_pagamento || [])
    .filter((p) => p.ativo)
    .map((p) => ({ id: p.id, nome: p.nome, icone: p.icone || '[]', taxa_pct: Number(p.taxa_pct || 0) }));

  onMount(async () => {
    const auth = await ensureActiveSubscription({ requireProfile: true });
    if (!auth?.userId) return;

    userId = auth.userId;
    ownerUserId = auth.ownerUserId || auth.userId;
    operadorUserId = auth.userId;
    isSubUser = auth.isSubUser;
    if (isSubUser && !(await hasAccessPermission('pedidos.acessar'))) {
      addToast('Seu cargo não tem acesso ao módulo de pedidos.', 'warning');
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
    [addonActive, menuActive, orderingReviewActive] = await Promise.all([
      hasPedidosAddon(ownerUserId),
      hasZeloMenuAccess(ownerUserId),
      hasOrderingReviewAccess(ownerUserId)
    ]);
    const canAccess = orderingReviewActive;
    if (bounceSubUserMissingAddon({ addonActive: canAccess, isSubUser, addonLabel: 'Pedidos / ZeloMenu' })) return;
    ready = true;

    if (!canAccess) {
      loading = false;
      return;
    }

    await Promise.all([carregarProdutos(true), carregarEmpresa(), carregarCaixaAberto()]);
    await carregarPedidos();
    if (orderingReviewActive) {
      realtimeChannel = subscribeCanonicalOrderUpdates(supabase, dadosEmpresa?.id, () => {
        if (realtimeRefreshTimer) return;
        realtimeRefreshTimer = setTimeout(() => {
          realtimeRefreshTimer = null;
          void carregarPedidos();
        }, 150);
      });
    }
    pollTimer = setInterval(carregarPedidos, 30000);
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
    if (realtimeRefreshTimer) clearTimeout(realtimeRefreshTimer);
    if (realtimeChannel) void supabase.removeChannel(realtimeChannel);
  });

  async function carregarProdutos(forceRefresh = false) {
    try {
      produtos = await pdvCache.getProdutos(forceRefresh);
    } catch (err) {
      addToast('Erro ao carregar produtos: ' + getFriendlyErrorMessage(err), 'error');
    }
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
    if (polling || fechandoPedido || !userId) return;
    polling = true;
    try {
      // Origens carregadas dependem dos addons ativos:
      // balcao → sempre (se addonActive); zelomenu → se menuActive.
      // comanda segue fluxo de mesas; zelochat tem fluxo próprio.
      const origensParaCarregar = [];
      if (addonActive) origensParaCarregar.push('balcao');
      const legacyPromise = origensParaCarregar.length
        ? supabase
          .from('pedidos')
          .select('id, numero_pedido, status, observacoes, nome_cliente, origem, criado_em, pedido_itens(id, id_produto, nome, preco_unitario, quantidade, subtotal, enviado_cozinha, status_cozinha)')
          .eq('id_usuario', ownerUserId || userId)
          .in('origem', origensParaCarregar)
          .in('status', ['aberto', 'pronto'])
          .order('criado_em', { ascending: true })
        : Promise.resolve({ data: [], error: null });
      const [legacy, online] = await Promise.all([
        legacyPromise,
        orderingReviewActive ? loadCanonicalOrders(supabase, dadosEmpresa?.id) : Promise.resolve([])
      ]);
      if (legacy.error) throw legacy.error;
      pedidos = [...(legacy.data || []), ...online]
        .sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
      if (!pedidos.some((p) => p.id === pedidoSelecionadoId)) {
        pedidoSelecionadoId = pedidos[0]?.id || null;
      }
    } catch (err) {
      addToast('Erro ao carregar pedidos: ' + getFriendlyErrorMessage(err), 'error');
    } finally {
      loading = false;
      polling = false;
    }
  }

  function selecionarPedido(id) {
    pedidoSelecionadoId = id;
    if (window.matchMedia('(max-width: 860px)').matches) {
      mobileDetailOpen = true;
    }
  }

  function editarPedido(pedido) {
    if (pedido.canonical) {
      addToast('Pedidos online devem ser operados pelas ações de status.', 'warning');
      return;
    }
    goto(`/app/pedidos/${pedido.id}/editar`);
  }

  async function excluirPedido(pedido) {
    if (!canCancelOrders) {
      addToast('Seu cargo não pode cancelar ou rejeitar pedidos.', 'warning');
      return;
    }
    if (pedido.canonical) return cancelarPedidoCanonico(pedido);
    const titulo = `Pedido #${pedido.numero_pedido}`;
    const itensPronto = (pedido.pedido_itens || []).some((i) => i.status_cozinha === 'pronto');
    const mensagem = itensPronto
      ? `Cancelar o ${titulo}? Há itens já marcados como prontos pela cozinha — eles serão descartados.`
      : `Cancelar o ${titulo}? Esta ação não pode ser desfeita.`;

    const ok = await confirmAction('Cancelar pedido', mensagem);
    if (!ok) return;

    const { error, data } = await supabase
      .from('pedidos')
      .delete()
      .eq('id', pedido.id)
      .eq('id_usuario', ownerUserId || userId)
      .in('status', ['aberto', 'pronto'])
      .select('id');

    if (error) {
      addToast('Erro ao cancelar pedido: ' + getFriendlyErrorMessage(error), 'error');
      return;
    }
    if (!data || data.length === 0) {
      addToast('Pedido já foi fechado em outro dispositivo.', 'warning');
    } else {
      if (isSubUser) {
        logAuditAction({
          ownerUserId,
          action: 'pedido.cancelado',
          entityType: 'pedido',
          entityId: String(pedido.id),
          details: {
            numero_pedido: pedido.numero_pedido,
            origem: pedido.origem
          }
        });
      }
      addToast(`${titulo} cancelado.`, 'success');
    }
    if (pedidoSelecionadoId === pedido.id) pedidoSelecionadoId = null;
    await carregarPedidos();
  }

  async function abrirPagamento() {
    if (!pedidoSelecionado || totalPedido <= 0) return;
    if (!idCaixaAberto) {
      await carregarCaixaAberto();
      if (!idCaixaAberto) {
        addToast('Abra o caixa antes de fechar pedidos.', 'warning');
        return;
      }
    }
    erroPagamento = '';
    pedidoEmFechamento = pedidoSelecionado;
    totalEmFechamento = totalPedido;
    itensEmFechamento = itensSelecionados.map((i) => ({ ...i }));
    modalPagamentoAberto = true;
  }

  async function handlePagamentoConfirmado(event) {
    const alvo = pedidoEmFechamento;
    if (!alvo || fechandoPedido) return;
    modalPagamentoRef?.setSalvando?.(true);
    fechandoPedido = true;
    erroPagamento = '';

    try {
      const pagamento = event.detail;
      const venda = await criarVendaParaPedido(alvo, pagamento);

      // Guard com .eq('status', 'aberto') / 'pronto' evita reabrir um pedido já fechado.
      const { error: pedidoError, data: atualizado } = await supabase
        .from('pedidos')
        .update({
          status: 'fechado',
          id_venda: venda.id,
          fechado_em: new Date().toISOString(),
          id_operador: operadorUserId
        })
        .eq('id', alvo.id)
        .eq('id_usuario', ownerUserId || userId)
        .in('status', ['aberto', 'pronto'])
        .select('id');

      if (pedidoError) {
        addToast('Venda criada, mas falhou ao fechar o pedido. Verifique manualmente.', 'warning');
        throw pedidoError;
      }
      if (!atualizado || atualizado.length === 0) {
        // Pedido já estava fechado em outro device — venda foi criada por engano.
        addToast('Pedido já havia sido fechado em outro dispositivo. Reverta a venda manualmente se duplicada.', 'warning');
      }

      if (isSubUser) {
        logAuditAction({
          ownerUserId,
          action: 'pedido.fechado',
          entityType: 'pedido',
          entityId: String(alvo.id),
          details: {
            numero_pedido: alvo.numero_pedido,
            venda_id: venda.id
          }
        });
      }
      addToast(`Pedido #${alvo.numero_pedido} fechado com sucesso.`, 'success');
      modalPagamentoAberto = false;
      modalPagamentoRef?.resetState?.();
      mobileDetailOpen = false;
      pedidoEmFechamento = null;
      itensEmFechamento = [];
      totalEmFechamento = 0;
      pdvCache.invalidateProdutos();
      await Promise.all([carregarPedidos(), carregarProdutos(true)]);
    } catch (err) {
      const msg = getFriendlyErrorMessage(err);
      erroPagamento = msg;
      modalPagamentoRef?.setErro?.(msg);
    } finally {
      fechandoPedido = false;
      modalPagamentoRef?.setSalvando?.(false);
    }
  }

  async function criarVendaParaPedido(pedido, pagamento) {
    const itens = (pedido.pedido_itens || []).map((item) => ({
      id_produto: item.id_produto ?? null,
      nome: item.nome,
      quantidade: Number(item.quantidade || 0),
      preco: Number(item.preco_unitario || 0)
    }));

    if (!itens.length) throw new Error('Pedido sem itens.');

    const totalBase = money(totalEmFechamento || totalPedido);
    const totalFinal = money(pagamento.totalFinal ?? totalBase);

    // Pre-flight estoque check (UX: mensagem amigável antes de submeter o RPC)
    await validarEstoque(itens);

    const { payload } = buildVendaPayload({
      formaPagamento: pagamento.formaPagamento,
      valorRecebido: pagamento.valorRecebido,
      pagamentos: Array.isArray(pagamento.pagamentos) ? pagamento.pagamentos : [],
      totalFinal,
      valorDesconto: pagamento.valorDesconto || 0,
      descontoTipo: pagamento.descontoTipo || null,
      taxaEntrega: 0,
      tipoPedido: 'retirada',
      idCaixa: idCaixaAberto,
      idCliente: pagamento.idCliente || null,
      itens,
      taxasPlataforma: Array.isArray(pagamento.taxasPlataforma) ? pagamento.taxasPlataforma : [],
      operadorId: operadorUserId
    });

    const { data, error: rpcError } = await supabase.rpc('criar_venda_completa', {
      p_payload: payload
    });
    if (rpcError) throw rpcError;

    return { id: data?.id, numero_venda: data?.numero_venda };
  }

  async function validarEstoque(itens) {
    const ids = [...new Set(itens.filter((item) => item.id_produto).map((item) => item.id_produto))];
    if (!ids.length) return;

    const { data, error } = await supabase
      .from('produtos')
      .select('id, nome, id_categoria, controlar_estoque, estoque_atual, categorias(id, nome, controlar_estoque_compartilhado, estoque_compartilhado_atual)')
      .in('id', ids);
    if (error) throw error;

    const produtosMap = new Map((data || []).map((produto) => [produto.id, produto]));

    // Produto referenciado pelo pedido não existe mais — bloqueia a venda
    // pra evitar FK violation em vendas_itens e venda fantasma.
    const removidos = [];
    for (const item of itens) {
      if (item.id_produto && !produtosMap.has(item.id_produto)) {
        removidos.push(item.nome);
      }
    }
    if (removidos.length) {
      throw new Error(`Produto removido do cadastro: ${removidos.join(', ')}. Edite o pedido antes de receber.`);
    }

    const itensComInfo = itens
      .filter((item) => item.id_produto)
      .map((item) => ({
        ...produtosMap.get(item.id_produto),
        id_produto: item.id_produto,
        nome: produtosMap.get(item.id_produto)?.nome || item.nome,
        quantidade: Number(item.quantidade || 0)
      }));

    const insuficientes = somarQuantidadePorEstoque(itensComInfo, itensComInfo)
      .filter((item) => item.quantidade > item.disponivel)
      .map((item) => `${item.nome} (disp: ${item.disponivel}, ped: ${item.quantidade})`);

    if (insuficientes.length) {
      throw new Error(`Estoque insuficiente para: ${insuficientes.join(', ')}`);
    }
  }

  function statusLabel(status) {
    const labels = {
      pending_payment: 'Aguardando pagamento', pending_review: 'Revisar', accepted: 'Aceito',
      preparing: 'Preparando', ready: 'Pronto', out_for_delivery: 'Saiu para entrega',
      delivered: 'Entregue', rejected: 'Rejeitado', cancelled: 'Cancelado', pronto: 'Pronto', aberto: 'Aberto'
    };
    return labels[status] || status;
  }

  function origemLabel(pedido) {
    if (pedido?.origem === 'zelomenu') return 'Online';
    if (pedido?.origem === 'comanda') return 'Mesa';
    if (pedido?.origem === 'zelochat') return 'ZeloChat';
    return 'Balcão';
  }

  async function fecharPedidoZeloMenu(pedido) {
    if (pedido.canonical) return avancarPedidoCanonico(pedido);
    const ok = await confirmAction(
      `Confirmar entrega — Pedido #${pedido.numero_pedido}`,
      'Marcar como entregue? O pagamento já foi coletado pelo cardápio online.'
    );
    if (!ok) return;
    fechandoPedido = true;
    try {
      const { error, data: atualizado } = await supabase
        .from('pedidos')
        .update({ status: 'fechado', fechado_em: new Date().toISOString(), id_operador: operadorUserId })
        .eq('id', pedido.id)
        .eq('id_usuario', ownerUserId || userId)
        .in('status', ['aberto', 'pronto'])
        .select('id');
      if (error) throw error;
      if (!atualizado || atualizado.length === 0) {
        addToast('Pedido já havia sido fechado em outro dispositivo.', 'warning');
      } else {
        addToast(`Pedido #${pedido.numero_pedido} marcado como entregue.`, 'success');
      }
      mobileDetailOpen = false;
      await carregarPedidos();
    } catch (err) {
      addToast('Erro: ' + getFriendlyErrorMessage(err), 'error');
    } finally {
      fechandoPedido = false;
    }
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
  {:else if !addonActive && !menuActive}
    <section class="upsell">
      <p class="eyebrow">Módulo Pedidos</p>
      <h1>Fila de Pedidos</h1>
      <p>Ative o ZeloMenu ou o módulo de Pedidos para receber e gerenciar pedidos.</p>
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
        <button type="button" class="btn-primary" on:click={() => goto('/app/pedidos/novo')}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="icon"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
          <span>Novo pedido</span>
        </button>
      </div>
    </header>

    {#if loading}
      <div class="state-card">Carregando pedidos...</div>
    {:else if pedidos.length === 0}
      <div class="empty-state">
        <div class="empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h10.5M8.25 12h10.5M8.25 17.25h10.5M3.75 6.75h.008v.008H3.75V6.75Zm0 5.25h.008v.008H3.75V12Zm0 5.25h.008v.008H3.75v-.008Z"/></svg>
        </div>
        <h2>Nenhum pedido na fila</h2>
        <p>Pedidos abertos e prontos aparecem aqui automaticamente.</p>
        <button type="button" class="btn-primary" on:click={() => goto('/app/pedidos/novo')}>Criar pedido</button>
      </div>
    {:else}
      <div class="queue-layout" class:detail-open={mobileDetailOpen}>
        <section class="queue-list" aria-label="Fila de pedidos">
          {#each pedidos as pedido (pedido.id)}
            {@const totalCard = pedido.canonical
              ? Number(pedido.total || 0)
              : (pedido.pedido_itens || []).reduce((acc, item) => acc + Number(item.subtotal || Number(item.preco_unitario || 0) * Number(item.quantidade || 0)), 0)}
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
                    {#if pedido.origem === 'zelomenu'}
                      <span class="online-badge">Online</span>
                    {/if}
                  </div>
                  <span class="qi-meta">{origemLabel(pedido)} · {formatTime(pedido.criado_em)}</span>
                </div>
                <div class="qi-foot">
                  <span>{qtdItens} {qtdItens === 1 ? 'item' : 'itens'}</span>
                  <strong>{formatMoney(totalCard)}</strong>
                </div>
              </button>
              <div class="queue-actions">
                <button
                  type="button"
                  class="action-btn"
                  aria-label="Editar pedido #{pedido.numero_pedido}"
                  title="Editar pedido"
                  on:click|stopPropagation={() => editarPedido(pedido)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/></svg>
                </button>
                <button
                  type="button"
                  class="action-btn action-btn-danger"
                  aria-label="Cancelar pedido #{pedido.numero_pedido}"
                  title={canCancelOrders ? 'Cancelar pedido' : 'Seu cargo não pode cancelar pedidos'}
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
                <span class="details-meta">{origemLabel(pedidoSelecionado)} · {formatTime(pedidoSelecionado.criado_em)}</span>
              </div>
              <span class="status-pill" data-status={pedidoSelecionado.status}>{statusLabel(pedidoSelecionado.status)}</span>
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
              {#if pedidoSelecionado?.origem === 'zelomenu'}
                <button type="button" class="btn-success" on:click={() => fecharPedidoZeloMenu(pedidoSelecionado)} disabled={fechandoPedido || (pedidoSelecionado.canonical && (pedidoSelecionado.status === 'pending_payment' || (['ready', 'out_for_delivery'].includes(pedidoSelecionado.status) && !canReceiveOrders)))} title={pedidoSelecionado.canonical && ['ready', 'out_for_delivery'].includes(pedidoSelecionado.status) && !canReceiveOrders ? 'Seu cargo não pode concluir pedidos' : ''}>
                  {#if fechandoPedido}
                    Confirmando...
                  {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="icon"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <span>{pedidoSelecionado.canonical ? canonicalActionLabel(pedidoSelecionado) : 'Confirmar entrega'}</span>
                  {/if}
                </button>
              {:else}
                <button type="button" class="btn-success" on:click={abrirPagamento} disabled={fechandoPedido || totalPedido <= 0}>
                  {#if fechandoPedido}
                    Fechando...
                  {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="icon"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/></svg>
                    <span>Receber</span>
                  {/if}
                </button>
              {/if}
            </footer>

            {#if erroPagamento}
              <p class="error-text">{erroPagamento}</p>
            {/if}
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

<ModalPagamento
  bind:this={modalPagamentoRef}
  open={modalPagamentoAberto}
  totalComanda={totalEmFechamento || totalPedido}
  subtotalProdutos={totalEmFechamento || totalPedido}
  comanda={itensEmFechamento.length ? itensEmFechamento : itensSelecionados}
  {idCaixaAberto}
  {produtos}
  {plataformasAtivas}
  tipoPedido="retirada"
  taxaEntrega={0}
  on:confirmar={handlePagamentoConfirmado}
  on:close={() => { modalPagamentoAberto = false; pedidoEmFechamento = null; itensEmFechamento = []; totalEmFechamento = 0; }}
/>

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

  .btn-primary,
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

  .btn-primary,
  .upsell a {
    background: var(--primary);
    color: var(--primary-text);
  }
  .btn-primary:hover:not(:disabled),
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
  .online-badge {
    flex-shrink: 0;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--primary) 40%, transparent);
    border-radius: 4px;
    padding: 1px 5px;
    line-height: 1.4;
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
  .items-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 0;
    border-bottom: 1px solid var(--border-subtle);
  }
  .items-list li:last-child { border-bottom: 0; }
  .item-info { display: grid; gap: 4px; min-width: 0; }
  .item-info strong { color: var(--text-main); font-weight: 700; }
  .item-info span { color: var(--text-muted); font-size: 0.82rem; }
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

  .error-text {
    margin: 12px 0 0;
    color: var(--error);
    font-weight: 700;
  }

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
    .header-actions .btn-secondary,
    .header-actions .btn-primary { flex: 1; }
  }
</style>

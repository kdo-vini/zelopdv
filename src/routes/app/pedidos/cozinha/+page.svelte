<script>
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabaseClient';
  import { ensureActiveSubscription, hasKitchenQueueAccess, bounceSubUserMissingAddon } from '$lib/guards';
  import { hasPermission as hasAccessPermission } from '$lib/accessControl';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import BackLink from '$lib/components/ui/BackLink.svelte';
  import InlineHelper from '$lib/components/ui/InlineHelper.svelte';
  import { itemModifierGroups, loadCanonicalOrders, transitionCanonicalOrder } from '$lib/onlineOrders';
  import {
    ifoodHasPendingCommand,
    isIfoodOrder,
    kitchenVisibleOrders,
    resolveKitchenAdvance,
    upcomingScheduledOrders
  } from '$lib/orders/ifoodPresentation.js';
  import { fetchIfoodSyncState, sendIfoodCommand } from '$lib/orders/ifoodCommandsClient.js';
  import OrderSourceBadge from '$lib/components/orders/OrderSourceBadge.svelte';
  import IfoodSyncState from '$lib/components/orders/IfoodSyncState.svelte';
  import { zeloSurface } from '$lib/theme/surface';
  import { MorphButton } from '$lib/components/zelo';
  import { Button } from '$lib/components/ui/button';
  import { CalendarClock, Check, ChefHat, ChevronLeft, Flame, RefreshCw, X } from 'lucide-svelte';

  let ownerUserId = '';
  let empresaId = '';
  let operadorUserId = '';
  let isSubUser = false;
  let canCancelOrders = true;
  let addonActive = false;
  let ready = false;
  let loading = true;
  let refreshing = false;
  let pedidos = [];
  let markingIds = new Set();
  let realtimeChannel = null;
  let refreshTimer = null;
  let ifoodSync = {};
  let nowTick = Date.now();
  let clockTimer = null;
  let ifoodSyncTimer = null;

  // Scheduled iFood orders only reach the board at their preparation start.
  $: pedidosVisiveis = kitchenVisibleOrders(pedidos, nowTick);
  $: pedidosAgendados = upcomingScheduledOrders(pedidos, nowTick);
  $: pedidosAbertos = pedidosVisiveis.filter(p => ['accepted', 'preparing'].includes(p.status));
  $: pedidosProntos = pedidosVisiveis.filter(p => p.status === 'ready');
  $: totalItensPendentes = pedidosAbertos.reduce(
    (acc, p) => acc + p.itens.filter(i => i.status_cozinha !== 'pronto').length,
    0
  );

  onMount(() => {
    boot();
    clockTimer = setInterval(() => { nowTick = Date.now(); }, 15000);
    ifoodSyncTimer = setInterval(() => {
      if (Object.values(ifoodSync).some((state) => ifoodHasPendingCommand(state))) void atualizarIfoodSync();
    }, 8000);
    return cleanupRealtime;
  });

  onDestroy(() => {
    cleanupRealtime();
    if (clockTimer) clearInterval(clockTimer);
    if (ifoodSyncTimer) clearInterval(ifoodSyncTimer);
  });

  async function boot() {
    const auth = await ensureActiveSubscription({ requireProfile: true });
    if (!auth?.userId) return;

    ownerUserId = auth.ownerUserId || auth.userId;
    operadorUserId = auth.userId;
    isSubUser = auth.isSubUser;
    if (isSubUser && !(await hasAccessPermission('pedidos.cozinha'))) {
      addToast('Seu cargo não tem acesso ao painel de cozinha.', 'warning');
      goto('/app');
      return;
    }
    addonActive = await hasKitchenQueueAccess(ownerUserId);
    if (bounceSubUserMissingAddon({ addonActive, isSubUser, addonLabel: 'ZeloMenu' })) return;
    ready = true;
    if (!addonActive) {
      loading = false;
      return;
    }

    const { data: empresa, error: empresaError } = await supabase
      .from('empresa_perfil')
      .select('id')
      .eq('user_id', ownerUserId)
      .maybeSingle();
    if (empresaError || !empresa?.id) {
      addToast('Não foi possível identificar a empresa para carregar pedidos online.', 'error');
      loading = false;
      return;
    }
    if (isSubUser) canCancelOrders = await hasAccessPermission('pedidos.cancelar');
    empresaId = empresa.id;

    await loadPedidos();
    setupRealtime();
  }

  async function loadPedidos() {
    if (!empresaId) return;
    if (!loading) refreshing = true;

    try {
      pedidos = await loadCanonicalOrders(supabase, empresaId, { kitchen: true });
      void atualizarIfoodSync();
    } catch (err) {
      addToast('Não foi possível carregar os pedidos da cozinha. Verifique sua conexão e tente novamente.', 'error');
    } finally {
      loading = false;
      refreshing = false;
    }
  }

  function setupRealtime() {
    cleanupRealtime();
    realtimeChannel = supabase
      .channel(`cozinha-${ownerUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'zelo_orders', filter: `empresa_id=eq.${empresaId}` },
        scheduleRefresh
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zelo_order_items' }, scheduleRefresh)
      .subscribe();
  }

  function cleanupRealtime() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }

  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      loadPedidos();
    }, 250);
  }

  function pedidoTitulo(pedido) {
    const nome = (pedido?.nome_cliente || '').trim();
    if (nome) return nome;
    if (pedido.numero_pedido) return `Pedido #${pedido.numero_pedido}`;
    return `Pedido ${String(pedido.id).slice(0, 8)}`;
  }

  function pedidoSubtitulo(pedido) {
    if (pedido?.nome_cliente && pedido.numero_pedido) return `#${pedido.numero_pedido}`;
    return '';
  }

  function minutosDesde(dataIso) {
    if (!dataIso) return '';
    const diff = Math.max(0, Date.now() - new Date(dataIso).getTime());
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'agora';
    return `${min} min`;
  }

  function horaCurta(value) {
    if (!value) return '--:--';
    return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function itemPronto(item) {
    return item.status_cozinha === 'pronto';
  }

  function isMarking(pedido) {
    return markingIds.has(pedido.id);
  }

  async function atualizarIfoodSync() {
    const ids = pedidos.filter(isIfoodOrder).map((p) => p.id);
    ifoodSync = ids.length ? await fetchIfoodSyncState(supabase, ids) : {};
  }

  function comandoIfoodPendente(pedido) {
    return isIfoodOrder(pedido) && ifoodHasPendingCommand(ifoodSync[pedido.id]);
  }

  /** Runs a kitchen step: iFood goes through the command API, other channels keep the RPC. */
  async function executarEtapa(pedido, step, errorMessage) {
    const advance = resolveKitchenAdvance(pedido, step);
    if (advance.kind === 'transition') {
      await transitionCanonicalOrder(supabase, pedido, advance.action, operadorUserId);
      await loadPedidos();
      return;
    }
    if (advance.kind !== 'ifood_command' || comandoIfoodPendente(pedido)) return;
    const result = await sendIfoodCommand(supabase, pedido, advance.intent);
    if (!result.ok) {
      addToast(result.message || errorMessage, result.status === 409 ? 'warning' : 'error');
      if (result.status === 409) await loadPedidos();
      return;
    }
    // The card only moves when iFood confirms by event.
    addToast('Enviado ao iFood. O pedido avança assim que o iFood confirmar.', 'info');
    await atualizarIfoodSync();
  }

  async function excluirPedido(pedido) {
    if (isIfoodOrder(pedido)) {
      addToast('Pedidos do iFood são cancelados pela tela de Pedidos, com o motivo exigido pelo iFood.', 'info');
      return;
    }
    if (!canCancelOrders) {
      addToast('Seu cargo não pode cancelar pedidos.', 'warning');
      return;
    }
    const ok = await confirmAction('Cancelar pedido', 'Esta ação será registrada no histórico do pedido.');
    if (!ok) return;
    try {
      await transitionCanonicalOrder(supabase, pedido, 'cancel', operadorUserId);
      await loadPedidos();
    } catch (error) {
      addToast('Não foi possível cancelar o pedido. Tente novamente.', 'error');
    }
  }

  async function marcarPedidoPreparando(pedido) {
    if (pedido.status !== 'accepted') return;
    try {
      await executarEtapa(pedido, 'start', 'Não foi possível iniciar o preparo. Tente novamente.');
    } catch (error) {
      addToast('Não foi possível iniciar o preparo. Tente novamente.', 'error');
    }
  }

  /**
   * O motor canônico não tem estado por item: o preparo conclui o pedido inteiro
   * (`mark_ready`). O botão aparece por item só para manter o alvo de toque grande
   * na tela da cozinha, mas a transição é sempre do pedido.
   */
  async function marcarPedidoPronto(pedido) {
    if (pedido.status !== 'preparing' || markingIds.has(pedido.id)) return;
    markingIds = new Set(markingIds).add(pedido.id);
    try {
      await executarEtapa(pedido, 'ready', 'Não foi possível concluir o preparo. Tente novamente.');
    } catch (error) {
      addToast('Não foi possível concluir o preparo. Tente novamente.', 'error');
    } finally {
      const next = new Set(markingIds);
      next.delete(pedido.id);
      markingIds = next;
    }
  }
</script>

{#if ready && !addonActive}
  <main class="blocked">
    <section class="blocked-panel">
      <p class="eyebrow">ZeloMenu</p>
      <h1>Cozinha indisponível</h1>
      <p>Ative o ZeloMenu para usar o painel de preparo.</p>
      <a href="/assinatura?addon=menu">Ativar ZeloMenu</a>
    </section>
  </main>
{:else if $zeloSurface}
  <!-- Zelo Design System (mockup 02 aprovado): clara, letra maior para leitura à distância. Same handlers and checks as the legacy branch below. -->
  <main class="zk">
    <header class="zk-head">
      <div>
        <p class="zk-eyebrow"><a href="/app/pedidos" class="zk-back"><ChevronLeft size={13} strokeWidth={1.75} aria-hidden="true" />Pedidos</a> / Cozinha</p>
        <h1 class="zk-title">Cozinha</h1>
      </div>
      <div class="zk-head-acts">
        <span class="zk-pill"><b>{pedidosAbertos.length}</b> em preparo</span>
        <span class="zk-pill ok"><i aria-hidden="true"></i><b>{pedidosProntos.length}</b> {pedidosProntos.length === 1 ? 'pronto' : 'prontos'}</span>
        <span class="zk-pill"><b>{totalItensPendentes}</b> itens abertos</span>
        <Button variant="outlined" size="md" onclick={loadPedidos} disabled={loading || refreshing}><RefreshCw strokeWidth={1.75} class={refreshing ? 'zk-spin' : ''} />{refreshing ? 'Atualizando' : 'Atualizar'}</Button>
      </div>
    </header>

    {#if !canCancelOrders}
      <InlineHelper id="cozinha-cancel-hint" compact message="Seu cargo não pode cancelar pedidos. Peça essa ação ao responsável pela operação." />
    {/if}

    {#if loading}
      <p class="zk-muted">Carregando cozinha…</p>
    {:else if pedidosVisiveis.length === 0 && pedidosAgendados.length === 0}
      <div class="zk-empty"><ChefHat size={32} strokeWidth={1.5} aria-hidden="true" /><p>Nenhum item enviado para a cozinha.</p></div>
    {:else}
      {#if pedidosAgendados.length}
        <section class="zk-sched" aria-label="Pedidos agendados">
          <p class="zk-eyebrow"><CalendarClock size={13} strokeWidth={1.75} aria-hidden="true" />Agendados</p>
          <ul>
            {#each pedidosAgendados as pedido (pedido.id)}
              <li><OrderSourceBadge order={pedido} onlyExternal />{pedidoTitulo(pedido)}<b>preparo a partir de {horaCurta(pedido.ifood?.preparationStartAt)}</b></li>
            {/each}
          </ul>
        </section>
      {/if}

      <section class="zk-board">
        <div class="zk-lane">
          <h2 class="zk-lane-h">Em preparo <span>{pedidosAbertos.length}</span></h2>
          <div class="zk-grid">
            {#each pedidosAbertos as pedido (pedido.id)}
              {@const pendentes = pedido.itens.filter((i) => !itemPronto(i)).length}
              <article class="zk-card" class:preparing={pedido.status === 'preparing'} class:late={(nowTick - Date.parse(pedido.criado_em)) / 60000 >= 15}>
                <header class="zk-card-h">
                  <div class="zk-card-id">
                    {#if isIfoodOrder(pedido)}<OrderSourceBadge order={pedido} />{/if}
                    <h3>{pedidoTitulo(pedido)}</h3>
                    <p>{#if pedidoSubtitulo(pedido)}<span class="zk-mono">{pedidoSubtitulo(pedido)}</span> · {/if}{pedido.status === 'preparing' ? 'Em preparo' : 'Aguardando início'}</p>
                  </div>
                  <div class="zk-card-r">
                    <span class="zk-time">{minutosDesde(pedido.criado_em)}</span>
                    <button type="button" class="zk-x" aria-label="Cancelar pedido" aria-describedby={!canCancelOrders ? 'cozinha-cancel-hint' : undefined} disabled={!canCancelOrders || isIfoodOrder(pedido)} title={isIfoodOrder(pedido) ? 'Cancele pedidos do iFood pela tela de Pedidos' : undefined} on:click={() => excluirPedido(pedido)}><X size={16} strokeWidth={1.75} /></button>
                  </div>
                </header>
                {#if isIfoodOrder(pedido)}<IfoodSyncState order={pedido} syncState={ifoodSync[pedido.id] || null} now={nowTick} compact />{/if}
                {#if pedido.observacoes}<p class="zk-obs">{pedido.observacoes}</p>{/if}
                <p class="zk-prog">{pendentes} de {pedido.itens.length} {pendentes === 1 ? 'pendente' : 'pendentes'}</p>
                <ul>
                  {#each pedido.itens as item (item.id)}
                    {@const montagem = itemModifierGroups(item)}
                    <li class:done={itemPronto(item)}>
                      <span class="zk-q">{Number(item.quantidade)}×</span>
                      <div>
                        <p class="zk-nm">{item.nome}</p>
                        {#each montagem as grupo (grupo.groupName)}<p class="zk-mod">{grupo.groupName}: {grupo.optionNames.join(', ')}</p>{/each}
                      </div>
                      {#if itemPronto(item)}<span class="zk-done"><Check size={16} strokeWidth={2} aria-hidden="true" />Pronto</span>{/if}
                    </li>
                  {/each}
                </ul>
                {#if pedido.status === 'accepted'}
                  <MorphButton state={comandoIfoodPendente(pedido) ? 'loading' : 'idle'} size="touch" class="zk-cta" loadingLabel="Aguardando o iFood…" onclick={() => marcarPedidoPreparando(pedido)}>
                    <Flame size={18} strokeWidth={1.75} aria-hidden="true" />Iniciar preparo
                  </MorphButton>
                {:else}
                  <MorphButton
                    state={isMarking(pedido) || comandoIfoodPendente(pedido) ? 'loading' : 'idle'}
                    size="touch"
                    class="zk-cta"
                    loadingLabel="Marcando pronto…"
                    onclick={() => marcarPedidoPronto(pedido)}
                    disabled={pendentes === 0 || pedido.status !== 'preparing' || resolveKitchenAdvance(pedido, 'ready').kind === 'none'}
                  >
                    <Check size={18} strokeWidth={1.75} aria-hidden="true" />Marcar pedido pronto
                  </MorphButton>
                {/if}
              </article>
            {/each}
            {#if pedidosAbertos.length === 0}<p class="zk-muted">Nada em preparo agora.</p>{/if}
          </div>
        </div>

        <div class="zk-lane ready">
          <h2 class="zk-lane-h">Prontos <span>{pedidosProntos.length}</span></h2>
          <div class="zk-ready">
            {#each pedidosProntos as pedido (pedido.id)}
              <article class="zk-rcard">
                <div>
                  {#if isIfoodOrder(pedido)}<OrderSourceBadge order={pedido} />{/if}
                  <h3>{pedidoTitulo(pedido)}</h3>
                  <p>{#if pedidoSubtitulo(pedido)}<span class="zk-mono">{pedidoSubtitulo(pedido)}</span> · {/if}{pedido.itens.length} {pedido.itens.length === 1 ? 'item' : 'itens'}</p>
                </div>
                <button type="button" class="zk-x" aria-label="Cancelar pedido" aria-describedby={!canCancelOrders ? 'cozinha-cancel-hint' : undefined} disabled={!canCancelOrders || isIfoodOrder(pedido)} title={isIfoodOrder(pedido) ? 'Cancele pedidos do iFood pela tela de Pedidos' : undefined} on:click={() => excluirPedido(pedido)}><X size={16} strokeWidth={1.75} /></button>
              </article>
            {/each}
          </div>
        </div>
      </section>
    {/if}
  </main>
{:else}
  <main class="kitchen-shell">
    <header class="kitchen-topbar">
      <div>
        <BackLink href="/app/pedidos" label="Pedidos" />
        <p class="eyebrow">Vendas / Cozinha</p>
        <h1>Pedidos em preparo</h1>
      </div>
      <div class="status-strip">
        <div>
          <span>{pedidosAbertos.length}</span>
          <small>abertos</small>
        </div>
        <div>
          <span>{totalItensPendentes}</span>
          <small>itens</small>
        </div>
        <button type="button" on:click={loadPedidos} disabled={loading || refreshing}>
          {refreshing ? 'Atualizando' : 'Atualizar'}
        </button>
      </div>
    </header>

    {#if !canCancelOrders}
      <InlineHelper id="cozinha-cancel-hint" compact message="Seu cargo não pode cancelar pedidos. Peça essa ação ao responsável pela operação." />
    {/if}

    {#if loading}
      <section class="empty-state">
        <p>Carregando cozinha...</p>
      </section>
    {:else if pedidosVisiveis.length === 0 && pedidosAgendados.length === 0}
      <section class="empty-state">
        <p>Nenhum item enviado para a cozinha.</p>
      </section>
    {:else}
      {#if pedidosAgendados.length}
        <section class="scheduled-strip" aria-label="Pedidos agendados">
          <h2>Agendados</h2>
          <ul>
            {#each pedidosAgendados as pedido (pedido.id)}
              <li>
                <OrderSourceBadge order={pedido} />
                <span class="scheduled-name">{pedidoTitulo(pedido)}</span>
                <span class="scheduled-time">preparo a partir de {horaCurta(pedido.ifood?.preparationStartAt)}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
      <section class="kitchen-board">
        <div class="lane">
          <div class="lane-header">
            <h2>Em preparo</h2>
            <span>{pedidosAbertos.length}</span>
          </div>
          <div class="pedido-grid">
            {#each pedidosAbertos as pedido (pedido.id)}
              <article class="pedido-card">
                <div class="card-actions">
                  <button
                    type="button"
                    class="action-btn action-btn-danger"
                    aria-label="Cancelar pedido"
                    aria-describedby={!canCancelOrders ? 'cozinha-cancel-hint' : undefined}
                    disabled={!canCancelOrders || isIfoodOrder(pedido)}
                    title={isIfoodOrder(pedido) ? 'Cancele pedidos do iFood pela tela de Pedidos' : undefined}
                    on:click={() => excluirPedido(pedido)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
                <div class="pedido-header">
                  <div>
                    {#if isIfoodOrder(pedido)}<OrderSourceBadge order={pedido} />{/if}
                    <h3>{pedidoTitulo(pedido)}</h3>
                    <p>
                      {#if pedidoSubtitulo(pedido)}<span class="num-tag">{pedidoSubtitulo(pedido)}</span> · {/if}
                      {minutosDesde(pedido.criado_em)}
                    </p>
                    {#if pedido.status === 'preparing'}
                      <span class="status-preparando">Em preparo</span>
                    {/if}
                  </div>
                  <span>{pedido.itens.filter(i => !itemPronto(i)).length}/{pedido.itens.length}</span>
                </div>
                {#if isIfoodOrder(pedido)}
                  <IfoodSyncState order={pedido} syncState={ifoodSync[pedido.id] || null} now={nowTick} compact />
                {/if}
                {#if pedido.observacoes}
                  <p class="observacoes">{pedido.observacoes}</p>
                {/if}
                <ul>
                  {#each pedido.itens as item (item.id)}
                    {@const montagem = itemModifierGroups(item)}
                    <li class:done={itemPronto(item)}>
                      <div>
                        <strong>{Number(item.quantidade)}x {item.nome}</strong>
                        {#if montagem.length}
                          <div class="item-modifiers">
                            {#each montagem as grupo (grupo.groupName)}
                              <p><span class="modifier-group">{grupo.groupName}:</span> {grupo.optionNames.join(', ')}</p>
                            {/each}
                          </div>
                        {/if}
                        {#if item.status_cozinha}
                          <small>{item.status_cozinha}</small>
                        {:else}
                          <small>pendente</small>
                        {/if}
                      </div>
                      <button
                        type="button"
                        on:click={() => marcarPedidoPronto(pedido)}
                        disabled={itemPronto(item) || isMarking(pedido) || pedido.status !== 'preparing' || comandoIfoodPendente(pedido) || resolveKitchenAdvance(pedido, 'ready').kind === 'none'}
                        aria-describedby={pedido.status === 'accepted' ? `cozinha-start-hint-${pedido.id}` : undefined}
                      >
                        {itemPronto(item) ? 'Pronto' : (isMarking(pedido) ? '...' : 'Marcar')}
                      </button>
                    </li>
                  {/each}
                </ul>
                {#if pedido.status === 'accepted'}
                  <InlineHelper id={`cozinha-start-hint-${pedido.id}`} compact message="Inicie o preparo antes de marcar os itens como prontos." />
                  <button
                    type="button"
                    class="pedido-action-btn"
                    on:click={() => marcarPedidoPreparando(pedido)}
                    disabled={comandoIfoodPendente(pedido)}
                  >
                    {comandoIfoodPendente(pedido) ? 'Aguardando o iFood...' : 'Iniciar preparo'}
                  </button>
                {/if}
              </article>
            {/each}
          </div>
        </div>

        <div class="lane ready-lane">
          <div class="lane-header">
            <h2>Prontos</h2>
            <span>{pedidosProntos.length}</span>
          </div>
          <div class="ready-list">
            {#each pedidosProntos as pedido (pedido.id)}
              <article class="ready-card">
                <div class="ready-info">
                  {#if isIfoodOrder(pedido)}<OrderSourceBadge order={pedido} />{/if}
                  <h3>{pedidoTitulo(pedido)}</h3>
                  <p>
                    {#if pedidoSubtitulo(pedido)}<span class="num-tag">{pedidoSubtitulo(pedido)}</span> · {/if}
                    {pedido.itens.length} {pedido.itens.length === 1 ? 'item' : 'itens'}
                  </p>
                </div>
                <div class="ready-actions">
                  <span class="ready-tag">Pronto</span>
                  <button
                    type="button"
                    class="action-btn action-btn-danger"
                    aria-label="Cancelar pedido"
                    aria-describedby={!canCancelOrders ? 'cozinha-cancel-hint' : undefined}
                    disabled={!canCancelOrders || isIfoodOrder(pedido)}
                    title={isIfoodOrder(pedido) ? 'Cancele pedidos do iFood pela tela de Pedidos' : undefined}
                    on:click={() => excluirPedido(pedido)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              </article>
            {/each}
          </div>
        </div>
      </section>
    {/if}
  </main>
{/if}

<style>
  :global(body) {
    background: var(--bg-app);
  }

  .kitchen-shell,
  .blocked {
    height: 100%;
    overflow-y: auto;
    background: var(--bg-app);
    color: var(--text-main);
    padding: clamp(1rem, 2vw, 2rem);
  }

  .kitchen-topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  }

  .eyebrow {
    margin: 0 0 0.35rem;
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--primary);
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  h1 {
    font-size: clamp(1.8rem, 4vw, 3.4rem);
    font-weight: 900;
  }

  .status-strip {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .status-strip > div {
    min-width: 92px;
    padding: 0.65rem 0.85rem;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.82);
  }

  .status-strip span {
    display: block;
    font-size: 1.45rem;
    font-weight: 900;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .status-strip small {
    color: var(--text-muted);
    font-size: 0.72rem;
    text-transform: uppercase;
    font-weight: 800;
  }

  button,
  .blocked-panel a {
    border: 0;
    border-radius: 8px;
    background: var(--primary);
    color: var(--primary-text);
    font-weight: 900;
    cursor: pointer;
    min-height: 44px;
    padding: 0.65rem 0.9rem;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  button:hover:not(:disabled),
  .blocked-panel a:hover {
    background: var(--primary-hover);
  }

  button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .kitchen-board {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(300px, 0.32fr);
    gap: 1rem;
    padding-top: 1rem;
  }

  .lane {
    min-width: 0;
  }

  .lane-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.8rem;
  }

  .lane-header h2 {
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-label);
  }

  .lane-header span {
    min-width: 34px;
    height: 28px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary) 16%, transparent);
    color: color-mix(in srgb, var(--primary) 70%, white);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
  }

  .pedido-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1rem;
  }

  .pedido-card,
  .ready-card,
  .blocked-panel,
  .empty-state {
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 8px;
    background: var(--bg-card);
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
  }

  .pedido-card {
    padding: 1rem;
    position: relative;
  }

  .card-actions {
    position: absolute;
    top: 0.65rem;
    right: 0.65rem;
    display: flex;
    gap: 4px;
    z-index: 1;
  }
  .action-btn {
    width: 28px;
    height: 28px;
    min-height: 28px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(15, 23, 42, 0.6);
    color: var(--text-muted);
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 6px;
    cursor: pointer;
    font-weight: 400;
    transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  }
  .action-btn:hover {
    background: rgba(30, 41, 59, 0.95);
    color: var(--text-main);
    border-color: rgba(148, 163, 184, 0.5);
  }
  .action-btn-danger:hover {
    background: rgba(239, 68, 68, 0.18);
    color: color-mix(in srgb, var(--error) 60%, white);
    border-color: rgba(239, 68, 68, 0.5);
  }
  .action-btn svg { width: 14px; height: 14px; }

  .pedido-header {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.8rem;
    padding-right: 4.5rem;
  }

  .pedido-header h3 {
    font-size: 1.25rem;
    font-weight: 900;
  }

  .pedido-header p,
  .ready-card p {
    color: var(--text-muted);
    font-size: 0.85rem;
    margin-top: 0.15rem;
  }

  .num-tag {
    color: var(--primary);
    font-weight: 900;
  }

  .pedido-header > span {
    font-weight: 900;
    color: var(--warning);
    font-size: 1.1rem;
    font-variant-numeric: tabular-nums;
  }

  .observacoes {
    padding: 0.65rem 0.75rem;
    border-radius: 8px;
    background: rgba(250, 204, 21, 0.1);
    color: color-mix(in srgb, var(--warning) 58%, white);
    margin-bottom: 0.85rem;
    font-weight: 700;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.6rem;
    align-items: center;
    padding: 0.75rem;
    border-radius: 8px;
    background: var(--bg-panel);
    border: 1px solid rgba(148, 163, 184, 0.14);
  }

  li.done {
    opacity: 0.62;
  }

  li strong {
    display: block;
    font-size: 1.05rem;
    overflow-wrap: anywhere;
  }

  li small {
    display: inline-block;
    margin-top: 0.2rem;
    color: var(--text-muted);
    text-transform: uppercase;
    font-size: 0.68rem;
    font-weight: 900;
  }

  /* Montagem do item (grupos de modificadores do ZeloMenu). */
  .item-modifiers {
    margin: 0.3rem 0 0.1rem;
    padding-left: 0.6rem;
    border-left: 2px solid var(--border-strong);
    color: var(--text-main);
    font-size: 0.88rem;
    overflow-wrap: anywhere;
  }
  .item-modifiers p { margin: 0 0 0.1rem; }
  .modifier-group {
    color: var(--text-muted);
    font-weight: 800;
  }

  li.done button {
    background: var(--success);
  }

  .ready-list {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .ready-card {
    padding: 0.85rem;
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: center;
  }

  .ready-card h3 {
    font-size: 1rem;
  }

  .ready-info { min-width: 0; flex: 1; }

  .ready-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .ready-tag {
    color: color-mix(in srgb, var(--success) 62%, white);
    font-size: 0.75rem;
    text-transform: uppercase;
    font-weight: 900;
  }

  .status-preparando {
    display: inline-block;
    margin-top: 0.3rem;
    padding: 0.1rem 0.5rem;
    border-radius: 4px;
    background: rgba(250, 204, 21, 0.12);
    color: color-mix(in srgb, var(--warning) 70%, white);
    font-size: 0.68rem;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .pedido-action-btn {
    display: block;
    width: 100%;
    margin-top: 0.85rem;
    background: color-mix(in srgb, var(--primary) 14%, transparent);
    color: color-mix(in srgb, var(--primary) 80%, white);
    border: 1px solid color-mix(in srgb, var(--primary) 35%, transparent);
    font-size: 0.88rem;
  }

  .pedido-action-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--primary) 24%, transparent);
    border-color: color-mix(in srgb, var(--primary) 55%, transparent);
  }

  .empty-state,
  .blocked {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-state {
    min-height: 55vh;
    margin-top: 1rem;
    color: var(--text-muted);
    font-size: 1.2rem;
    font-weight: 800;
  }

  .blocked-panel {
    width: min(460px, 100%);
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .blocked-panel p:not(.eyebrow) {
    color: var(--text-muted);
  }

  @media (max-width: 900px) {
    .kitchen-topbar {
      align-items: stretch;
      flex-direction: column;
      gap: 0.75rem;
    }

    .status-strip {
      width: 100%;
      flex-wrap: wrap;
    }

    .status-strip > div {
      flex: 1;
      min-width: 80px;
    }

    .status-strip button {
      flex: 1;
    }

    .kitchen-board {
      grid-template-columns: 1fr;
    }

    /* Touch: botões de ação maiores e sempre visíveis */
    .action-btn {
      width: 36px;
      height: 36px;
      min-height: 36px;
    }
    .action-btn svg { width: 16px; height: 16px; }

    /* Itens de pedido: botão "Marcar" mais fácil de tocar */
    li button {
      min-width: 80px;
      padding: 0.5rem 0.75rem;
    }
  }

  /* iFood scheduled orders (Task 11) */
  .scheduled-strip {
    margin-bottom: 1rem;
    padding: 0.75rem 1rem;
    border: 1px dashed var(--border-subtle);
    border-radius: 12px;
    background: var(--bg-card);
  }

  .scheduled-strip h2 {
    margin: 0 0 0.5rem;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .scheduled-strip ul {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .scheduled-strip li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-label);
    font-size: 0.85rem;
  }

  .scheduled-name {
    color: var(--text-main);
    font-weight: 700;
  }

  .scheduled-time {
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  /* ═══ Cozinha · Zelo Design System (only when $zeloSurface; mockup 02) — light, larger type for reading at a distance ═══ */
  .zk { display: flex; flex-direction: column; gap: 16px; min-height: 100%; padding: 24px 28px; background: var(--bg-app); color: var(--text-main); font-family: var(--zelo-font-ui); }
  .zk-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .zk-eyebrow { margin: 0; display: inline-flex; align-items: center; gap: 5px; font: var(--type-eyebrow); letter-spacing: var(--type-eyebrow-tracking); text-transform: uppercase; color: var(--text-muted); }
  .zk-back { display: inline-flex; align-items: center; gap: 2px; color: var(--text-label); text-decoration: none; }
  .zk-title { margin: 6px 0 0; font: var(--type-title); letter-spacing: var(--type-title-tracking); }
  .zk-head-acts { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .zk-pill { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: 1px solid var(--border-subtle); border-radius: var(--zelo-radius-pill); background: var(--bg-panel); font: var(--type-label); color: var(--text-label); }
  .zk-pill b { font: var(--type-num-sm); letter-spacing: var(--type-num-sm-tracking); color: var(--text-main); }
  .zk-pill i { width: 7px; height: 7px; border-radius: 50%; background: var(--status-success-text); }
  .zk-head-acts :global(.zk-spin) { animation: zk-spin 0.8s linear infinite; }
  @keyframes zk-spin { to { transform: rotate(360deg); } }
  .zk-muted { margin: 0; font: var(--type-body); color: var(--text-muted); }
  .zk-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 64px 24px; border: 1.5px dashed var(--border-strong); border-radius: var(--zelo-radius-card); color: var(--text-muted); text-align: center; }
  .zk-empty p { margin: 0; font: var(--type-body); }
  .zk-sched { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border: 1px solid var(--border-subtle); border-radius: var(--zelo-radius-control); background: var(--bg-panel); flex-wrap: wrap; }
  .zk-sched ul { display: flex; gap: 8px; flex-wrap: wrap; margin: 0; padding: 0; list-style: none; }
  .zk-sched li { border: 0; grid-template-columns: none; display: inline-flex; align-items: center; gap: 8px; padding: 5px 10px; border-radius: 9px; background: var(--bg-sunken); font: var(--type-label); color: var(--text-label); }
  .zk-sched li b { font: var(--type-num-sm); letter-spacing: var(--type-num-sm-tracking); color: var(--text-main); }
  .zk-board { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; align-items: start; }
  .zk-lane-h { margin: 0 0 10px; display: flex; gap: 8px; font: var(--type-eyebrow); letter-spacing: var(--type-eyebrow-tracking); text-transform: uppercase; color: var(--text-muted); }
  .zk-lane-h span { color: var(--text-main); }
  .zk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  .zk-card { display: flex; flex-direction: column; gap: 10px; padding: 16px; border: 1px solid var(--border-card); border-radius: var(--zelo-radius-card); background: var(--bg-card); }
  .zk-card.preparing { border-color: var(--border-strong); }
  .zk-card.late { border-color: var(--status-warning-border); box-shadow: 0 0 0 1px var(--status-warning-border); }
  .zk-card.late .zk-time { color: var(--status-warning-text); }
  .zk-card-h { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .zk-card-id { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .zk-card-id h3, .zk-rcard h3 { margin: 0; font: var(--type-num-lg); letter-spacing: var(--type-num-lg-tracking); font-weight: 600; overflow-wrap: anywhere; }
  .zk-card-id p, .zk-rcard p { margin: 0; font: var(--type-caption); font-size: 13px; color: var(--text-muted); }
  .zk-mono { font-family: var(--zelo-font-num); color: var(--text-label); }
  .zk-card-r { display: flex; align-items: center; gap: 6px; flex: none; }
  .zk-time { font: var(--type-num-lg); letter-spacing: var(--type-num-lg-tracking); font-weight: 600; color: var(--text-main); white-space: nowrap; }
  /* the legacy stylesheet styles bare button/ul/li; reset them inside the Zelo branch */
  .zk-x { display: grid; place-items: center; width: 32px; height: 32px; min-height: 0; padding: 0; border: 0; border-radius: 9px; background: transparent; color: var(--text-muted); font-weight: 400; }
  .zk-x:hover:not(:disabled) { background: var(--status-error-bg); }
  .zk .zk-card ul, .zk .zk-sched ul { display: block; gap: 0; }
  .zk-x:hover:not(:disabled) { background: var(--status-error-bg); color: var(--status-error-text); }
  .zk-x:disabled { opacity: 0.35; }
  .zk-obs { margin: 0; padding: 8px 10px; border-radius: 10px; background: var(--status-warning-bg); color: var(--status-warning-text); font: var(--type-body); }
  .zk-prog { margin: 0; font: var(--type-num-sm); letter-spacing: var(--type-num-sm-tracking); color: var(--text-muted); }
  .zk-card ul { list-style: none; margin: 0; padding: 0; }
  .zk-card li { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 10px 0; border: 0; border-top: 1px solid var(--border-subtle); border-radius: 0; background: none; opacity: 1; }
  .zk-q { font: var(--type-num-lg); font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .zk-nm { margin: 0; font: var(--type-body-strong); font-size: 17px; line-height: 1.25; }
  .zk-mod { margin: 2px 0 0; font: var(--type-caption); font-size: 13px; color: var(--text-muted); }
  .zk-card li.done .zk-nm { color: var(--text-muted); text-decoration: line-through; }
  .zk-done { display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 0 10px; border-radius: 9px; background: var(--status-success-bg); color: var(--status-success-text); font: var(--type-label); }
  .zk-card :global(.zk-cta) { width: 100%; margin-top: 4px; }
  .zk-ready { display: flex; flex-direction: column; gap: 8px; }
  .zk-rcard { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 14px; border: 1px solid var(--status-success-border); border-radius: var(--zelo-radius-card); background: var(--status-success-bg); }
  .zk-rcard p { color: var(--status-success-text); margin-top: 3px; }
  @media (max-width: 1023px) { .zk-board { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 767px) {
    .zk { padding: 16px; }
    .zk-head-acts .zk-pill:last-of-type { display: none; }
    .zk-grid { grid-template-columns: minmax(0, 1fr); }
  }
</style>

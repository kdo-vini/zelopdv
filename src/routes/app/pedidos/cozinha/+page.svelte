<script>
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabaseClient';
  import { ensureActiveSubscription, hasKitchenQueueAccess, bounceSubUserMissingAddon } from '$lib/guards';
  import { hasPermission as hasAccessPermission } from '$lib/accessControl';
  import { logAuditAction } from '$lib/accessControl';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import BackLink from '$lib/components/ui/BackLink.svelte';

  let userId = '';
  let ownerUserId = '';
  let operadorUserId = '';
  let isSubUser = false;
  let addonActive = false;
  let ready = false;
  let loading = true;
  let refreshing = false;
  let pedidos = [];
  let markingIds = new Set();
  let realtimeChannel = null;
  let refreshTimer = null;

  $: pedidosAbertos = pedidos.filter(p => p.status === 'aberto' || p.status === 'preparando');
  $: pedidosProntos = pedidos.filter(p => p.status === 'pronto');
  $: totalItensPendentes = pedidosAbertos.reduce(
    (acc, p) => acc + p.itens.filter(i => i.status_cozinha !== 'pronto').length,
    0
  );

  onMount(() => {
    boot();
    return cleanupRealtime;
  });

  onDestroy(cleanupRealtime);

  async function boot() {
    const auth = await ensureActiveSubscription({ requireProfile: true });
    if (!auth?.userId) return;

    userId = auth.userId;
    ownerUserId = auth.ownerUserId || auth.userId;
    operadorUserId = auth.userId;
    isSubUser = auth.isSubUser;
    if (isSubUser && !(await hasAccessPermission('pedidos.cozinha'))) {
      addToast('Seu cargo não tem acesso ao painel de cozinha.', 'warning');
      goto('/app');
      return;
    }
    addonActive = await hasKitchenQueueAccess(ownerUserId);
    if (bounceSubUserMissingAddon({ addonActive, isSubUser, addonLabel: 'Pedidos' })) return;
    ready = true;
    if (!addonActive) {
      loading = false;
      return;
    }

    await loadPedidos();
    setupRealtime();
  }

  async function loadPedidos() {
    if (!ownerUserId) return;
    if (!loading) refreshing = true;

    const { data, error } = await supabase
      .from('pedidos')
      .select(`
        id,
        numero_pedido,
        status,
        origem,
        id_comanda,
        observacoes,
        nome_cliente,
        criado_em,
        pedido_itens!inner (
          id,
          id_produto,
          nome,
          preco_unitario,
          quantidade,
          subtotal,
          enviado_cozinha,
          status_cozinha
        )
      `)
      .eq('id_usuario', ownerUserId)
      .in('status', ['aberto', 'preparando', 'pronto'])
      .eq('pedido_itens.enviado_cozinha', true)
      .order('criado_em', { ascending: true });

    if (error) {
      addToast('Erro ao carregar cozinha: ' + error.message, 'error');
      loading = false;
      refreshing = false;
      return;
    }

    pedidos = (data || [])
      .map(p => ({
        ...p,
        itens: (p.pedido_itens || []).filter(i => i.enviado_cozinha === true),
      }))
      .filter(p => p.itens.length > 0);
    loading = false;
    refreshing = false;
  }

  function setupRealtime() {
    cleanupRealtime();
    realtimeChannel = supabase
      .channel(`cozinha-${ownerUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos', filter: `id_usuario=eq.${ownerUserId}` },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedido_itens' },
        scheduleRefresh
      )
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

  function origemLabel(pedido) {
    if (pedido.origem === 'comanda') return pedido.id_comanda ? `Comanda ${String(pedido.id_comanda).slice(0, 8)}` : 'Comanda';
    if (pedido.origem === 'zelochat') return 'ZeloChat';
    if (pedido.origem === 'zelomenu') return '📱 App';
    return 'Balcão';
  }

  function minutosDesde(dataIso) {
    if (!dataIso) return '';
    const diff = Math.max(0, Date.now() - new Date(dataIso).getTime());
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'agora';
    return `${min} min`;
  }

  function itemPronto(item) {
    return item.status_cozinha === 'pronto';
  }

  function isMarking(item) {
    return markingIds.has(item.id);
  }

  function editarPedido(pedido) {
    goto(`/app/pedidos/${pedido.id}/editar`);
  }

  async function excluirPedido(pedido) {
    const titulo = `Pedido #${pedido.numero_pedido}`;
    const itensProntos = (pedido.itens || []).some((i) => i.status_cozinha === 'pronto');
    const mensagem = itensProntos
      ? `Cancelar o ${titulo}? Há itens já marcados como prontos — eles serão descartados.`
      : `Cancelar o ${titulo}? Esta ação não pode ser desfeita.`;

    const ok = await confirmAction('Cancelar pedido', mensagem);
    if (!ok) return;

    const { error, data } = await supabase
      .from('pedidos')
      .delete()
      .eq('id', pedido.id)
      .eq('id_usuario', ownerUserId)
      .in('status', ['aberto', 'pronto'])
      .select('id');

    if (error) {
      addToast('Erro ao cancelar pedido: ' + (error?.message || error), 'error');
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
            origem: pedido.origem,
            origem_painel: 'cozinha'
          }
        });
      }
      addToast(`${titulo} cancelado.`, 'success');
    }
    await loadPedidos();
  }

  async function marcarPedidoPreparando(pedido) {
    if (pedido.status !== 'aberto') return;

    const { error } = await supabase
      .from('pedidos')
      .update({ status: 'preparando', id_operador: operadorUserId })
      .eq('id', pedido.id)
      .eq('id_usuario', ownerUserId)
      .eq('status', 'aberto');

    if (error) {
      addToast('Erro ao iniciar preparo: ' + (error?.message || error), 'error');
      return;
    }

    if (isSubUser) {
      logAuditAction({
        ownerUserId,
        action: 'pedido.preparando',
        entityType: 'pedido',
        entityId: String(pedido.id),
        details: {
          numero_pedido: pedido.numero_pedido,
          origem: pedido.origem,
          origem_painel: 'cozinha'
        }
      });
    }
    await loadPedidos();
  }

  async function marcarItemPronto(pedido, item) {
    if (itemPronto(item) || isMarking(item)) return;
    markingIds = new Set(markingIds).add(item.id);

    try {
      // Idempotência: só marca se ainda estiver aguardando — se outro KDS marcou primeiro, no-op.
      const { error } = await supabase
        .from('pedido_itens')
        .update({ status_cozinha: 'pronto' })
        .eq('id', item.id)
        .eq('status_cozinha', 'aguardando');
      if (error) throw error;

      const { data: itensPedido, error: itensErr } = await supabase
        .from('pedido_itens')
        .select('id, status_cozinha, enviado_cozinha')
        .eq('id_pedido', pedido.id)
        .eq('enviado_cozinha', true);
      if (itensErr) throw itensErr;

      const todosProntos = (itensPedido || []).length > 0
        && (itensPedido || []).every(i => i.status_cozinha === 'pronto');

      if (todosProntos) {
        // Guard com .in evita reabrir um pedido já fechado pelo caixa.
        const { error: pedidoErr } = await supabase
          .from('pedidos')
          .update({ status: 'pronto', id_operador: operadorUserId })
          .eq('id', pedido.id)
          .eq('id_usuario', ownerUserId)
          .in('status', ['aberto', 'preparando']);
        if (pedidoErr) throw pedidoErr;
      }

      if (isSubUser) {
        logAuditAction({
          ownerUserId,
          action: 'pedido.item_pronto',
          entityType: 'pedido_item',
          entityId: String(item.id),
          details: {
            pedido_id: pedido.id,
            numero_pedido: pedido.numero_pedido,
            nome: item.nome
          }
        });
      }
      await loadPedidos();
    } catch (error) {
      addToast('Erro ao marcar item pronto: ' + (error?.message || error), 'error');
    } finally {
      const next = new Set(markingIds);
      next.delete(item.id);
      markingIds = next;
    }
  }
</script>

{#if ready && !addonActive}
  <main class="blocked">
    <section class="blocked-panel">
      <p class="eyebrow">Módulo Pedidos</p>
      <h1>Cozinha indisponível</h1>
      <p>Ative o módulo Pedidos para usar o painel de preparo.</p>
      <a href="/assinatura?addon=pedidos">Ativar módulo</a>
    </section>
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

    {#if loading}
      <section class="empty-state">
        <p>Carregando cozinha...</p>
      </section>
    {:else if pedidos.length === 0}
      <section class="empty-state">
        <p>Nenhum item enviado para a cozinha.</p>
      </section>
    {:else}
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
                    class="action-btn"
                    aria-label="Editar pedido"
                    title="Editar pedido"
                    on:click={() => editarPedido(pedido)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/></svg>
                  </button>
                  <button
                    type="button"
                    class="action-btn action-btn-danger"
                    aria-label="Cancelar pedido"
                    title="Cancelar pedido"
                    on:click={() => excluirPedido(pedido)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
                <div class="pedido-header">
                  <div>
                    <h3>{pedidoTitulo(pedido)}</h3>
                    <p>
                      {#if pedidoSubtitulo(pedido)}<span class="num-tag">{pedidoSubtitulo(pedido)}</span> · {/if}
                      {#if pedido.origem === 'zelomenu'}<span class="origem-badge origem-zelomenu">{origemLabel(pedido)}</span>{:else}{origemLabel(pedido)}{/if}
                      · {minutosDesde(pedido.criado_em)}
                    </p>
                    {#if pedido.status === 'preparando'}
                      <span class="status-preparando">Em preparo</span>
                    {/if}
                  </div>
                  <span>{pedido.itens.filter(i => !itemPronto(i)).length}/{pedido.itens.length}</span>
                </div>
                {#if pedido.observacoes}
                  <p class="observacoes">{pedido.observacoes}</p>
                {/if}
                <ul>
                  {#each pedido.itens as item (item.id)}
                    <li class:done={itemPronto(item)}>
                      <div>
                        <strong>{Number(item.quantidade)}x {item.nome}</strong>
                        {#if item.status_cozinha}
                          <small>{item.status_cozinha}</small>
                        {:else}
                          <small>pendente</small>
                        {/if}
                      </div>
                      <button
                        type="button"
                        on:click={() => marcarItemPronto(pedido, item)}
                        disabled={itemPronto(item) || isMarking(item)}
                      >
                        {itemPronto(item) ? 'Pronto' : (isMarking(item) ? '...' : 'Marcar')}
                      </button>
                    </li>
                  {/each}
                </ul>
                {#if pedido.status === 'aberto'}
                  <button
                    type="button"
                    class="pedido-action-btn"
                    on:click={() => marcarPedidoPreparando(pedido)}
                  >
                    Iniciar preparo
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
                  <h3>{pedidoTitulo(pedido)}</h3>
                  <p>
                    {#if pedidoSubtitulo(pedido)}<span class="num-tag">{pedidoSubtitulo(pedido)}</span> · {/if}
                    {origemLabel(pedido)} · {pedido.itens.length} {pedido.itens.length === 1 ? 'item' : 'itens'}
                  </p>
                </div>
                <div class="ready-actions">
                  <span class="ready-tag">Pronto</span>
                  <button
                    type="button"
                    class="action-btn"
                    aria-label="Editar pedido"
                    title="Editar pedido"
                    on:click={() => editarPedido(pedido)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/></svg>
                  </button>
                  <button
                    type="button"
                    class="action-btn action-btn-danger"
                    aria-label="Cancelar pedido"
                    title="Cancelar pedido"
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

  .origem-badge {
    display: inline-block;
    padding: 0.1rem 0.45rem;
    border-radius: 4px;
    font-size: 0.72rem;
    font-weight: 900;
    vertical-align: middle;
  }

  .origem-zelomenu {
    background: rgba(59, 130, 246, 0.15);
    color: color-mix(in srgb, #3b82f6 70%, white);
    border: 1px solid rgba(59, 130, 246, 0.3);
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
</style>

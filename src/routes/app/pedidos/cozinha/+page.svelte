<script>
  import { onDestroy, onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { ensureActiveSubscription, hasPedidosAddon } from '$lib/guards';
  import { addToast } from '$lib/stores/ui';

  let userId = '';
  let addonActive = false;
  let ready = false;
  let loading = true;
  let refreshing = false;
  let pedidos = [];
  let markingIds = new Set();
  let realtimeChannel = null;
  let refreshTimer = null;

  $: pedidosAbertos = pedidos.filter(p => p.status !== 'pronto');
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
    addonActive = await hasPedidosAddon(userId);
    ready = true;
    if (!addonActive) {
      loading = false;
      return;
    }

    await loadPedidos();
    setupRealtime();
  }

  async function loadPedidos() {
    if (!userId) return;
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
      .eq('id_usuario', userId)
      .in('status', ['aberto', 'pronto'])
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
      .channel(`cozinha-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos', filter: `id_usuario=eq.${userId}` },
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
        // Guard com .eq('status', 'aberto') evita reabrir um pedido já fechado pelo caixa.
        const { error: pedidoErr } = await supabase
          .from('pedidos')
          .update({ status: 'pronto' })
          .eq('id', pedido.id)
          .eq('status', 'aberto');
        if (pedidoErr) throw pedidoErr;
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
        <p class="eyebrow">Painel da cozinha</p>
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
                <div class="pedido-header">
                  <div>
                    <h3>{pedidoTitulo(pedido)}</h3>
                    <p>
                      {#if pedidoSubtitulo(pedido)}<span class="num-tag">{pedidoSubtitulo(pedido)}</span> · {/if}
                      {origemLabel(pedido)} · {minutosDesde(pedido.criado_em)}
                    </p>
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
                <div>
                  <h3>{pedidoTitulo(pedido)}</h3>
                  <p>
                    {#if pedidoSubtitulo(pedido)}<span class="num-tag">{pedidoSubtitulo(pedido)}</span> · {/if}
                    {origemLabel(pedido)} · {pedido.itens.length} {pedido.itens.length === 1 ? 'item' : 'itens'}
                  </p>
                </div>
                <span>Pronto</span>
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
    background: #05070a;
  }

  .kitchen-shell,
  .blocked {
    min-height: 100vh;
    background: #05070a;
    color: #f8fafc;
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
    color: #38bdf8;
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
    color: #94a3b8;
    font-size: 0.72rem;
    text-transform: uppercase;
    font-weight: 800;
  }

  button,
  .blocked-panel a {
    border: 0;
    border-radius: 8px;
    background: #0ea5e9;
    color: #ffffff;
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
    background: #0284c7;
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
    color: #cbd5e1;
  }

  .lane-header span {
    min-width: 34px;
    height: 28px;
    border-radius: 999px;
    background: rgba(14, 165, 233, 0.16);
    color: #7dd3fc;
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
    background: #101826;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
  }

  .pedido-card {
    padding: 1rem;
  }

  .pedido-header {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.8rem;
  }

  .pedido-header h3 {
    font-size: 1.25rem;
    font-weight: 900;
  }

  .pedido-header p,
  .ready-card p {
    color: #94a3b8;
    font-size: 0.85rem;
    margin-top: 0.15rem;
  }

  .num-tag {
    color: #0ea5e9;
    font-weight: 900;
  }

  .pedido-header > span {
    font-weight: 900;
    color: #facc15;
    font-size: 1.1rem;
    font-variant-numeric: tabular-nums;
  }

  .observacoes {
    padding: 0.65rem 0.75rem;
    border-radius: 8px;
    background: rgba(250, 204, 21, 0.1);
    color: #fde68a;
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
    background: #0b1220;
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
    color: #94a3b8;
    text-transform: uppercase;
    font-size: 0.68rem;
    font-weight: 900;
  }

  li.done button {
    background: #166534;
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

  .ready-card > span {
    color: #86efac;
    font-size: 0.75rem;
    text-transform: uppercase;
    font-weight: 900;
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
    color: #94a3b8;
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
    color: #94a3b8;
  }

  @media (max-width: 900px) {
    .kitchen-topbar,
    .status-strip {
      align-items: stretch;
      flex-direction: column;
    }

    .status-strip {
      width: 100%;
    }

    .status-strip > div,
    .status-strip button {
      width: 100%;
    }

    .kitchen-board {
      grid-template-columns: 1fr;
    }
  }
</style>

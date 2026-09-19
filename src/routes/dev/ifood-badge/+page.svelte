<script>
  import OrderSourceBadge from '$lib/components/orders/OrderSourceBadge.svelte';

  const mockIfood = {
    id: '11111111-2222-4333-8444-555555555555',
    source: 'ifood',
    status: 'pending_review',
    ifood: { displayId: '7421' },
    cliente_nome: 'Rafa (mock)'
  };

  const mockMenu = {
    id: '22222222-2222-4333-8444-555555555555',
    source: 'zelomenu',
    status: 'accepted',
    numero_pedido: 'A1B2C3D4'
  };
</script>

<svelte:head>
  <title>Preview iFood badge — ZeloPDV</title>
</svelte:head>

<main class="preview">
  <p class="eyebrow">Preview local · não entra em produção</p>
  <h1>Canal iFood na fila</h1>
  <p class="lede">Círculo com o logo + pill de texto, como em `/app/pedidos`.</p>

  <section class="queue-list" aria-label="Pedido iFood mock">
    <article class="queue-item">
      <div class="qi-top">
        <OrderSourceBadge order={mockIfood} />
        <span class="status-pill">Aguardando aceite</span>
      </div>
      <div class="qi-mid">
        <strong>Rafa (mock)</strong>
        <span>agora · 2 itens</span>
      </div>
      <p class="qi-address">Av. Júlio Prestes, 930 — Hotel Esplanada</p>
      <div class="qi-foot">
        <span>2 itens</span>
        <strong>R$ 32,90</strong>
      </div>
    </article>

    <article class="queue-item">
      <div class="qi-top">
        <OrderSourceBadge order={mockMenu} />
        <span class="status-pill muted">Em preparo</span>
      </div>
      <div class="qi-mid">
        <strong>Pedido ZeloMenu (comparativo)</strong>
        <span>sem moldura iFood</span>
      </div>
    </article>
  </section>
</main>

<style>
  .preview {
    min-height: 100vh;
    padding: 2rem 1.25rem 4rem;
    background: var(--bg-app);
    color: var(--text-main);
  }

  .eyebrow {
    margin: 0 0 0.4rem;
    color: var(--text-muted);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: 1.35rem;
    font-weight: 800;
  }

  .lede {
    margin: 0.4rem 0 1.5rem;
    color: var(--text-muted);
    max-width: 36rem;
  }

  .queue-list {
    display: grid;
    gap: 0.85rem;
    max-width: 28rem;
  }

  .queue-item {
    padding: 0.9rem 1rem;
    border: 1px solid var(--border-card);
    border-radius: 0.9rem;
    background: var(--bg-card);
  }

  .qi-top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .status-pill {
    padding: 2px 8px;
    border: 1px solid var(--status-warning-border);
    border-radius: 999px;
    background: var(--status-warning-bg);
    color: var(--status-warning-text);
    font-size: 0.68rem;
    font-weight: 800;
  }

  .status-pill.muted {
    border-color: var(--border-strong);
    background: var(--bg-panel);
    color: var(--text-label);
  }

  .qi-mid {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin-top: 0.65rem;
  }

  .qi-mid span,
  .qi-address {
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  .qi-address {
    margin: 0.45rem 0 0;
  }

  .qi-foot {
    display: flex;
    justify-content: space-between;
    margin-top: 0.7rem;
    padding-top: 0.55rem;
    border-top: 1px solid var(--border-subtle);
    font-size: 0.82rem;
  }
</style>

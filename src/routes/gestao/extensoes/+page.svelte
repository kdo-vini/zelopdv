<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { hasMesasAddon } from '$lib/guards';

  let userId = '';
  let ready = false;
  let mesasActive = false;

  onMount(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id || '';
    if (!userId) {
      window.location.href = '/login';
      return;
    }
    mesasActive = await hasMesasAddon(userId);
    ready = true;
  });

  // Catálogo de addons. Quando criar um novo addon, adiciona aqui (icon SVG inline + descrição curta + preço + flag de "active").
  $: addons = [
    {
      id: 'mesas',
      name: 'Mesas',
      tagline: 'Para bares, lanchonetes e pequenos restaurantes',
      description: 'Gerencie comandas por mesa, divisão de conta, pagamentos parciais e transferência entre mesas.',
      price: 30,
      active: mesasActive,
      cta: '/assinatura?addon=mesas',
      manage: '/app/mesas',
    },
  ];
</script>

<svelte:head>
  <title>Extensões — Zelo PDV</title>
</svelte:head>

<div class="page-shell">
  {#if !ready}
    <div class="centered-state">
      <p class="muted">Carregando…</p>
    </div>
  {:else}
    <header class="page-header">
      <h1 class="title">Extensões</h1>
      <p class="subtitle">
        Recursos opcionais que ampliam o seu PDV. Ative só o que faz sentido pro seu negócio.
      </p>
    </header>

    <div class="addons-grid">
      {#each addons as addon (addon.id)}
        <article class="addon-card" class:active={addon.active}>
          <div class="addon-icon" aria-hidden="true">
            {#if addon.id === 'mesas'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"/>
              </svg>
            {/if}
          </div>

          <div class="addon-body">
            <div class="addon-head">
              <h2 class="addon-name">{addon.name}</h2>
              <span class="addon-tagline">{addon.tagline}</span>
            </div>
            <p class="addon-desc">{addon.description}</p>
          </div>

          <div class="addon-footer">
            <span class="addon-price">+R$ {addon.price}/mês</span>
            {#if addon.active}
              <span class="active-badge">
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M16.704 5.296a1 1 0 0 1 0 1.408l-7.5 7.5a1 1 0 0 1-1.408 0l-3.5-3.5a1 1 0 0 1 1.408-1.408L8.5 12.092l6.796-6.796a1 1 0 0 1 1.408 0Z" clip-rule="evenodd"/>
                </svg>
                Você já tem
              </span>
            {:else}
              <a href={addon.cta} class="btn-cta">Ativar</a>
            {/if}
          </div>
        </article>
      {/each}

      <!-- Placeholder pro futuro: indica que mais addons virão -->
      <article class="addon-card addon-card-soon" aria-label="Mais addons em breve">
        <div class="soon-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
          </svg>
        </div>
        <p class="soon-title">Em breve</p>
        <p class="soon-desc">Novos addons serão lançados conforme o feedback dos clientes.</p>
      </article>
    </div>
  {/if}
</div>

<style>
  .page-shell {
    height: 100%;
    padding: 1.5rem 1.75rem;
    box-sizing: border-box;
    overflow-y: auto;
  }

  .centered-state {
    height: 60vh;
    display: flex; align-items: center; justify-content: center;
  }
  .muted { color: var(--text-muted); }

  .page-header {
    margin-bottom: 1.75rem;
  }
  .title {
    font-size: 1.85rem; font-weight: 800; color: var(--text-main);
    margin: 0; letter-spacing: -0.02em;
    line-height: 1.15;
  }
  .subtitle {
    font-size: 0.92rem; color: var(--text-label);
    line-height: 1.5;
    margin: 0.5rem 0 0;
    max-width: 520px;
  }

  .addons-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }

  /* === Addon card === */
  .addon-card {
    display: flex; flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 16px;
    transition: border-color 0.15s, transform 0.12s;
  }
  .addon-card:hover {
    border-color: var(--border-strong);
    transform: translateY(-1px);
  }
  .addon-card.active {
    border-color: var(--status-success-border);
    background: linear-gradient(180deg, var(--status-success-bg) 0%, var(--bg-card) 70%);
  }

  .addon-icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 48px; height: 48px;
    border-radius: 12px;
    background: var(--accent-light);
    color: var(--primary);
  }
  .addon-icon svg { width: 26px; height: 26px; }
  .addon-card.active .addon-icon {
    background: var(--status-success-bg);
    color: var(--status-success-text);
    border: 1px solid var(--status-success-border);
  }

  .addon-body {
    display: flex; flex-direction: column;
    gap: 0.6rem;
    flex: 1;
  }
  .addon-head { display: flex; flex-direction: column; gap: 0.15rem; }
  .addon-name {
    font-size: 1.15rem; font-weight: 800; color: var(--text-main);
    margin: 0; letter-spacing: -0.01em;
  }
  .addon-tagline {
    font-size: 0.72rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .addon-desc {
    font-size: 0.88rem; color: var(--text-label);
    line-height: 1.5;
    margin: 0;
  }

  .addon-footer {
    display: flex; align-items: center; justify-content: space-between;
    gap: 0.75rem;
    padding-top: 0.85rem;
    border-top: 1px solid var(--border-subtle);
  }
  .addon-price {
    font-size: 0.85rem; font-weight: 700; color: var(--text-main);
    font-variant-numeric: tabular-nums;
  }
  .addon-card.active .addon-price { color: var(--text-muted); }

  .btn-cta {
    display: inline-flex; align-items: center; gap: 0.35rem;
    background: var(--primary);
    color: var(--primary-text);
    border: 1px solid var(--primary);
    border-radius: 8px;
    padding: 0.45rem 0.95rem;
    font-size: 0.82rem; font-weight: 700;
    text-decoration: none;
    transition: background 0.15s;
  }
  .btn-cta:hover { background: var(--primary-hover); border-color: var(--primary-hover); }

  .active-badge {
    display: inline-flex; align-items: center; gap: 0.35rem;
    background: var(--status-success-bg);
    color: var(--status-success-text);
    border: 1px solid var(--status-success-border);
    border-radius: 999px;
    padding: 0.3rem 0.7rem;
    font-size: 0.75rem; font-weight: 700;
  }
  .active-badge svg { width: 13px; height: 13px; }

  /* === Card "Em breve" === */
  .addon-card-soon {
    align-items: center; justify-content: center;
    text-align: center;
    background: transparent;
    border: 1px dashed var(--border-subtle);
    color: var(--text-muted);
    min-height: 220px;
  }
  .addon-card-soon:hover {
    border-color: var(--border-strong);
    transform: none;
  }
  .soon-icon {
    width: 40px; height: 40px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 999px;
    border: 1px dashed var(--border-strong);
    color: var(--text-muted);
  }
  .soon-icon svg { width: 18px; height: 18px; }
  .soon-title {
    font-size: 0.78rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--text-label);
    margin: 0;
  }
  .soon-desc {
    font-size: 0.82rem; color: var(--text-muted);
    line-height: 1.5;
    margin: 0;
    max-width: 220px;
  }

  /* === Mobile === */
  @media (max-width: 768px) {
    .page-shell { padding: 3.25rem 1rem 1.25rem; }
    .addons-grid { grid-template-columns: 1fr; }
    .addon-card { padding: 1.25rem; }
  }
</style>

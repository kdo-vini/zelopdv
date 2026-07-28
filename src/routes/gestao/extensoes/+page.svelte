<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { hasMesasAddon, hasZeloChatAccess, hasAcessosAddon, hasZeloMenuAccess } from '$lib/guards';
  import { PLANS, ADDONS } from '$lib/pricing';
  import { addToast } from '$lib/stores/ui';

  let userId = '';
  let ready = false;
  let mesasActive = false;
  let acessosActive = false;
  let chatActive = false;
  let menuActive = false;
  let planTier = null;

  onMount(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id || '';
    if (!userId) {
      window.location.href = '/login';
      return;
    }

    // Block sub-users from accessing extensions management
    const { data: subUserRow } = await supabase
      .from('access_users')
      .select('id')
      .eq('auth_user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    if (subUserRow) {
      window.location.href = '/gestao';
      return;
    }

    const { data } = await supabase
      .from('subscriptions')
      .select('plan_tier')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    planTier = data?.plan_tier || 'pdv';

    [mesasActive, acessosActive, chatActive, menuActive] = await Promise.all([
      hasMesasAddon(userId),
      hasAcessosAddon(userId),
      hasZeloChatAccess(userId),
      hasZeloMenuAccess(userId),
    ]);
    ready = true;
  });

  // Catálogo de extensões. ZeloChat aparece como produto/plano (não addon),
  // mas é apresentado aqui pra discovery — CTA leva pra /assinatura?upgrade=bundle.
  $: extensions = [
    {
      id: 'mesas',
      kind: 'addon',
      name: 'Mesas',
      tagline: 'Para bares, lanchonetes e pequenos restaurantes',
      description: 'Comandas por mesa, divisão de conta, pagamentos parciais e transferência entre mesas.',
      price: ADDONS.mesas.price,
      active: mesasActive,
      compatible: planTier === 'pdv' || planTier === 'bundle',
      cta: '/assinatura?addon=mesas',
      manage: '/app/mesas',
      incompatibleNote: 'Requer plano com PDV (ZeloPDV ou Pacote Gestão + Atendimento).',
    },
    {
      id: 'menu',
      kind: 'addon',
      name: 'ZeloMenu',
      tagline: 'Cardápio digital com publicação online',
      description: 'Publique seus produtos no cardápio online do seu negócio. Clientes acessam o menu pelo celular, veem fotos, preços e variações. Pedidos entram na fila do PDV e no painel da cozinha.',
      price: ADDONS.menu.price,
      active: menuActive,
      compatible: planTier === 'pdv' || planTier === 'bundle',
      cta: '/assinatura?addon=menu',
      manage: menuActive ? '/app/pedidos' : null,
      incompatibleNote: 'Requer plano com PDV (ZeloPDV ou Pacote Gestão + Atendimento).',
    },
    {
      id: 'acessos',
      kind: 'addon',
      name: 'Controle de Acessos',
      tagline: 'Equipe com cargos e permissões',
      description: 'Crie até 5 subusuários para sua equipe, defina cargos como Caixa, Atendente e Gerente, e controle quem pode fazer o quê no sistema.',
      price: ADDONS.acessos.price,
      active: acessosActive,
      compatible: planTier === 'pdv' || planTier === 'bundle',
      cta: '/assinatura?addon=acessos',
      manage: '/gestao/acessos',
      incompatibleNote: 'Requer plano com PDV (ZeloPDV ou Pacote Gestão + Atendimento).',
    },
    {
      id: 'chat',
      kind: 'plan',
      name: 'ZeloChat',
      tagline: 'Atendimento WhatsApp com IA',
      description: 'IA responde clientes, anota pedidos, dispara alertas humanos. Disponível no plano ZeloChat ou no Pacote Gestão + Atendimento (que inclui PDV).',
      price: PLANS.bundle.price - PLANS.pdv.price, // diferencial pra fazer upgrade do pdv
      active: chatActive,
      compatible: true, // sempre disponível como upgrade
      cta: planTier === 'pdv' ? '/assinatura?upgrade=bundle' : '/assinatura?upgrade=chat',
      manage: chatActive ? 'https://chat.zelopdv.com.br' : null,
      ctaLabel: planTier === 'pdv' ? 'Upgrade pro pacote completo' : 'Assinar ZeloChat',
      priceLabel: planTier === 'pdv' ? `+R$ ${(PLANS.bundle.price - PLANS.pdv.price)}/mês (vira pacote completo)` : `R$ ${PLANS.chat.price}/mês`,
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
    <header class="page-header" style="border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 85%, transparent); padding-bottom: 1rem;">
      <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">Outros / Extensões</p>
      <h1 class="text-xl font-bold text-slate-100 tracking-tight">Extensões</h1>
      <p class="subtitle">
        Recursos extras que ampliam o seu Zelo. Ative só o que faz sentido pro seu negócio.
      </p>
    </header>

    {#if menuActive}
      <div class="link-panel">
        <div class="link-panel-header">
          <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">ZeloMenu · Cardápio online</p>
          <h2 class="text-base font-bold text-slate-100 tracking-tight">Configurar cardápio</h2>
          <p class="link-panel-desc">Gerencie produtos, fotos, modificadores e o link público do seu cardápio em um só lugar.</p>
        </div>
        <div>
          <a href="https://menu.zelopdv.com.br/admin" target="_blank" rel="noopener" class="btn-cta">
            Abrir ZeloMenu →
          </a>
        </div>
      </div>
    {/if}

    <div class="addons-grid">
      {#each extensions as ext (ext.id)}
        <article class="addon-card" class:active={ext.active} class:disabled={!ext.compatible}>
          <div class="addon-icon" aria-hidden="true">
            {#if ext.id === 'mesas'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"/>
              </svg>
            {:else if ext.id === 'menu'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"/>
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 18.75L21 12l-5.25-6.75"/>
              </svg>
            {:else if ext.id === 'acessos'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/>
              </svg>
            {:else if ext.id === 'chat'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332c2.456-.16 4.892-.45 7.297-.866C21.93 15.59 22.5 14.566 22.5 13.5V8.25c0-1.066-.57-2.09-1.741-2.249-2.405-.416-4.841-.706-7.297-.866-1.106-.072-2.151.31-2.927.991L4.957 9.522A2.247 2.247 0 0 1 4.5 9.522V12.76Z"/>
                <circle cx="9" cy="11" r="1" fill="currentColor"/>
                <circle cx="13" cy="11" r="1" fill="currentColor"/>
                <circle cx="17" cy="11" r="1" fill="currentColor"/>
              </svg>
            {/if}
          </div>

          <div class="addon-body">
            <div class="addon-head">
              <h2 class="addon-name">{ext.name}</h2>
              <span class="addon-tagline">{ext.tagline}</span>
            </div>
            <p class="addon-desc">{ext.description}</p>
            {#if !ext.compatible && ext.incompatibleNote}
              <p class="incompat-note">{ext.incompatibleNote}</p>
            {/if}
          </div>

          <div class="addon-footer">
            <span class="addon-price">
              {ext.priceLabel || `+R$ ${ext.price}/mês`}
            </span>
            {#if ext.active}
              <span class="active-badge">
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M16.704 5.296a1 1 0 0 1 0 1.408l-7.5 7.5a1 1 0 0 1-1.408 0l-3.5-3.5a1 1 0 0 1 1.408-1.408L8.5 12.092l6.796-6.796a1 1 0 0 1 1.408 0Z" clip-rule="evenodd"/>
                </svg>
                Você já tem
              </span>
            {:else if !ext.compatible}
              <span class="incompat-badge">Indisponível</span>
            {:else}
              <a href={ext.cta} class="btn-cta">{ext.ctaLabel || 'Ativar'}</a>
            {/if}
          </div>
        </article>
      {/each}

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

  .centered-state { height: 60vh; display: flex; align-items: center; justify-content: center; }
  .muted { color: var(--text-muted); }

  .link-panel {
    margin-bottom: 1.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 12px;
    box-shadow: inset 0 2px 0 0 var(--primary);
    padding: 1.25rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .link-panel-header { display: flex; flex-direction: column; gap: 0; }
  .link-panel-desc { font-size: 0.85rem; color: var(--text-label); margin: 0.3rem 0 0; line-height: 1.5; }

  .page-header { margin-bottom: 1.75rem; }
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

  .addon-card {
    display: flex; flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 16px;
    transition: border-color 0.15s, transform 0.12s;
  }
  .addon-card:hover { border-color: var(--border-strong); transform: translateY(-1px); }
  .addon-card.active {
    border-color: var(--status-success-border);
    background: linear-gradient(180deg, var(--status-success-bg) 0%, var(--bg-card) 70%);
  }
  .addon-card.disabled { opacity: 0.7; }
  .addon-card.disabled:hover { transform: none; }

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

  .addon-body { display: flex; flex-direction: column; gap: 0.6rem; flex: 1; }
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
  .addon-desc { font-size: 0.88rem; color: var(--text-label); line-height: 1.5; margin: 0; }
  .incompat-note {
    font-size: 0.78rem; color: var(--text-muted); margin: 0;
    padding: 0.5rem 0.7rem;
    background: var(--bg-input);
    border-radius: 6px;
    border-left: 2px solid var(--border-strong);
  }

  .addon-footer {
    display: flex; align-items: center; justify-content: space-between;
    gap: 0.75rem;
    padding-top: 0.85rem;
    border-top: 1px solid var(--border-subtle);
  }
  .addon-price { font-size: 0.85rem; font-weight: 700; color: var(--text-main); font-variant-numeric: tabular-nums; }
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

  .incompat-badge {
    font-size: 0.7rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--text-muted);
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: 999px;
    padding: 0.3rem 0.7rem;
  }

  @media (max-width: 768px) {
    .page-shell { padding: 3.25rem 1rem 1.25rem; }
    .addons-grid { grid-template-columns: 1fr; }
    .addon-card { padding: 1.25rem; }
  }
</style>

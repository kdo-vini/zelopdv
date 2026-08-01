<script>
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabaseClient';
  import { sessionStore, companyNameStore } from '$lib/stores/session';
  import { closeAssistant } from '$lib/stores/assistant';
  import { unreadCount, hasUnreadCritical } from '$lib/stores/gerente';
  import SidebarBadge from '$lib/components/gerente/SidebarBadge.svelte';
  import MobileBottomNav from '$lib/components/MobileBottomNav.svelte';
  import { toggleSupport, closeSupport, isSupportOpen } from '$lib/stores/support';
  import { getAccessContext, getAccessContextSync } from '$lib/accessControl';
  import {
    appNavigationSections,
    isNavigationItemActive,
    shouldShowNavigationItem,
  } from '$lib/navigation/appNavigation';
  import { onMount } from 'svelte';
  import { TRIAL_DAYS } from '$lib/pricing';
  import { getTrialTotalDays } from '$lib/subscriptionStatus';
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';

  let collapsed = false;
  let subStatus = null;
  let trialDaysLeft = null;
  // Duração real do trial desta conta. Contas anteriores a 2026-07-27 têm 30 dias.
  let trialTotalDays = TRIAL_DAYS;
  let companyLogoUrl = null;
  let orderingReviewActive = false;
  let kitchenQueueActive = false;
  let mesasAddonActive = false;
  let acessosAddonActive = false;
  let isSubUserMode = false;
  let subUserPermissions = {};
  // Until access context is known, suppress permission-gated nav items so the
  // sidebar never flashes owner-only links to a freshly-mounted sub-user
  // (happens on cross-section nav like /app ↔ /gestao because each section has
  // its own layout that remounts the sidebar).
  let accessLoaded = false;
  {
    const cached = getAccessContextSync();
    if (cached) {
      isSubUserMode = cached.isSubUser === true;
      subUserPermissions = cached.permissions || {};
      accessLoaded = true;
    }
  }

  onMount(async () => {
    const saved = localStorage.getItem('zelo_sidebar_collapsed');
    if (saved !== null) collapsed = saved === 'true';

    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      let subscriptionUserId = user.id;

      // Resolve sub-user via the shared cache helper (avoids duplicating the
      // query and benefits from the sessionStorage warm-start).
      try {
        const ctx = await getAccessContext();
        if (ctx?.isSubUser) {
          isSubUserMode = true;
          subUserPermissions = ctx.permissions || {};
          subscriptionUserId = ctx.ownerUserId || user.id;
        } else {
          isSubUserMode = false;
          subUserPermissions = {};
        }
        accessLoaded = true;
      } catch (e) { /* silent */ }

      try {
        const [{ data: sub }, { data: perfil }] = await Promise.all([
          supabase
            .from('subscriptions')
            .select('status, created_at, current_period_end, manually_extended_until, plan_tier, has_mesas_addon, has_acessos_addon, has_zelo_menu')
            .eq('user_id', subscriptionUserId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('empresa_perfil')
            .select('logo_url, gerente_prefs')
            .eq('user_id', subscriptionUserId)
            .maybeSingle()
        ]);
        if (sub?.status === 'trialing' && sub?.current_period_end) {
          subStatus = sub.status;
          const diff = new Date(sub.current_period_end) - new Date();
          trialDaysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
          trialTotalDays = getTrialTotalDays(sub, TRIAL_DAYS);
        }
        const planAllowsAddons = sub?.plan_tier === 'pdv' || sub?.plan_tier === 'bundle';
        mesasAddonActive = planAllowsAddons && !!sub?.has_mesas_addon;
        acessosAddonActive = planAllowsAddons && !!sub?.has_acessos_addon;
        orderingReviewActive = (sub?.plan_tier === 'chat' || sub?.plan_tier === 'bundle')
          || (sub?.plan_tier === 'pdv' && !!sub?.has_zelo_menu);
        // Espelha `hasKitchenQueueAccess`: a fila de preparo é alimentada só pelo
        // motor canônico `zelo_orders` (domínio ZeloMenu), então o fallback por
        // `has_mesas_addon` saiu junto com o módulo legado. Cliente só-Mesas
        // deixa de ver o item Cozinha em vez de abrir uma tela sempre vazia.
        kitchenQueueActive = orderingReviewActive;
        if (perfil?.logo_url) companyLogoUrl = perfil.logo_url;
        // Muted types only hide a signal from the briefing/WhatsApp digest
        // (TA-INTELLIGENCE-01 in docs/TRADEOFFS.md keeps the engine detecting
        // and the feed showing them for audit purposes) — the "new alert"
        // badge should still respect it, since silencing a type means the
        // owner asked to stop being nudged about it.
        const mutedTypes = Array.isArray(perfil?.gerente_prefs?.muted_types) ? perfil.gerente_prefs.muted_types : [];
        let unreadQuery = supabase.from('business_signals').select('id', { count: 'exact', head: true }).is('read_at', null);
        let criticalQuery = supabase.from('business_signals').select('id').is('read_at', null).eq('severity', 'critical').limit(1);
        if (mutedTypes.length) {
          unreadQuery = unreadQuery.not('type', 'in', `(${mutedTypes.join(',')})`);
          criticalQuery = criticalQuery.not('type', 'in', `(${mutedTypes.join(',')})`);
        }
        const [{ count }, { data: unreadSignals }] = await Promise.all([unreadQuery, criticalQuery]);
        unreadCount.set(count || 0);
        hasUnreadCritical.set(Boolean(unreadSignals?.length));
      } catch (e) {
        // silent fail - non-critical
      }
    }
  });

  function toggleCollapse() {
    collapsed = !collapsed;
    localStorage.setItem('zelo_sidebar_collapsed', String(collapsed));
  }

  $: pathname = $page.url.pathname;

  async function logout() {
    $sessionStore = null;
    $companyNameStore = null;
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  function openSupport() {
    toggleSupport();
    closeAssistant();
  }

  $: avatarLetter = ($companyNameStore || $sessionStore?.user?.email || 'Z')[0].toUpperCase();
  $: displayName = $companyNameStore || $sessionStore?.user?.email?.split('@')[0] || '';

  // Mapa central de addons → flag reativa. Quando um novo addon for adicionado,
  // basta criar a flag (ex: deliveryAddonActive) e registrar aqui.
  $: addonFlags = {
    orderingReview: orderingReviewActive,
    kitchenQueue: kitchenQueueActive,
    mesas: mesasAddonActive,
    acessos: acessosAddonActive
  };

  $: navigationContext = {
    accessLoaded,
    addonFlags,
    isSubUser: isSubUserMode,
    permissions: subUserPermissions,
  };
  $: desktopSections = appNavigationSections.filter((section) => section.id !== 'perfil');
  $: profileSection = appNavigationSections.find((section) => section.id === 'perfil');
  $: profileItem = profileSection?.items.find((item) => item.href);
  $: logoutItem = profileSection?.items.find((item) => item.action === 'logout');
</script>

<!-- Sidebar -->
<aside
  id="gestao-sidebar"
  role="navigation"
  aria-label="Menu de gestão"
  class="hidden md:flex md:static flex-col h-screen shrink-0 sidebar-shell"
  class:collapsed
  style="background: var(--bg-sidebar); border-right: 1px solid var(--border-subtle);"
>

  <!-- Topo: logo + botão de toggle -->
  <div class="px-3 py-4 border-b flex items-center shrink-0 gap-2" style="border-color: var(--border-subtle); min-height: 64px;">
    <a
      href="/app"
      class="flex items-center gap-2 min-w-0 flex-1 overflow-hidden"
      title="Ir para Frente de Caixa"
    >
      <img src="/logo-horizontal.webp" alt="Zelo PDV" class="h-24 w-auto shrink-0" />
    </a>

    <!-- Botão de colapsar — oculto em mobile -->
    <button
      class="hidden md:flex items-center justify-center w-7 h-7 rounded-md shrink-0 transition-colors toggle-btn"
      style="color: var(--text-muted); border: 1px solid var(--border-subtle);"
      on:click={toggleCollapse}
      title={collapsed ? 'Expandir menu' : 'Recolher menu'}
      aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
    >
      {#if collapsed}
        <ChevronRight class="size-4" aria-hidden="true" />
      {:else}
        <ChevronLeft class="size-4" aria-hidden="true" />
      {/if}
    </button>
  </div>

  {#if subStatus === 'trialing' && trialDaysLeft !== null && !collapsed && !isSubUserMode}
    {@const trialDay = Math.min(trialTotalDays, Math.max(1, trialTotalDays - trialDaysLeft))}
    {@const pct = Math.round((trialDay / trialTotalDays) * 100)}
    <!-- último quarto do trial vira aviso urgente (era 7 de 30; agora 4 de 14) -->
    {@const urgent = trialDaysLeft <= Math.ceil(trialTotalDays / 4)}
    <div
      class="mx-3 mt-2 mb-1 rounded-lg p-3 text-xs label-text"
      style="background: {urgent ? 'var(--warning)' : 'var(--bg-input)'}; color: {urgent ? '#1a1a00' : 'var(--text-main)'}; border: 1px solid {urgent ? 'rgba(0,0,0,0.12)' : 'var(--border-subtle)'};"
    >
      <div class="flex items-center justify-between mb-1.5">
        <span class="font-semibold">
          {#if trialDaysLeft === 0}
            Teste termina hoje
          {:else if urgent}
            Termina em {trialDaysLeft} dia{trialDaysLeft === 1 ? '' : 's'}
          {:else}
            Dia {trialDay} de {trialTotalDays}
          {/if}
        </span>
        <a
          href="/assinatura"
          class="font-bold underline"
          style="color: {urgent ? '#1a1a00' : 'var(--primary)'}; font-size: 0.7rem;"
        >Assinar</a>
      </div>
      <!-- Progress bar -->
      <div style="height:3px; border-radius:2px; background: {urgent ? 'rgba(0,0,0,0.15)' : 'var(--border-subtle)'}; overflow:hidden; margin-bottom:6px;">
        <div style="width:{pct}%; height:100%; border-radius:2px; background:{urgent ? 'rgba(0,0,0,0.4)' : 'var(--primary)'}; transition:width 0.4s;"></div>
      </div>
      {#if !urgent}
        <p style="color: var(--text-muted); font-size: 0.68rem; margin:0;">Caixa · Relatórios · Suporte</p>
      {/if}
    </div>
  {/if}

  <!-- Grupos de navegação -->
  <nav class="flex-1 overflow-y-auto px-3 py-2 space-y-1 sidebar-nav" class:nav-collapsed={collapsed} aria-label="Navegação principal de gestão">
    {#each desktopSections as section}
      <div class="pt-3">
        <p class="px-3 pb-1 text-xs font-bold uppercase tracking-wider overflow-hidden label-text" style="color: var(--text-muted);">
          {section.desktopLabel}
        </p>
        <ul role="list" class="space-y-0.5">
          {#each section.items as item}
            {#if shouldShowNavigationItem(item, navigationContext)}
              {@const active = item.href ? isNavigationItemActive(item, pathname) : item.action === 'support' && $isSupportOpen}
              <li>
                {#if item.href}
                  <a
                    href={item.href}
                    class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors overflow-hidden"
                    style="background: {active ? 'var(--sidebar-item-active-bg)' : 'transparent'}; color: {active ? 'var(--sidebar-item-active-text)' : 'var(--text-main)'};"
                    on:mouseenter={e => { if (!active) e.currentTarget.style.background = 'var(--sidebar-item-hover-bg)'; }}
                    on:mouseleave={e => { if (!active) e.currentTarget.style.background = active ? 'var(--sidebar-item-active-bg)' : 'transparent'; }}
                    aria-current={active ? 'page' : undefined}
                    title={item.label}
                  >
                    <span class="nav-icon"><svelte:component this={item.icon} class="size-5 shrink-0" aria-hidden="true" />{#if item.badge && collapsed && $unreadCount > 0}<span class:critical-dot={$hasUnreadCritical} class="collapsed-gerente-dot" aria-hidden="true"></span>{/if}</span>
                    <span class="label-text whitespace-nowrap">{item.label}</span>
                    {#if item.badge}<span class="ml-auto label-text"><SidebarBadge count={$unreadCount} hasCritical={$hasUnreadCritical} /></span>{/if}
                  </a>
                {:else}
                  <button
                    type="button"
                    on:click={openSupport}
                    class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors overflow-hidden w-full text-left"
                    style="background: {active ? 'var(--accent-light)' : 'transparent'}; color: {active ? 'var(--primary)' : 'var(--text-main)'};"
                    on:mouseenter={e => { if (!active) e.currentTarget.style.background = 'var(--sidebar-item-hover-bg)'; }}
                    on:mouseleave={e => { e.currentTarget.style.background = active ? 'var(--accent-light)' : 'transparent'; }}
                    aria-pressed={$isSupportOpen}
                    title={item.label}
                  >
                    <svelte:component this={item.icon} class="size-5 shrink-0" aria-hidden="true" />
                    <span class="label-text whitespace-nowrap">{item.label}</span>
                  </button>
                {/if}
              </li>
            {/if}
          {/each}
        </ul>
      </div>
    {/each}
  </nav>

  <!-- Usuário / base -->
  <div class="shrink-0 border-t px-3 py-3 overflow-hidden" style="border-color: var(--border-subtle);">
    <a
      href={profileItem.href}
      class="flex items-center gap-3 mb-2 min-w-0 w-full px-2 py-1.5 rounded-lg transition-colors"
      style="color: var(--text-main);"
      on:mouseenter={e => e.currentTarget.style.background = 'var(--sidebar-item-hover-bg)'}
      on:mouseleave={e => e.currentTarget.style.background = ''}
      title={profileItem.label}
      aria-label={`Ir para ${profileItem.label}`}
    >
      <div
        class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden"
        style={companyLogoUrl ? 'background: var(--bg-input);' : 'background: var(--accent-light); color: var(--accent);'}
        aria-hidden="true"
      >
        {#if companyLogoUrl}
          <img src={companyLogoUrl} alt="Logo" class="w-full h-full object-contain" />
        {:else}
          {avatarLetter}
        {/if}
      </div>
      <span class="label-text text-sm font-medium truncate min-w-0" style="color: var(--text-main);">
        {displayName}
      </span>
    </a>
    <button
      on:click={logout}
      class="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors overflow-hidden"
      style="color: var(--error);"
      on:mouseenter={e => e.currentTarget.style.background = 'var(--error-bg)'}
      on:mouseleave={e => e.currentTarget.style.background = ''}
      aria-label="Sair da conta"
      title="Sair"
    >
      <svelte:component this={logoutItem.icon} class="size-5 shrink-0" aria-hidden="true" />
      <span class="label-text whitespace-nowrap">{logoutItem.label}</span>
    </button>
  </div>
</aside>

<MobileBottomNav
  sections={appNavigationSections}
  {pathname}
  {navigationContext}
  {companyLogoUrl}
  {displayName}
  {avatarLetter}
  unreadCount={$unreadCount}
  hasUnreadCritical={$hasUnreadCritical}
  supportOpen={$isSupportOpen}
  onSupport={openSupport}
  onLogout={logout}
/>

<style>
  /* Largura da sidebar com transição suave */
  .sidebar-shell {
    width: 240px;
    height: 100vh;
    height: 100dvh;
    transition: width 220ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .sidebar-shell.collapsed {
    width: 64px;
  }

  /* Labels: somem com fade + clip quando colapsado */
  .sidebar-shell .label-text {
    max-width: 200px;
    overflow: hidden;
    opacity: 1;
    transition:
      max-width 220ms cubic-bezier(0.4, 0, 0.2, 1),
      opacity 180ms ease;
  }

  .sidebar-shell.collapsed .label-text {
    max-width: 0;
    opacity: 0;
  }

  /* Botão toggle: hover sutil */
  .toggle-btn:hover {
    background: var(--sidebar-item-hover-bg);
    color: var(--text-main);
  }

  /* Collapsed: esconde scrollbar visualmente, reduz padding/gap */
  .sidebar-shell.collapsed .sidebar-nav {
    scrollbar-width: none;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }
  .sidebar-shell.collapsed .sidebar-nav::-webkit-scrollbar {
    display: none;
  }
  .sidebar-shell.collapsed .sidebar-nav :global(a),
  .sidebar-shell.collapsed .sidebar-nav :global(button) {
    padding-left: 0.5rem !important;
    padding-right: 0.5rem !important;
    gap: 0.5rem !important;
  }

  /* Collapsed: bottom area (user + sair) */
  .sidebar-shell.collapsed > :global(.shrink-0) :global(a),
  .sidebar-shell.collapsed > :global(.shrink-0) :global(button) {
    padding-left: 0.25rem !important;
    padding-right: 0.25rem !important;
    gap: 0.35rem !important;
  }
  .nav-icon { position: relative; display: inline-flex; flex: 0 0 auto; }.collapsed-gerente-dot { position: absolute; width: 8px; height: 8px; border-radius: 50%; background: var(--primary); }.collapsed-gerente-dot.critical-dot { background: var(--status-error-text); }.collapsed-gerente-dot { top: -3px; right: -4px; }
</style>

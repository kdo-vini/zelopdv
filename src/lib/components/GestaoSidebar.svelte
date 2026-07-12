<script>
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabaseClient';
  import { sessionStore, companyNameStore } from '$lib/stores/session';
  import { toggleAssistant, closeAssistant } from '$lib/stores/assistant';
  import { unreadCount } from '$lib/stores/gerente';
  import SidebarBadge from '$lib/components/gerente/SidebarBadge.svelte';
  import { toggleSupport, closeSupport, isSupportOpen } from '$lib/stores/support';
  import { getAccessContext, getAccessContextSync } from '$lib/accessControl';
  import { onMount } from 'svelte';
  import { X, Menu, ChevronLeft, ChevronRight, HelpCircle, Sparkles, LogOut, ShoppingBag, Table2, ListChecks, LayoutGrid, Package, Users, Boxes, BarChart3, Wrench, ArrowUpRight, Wallet, Puzzle, ChefHat, BookOpen, Receipt, Radar } from 'lucide-svelte';

  let mobileOpen = false;
  let collapsed = false;
  let subStatus = null;
  let trialDaysLeft = null;
  let companyLogoUrl = null;
  let pedidosAddonActive = false;
  let mesasAddonActive = false;
  let acessosAddonActive = false;
  let isSubUserMode = false;
  let subUserPermissions = {};
  let hasUnreadCritical = false;
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
            .select('status, current_period_end, plan_tier, has_pedidos_addon, has_mesas_addon, has_acessos_addon')
            .eq('user_id', subscriptionUserId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('empresa_perfil')
            .select('logo_url, intelligence_enabled_at')
            .eq('user_id', subscriptionUserId)
            .maybeSingle()
        ]);
        if (sub?.status === 'trialing' && sub?.current_period_end) {
          subStatus = sub.status;
          const diff = new Date(sub.current_period_end) - new Date();
          trialDaysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
        }
        const planAllowsAddons = sub?.plan_tier === 'pdv' || sub?.plan_tier === 'bundle';
        pedidosAddonActive = planAllowsAddons && !!sub?.has_pedidos_addon;
        mesasAddonActive = planAllowsAddons && !!sub?.has_mesas_addon;
        acessosAddonActive = planAllowsAddons && !!sub?.has_acessos_addon;
        if (perfil?.logo_url) companyLogoUrl = perfil.logo_url;
        if (perfil?.intelligence_enabled_at) {
          const [{ count }, { data: unreadSignals }] = await Promise.all([
            supabase.from('business_signals').select('id', { count: 'exact', head: true }).is('read_at', null),
            supabase.from('business_signals').select('id').is('read_at', null).eq('severity', 'critical').limit(1),
          ]);
          unreadCount.set(count || 0);
          hasUnreadCritical = Boolean(unreadSignals?.length);
        } else {
          unreadCount.set(0);
          hasUnreadCritical = false;
        }
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

  function isActive(href, currentPath) {
    // Itens "raiz" precisam ser exact match — caso contrário /app/mesas marcaria /app como ativo
    if (href === '/gestao' || href === '/app') return currentPath === href;
    if (currentPath !== href && !currentPath.startsWith(href + '/')) return false;
    // Se algum item mais específico também combina (ex: /app/pedidos/cozinha vs /app/pedidos),
    // só o mais específico fica ativo.
    return !allHrefs.some(
      (h) => h.length > href.length && (currentPath === h || currentPath.startsWith(h + '/'))
    );
  }

  async function logout() {
    $sessionStore = null;
    $companyNameStore = null;
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  function closeMobile() {
    mobileOpen = false;
  }

  $: avatarLetter = ($companyNameStore || $sessionStore?.user?.email || 'Z')[0].toUpperCase();
  $: displayName = $companyNameStore || $sessionStore?.user?.email?.split('@')[0] || '';

  // Mapa central de addons → flag reativa. Quando um novo addon for adicionado,
  // basta criar a flag (ex: deliveryAddonActive) e registrar aqui.
  $: addonFlags = {
    pedidos: pedidosAddonActive,
    mesas: mesasAddonActive,
    acessos: acessosAddonActive
  };

  function shouldShowItem(item, flags, ready = accessLoaded) {
    // Hide any permission/admin-gated entry until we know who the user is. For
    // public items (no requiredPermission and no adminOnly) we render eagerly
    // so the menu doesn't feel empty for owners on a cold start.
    const isGated = item.adminOnly || item.requiredPermission;
    if (isGated && !ready) return false;

    if (!item.requiresAddon) {
      if (isSubUserMode && item.adminOnly) return false;
      if (isSubUserMode && item.requiredPermission) {
        return subUserPermissions?.[item.requiredPermission] === true;
      }
      return true;
    }
    if (!flags[item.requiresAddon]) return false;
    if (isSubUserMode && item.adminOnly) return false;
    if (isSubUserMode && item.requiredPermission) {
      return subUserPermissions?.[item.requiredPermission] === true;
    }
    return true;
  }

  const navGroups = [
    {
      label: 'Vendas',
      items: [
        {
          href: '/app',
          label: 'Frente de Caixa',
          requiredPermission: 'pdv.acessar',
          icon: ShoppingBag
        },
        {
          href: '/app/mesas',
          label: 'Mesas',
          requiresAddon: 'mesas',
          requiredPermission: 'mesas.acessar',
          icon: Table2
        },
        {
          href: '/app/pedidos',
          label: 'Pedidos',
          requiresAddon: 'pedidos',
          requiredPermission: 'pedidos.acessar',
          icon: ListChecks
        },
        {
          href: '/app/pedidos/cozinha',
          label: 'Cozinha',
          requiresAddon: 'pedidos',
          requiredPermission: 'pedidos.cozinha',
          icon: ChefHat
        }
      ]
    },
    {
      label: 'Gestão',
      items: [
        {
          href: '/gestao',
          label: 'Dashboard',
          icon: LayoutGrid
        },
        {
          href: '/gestao/gerente',
          label: 'Zelinho Gerente',
          icon: Radar,
          badge: true,
        },
        {
          href: '/gestao/produtos',
          label: 'Produtos',
          requiredPermission: 'produtos.visualizar',
          icon: Package
        },
        {
          href: '/gestao/pessoas',
          label: 'Pessoas',
          requiredPermission: 'pessoas.visualizar',
          icon: Users
        },
        {
          href: '/gestao/estoque',
          label: 'Estoque',
          requiredPermission: 'estoque.visualizar',
          icon: Boxes
        },
        {
          href: '/gestao/mesas',
          label: 'Cadastro de Mesas',
          requiresAddon: 'mesas',
          requiredPermission: 'mesas.acessar',
          icon: Table2
        }
      ]
    },
    {
      label: 'Financeiro',
      items: [
        {
          href: '/gestao/caixa',
          label: 'Fechar Caixa',
          requiredPermission: 'caixa.ver',
          icon: Wallet
        },
        {
          href: '/gestao/fichario',
          label: 'Fichário (Fiado)',
          requiredPermission: 'fiado.visualizar',
          icon: BookOpen
        },
        {
          href: '/gestao/despesas',
          label: 'Despesas',
          requiredPermission: 'despesas.visualizar',
          icon: Receipt
        }
      ]
    },
    {
      label: 'Outros',
      items: [
        {
          href: '/relatorios',
          label: 'Relatórios',
          requiredPermission: 'relatorios.ver',
          icon: BarChart3
        },
        {
          href: '/ferramentas',
          label: 'Ferramentas',
          icon: Wrench
        },
        {
          href: '/gestao/indicacoes',
          label: 'Indicações',
          adminOnly: true,
          icon: ArrowUpRight
        },
        {
          href: '/gestao/extensoes',
          label: 'Extensões',
          adminOnly: true,
          icon: Puzzle
        },
        {
          href: '/gestao/acessos',
          label: 'Acessos',
          requiresAddon: 'acessos',
          adminOnly: true,
          icon: Users
        }
      ]
    }
  ];

  const allHrefs = navGroups.flatMap((g) => g.items.map((i) => i.href));
</script>

<!-- Botão hambúrguer mobile -->
<button
  class="md:hidden fixed top-3 left-3 z-60 p-2 rounded-lg transition-colors"
  style="background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-subtle);"
  on:click={() => mobileOpen = !mobileOpen}
  aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu de gestão'}
  aria-expanded={mobileOpen}
  aria-controls="gestao-sidebar"
>
  {#if $unreadCount > 0}<span class:critical-dot={hasUnreadCritical} class="mobile-gerente-dot" aria-hidden="true"></span>{/if}
  {#if mobileOpen}
    <X class="size-5" aria-hidden="true" />
  {:else}
    <Menu class="size-5" aria-hidden="true" />
  {/if}
</button>

<!-- Overlay mobile -->
{#if mobileOpen}
  <div
    class="md:hidden fixed inset-0 z-55 bg-black/50"
    role="presentation"
    on:click={closeMobile}
    on:keydown={e => e.key === 'Escape' && closeMobile()}
    aria-hidden="true"
  ></div>
{/if}

<!-- Sidebar -->
<aside
  id="gestao-sidebar"
  role="navigation"
  aria-label="Menu de gestão"
  class="fixed md:static inset-y-0 left-0 z-58 flex flex-col h-screen shrink-0 sidebar-shell"
  class:collapsed
  style="background: var(--bg-sidebar); border-right: 1px solid var(--border-subtle);"
  class:mobile-open={mobileOpen}
>

  <!-- Topo: logo + botão de toggle -->
  <div class="px-3 py-4 border-b flex items-center shrink-0 gap-2" style="border-color: var(--border-subtle); min-height: 64px;">
    <a
      href="/app"
      class="flex items-center gap-2 min-w-0 flex-1 overflow-hidden"
      title="Ir para Frente de Caixa"
      on:click={closeMobile}
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
    {@const trialDay = Math.min(30, Math.max(1, 30 - trialDaysLeft))}
    {@const pct = Math.round((trialDay / 30) * 100)}
    {@const urgent = trialDaysLeft <= 7}
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
            Dia {trialDay} de 30
          {/if}
        </span>
        <a
          href="/assinatura"
          on:click={closeMobile}
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
    {#each navGroups as group}
      <div class="pt-3">
        <p class="px-3 pb-1 text-xs font-bold uppercase tracking-wider overflow-hidden label-text" style="color: var(--text-muted);">
          {group.label}
        </p>
        <ul role="list" class="space-y-0.5">
          {#each group.items as item}
            {#if shouldShowItem(item, addonFlags, accessLoaded)}
              {@const active = isActive(item.href, pathname)}
              <li>
                <a
                  href={item.href}
                  class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors overflow-hidden"
                  style="
                    background: {active ? 'var(--sidebar-item-active-bg)' : 'transparent'};
                    color: {active ? 'var(--sidebar-item-active-text)' : 'var(--text-main)'};
                  "
                  on:mouseenter={e => { if (!active) e.currentTarget.style.background = 'var(--sidebar-item-hover-bg)'; }}
                  on:mouseleave={e => { if (!active) e.currentTarget.style.background = active ? 'var(--sidebar-item-active-bg)' : 'transparent'; }}
                  on:click={closeMobile}
                  aria-current={active ? 'page' : undefined}
                  title={item.label}
                >
                  <span class="nav-icon"><svelte:component this={item.icon} class="size-5 shrink-0" aria-hidden="true" />{#if item.badge && collapsed && $unreadCount > 0}<span class:critical-dot={hasUnreadCritical} class="collapsed-gerente-dot" aria-hidden="true"></span>{/if}</span>
                  <span class="label-text whitespace-nowrap">{item.label}</span>
                  {#if item.badge}<span class="ml-auto label-text"><SidebarBadge count={$unreadCount} hasCritical={hasUnreadCritical} /></span>{/if}
                </a>
              </li>
            {/if}
          {/each}
        </ul>
      </div>
    {/each}

    <!-- Suporte -->
    <div class="pt-3">
      <p class="px-3 pb-1 text-xs font-bold uppercase tracking-wider overflow-hidden label-text" style="color: var(--text-muted);">
        Ajuda
      </p>
      <ul role="list" class="space-y-0.5">
        <li>
          <button
            on:click={() => { toggleSupport(); closeAssistant(); closeMobile(); }}
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors overflow-hidden w-full text-left"
            style="color: {$isSupportOpen ? '#0f766e' : 'var(--text-main)'};"
            on:mouseenter={e => e.currentTarget.style.background = 'var(--sidebar-item-hover-bg)'}
            on:mouseleave={e => e.currentTarget.style.background = ''}
            title="Suporte IA"
            aria-label="Abrir Suporte IA"
            aria-pressed={$isSupportOpen}
          >
            <HelpCircle class="size-5 shrink-0" style="color: {$isSupportOpen ? '#0f766e' : 'var(--link)'};" aria-hidden="true" />
            <span class="label-text whitespace-nowrap">Suporte</span>
          </button>
        </li>
        <li>
          <button
            on:click={() => { toggleAssistant(); closeSupport(); closeMobile(); }}
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors overflow-hidden w-full text-left"
            style="color: var(--text-main);"
            on:mouseenter={e => e.currentTarget.style.background = 'var(--sidebar-item-hover-bg)'}
            on:mouseleave={e => e.currentTarget.style.background = ''}
            title="Parceiro IA"
            aria-label="Abrir Parceiro IA"
          >
            <Sparkles class="size-5 shrink-0" aria-hidden="true" />
            <span class="label-text whitespace-nowrap">Parceiro IA</span>
          </button>
        </li>
      </ul>
    </div>
  </nav>

  <!-- Usuário / base -->
  <div class="shrink-0 border-t px-3 py-3 overflow-hidden" style="border-color: var(--border-subtle);">
    <a
      href="/perfil"
      on:click={closeMobile}
      class="flex items-center gap-3 mb-2 min-w-0 w-full px-2 py-1.5 rounded-lg transition-colors"
      style="color: var(--text-main);"
      on:mouseenter={e => e.currentTarget.style.background = 'var(--sidebar-item-hover-bg)'}
      on:mouseleave={e => e.currentTarget.style.background = ''}
      title="Meu Perfil"
      aria-label="Ir para Meu Perfil"
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
      <LogOut class="size-5 shrink-0" aria-hidden="true" />
      <span class="label-text whitespace-nowrap">Sair</span>
    </button>
  </div>
</aside>

<style>
  /* Largura da sidebar com transição suave */
  .sidebar-shell {
    width: 240px;
    transition: width 220ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .sidebar-shell.collapsed {
    width: 64px;
  }

  /* Mobile: ignora collapsed, segue translate */
  @media (max-width: 767px) {
    .sidebar-shell {
      width: 240px !important;
      transform: translateX(-100%);
      transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    .sidebar-shell.mobile-open {
      transform: translateX(0);
    }
    /* Always show labels on mobile, regardless of collapsed state */
    .sidebar-shell.collapsed .label-text {
      max-width: 200px;
      opacity: 1;
    }
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
  .nav-icon { position: relative; display: inline-flex; flex: 0 0 auto; }.collapsed-gerente-dot, .mobile-gerente-dot { position: absolute; width: 8px; height: 8px; border-radius: 50%; background: var(--primary); }.collapsed-gerente-dot.critical-dot, .mobile-gerente-dot.critical-dot { background: var(--status-error-text); }.collapsed-gerente-dot { top: -3px; right: -4px; }.mobile-gerente-dot { top: 4px; right: 4px; }
</style>

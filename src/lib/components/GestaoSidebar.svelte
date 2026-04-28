<script>
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabaseClient';
  import { sessionStore, companyNameStore } from '$lib/stores/session';
  import { toggleAssistant } from '$lib/stores/assistant';
  import { onMount } from 'svelte';

  let mobileOpen = false;
  let collapsed = false;
  let subStatus = null;
  let trialDaysLeft = null;
  let companyLogoUrl = null;

  onMount(async () => {
    const saved = localStorage.getItem('zelo_sidebar_collapsed');
    if (saved !== null) collapsed = saved === 'true';

    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      try {
        const [{ data: sub }, { data: perfil }] = await Promise.all([
          supabase
            .from('subscriptions')
            .select('status, current_period_end')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('empresa_perfil')
            .select('logo_url')
            .eq('user_id', user.id)
            .maybeSingle()
        ]);
        if (sub?.status === 'trialing' && sub?.current_period_end) {
          subStatus = sub.status;
          const diff = new Date(sub.current_period_end) - new Date();
          trialDaysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
        }
        if (perfil?.logo_url) companyLogoUrl = perfil.logo_url;
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
    return currentPath === href || currentPath.startsWith(href + '/');
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

  const navGroups = [
    {
      label: 'Vendas',
      items: [
        {
          href: '/app',
          label: 'Frente de Caixa',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 flex-shrink-0" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.15c0 .415.336.75.75.75z" /></svg>`
        },
        {
          href: '/app/mesas',
          label: 'Mesas',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 flex-shrink-0" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>`
        }
      ]
    },
    {
      label: 'Gestão',
      items: [
        {
          href: '/gestao',
          label: 'Dashboard',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 flex-shrink-0" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>`
        },
        {
          href: '/gestao/produtos',
          label: 'Produtos',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 flex-shrink-0" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>`
        },
        {
          href: '/gestao/pessoas',
          label: 'Pessoas',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 flex-shrink-0" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>`
        },
        {
          href: '/gestao/estoque',
          label: 'Estoque',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 flex-shrink-0" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 2.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>`
        },
        {
          href: '/gestao/mesas',
          label: 'Cadastro de Mesas',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 flex-shrink-0" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>`
        }
      ]
    },
    {
      label: 'Financeiro',
      items: [
        {
          href: '/gestao/caixa',
          label: 'Fechar Caixa',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 flex-shrink-0" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>`
        },
        {
          href: '/gestao/fichario',
          label: 'Fichário (Fiado)',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 flex-shrink-0" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>`
        },
        {
          href: '/gestao/despesas',
          label: 'Despesas',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 flex-shrink-0" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>`
        }
      ]
    },
    {
      label: 'Outros',
      items: [
        {
          href: '/relatorios',
          label: 'Relatórios',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 flex-shrink-0" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>`
        },
        {
          href: '/gestao/cardapio',
          label: 'Cardápio Digital',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 flex-shrink-0" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>`
        },
        {
          href: '/gestao/extensoes',
          label: 'Extensões',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 flex-shrink-0" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.6c-1.886.342-3.815.566-5.78.666a.64.64 0 01-.657-.643v0z" /></svg>`
        }
      ]
    }
  ];
</script>

<!-- Botão hambúrguer mobile -->
<button
  class="md:hidden fixed top-3 left-3 z-[60] p-2 rounded-lg transition-colors"
  style="background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-subtle);"
  on:click={() => mobileOpen = !mobileOpen}
  aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu de gestão'}
  aria-expanded={mobileOpen}
  aria-controls="gestao-sidebar"
>
  {#if mobileOpen}
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  {:else}
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true">
      <path fill-rule="evenodd" d="M3.75 6.75A.75.75 0 014.5 6h15a.75.75 0 010 1.5H4.5a.75.75 0 01-.75-.75zm0 5.25a.75.75 0 01.75-.75h15a.75.75 0 010 1.5H4.5a.75.75 0 01-.75-.75zm.75 4.5a.75.75 0 000 1.5h15a.75.75 0 000-1.5H4.5z" clip-rule="evenodd" />
    </svg>
  {/if}
</button>

<!-- Overlay mobile -->
{#if mobileOpen}
  <div
    class="md:hidden fixed inset-0 z-[55] bg-black/50"
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
  class="fixed md:static inset-y-0 left-0 z-[58] flex flex-col h-screen flex-shrink-0 sidebar-shell"
  class:collapsed
  style="background: var(--bg-sidebar); border-right: 1px solid var(--border-subtle);"
  class:mobile-open={mobileOpen}
>

  <!-- Topo: logo + botão de toggle -->
  <div class="px-3 py-4 border-b flex items-center flex-shrink-0 gap-2" style="border-color: var(--border-subtle); min-height: 64px;">
    <a
      href="/app"
      class="flex items-center gap-2 min-w-0 flex-1 overflow-hidden"
      title="Ir para Frente de Caixa"
      on:click={closeMobile}
    >
      <img src="/logo-horizontal.png" alt="Zelo PDV" class="h-24 w-auto flex-shrink-0" />
    </a>

    <!-- Botão de colapsar — oculto em mobile -->
    <button
      class="hidden md:flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0 transition-colors toggle-btn"
      style="color: var(--text-muted); border: 1px solid var(--border-subtle);"
      on:click={toggleCollapse}
      title={collapsed ? 'Expandir menu' : 'Recolher menu'}
      aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
    >
      <!-- Chevron left / right -->
      {#if collapsed}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4" aria-hidden="true">
          <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
        </svg>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4" aria-hidden="true">
          <path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" />
        </svg>
      {/if}
    </button>
  </div>

  {#if subStatus === 'trialing' && trialDaysLeft !== null && !collapsed}
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
  <nav class="flex-1 overflow-y-auto px-3 py-2 space-y-1" aria-label="Navegação principal de gestão">
    {#each navGroups as group}
      <div class="pt-3">
        <p class="px-3 pb-1 text-xs font-bold uppercase tracking-wider overflow-hidden label-text" style="color: var(--text-muted);">
          {group.label}
        </p>
        <ul role="list" class="space-y-0.5">
          {#each group.items as item}
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
                {@html item.icon}
                <span class="label-text whitespace-nowrap">{item.label}</span>
              </a>
            </li>
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
          <a
            href="https://wa.me/5514991537503?text=Oi%2C%20vim%20pelo%20sistema%20Zelo%20PDV%20e%20preciso%20de%20suporte%20(d%C3%BAvida%20ou%20problema)."
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors overflow-hidden"
            style="color: var(--text-main);"
            on:mouseenter={e => e.currentTarget.style.background = 'var(--sidebar-item-hover-bg)'}
            on:mouseleave={e => e.currentTarget.style.background = ''}
            on:click={closeMobile}
            aria-label="Suporte via WhatsApp (abre em nova aba)"
            title="Suporte"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 flex-shrink-0" style="color: var(--link);" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
            <span class="label-text whitespace-nowrap">Suporte</span>
          </a>
        </li>
        <li>
          <button
            on:click={() => { toggleAssistant(); closeMobile(); }}
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors overflow-hidden w-full text-left"
            style="color: var(--text-main);"
            on:mouseenter={e => e.currentTarget.style.background = 'var(--sidebar-item-hover-bg)'}
            on:mouseleave={e => e.currentTarget.style.background = ''}
            title="Parceiro IA"
            aria-label="Abrir Parceiro IA"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 flex-shrink-0" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
            <span class="label-text whitespace-nowrap">Parceiro IA</span>
          </button>
        </li>
      </ul>
    </div>
  </nav>

  <!-- Usuário / base -->
  <div class="flex-shrink-0 border-t px-3 py-3 overflow-hidden" style="border-color: var(--border-subtle);">
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
        class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden"
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
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 flex-shrink-0" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
      </svg>
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
</style>

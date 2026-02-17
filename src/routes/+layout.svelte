<script>
  import "../app.css";
  import { onMount } from 'svelte';
  import { supabase, hasSupabaseConfig } from '$lib/supabaseClient';
  import { isSubscriptionActiveStrict } from '$lib/guards';
  import { page } from '$app/stores';

  export let params;

  let session = null;
  let showMobileMenu = false;
  
  // Generic Menu State
  let activeMenu = null; // 'gestao', 'financeiro', 'user', null
  let menuCloseTimer;
  const closeDelay = 200;

  function openMenu(name) {
    cancelCloseMenu();
    activeMenu = name;
  }
  
  function scheduleCloseMenu() {
    cancelCloseMenu();
    menuCloseTimer = setTimeout(() => (activeMenu = null), closeDelay);
  }
  
  function cancelCloseMenu() {
    if (menuCloseTimer) clearTimeout(menuCloseTimer);
  }

  // Active state helpers
  $: path = $page.url.pathname;
  $: isGestao = path === '/admin' || path.startsWith('/admin/pessoas') || path.startsWith('/admin/produtos') || path.startsWith('/admin/estoque');
  $: isFinanceiro = path.startsWith('/admin/caixa') || path.startsWith('/admin/fichario') || path.startsWith('/admin/despesas');
  $: isRelatorios = path.startsWith('/relatorios');
  $: isApp = path.startsWith('/app');
  $: isPerfil = path.startsWith('/perfil');

  // NEW YEAR THEME STATE (DEPRECATED - New Year is over)
  let isNewYearMode = false;
  let sparkles = [];

  function createSparkles() {
    return Array(20).fill(0).map((_, i) => ({
      left: Math.random() * 100 + '%',
      top: Math.random() * 100 + '%',
      size: (Math.random() * 4 + 2) + 'px',
      animDuration: (Math.random() * 2 + 1) + 's',
      delay: (Math.random() * 3) + 's',
      opacity: Math.random()
    }));
  }

  function toggleNewYear() {
     isNewYearMode = !isNewYearMode;
     if(typeof window !== 'undefined'){
       localStorage.setItem('zelo_newyear_theme', String(isNewYearMode));
       // Desativar natal se ativar ano novo (opcional, mas limpo)
       if (isNewYearMode) {
          isChristmasMode = false;
          localStorage.setItem('zelo_xmas_theme', 'false');
       }
     }
  }

  // CHRISTMAS THEME STATE (DEPRECATED - Christmas is over)
  let isChristmasMode = false;
  let flakes = [];

  function createSnowflakes() {
    return Array(30).fill(0).map((_,i) => ({
      left: Math.random() * 100 + '%',
      animDuration: (Math.random() * 5 + 5) + 's',
      delay: (Math.random() * 5) + 's',
      opacity: Math.random()
    }));
  }

  function toggleChristmas() {
     isChristmasMode = !isChristmasMode;
     if(typeof window !== 'undefined'){
       localStorage.setItem('zelo_xmas_theme', String(isChristmasMode));
     }
  }

  onMount(async () => {
    // SEASONAL INIT
    if(typeof window !== 'undefined'){
        flakes = createSnowflakes();
        sparkles = createSparkles();
        
        const savedXmas = localStorage.getItem('zelo_xmas_theme');
        // FORCE DISABLE CHRISTMAS (Christmas is over)
        if(savedXmas === 'true') {
          localStorage.setItem('zelo_xmas_theme', 'false');
          isChristmasMode = false;
        } else {
          isChristmasMode = false;
        }

        const savedNY = localStorage.getItem('zelo_newyear_theme');
        // FORCE DISABLE NEW YEAR (New Year is over)
        if(savedNY === 'true') {
          localStorage.setItem('zelo_newyear_theme', 'false');
          isNewYearMode = false;
        } else {
          isNewYearMode = false;
        }
    }

    if (!supabase) return;
 
  const publicPaths = ['/', '/login', '/cadastro', '/esqueci-senha', '/landing', '/assinatura', '/perfil', '/perfil.html', '/painel.html', '/redefinir-senha'];
    const path = window.location.pathname;

    let navigated = false;
    let authReady = false;

    const maybeNavigate = async () => {
      if (navigated || !authReady) return;
      // Se logado, checa assinatura antes de liberar rotas protegidas
      let hasActiveSub = false;
      let hasCompleteProfile = false;
      if (session?.user?.id) {
        try {
          // 1) Assinatura ativa (somente por user_id)
          let { data: subRow } = await supabase
            .from('subscriptions')
            .select('status, current_period_end')
            .eq('user_id', session.user.id)
            .maybeSingle();
          hasActiveSub = isSubscriptionActiveStrict(subRow);

          // 2) Perfil da empresa completo (não cria se ausente, devido a NOT NULL)
          let { data: perfil } = await supabase
            .from('empresa_perfil')
            .select('nome_exibicao, documento, contato, largura_bobina')
            .eq('user_id', session.user.id)
            .maybeSingle();
          hasCompleteProfile = Boolean(
            perfil && perfil.nome_exibicao && perfil.documento && perfil.contato &&
            (perfil.largura_bobina === '58mm' || perfil.largura_bobina === '80mm')
          );
          
        } catch {}
      }

      // Se logado e perfil incompleto, força ir para /perfil (evitar loop quando já está em /perfil)
      if (session && !hasCompleteProfile && path !== '/perfil' && path !== '/perfil.html') {

        const params = new URLSearchParams({ msg: 'complete' });
        window.location.href = `/perfil?${params.toString()}`;
        navigated = true;
        return;
      }

      // Helper to check if path is public (includes /loja/* subroutes)
      const isPublicPath = (p) => publicPaths.includes(p);

      if (!session && !isPublicPath(path)) {

        window.location.href = '/login';
        navigated = true;
        return;
      }
      if (session && isPublicPath(path)) {
        // Allow /loja/* paths without redirect (public storefront)
        if (path === '/' || path === '/assinatura' || path === '/perfil' || path === '/perfil.html' || path === '/redefinir-senha') {

        } else {

          window.location.href = '/app';
          navigated = true;
        }
        return;
      }
      // Protege rotas internas sem assinatura ativa
      const protectedPaths = ['/app', '/admin', '/relatorios'];
      if (session && protectedPaths.some((p) => path.startsWith(p))) {
        if (!hasCompleteProfile) {

          const params = new URLSearchParams({ msg: 'complete' });
          window.location.href = `/perfil?${params.toString()}`;
          navigated = true;
          return;
        }
        if (!hasActiveSub) {
          // Redirecionar para assinatura - msg=subscribe para novos usuários
          window.location.href = '/assinatura?msg=subscribe';
          navigated = true;
          return;
        }
      }
    };

    // 1) onAuthStateChange primeiro (emite INITIAL_SESSION em v2)
    supabase.auth.onAuthStateChange((event, sess) => {

      session = sess;
      if (['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED'].includes(event)) {
        authReady = true;
        maybeNavigate();
      }
    });

    // 2) getSession com timeout
    const getSessionWithTimeout = (ms = 3000) =>
      Promise.race([
        supabase.auth.getSession(),
        new Promise((resolve) => setTimeout(() => resolve({ data: { session: null }, error: null }), ms))
      ]);

    const { data, error } = await getSessionWithTimeout(4000);
    if (error) console.warn('[AuthDebug] getSession error:', error?.message || error);
    if (data?.session) {
      session = data.session;
      authReady = true; // Only mark ready when we actually have a session here
      maybeNavigate();
    }
  });

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const navLinkBase = "px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150";
  const navLinkInactive = "text-muted hover:bg-black/5 dark:hover:bg-white/10";
  const navLinkActive = "font-semibold text-[var(--accent)] bg-[var(--accent-light)]";

  let isOnline = true;
  onMount(() => {
    isOnline = navigator.onLine;
    const setOnline = () => isOnline = true;
    const setOffline = () => isOnline = false;
    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOffline);
    return () => {
      window.removeEventListener('online', setOnline);
      window.removeEventListener('offline', setOffline);
    };
  });
  import ToastContainer from '$lib/components/ToastContainer.svelte';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import PinSetupModal from '$lib/components/PinSetupModal.svelte';
  import { adminUnlocked } from '$lib/stores/adminStore';

  let showPinSetup = false;
  let adminPin = null;
  let companyName = null;

  // Enhance the existing onMount/auth check
  // We need to fetch the PIN and NAME from profile when session loads
  
  async function fetchProfileData(uId) {
    if (!uId) return;
    const { data } = await supabase.from('empresa_perfil').select('pin_admin, nome_exibicao').eq('user_id', uId).maybeSingle();
    
    if (data) {
        if (!data.pin_admin) {
            showPinSetup = true;
        } else {
            adminPin = data.pin_admin;
        }
        if (data.nome_exibicao) {
            companyName = data.nome_exibicao;
        }
    }
  }

  // Hook into existing session logic
  $: if (session?.user?.id) fetchProfileData(session.user.id);
  
  function onPinSet(newPin) {
    showPinSetup = false;
    adminPin = newPin;
    $adminUnlocked = true; // Auto unlock on creation
  }
</script>

<ToastContainer />
<ConfirmDialog />

{#if showPinSetup && session}
  <PinSetupModal userId={session.user.id} {onPinSet} />
{/if}

{#if !isOnline}
  <div class="bg-red-600 text-white text-center text-sm py-1 font-medium z-[60] relative">
    Você está offline. Verifique sua conexão.
  </div>
{/if}

<div class="flex flex-col min-h-screen bg-app-base overflow-x-hidden" class:christmas-theme={isChristmasMode} class:newyear-theme={isNewYearMode}>
  
  {#if isChristmasMode}
    <div class="snow-container">
      {#each flakes as f}
         <div class="snowflake" style="left: {f.left}; animation-duration: {f.animDuration}; animation-delay: {f.delay}; opacity: {f.opacity}">❄</div>
      {/each}
    </div>
  {/if}

  {#if isNewYearMode}
    <div class="sparkle-container">
      {#each sparkles as s}
         <div class="sparkle" style="left: {s.left}; top: {s.top}; width: {s.size}; height: {s.size}; animation-duration: {s.animDuration}; animation-delay: {s.delay}; opacity: {s.opacity}">✨</div>
      {/each}
    </div>
  {/if}

  {#if $page.url.pathname !== '/' && $page.url.pathname !== '/landing'}
  <header class="border-b bg-header-base backdrop-blur sticky top-0 z-50 transition-colors duration-500">
    <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
      
       <div class="flex items-center gap-4">
          <a href={session ? '/app' : '/'} class="flex items-center gap-2">
            <img src="/logo-zelo.svg" alt="Zelo PDV" class="h-8 sm:h-10 w-auto" />
          </a>
          
          <!-- Botao de Natal desativado pois o natal ja passou -->
          <!-- 
          <button on:click={toggleChristmas} class="p-1 rounded-full hover:bg-[var(--sidebar-item-hover-bg)] transition-colors group relative" title="Modo Natal">
            <span class="text-xl filter grayscale group-hover:grayscale-0 transition-all duration-300" style="filter: {isChristmasMode ? 'none' : 'grayscale(100%)'}">🎄</span>
          </button>
          -->

          <!-- Botao de Ano Novo desativado pois o ano novo ja passou -->
          <!-- 
          <button on:click={toggleNewYear} class="p-1 rounded-full hover:bg-[var(--sidebar-item-hover-bg)] transition-colors group relative" title="Modo Ano Novo">
            <span class="text-xl filter grayscale group-hover:grayscale-0 transition-all duration-300" style="filter: {isNewYearMode ? 'none' : 'grayscale(100%)'}">🥂</span>
          </button>
          -->
       </div>

      <nav class="hidden md:flex gap-1 text-sm items-center font-medium">
        {#if session}
          <!-- Frente de Caixa -->
          <a href="/app" class="{navLinkBase} {isApp ? navLinkActive : navLinkInactive}">
            Frente de Caixa
          </a>

          <!-- Gestão Dropdown -->
          <div class="relative" role="menubar" tabindex="0" aria-label="Gestão" 
               on:mouseenter={() => openMenu('gestao')} on:mouseleave={scheduleCloseMenu}>
            <button class="{navLinkBase} {isGestao ? navLinkActive : navLinkInactive} flex items-center gap-1"
              aria-haspopup="true" aria-expanded={activeMenu === 'gestao'} on:click={() => activeMenu = activeMenu === 'gestao' ? null : 'gestao'}>
              Gestão
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 opacity-70"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.08 1.04l-4.25 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z" clip-rule="evenodd"/></svg>
            </button>
            
            {#if activeMenu === 'gestao'}
              <div role="menu" tabindex="-1" 
                   class="absolute left-0 mt-1 w-48 rounded-md shadow-lg py-1 z-50 border bg-[var(--bg-panel)] border-[var(--border-subtle)]"
                   on:mouseenter={cancelCloseMenu} on:mouseleave={scheduleCloseMenu}>
                <a href="/admin" class="block px-4 py-2 text-sm text-[var(--text-main)] hover:bg-[var(--sidebar-item-hover-bg)]">Dashboard</a>
                <a href="/admin/pessoas" class="block px-4 py-2 text-sm text-[var(--text-main)] hover:bg-[var(--sidebar-item-hover-bg)]">Pessoas</a>
                <a href="/admin/produtos" class="block px-4 py-2 text-sm text-[var(--text-main)] hover:bg-[var(--sidebar-item-hover-bg)]">Produtos</a>
                <a href="/admin/estoque" class="block px-4 py-2 text-sm text-[var(--text-main)] hover:bg-[var(--sidebar-item-hover-bg)]">Estoque</a>
              </div>
            {/if}
          </div>

          <!-- Financeiro Dropdown -->
          <div class="relative" role="menubar" tabindex="0" aria-label="Financeiro" 
               on:mouseenter={() => openMenu('financeiro')} on:mouseleave={scheduleCloseMenu}>
            <button class="{navLinkBase} {isFinanceiro ? navLinkActive : navLinkInactive} flex items-center gap-1"
              aria-haspopup="true" aria-expanded={activeMenu === 'financeiro'} on:click={() => activeMenu = activeMenu === 'financeiro' ? null : 'financeiro'}>
              Financeiro
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 opacity-70"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.08 1.04l-4.25 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z" clip-rule="evenodd"/></svg>
            </button>
            
            {#if activeMenu === 'financeiro'}
              <div role="menu" tabindex="-1" 
                   class="absolute left-0 mt-1 w-48 rounded-md shadow-lg py-1 z-50 border bg-[var(--bg-panel)] border-[var(--border-subtle)]"
                   on:mouseenter={cancelCloseMenu} on:mouseleave={scheduleCloseMenu}>
                <a href="/admin/caixa" class="block px-4 py-2 text-sm text-[var(--text-main)] hover:bg-[var(--sidebar-item-hover-bg)]">Fechar Caixa</a>
                <a href="/admin/fichario" class="block px-4 py-2 text-sm text-[var(--text-main)] hover:bg-[var(--sidebar-item-hover-bg)]">Fichário (Fiado)</a>
                <a href="/admin/despesas" class="block px-4 py-2 text-sm text-[var(--text-main)] hover:bg-[var(--sidebar-item-hover-bg)]">Despesas</a>
              </div>
            {/if}
          </div>

          <!-- Relatórios -->
          <a href="/relatorios" class="{navLinkBase} {isRelatorios ? navLinkActive : navLinkInactive}">
            Relatórios
          </a>

          <div class="mx-2 h-6 w-px bg-[var(--border-subtle)]"></div>

          <!-- Suporte -->
          <a href="https://wa.me/5514991537503?text=Oi%2C%20vim%20pelo%20sistema%20Zelo%20PDV%20e%20preciso%20de%20suporte%20(d%C3%BAvida%20ou%20problema)." 
             target="_blank" rel="noopener" 
             class="{navLinkBase} {navLinkInactive} group relative flex items-center gap-2" 
             aria-label="Suporte Técnico">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 text-sky-500">
               <path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
            <span class="hidden xl:inline">Suporte</span>
            <!-- Tooltip -->
            <div role="tooltip" class="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 whitespace-nowrap px-3 py-2 rounded-md bg-slate-900 text-white text-xs shadow-lg opacity-0 scale-95 transition-all duration-200 group-hover:opacity-100 group-hover:scale-100 group-hover:visible z-50">
              Preciso de suporte
              <div class="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45"></div>
            </div>
          </a>

          <!-- User Menu -->
          <div class="relative" role="menubar" tabindex="0" aria-label="Usuário" 
               on:mouseenter={() => openMenu('user')} on:mouseleave={scheduleCloseMenu}>
             <button class="{navLinkBase} {isPerfil ? navLinkActive : navLinkInactive} flex items-center gap-2"
                 aria-haspopup="true" aria-expanded={activeMenu === 'user'} on:click={() => activeMenu = activeMenu === 'user' ? null : 'user'}>
               <span class="w-8 h-8 rounded-full bg-[var(--accent-light)] flex items-center justify-center text-[var(--accent)] font-bold text-xs ring-2 ring-transparent group-hover:ring-[var(--accent)] transition-all">
                 {(companyName || session.user.email)[0].toUpperCase()}
               </span>
               <span class="max-w-[150px] truncate hidden xl:inline font-semibold">
                 {companyName || session.user.email.split('@')[0]}
               </span>
             </button>

             {#if activeMenu === 'user'}
              <div role="menu" tabindex="-1" 
                   class="absolute right-0 mt-1 w-48 rounded-md shadow-lg py-1 z-50 border bg-[var(--bg-panel)] border-[var(--border-subtle)]"
                   on:mouseenter={cancelCloseMenu} on:mouseleave={scheduleCloseMenu}>
                <div class="px-4 py-2 text-xs text-[var(--text-muted)] border-b border-[var(--border-subtle)] mb-1">
                  {session.user.email}
                </div>
                <!-- Exibir Nome da Empresa no menu também -->
                {#if companyName}
                  <div class="px-4 py-1 text-xs font-bold text-[var(--text-main)]">
                    {companyName}
                  </div>
                {/if}
                <a href="/perfil" class="block px-4 py-2 text-sm text-[var(--text-main)] hover:bg-[var(--sidebar-item-hover-bg)]">Meu Perfil</a>
                <button on:click={logout} class="w-full text-left block px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">Sair</button>
              </div>
            {/if}
          </div>

        {:else}
          <a href="/login" class="text-sm font-medium text-[var(--accent)] hover:text-[var(--primary)] transition-colors">
            Entrar
          </a>
          <a href="/cadastro" class="ml-2 btn-primary px-4 shadow-sm text-sm font-medium border border-transparent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--accent)]">
            Criar conta
          </a>
        {/if}
      </nav>
      <button class="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-md border text-main" style="border-color: var(--border-subtle);"
        aria-label="Abrir menu" on:click={() => showMobileMenu = !showMobileMenu}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
          <path fill-rule="evenodd" d="M3.75 6.75A.75.75 0 014.5 6h15a.75.75 0 010 1.5H4.5a.75.75 0 01-.75-.75zm0 5.25a.75.75 0 01.75-.75h15a.75.75 0 010 1.5H4.5a.75.75 0 01-.75-.75zm.75 4.5a.75.75 0 000 1.5h15a.75.75 0 000-1.5H4.5z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>
  </header>

  {#if showMobileMenu}
    <div class="md:hidden border-b backdrop-blur" style="background-color: var(--bg-panel); border-color: var(--border-subtle);">
      <div class="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-2 text-sm">
        {#if session}
          <a href="/app" class="{navLinkBase} {isApp ? navLinkActive : navLinkInactive} justify-center text-center py-3" on:click={() => showMobileMenu=false}>
            FRENTE DE CAIXA
          </a>
          
          <div class="mt-4 px-2 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Gestão</div>
          <a href="/admin" class="block px-3 py-2 text-[var(--text-main)] rounded hover:bg-[var(--sidebar-item-hover-bg)]" on:click={() => showMobileMenu=false}>Dashboard</a>
          <a href="/admin/pessoas" class="block px-3 py-2 text-[var(--text-main)] rounded hover:bg-[var(--sidebar-item-hover-bg)]" on:click={() => showMobileMenu=false}>Pessoas</a>
          <a href="/admin/produtos" class="block px-3 py-2 text-[var(--text-main)] rounded hover:bg-[var(--sidebar-item-hover-bg)]" on:click={() => showMobileMenu=false}>Produtos</a>
          <a href="/admin/estoque" class="block px-3 py-2 text-[var(--text-main)] rounded hover:bg-[var(--sidebar-item-hover-bg)]" on:click={() => showMobileMenu=false}>Estoque</a>

          <div class="mt-2 px-2 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Financeiro</div>
          <a href="/admin/caixa" class="block px-3 py-2 text-[var(--text-main)] rounded hover:bg-[var(--sidebar-item-hover-bg)]" on:click={() => showMobileMenu=false}>Fechar Caixa</a>
          <a href="/admin/fichario" class="block px-3 py-2 text-[var(--text-main)] rounded hover:bg-[var(--sidebar-item-hover-bg)]" on:click={() => showMobileMenu=false}>Fichário (Fiado)</a>
          <a href="/admin/despesas" class="block px-3 py-2 text-[var(--text-main)] rounded hover:bg-[var(--sidebar-item-hover-bg)]" on:click={() => showMobileMenu=false}>Despesas</a>

          <div class="mt-2 px-2 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Outros</div>
          <a href="/relatorios" class="block px-3 py-2 text-[var(--text-main)] rounded hover:bg-[var(--sidebar-item-hover-bg)]" on:click={() => showMobileMenu=false}>Relatórios</a>
          <a href="/perfil" class="block px-3 py-2 text-[var(--text-main)] rounded hover:bg-[var(--sidebar-item-hover-bg)]" on:click={() => showMobileMenu=false}>Meu Perfil</a>
          
          <div class="my-2 border-t border-[var(--border-subtle)]"></div>
          
          <a href="https://wa.me/5514991537503?text=Oi%2C%20vim%20pelo%20sistema%20Zelo%20PDV%20e%20preciso%20de%20suporte%20(d%C3%BAvida%20ou%20problema)." target="_blank" rel="noopener" class="flex items-center gap-2 px-3 py-2 text-sky-600 dark:text-sky-400 font-medium" on:click={() => showMobileMenu=false}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
            Suporte Técnico
          </a>

          <button on:click={logout} class="w-full text-left px-3 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
            Sair
          </button>
        {:else}
          <a href="/login" class="text-sm font-medium text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300 transition-colors" on:click={() => showMobileMenu=false}>Entrar</a>
          <a href="/cadastro" class="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-sky-600 border border-transparent rounded-md shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-colors" on:click={() => showMobileMenu=false}>Criar conta</a>
        {/if}
      </div>
    </div>
  {/if}
  {/if}

  <main class="flex-1 mx-auto w-full {$page.url.pathname.startsWith('/app') || $page.url.pathname === '/' || $page.url.pathname === '/landing' ? 'max-w-full p-0' : 'max-w-6xl px-4 py-6'}">
    <slot />
  </main>

  {#if $page.url.pathname !== '/' && $page.url.pathname !== '/landing'}
  <footer class="mt-auto border-t py-4" style="background-color: var(--bg-panel); border-color: var(--border-subtle);">
    <div class="max-w-6xl mx-auto px-4">
      <div class="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <span class="text-xs" style="color: var(--text-muted);">© {new Date().getFullYear()} <strong style="color: var(--text-main);">Zelo PDV</strong></span>
        </div>
        <div class="text-xs" style="color: var(--text-muted);">
          Desenvolvido com 💙 por <a href="https://techneia.com.br" target="_blank" rel="noopener noreferrer" class="font-medium hover:underline transition-colors" style="color: var(--accent);">Techne Sistemas</a>
        </div>
      </div>
    </div>
  </footer>
  {/if}


</div>
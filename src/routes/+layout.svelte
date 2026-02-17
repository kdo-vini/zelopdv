<script>
  import "../app.css";
  import { onMount } from 'svelte';
  import { supabase, hasSupabaseConfig } from '$lib/supabaseClient';
  import { isSubscriptionActiveStrict } from '$lib/guards';
  import { page } from '$app/stores';

  export let params;

  let session = null;
  let showMobileMenu = false;
  let showAdminMenu = false;
  let adminCloseTimer;
  const closeDelay = 240; // ms
  

  function openAdminMenu() { showAdminMenu = true; }
  function scheduleCloseAdminMenu() {
    cancelCloseAdminMenu();
    adminCloseTimer = setTimeout(() => (showAdminMenu = false), closeDelay);
  }
  function cancelCloseAdminMenu() { if (adminCloseTimer) clearTimeout(adminCloseTimer); }

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
 
  const publicPaths = ['/', '/login', '/cadastro', '/esqueci-senha', '/landing', '/assinatura', '/perfil', '/perfil.html', '/painel.html'];
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
        if (path === '/' || path === '/assinatura' || path === '/perfil' || path === '/perfil.html') {

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

  // Enhance the existing onMount/auth check
  // We need to fetch the PIN from profile when session loads
  
  async function checkPin(uId) {
    if (!uId) return;
    const { data } = await supabase.from('empresa_perfil').select('pin_admin').eq('user_id', uId).maybeSingle();
    // If no profile found, maybe wait for profile complete logic? 
    // But if profile exists and pin_admin is null -> Show Setup
    if (data) {
        if (!data.pin_admin) {
            showPinSetup = true;
        } else {
            adminPin = data.pin_admin;
        }
    }
  }

  // Hook into existing session logic
  $: if (session?.user?.id) checkPin(session.user.id);
  
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

      <nav class="hidden sm:flex gap-4 text-sm items-center">
        {#if session}
          <a href="/app" class="{navLinkBase} {$page.url.pathname.startsWith('/app') ? navLinkActive : navLinkInactive}">
            Frente de Caixa
          </a>
          <div class="relative" role="menubar" tabindex="0" aria-label="Admin" on:mouseenter={openAdminMenu} on:mouseleave={scheduleCloseAdminMenu}>
            <button class="{navLinkBase} {$page.url.pathname.startsWith('/admin') || $page.url.pathname.startsWith('/relatorios') ? navLinkActive : navLinkInactive} flex items-center gap-1"
              aria-haspopup="true" aria-expanded={showAdminMenu} on:click={() => showAdminMenu = !showAdminMenu}>
              Admin
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.08 1.04l-4.25 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z" clip-rule="evenodd"/></svg>
            </button>
            {#if showAdminMenu}
        <div role="menu" tabindex="-1" aria-label="Admin opções" 
             class="absolute right-0 mt-2 w-56 rounded-md shadow-lg py-2 z-50"
             style="background-color: var(--bg-panel); border: 1px solid var(--border-subtle);"
             on:mouseenter={cancelCloseAdminMenu} on:mouseleave={scheduleCloseAdminMenu}>
                <a href="/admin" class="block px-3 py-2 text-sm text-main hover:bg-[var(--sidebar-item-hover-bg)] rounded">Dashboard</a>
                <a href="/admin/pessoas" class="block px-3 py-2 text-sm text-main hover:bg-[var(--sidebar-item-hover-bg)] rounded">Pessoas</a>
                <a href="/admin/fichario" class="block px-3 py-2 text-sm text-main hover:bg-[var(--sidebar-item-hover-bg)] rounded">Fichário (Fiado)</a>
                <a href="/admin/produtos" class="block px-3 py-2 text-sm text-main hover:bg-[var(--sidebar-item-hover-bg)] rounded">Gerenciar produtos</a>
                <a href="/admin/estoque" class="block px-3 py-2 text-sm text-main hover:bg-[var(--sidebar-item-hover-bg)] rounded">Estoque</a>
                <a href="/admin/caixa" class="block px-3 py-2 text-sm text-main hover:bg-[var(--sidebar-item-hover-bg)] rounded">Fechar Caixa</a>
                <a href="/admin/despesas" class="block px-3 py-2 text-sm text-main hover:bg-[var(--sidebar-item-hover-bg)] rounded">Despesas</a>
                <div class="my-1 border-t" style="border-color: var(--border-subtle);"></div>
                <a href="/relatorios" class="block px-3 py-2 text-sm text-main hover:bg-[var(--sidebar-item-hover-bg)] rounded">Relatórios</a>
              </div>
            {/if}
          </div>
          
          <a href="https://wa.me/5514991537503?text=Oi%2C%20vim%20pelo%20sistema%20Zelo%20PDV%20e%20preciso%20de%20suporte%20(d%C3%BAvida%20ou%20problema)." target="_blank" rel="noopener" class="{navLinkBase} {navLinkInactive} group relative flex items-center gap-2" aria-label="Suporte Técnico">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.02-.398-1.11-.94l-.149-.894c-.07-.424-.384-.764-.78-.93-.398-.164-.855-.142-1.205.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span class="hidden lg:inline">Suporte</span>
            <!-- Tooltip -->
            <div role="tooltip" class="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 whitespace-nowrap px-3 py-2 rounded-md bg-slate-900 text-white text-xs shadow-lg opacity-0 scale-95 transition-all duration-200 group-hover:opacity-100 group-hover:scale-100 group-hover:visible z-50">
              Preciso de suporte
              <div class="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45"></div>
            </div>
          </a>

          <a href="/perfil" class="ml-4 {navLinkBase} {$page.url.pathname.startsWith('/perfil') ? navLinkActive : navLinkInactive} !px-3 !py-1.5">
            Perfil
          </a>
        {:else}
          <a href="/login" class="text-sm font-medium text-[var(--accent)] hover:text-[var(--primary)] transition-colors">
            Entrar
          </a>
          <a href="/cadastro" class="ml-2 btn-primary px-4 shadow-sm text-sm font-medium border border-transparent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--accent)]">
            Criar conta
          </a>
        {/if}
      </nav>
      <button class="sm:hidden inline-flex items-center justify-center w-9 h-9 rounded-md border text-main" style="border-color: var(--border-subtle);"
        aria-label="Abrir menu" on:click={() => showMobileMenu = !showMobileMenu}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
          <path fill-rule="evenodd" d="M3.75 6.75A.75.75 0 014.5 6h15a.75.75 0 010 1.5H4.5a.75.75 0 01-.75-.75zm0 5.25a.75.75 0 01.75-.75h15a.75.75 0 010 1.5H4.5a.75.75 0 01-.75-.75zm.75 4.5a.75.75 0 000 1.5h15a.75.75 0 000-1.5H4.5z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>
  </header>

  {#if showMobileMenu}
    <div class="sm:hidden border-b backdrop-blur" style="background-color: var(--bg-panel); border-color: var(--border-subtle);">
      <div class="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-2 text-sm">
        {#if session}
          <a href="/app" class="{navLinkBase} { $page.url.pathname.startsWith('/app') ? navLinkActive : navLinkInactive }" on:click={() => showMobileMenu=false}>Frente de Caixa</a>
          <div class="mt-1 text-xs uppercase text-muted">Admin</div>
          <a href="/admin" class="{navLinkBase} { $page.url.pathname === '/admin' ? navLinkActive : navLinkInactive }" on:click={() => showMobileMenu=false}>Dashboard</a>
          <a href="/admin/pessoas" class="{navLinkBase} { $page.url.pathname.startsWith('/admin/pessoas') ? navLinkActive : navLinkInactive }" on:click={() => showMobileMenu=false}>Pessoas</a>
          <a href="/admin/fichario" class="{navLinkBase} { $page.url.pathname.startsWith('/admin/fichario') ? navLinkActive : navLinkInactive }" on:click={() => showMobileMenu=false}>Fichário (Fiado)</a>
          <a href="/admin/produtos" class="{navLinkBase} { $page.url.pathname.startsWith('/admin/produtos') ? navLinkActive : navLinkInactive }" on:click={() => showMobileMenu=false}>Gerenciar produtos</a>
          <a href="/admin/estoque" class="{navLinkBase} { $page.url.pathname.startsWith('/admin/estoque') ? navLinkActive : navLinkInactive }" on:click={() => showMobileMenu=false}>Estoque</a>
          <a href="/admin/caixa" class="{navLinkBase} { $page.url.pathname.startsWith('/admin/caixa') ? navLinkActive : navLinkInactive }" on:click={() => showMobileMenu=false}>Fechar Caixa</a>
          
          <a href="/relatorios" class="{navLinkBase} { $page.url.pathname.startsWith('/relatorios') ? navLinkActive : navLinkInactive }" on:click={() => showMobileMenu=false}>Relatórios</a>
          <a href="/perfil" class="{navLinkBase} { $page.url.pathname.startsWith('/perfil') ? navLinkActive : navLinkInactive } !px-3 !py-1.5" on:click={() => showMobileMenu=false}>Perfil</a>
          
          <div class="my-1 border-t" style="border-color: var(--border-subtle);"></div>
          <a href="https://wa.me/5514991537503?text=Oi%2C%20vim%20pelo%20sistema%20Zelo%20PDV%20e%20preciso%20de%20suporte%20(d%C3%BAvida%20ou%20problema)." target="_blank" class="{navLinkBase} {navLinkInactive} flex items-center gap-2" on:click={() => showMobileMenu=false}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.02-.398-1.11-.94l-.149-.894c-.07-.424-.384-.764-.78-.93-.398-.164-.855-.142-1.205.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Suporte Técnico
          </a>
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
<script>
  import "../app.css";
  import { onMount } from 'svelte';
  import { supabase, hasSupabaseConfig } from '$lib/supabaseClient';
  import { isSubscriptionActiveStrict } from '$lib/guards';
  import { page } from '$app/stores';

  let session = null;
  let showMobileMenu = false;

  onMount(async () => {
    if (!supabase) return;

  const publicPaths = ['/', '/login', '/cadastro', '/esqueci-senha', '/landing', '/assinatura', '/perfil', '/perfil.html', '/painel.html'];
    const path = window.location.pathname;

    console.groupCollapsed('[AuthDebug] +layout onMount');
    console.log('path =', path);
    console.log('hasSupabaseConfig =', hasSupabaseConfig);
    console.log('supabase exists =', Boolean(supabase));

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
          hasActiveSub = isSubscriptionActiveStrict(subRow?.status);

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

      // Se logado e perfil incompleto, força ir para /perfil.html
      if (session && !hasCompleteProfile && path !== '/perfil.html') {
        console.log('[AuthDebug] decision: force complete profile -> /perfil.html');
        const params = new URLSearchParams({ msg: 'complete' });
        window.location.href = `/perfil?${params.toString()}`;
        navigated = true;
        return;
      }

      if (!session && !publicPaths.includes(path)) {
        console.log('[AuthDebug] decision: redirect to /login (protected path + no session)');
        window.location.href = '/login';
        navigated = true;
        return;
      }
      if (session && publicPaths.includes(path)) {
        console.log('[AuthDebug] decision: user is logged on a public path');
        if (path === '/' || path === '/assinatura' || path === '/perfil' || path === '/perfil.html') {
          console.log('[AuthDebug] stay on public path', path);
        } else {
          console.log('[AuthDebug] redirect to /app');
          window.location.href = '/app';
          navigated = true;
        }
        return;
      }
      // Protege rotas internas sem assinatura ativa
      const protectedPaths = ['/app', '/admin', '/relatorios'];
      if (session && protectedPaths.some((p) => path.startsWith(p))) {
        if (!hasCompleteProfile) {
          console.log('[AuthDebug] decision: incomplete profile -> redirect /perfil');
          const params = new URLSearchParams({ msg: 'complete' });
          window.location.href = `/perfil?${params.toString()}`;
          navigated = true;
          return;
        }
        if (!hasActiveSub) {
          console.log('[AuthDebug] decision: no active subscription -> redirect /assinatura');
          window.location.href = '/assinatura';
          navigated = true;
          return;
        }
      }
    };

    // 1) onAuthStateChange primeiro (emite INITIAL_SESSION em v2)
    supabase.auth.onAuthStateChange((event, sess) => {
      console.log('[AuthDebug] onAuthStateChange', { event, hasSession: Boolean(sess), userId: sess?.user?.id || null });
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
    console.time('[AuthDebug] getSession (layout)');
    const { data, error } = await getSessionWithTimeout(4000);
    console.timeEnd('[AuthDebug] getSession (layout)');
    if (error) console.warn('[AuthDebug] getSession error:', error?.message || error);
    console.log('[AuthDebug] getSession', { hasSession: Boolean(data?.session), userId: data?.session?.user?.id || null });
    if (data?.session) session = data.session;
    authReady = true;
    maybeNavigate();

    // 3) Fallback 1s
    setTimeout(() => {
      if (!navigated && !authReady) {
        console.log('[AuthDebug] fallback: auth not ready after 1s, proceeding with current session state');
        authReady = true;
        maybeNavigate();
      }
    }, 1000);

    try {
      const keys = Object.keys(localStorage).filter((k) => k.includes('sb-') || k.toLowerCase().includes('supabase'));
      console.log('[AuthDebug] localStorage keys (sb-/supabase):', keys);
    } catch {}
    console.groupEnd();
  });

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const navLinkBase = "px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150";
  const navLinkInactive = "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800";
  const navLinkActive = "font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/50";
</script>

<div class="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-50">
  <header class="border-b border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 backdrop-blur sticky top-0 z-50">
    <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2">
        <span class="text-xl sm:text-2xl font-extrabold tracking-tight leading-none">
          <span class="text-slate-900 dark:text-white">Zelo</span>
          <span class="ml-1 align-[2px] inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider border-sky-200 text-sky-700 bg-sky-50 dark:border-sky-500/30 dark:text-sky-300 dark:bg-sky-500/10">PDV</span>
        </span>
        <span class="sr-only">Zelo PDV</span>
      </a>

      <nav class="hidden sm:flex gap-4 text-sm items-center">
        {#if session}
          <a href="/app" class="{navLinkBase} {$page.url.pathname.startsWith('/app') ? navLinkActive : navLinkInactive}">
            Frente de Caixa
          </a>
          <a href="/admin" class="{navLinkBase} {$page.url.pathname.startsWith('/admin') ? navLinkActive : navLinkInactive}">
            Admin
          </a>
          <a href="/relatorios" class="{navLinkBase} {$page.url.pathname.startsWith('/relatorios') ? navLinkActive : navLinkInactive}">
            Relatórios
          </a>
          <a href="/perfil" class="ml-4 {navLinkBase} {$page.url.pathname.startsWith('/perfil') ? navLinkActive : navLinkInactive} !px-3 !py-1.5">
            Perfil
          </a>
        {:else}
          <a href="/login" class="text-sm font-medium text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300 transition-colors">
            Entrar
          </a>
          <a href="/cadastro" class="ml-2 inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-sky-600 border border-transparent rounded-md shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-colors">
            Criar conta
          </a>
        {/if}
      </nav>
      <button class="sm:hidden inline-flex items-center justify-center w-9 h-9 rounded-md border border-slate-300/60 dark:border-slate-700 text-slate-700 dark:text-slate-200"
        aria-label="Abrir menu" on:click={() => showMobileMenu = !showMobileMenu}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
          <path fill-rule="evenodd" d="M3.75 6.75A.75.75 0 014.5 6h15a.75.75 0 010 1.5H4.5a.75.75 0 01-.75-.75zm0 5.25a.75.75 0 01.75-.75h15a.75.75 0 010 1.5H4.5a.75.75 0 01-.75-.75zm.75 4.5a.75.75 0 000 1.5h15a.75.75 0 000-1.5H4.5z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>
  </header>

  {#if showMobileMenu}
    <div class="sm:hidden border-b border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
      <div class="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-2 text-sm">
        {#if session}
          <a href="/app" class="{navLinkBase} { $page.url.pathname.startsWith('/app') ? navLinkActive : navLinkInactive }" on:click={() => showMobileMenu=false}>Frente de Caixa</a>
          <a href="/admin" class="{navLinkBase} { $page.url.pathname.startsWith('/admin') ? navLinkActive : navLinkInactive }" on:click={() => showMobileMenu=false}>Admin</a>
          <a href="/relatorios" class="{navLinkBase} { $page.url.pathname.startsWith('/relatorios') ? navLinkActive : navLinkInactive }" on:click={() => showMobileMenu=false}>Relatórios</a>
          <a href="/perfil" class="{navLinkBase} { $page.url.pathname.startsWith('/perfil') ? navLinkActive : navLinkInactive } !px-3 !py-1.5" on:click={() => showMobileMenu=false}>Perfil</a>
        {:else}
          <a href="/login" class="text-sm font-medium text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300 transition-colors" on:click={() => showMobileMenu=false}>Entrar</a>
          <a href="/cadastro" class="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-sky-600 border border-transparent rounded-md shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-colors" on:click={() => showMobileMenu=false}>Criar conta</a>
        {/if}
      </div>
    </div>
  {/if}

  <main class="max-w-6xl mx-auto px-4 py-6">
    <slot />
  </main>

  <footer class="border-t border-slate-200/80 dark:border-slate-700/80 py-6 text-center text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900">
    <div class="max-w-6xl mx-auto px-4">
      © {new Date().getFullYear()} Zelo PDV · Desenvolvido por Téchne IA
    </div>
  </footer>
</div>



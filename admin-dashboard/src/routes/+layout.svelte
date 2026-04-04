<script>
  import { onMount } from 'svelte'
  import { supabase, isSuperAdmin, getAdminInfo, updateLastLogin } from '$lib/supabaseAdmin'
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import Toast from '$lib/Toast.svelte'
  import { fade } from 'svelte/transition'
  
  let session = null
  let adminInfo = null
  let loading = true
  let error = ''
  let mobileMenuOpen = false
  
  // Skip auth check on login page
  $: isLoginPage = $page.url.pathname === '/login'
  
  onMount(async () => {
    // Skip auth check on login page
    if (isLoginPage) {
      loading = false
      return
    }
    
    try {
      // Check auth state
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      session = currentSession
      
      if (!session) {
        console.log('[Admin] No session, redirecting to login')
        goto('/login')
        return
      }
      
      // Check if user is super admin
      const isAdmin = await isSuperAdmin(session.user.id)
      
      if (!isAdmin) {
        error = 'Acesso Negado. Você não é um super admin homologado.'
        loading = false
        return
      }
      
      // Get admin info
      adminInfo = await getAdminInfo(session.user.id)
      
      if (adminInfo) {
        await updateLastLogin(adminInfo.id)
      }
      
      loading = false
      
      // Listen for auth changes
      supabase.auth.onAuthStateChange((event, newSession) => {
        if (event === 'SIGNED_OUT') {
          goto('/login')
        }
      })
    } catch (err) {
      console.error('[Admin] Error in layout:', err)
      error = err.message || 'Erro de autenticação'
      loading = false
    }
  })
  
  async function handleLogout() {
    await supabase.auth.signOut()
    goto('/login')
  }

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />' },
    { name: 'Assinaturas', path: '/subscriptions', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />' },
    { name: 'Usuários', path: '/users', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />' },
    { name: 'Analytics', path: '/analytics', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />' },
    { name: 'Uso de IA', path: '/ai-usage', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />' },
    { name: 'Audit Logs', path: '/logs', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />' }
  ]
  
  function getInitials(email) {
    if(!email) return 'AD'
    return email.substring(0,2).toUpperCase()
  }

  $: closeMenu = () => { mobileMenuOpen = false }
</script>

{#if isLoginPage}
  <!-- Login page - no layout -->
  <slot />
{:else if loading}
  <div class="flex flex-col items-center justify-center min-h-screen bg-[#0B0F19]">
    <div class="w-12 h-12 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin mb-4"></div>
    <div class="text-sm font-medium tracking-widest text-[#94a3b8] uppercase">Inicializando Painel</div>
  </div>
{:else if error}
  <div class="flex items-center justify-center min-h-screen bg-[#0B0F19]">
    <div class="bg-slate-900 border border-red-500/30 rounded-2xl p-8 max-w-md text-center shadow-2xl relative overflow-hidden">
      <!-- Glow -->
      <div class="absolute top-0 inset-x-0 h-1 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]"></div>
      
      <div class="w-16 h-16 mx-auto bg-red-500/10 rounded-full flex items-center justify-center mb-6">
        <svg class="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h2 class="text-xl font-bold text-white mb-2">Acesso Restrito</h2>
      <p class="text-slate-400 text-sm mb-8 leading-relaxed">{error}</p>
      
      <a href="/login" class="inline-flex items-center justify-center px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all w-full font-medium">
        Voltar para Login
      </a>
    </div>
  </div>
{:else}
  <div class="flex h-screen bg-[#0B0F19] text-white overflow-hidden selection:bg-sky-500/30 selection:text-white">
    
    <!-- Mobile Sidebar Backdrop -->
    {#if mobileMenuOpen}
      <button 
        class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden cursor-default focus:outline-none" 
        on:click={closeMenu} 
        on:keydown={(e) => e.key === 'Escape' && closeMenu()} 
        transition:fade={{duration: 200}}>
      </button>
    {/if}

    <!-- Sidebar -->
    <aside class="fixed inset-y-0 left-0 z-50 w-72 bg-[#090D14] border-r border-[#1E293B] shadow-2xl lg:relative lg:flex flex-col flex-shrink-0 transition-transform duration-300 ease-in-out {mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}">
      
      <!-- Brand Logo -->
      <div class="h-20 flex items-center px-8 border-b border-[#1E293B]">
        <img 
          src="https://zelopdv.com.br/logo-horizontal.png" 
          alt="Zelo PDV Logo" 
          class="h-8 w-auto grayscale brightness-200 invert-[0.1] hover:grayscale-0 hover:brightness-100 transition-all duration-500" 
        />
        <span class="ml-3 text-[10px] font-bold text-sky-400 bg-sky-900/30 px-2 py-0.5 rounded-full border border-sky-500/20 uppercase tracking-widest">Admin</span>
      </div>

      <!-- Navigation Links -->
      <div class="flex-1 overflow-y-auto py-8 px-4 scrollbar-hide">
        <div class="text-xs font-semibold text-[#475569] uppercase tracking-[0.2em] mb-4 px-4">Menu</div>
        <nav class="space-y-1">
          {#each menuItems as item}
            {@const isActive = item.path === '/' ? $page.url.pathname === '/' : $page.url.pathname.startsWith(item.path)}
            <a
              href={item.path}
              on:click={closeMenu}
              class="flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 group relative {isActive ? 'text-white bg-sky-500/10' : 'text-[#94A3B8] hover:text-white hover:bg-white/5'}"
            >
              {#if isActive}
                <div class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-sky-500 rounded-r-md shadow-[0_0_10px_rgba(14,165,233,0.8)]"></div>
              {/if}
              
              <svg class="w-5 h-5 mr-3 {isActive ? 'text-sky-400' : 'text-[#64748B] group-hover:text-slate-300'} transition-colors" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {@html item.icon}
              </svg>
              {item.name}
            </a>
          {/each}
        </nav>
      </div>

      <!-- User Profile Bottom -->
      <div class="p-6 border-t border-[#1E293B] bg-gradient-to-b from-transparent to-[#04060A]">
        <div class="flex items-center mb-4">
          <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center font-bold shadow-[0_0_15px_rgba(14,165,233,0.4)] border border-white/10 shrink-0">
            {getInitials(adminInfo?.email)}
          </div>
          <div class="ml-3 overflow-hidden">
            <p class="text-sm font-semibold text-white truncate">{adminInfo?.email || 'Admin'}</p>
            <p class="text-[11px] font-medium text-sky-400 tracking-wider uppercase truncate">{adminInfo?.role || 'Super Admin'}</p>
          </div>
        </div>
        <button on:click={handleLogout} class="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-[#94A3B8] hover:text-rose-400 bg-white/5 hover:bg-rose-500/10 border border-white/5 hover:border-rose-500/20 rounded-xl transition-all">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          Sair da Conta
        </button>
      </div>
    </aside>

    <!-- Main View Area -->
    <div class="flex-1 flex flex-col min-w-0 overflow-hidden relative">
      <!-- Background Graphic Accents -->
      <div class="absolute top-0 right-0 w-[500px] h-[500px] bg-sky-500/5 rounded-full blur-[120px] pointer-events-none -z-10 translate-x-1/3 -translate-y-1/3"></div>
      <div class="absolute bottom-0 left-1/4 w-[600px] h-[400px] bg-indigo-500/5 rounded-full blur-[150px] pointer-events-none -z-10"></div>

      <!-- Topbar (Mobile Hamburger) -->
      <header class="lg:hidden h-20 flex flex-shrink-0 items-center justify-between px-6 border-b border-[#1E293B] bg-[#090D14]/80 backdrop-blur-md z-30">
        <div class="flex items-center gap-3">
          <button on:click={() => mobileMenuOpen = true} class="p-2 -ml-2 text-[#94A3B8] hover:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <img src="https://zelopdv.com.br/logo-horizontal.png" alt="Zelo PDV" class="h-6 w-auto grayscale brightness-200 invert-[0.1]" />
        </div>
        <!-- Right side mobile header items if needed -->
      </header>

      <!-- Page Content -->
      <main class="flex-1 overflow-y-auto px-4 py-8 sm:px-8 lg:px-12 scrollbar-smooth z-10">
        <slot />
      </main>
    </div>
    
    <!-- Toast Notifications -->
    <Toast />
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background-color: #0B0F19;
    color: #e2e8f0;
  }
  
  :global(::-webkit-scrollbar) {
    width: 8px;
    height: 8px;
  }
  :global(::-webkit-scrollbar-track) {
    background: transparent;
  }
  :global(::-webkit-scrollbar-thumb) {
    background: #1e293b;
    border-radius: 4px;
  }
  :global(::-webkit-scrollbar-thumb:hover) {
    background: #334155;
  }
</style>

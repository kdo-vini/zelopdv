<script>
  import { onMount } from 'svelte'
  import { supabase, isSuperAdmin, getAdminInfo, updateLastLogin } from '$lib/supabaseAdmin'
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import Toast from '$lib/Toast.svelte'
  
  let session = null
  let adminInfo = null
  let loading = true
  let error = ''
  
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
      
      console.log('[Admin] Session found:', session.user.email)
      
      // Check if user is super admin
      const isAdmin = await isSuperAdmin(session.user.id)
      console.log('[Admin] Is super admin?', isAdmin)
      
      if (!isAdmin) {
        error = 'Usuário não é super admin. Verifique se inseriu na tabela super_admins.'
        console.error('[Admin] User is not super admin')
        loading = false
        return
      }
      
      // Get admin info
      adminInfo = await getAdminInfo(session.user.id)
      console.log('[Admin] Admin info:', adminInfo)
      
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
      error = err.message || 'Erro ao carregar'
      loading = false
    }
  })
  
  async function handleLogout() {
    await supabase.auth.signOut()
    goto('/login')
  }
</script>

{#if isLoginPage}
  <!-- Login page - no layout -->
  <slot />
{:else if loading}
  <div class="flex items-center justify-center min-h-screen bg-slate-900">
    <div class="text-center">
      <div class="text-white mb-4">Carregando...</div>
      {#if error}
        <div class="bg-red-900/30 border border-red-700 rounded-lg p-4 max-w-md">
          <div class="text-red-400 text-sm">{error}</div>
          <div class="mt-4">
            <a href="/login" class="text-sky-400 hover:underline">Voltar para login</a>
          </div>
        </div>
      {/if}
    </div>
  </div>
{:else}
  <div class="min-h-screen bg-slate-900 text-white">
    <!-- Header -->
    <header class="bg-slate-800 border-b border-slate-700">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <div class="flex items-center">
            <h1 class="text-xl font-bold text-sky-400">Zelo PDV Admin</h1>
          </div>
          
          <div class="flex items-center gap-4">
            <span class="text-sm text-slate-400">{adminInfo?.email}</span>
            <span class="px-2 py-1 text-xs bg-sky-900 text-sky-200 rounded">
              {adminInfo?.role}
            </span>
            <button
              on:click={handleLogout}
              class="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded transition"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    </header>
    
    <!-- Navigation -->
    <nav class="bg-slate-800 border-b border-slate-700">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex gap-1 py-2">
          <a
            href="/"
            class="px-4 py-2 rounded-lg text-sm transition hover:bg-slate-700"
            class:bg-slate-700={$page.url.pathname === '/'}
          >
            📊 Dashboard
          </a>
          <a
            href="/subscriptions"
            class="px-4 py-2 rounded-lg text-sm transition hover:bg-slate-700"
            class:bg-slate-700={$page.url.pathname.startsWith('/subscriptions')}
          >
            📋 Assinaturas
          </a>
          <a
            href="/users"
            class="px-4 py-2 rounded-lg text-sm transition hover:bg-slate-700"
            class:bg-slate-700={$page.url.pathname.startsWith('/users')}
          >
            👥 Usuários
          </a>
          <a
            href="/logs"
            class="px-4 py-2 rounded-lg text-sm transition hover:bg-slate-700"
            class:bg-slate-700={$page.url.pathname.startsWith('/logs')}
          >
            📝 Logs
          </a>
        </div>
      </div>
    </nav>
    
    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <slot />
    </main>
    
    <!-- Toast Notifications -->
    <Toast />
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  }
</style>

<script>
  import { supabase } from '$lib/supabaseAdmin'
  import { goto } from '$app/navigation'
  
  let email = ''
  let password = ''
  let error = ''
  let loading = false
  
  async function handleLogin() {
    error = ''
    loading = true
    
    try {
      // Sign in with Supabase
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      
      if (authError) {
        error = 'Email ou senha incorretos'
        loading = false
        return
      }
      
      // Check if user is super admin
      const { data: admin } = await supabase
        .from('super_admins')
        .select('id, is_active')
        .eq('user_id', data.user.id)
        .eq('is_active', true)
        .maybeSingle()
      
      if (!admin) {
        await supabase.auth.signOut()
        error = 'Acesso negado. Você não é um administrador.'
        loading = false
        return
      }
      
      // Success - redirect to dashboard
      goto('/')
    } catch (err) {
      error = 'Erro ao fazer login. Tente novamente.'
      loading = false
    }
  }

</script>

<svelte:head>
  <title>Login - Zelo Admin</title>
</svelte:head>

<div class="min-h-screen bg-slate-900 flex items-center justify-center px-4">
  <div class="max-w-md w-full">
    <!-- Logo/Header -->
    <div class="text-center mb-8">
      <h1 class="text-3xl font-bold text-sky-400 mb-2">Zelo PDV Admin</h1>
      <p class="text-slate-400">Painel Administrativo</p>
    </div>
    
    <!-- Login Card -->
    <div class="bg-slate-800 border border-slate-700 rounded-lg p-8">
      <h2 class="text-xl font-semibold text-white mb-6">Login</h2>
      
      {#if error}
        <div class="bg-red-900/20 border border-red-700 rounded-lg p-3 mb-6">
          <div class="text-sm text-red-400">{error}</div>
        </div>
      {/if}
      
      <form on:submit|preventDefault={handleLogin} class="space-y-4">
        <div>
          <label for="email" class="block text-sm font-medium text-slate-300 mb-2">
            Email
          </label>
          <input
            id="email"
            type="email"
            bind:value={email}
            required
            disabled={loading}
            class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50"
            placeholder="admin@zelopdv.com.br"
          />
        </div>
        
        <div>
          <label for="password" class="block text-sm font-medium text-slate-300 mb-2">
            Senha
          </label>
          <input
            id="password"
            type="password"
            bind:value={password}
            required
            disabled={loading}
            class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50"
            placeholder="••••••••"
          />
        </div>
        
        <button
          type="submit"
          disabled={loading}
          class="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
      
      <div class="mt-6 pt-6 border-t border-slate-700">
        <p class="text-xs text-slate-400 text-center">
          🔒 Acesso restrito a administradores autorizados
        </p>
      </div>
    </div>
  </div>
</div>

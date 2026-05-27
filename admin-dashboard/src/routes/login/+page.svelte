<script>
  import { supabase } from '$lib/supabaseClient'
  import { goto } from '$app/navigation'
  import { fade } from 'svelte/transition'
  
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
        error = 'Credenciais inválidas. Verifique seu email e senha.'
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
        error = 'Você não tem privilégios de administrador homologados.'
        loading = false
        return
      }
      
      // Success - redirect to dashboard
      goto('/')
    } catch (err) {
      error = 'Ocorreu um erro no servidor. Tente novamente mais tarde.'
      loading = false
    }
  }

</script>

<svelte:head>
  <title>Login - Zelo Admin</title>
</svelte:head>

<div class="relative min-h-screen bg-[#0B0F19] flex items-center justify-center p-4 overflow-hidden selection:bg-sky-500/30 selection:text-white">
  
  <!-- Background Accents -->
  <div class="absolute top-[10%] right-[10%] w-[300px] md:w-[600px] h-[300px] md:h-[600px] bg-sky-500/10 rounded-full blur-[100px] pointer-events-none -z-10 mix-blend-screen"></div>
  <div class="absolute bottom-[20%] left-[10%] w-[250px] md:w-[500px] h-[250px] md:h-[500px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none -z-10 mix-blend-screen"></div>

  <div class="w-full max-w-md" in:fade={{duration: 800, delay: 100}}>
    <!-- Logo/Header -->
    <div class="text-center mb-10 flex flex-col items-center">
      <img src="https://zelopdv.com.br/logo-horizontal.png" alt="Zelo PDV" class="h-10 md:h-12 w-auto grayscale brightness-200 invert-[0.1] mb-6" />
      <div class="inline-flex items-center justify-center px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20">
        <span class="w-1.5 h-1.5 rounded-full bg-sky-400 mr-2 animate-pulse"></span>
        <span class="text-[10px] uppercase tracking-widest font-bold text-sky-400">Environment Securizado</span>
      </div>
    </div>
    
    <!-- Login Card -->
    <div class="relative bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl p-8 overflow-hidden">
      <!-- Glow Line -->
      <div class="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-sky-500/50 to-transparent"></div>
      
      <h2 class="text-xl font-bold text-white mb-2 tracking-wide">Painel Administrativo</h2>
      <p class="text-sm text-slate-400 mb-8">Insira suas credenciais de segurança.</p>
      
      {#if error}
        <div class="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3" in:fade>
          <svg class="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          <div class="text-sm font-medium text-red-400 leading-tight">{error}</div>
        </div>
      {/if}
      
      <form on:submit|preventDefault={handleLogin} class="space-y-6">
        <div class="space-y-2">
          <label for="email" class="block text-[13px] font-semibold text-slate-400 uppercase tracking-wide">
            E-mail de Operador
          </label>
          <div class="relative">
            <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            <input
              id="email"
              type="email"
              bind:value={email}
              required
              disabled={loading}
              class="w-full pl-11 pr-4 py-3 bg-slate-900/50 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 transition-all shadow-inner disabled:opacity-50"
              placeholder="admin@zelopdv.com.br"
            />
          </div>
        </div>
        
        <div class="space-y-2">
          <label for="password" class="block text-[13px] font-semibold text-slate-400 uppercase tracking-wide">
            Chave de Acesso
          </label>
          <div class="relative">
            <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
            <input
              id="password"
              type="password"
              bind:value={password}
              required
              disabled={loading}
              class="w-full pl-11 pr-4 py-3 bg-slate-900/50 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 transition-all shadow-inner disabled:opacity-50"
              placeholder="••••••••"
            />
          </div>
        </div>
        
        <button
          type="submit"
          disabled={loading}
          class="w-full py-3.5 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold uppercase tracking-wider rounded-xl transition-all shadow-[0_0_15px_rgba(14,165,233,0.3)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
        >
          {#if loading}
            <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            Autenticando...
          {:else}
            Entrar no Painel
          {/if}
        </button>
      </form>
      
      <div class="mt-8 pt-6 border-t border-slate-800">
        <p class="text-[11px] font-medium text-slate-500 text-center uppercase tracking-widest">
          Acesso restrito &bull; Auditado
        </p>
      </div>
    </div>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background-color: #0B0F19;
  }
</style>

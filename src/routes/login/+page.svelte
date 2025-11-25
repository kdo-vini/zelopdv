<script>
  import { supabase } from '$lib/supabaseClient';
  export let params;
  import { onMount } from 'svelte';
  let email = '';
  let password = '';
  let errorMessage = '';
  let infoMessage = '';
  let loading = false;
  let showPassword = false;

  // Se já houver sessão ativa, redireciona para o PDV (/app)
  onMount(async () => {
    if (!supabase) return; // evita erro quando env não está configurado
    console.groupCollapsed('[AuthDebug] /login onMount');
    try {
      // Mensagem após confirmação de e-mail
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('confirmed') === '1') {
          infoMessage = 'E-mail confirmado com sucesso. Agora faça login.';
        }
      } catch {}
      const { data, error } = await supabase.auth.getSession();
      if (error) console.warn('[AuthDebug] getSession error (login):', error?.message || error);
      console.log('[AuthDebug] getSession (login)', { hasSession: Boolean(data?.session), userId: data?.session?.user?.id || null });
      if (data.session) {
        console.log('[AuthDebug] already logged in -> redirect /app');
        window.location.href = '/app';
      }
    } finally {
      console.groupEnd();
    }
  });

  /** Processa login com e-mail/senha usando Supabase Auth. */
  async function handleLogin(e) {
    e.preventDefault();
    if (loading) return;
    loading = true;
    errorMessage = '';
    try {
      if (!supabase) { throw new Error('Configuração do Supabase ausente.'); }
      console.groupCollapsed('[AuthDebug] handleLogin');
      console.time('[AuthDebug] supabase.signInWithPassword');
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      console.timeEnd('[AuthDebug] supabase.signInWithPassword');
      if (error) {
        console.warn('[AuthDebug] login error:', error?.message || error);
        throw error;
      }
      if (data?.session) {
        console.log('[AuthDebug] login OK -> aguardando sessão estável antes de redirect /app', { userId: data.session.user?.id || null });
        const waitStableSession = async (tries = 15) => {
          for (let i = 0; i < tries; i++) {
            try {
              const { data: s } = await supabase.auth.getSession();
              if (s?.session?.user?.id) return true;
            } catch {}
            await new Promise(r => setTimeout(r, 150));
          }
          return false;
        };
        await waitStableSession();
        window.location.assign('/app');
      }
    } catch (err) {
      console.error('[AuthDebug] login exception:', err?.message || err);
      errorMessage = err?.message || 'Falha ao entrar.';
    } finally {
      try {
        const { data } = await supabase.auth.getSession();
        console.log('[AuthDebug] post-login getSession', { hasSession: Boolean(data?.session), userId: data?.session?.user?.id || null });
      } catch {}
      console.groupEnd?.();
      loading = false;
    }
  }
</script>

<div class="max-w-md mx-auto bg-white dark:bg-slate-800 rounded-lg shadow p-6">
  <h1 class="text-xl font-semibold mb-4">Entrar</h1>
  {#if infoMessage}
    <div class="mb-4 text-sm text-green-700">{infoMessage}</div>
  {/if}
  {#if errorMessage}
    <div class="mb-4 text-sm text-red-600">{errorMessage}</div>
  {/if}
  <form on:submit={handleLogin} class="space-y-4">
    <div>
      <label for="login-email" class="block text-sm mb-1">E-mail</label>
      <input id="login-email" type="email" bind:value={email} class="input-form" required />
    </div>
    <div>
      <label for="login-password" class="block text-sm mb-1">Senha</label>
      <div class="relative">
        {#if showPassword}
          <input id="login-password" type="text" bind:value={password} class="input-form pr-10" required />
        {:else}
          <input id="login-password" type="password" bind:value={password} class="input-form pr-10" required />
        {/if}
        <button type="button"
          aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
          title="Pressione e segure para ver a senha"
          on:mousedown={() => showPassword = true}
          on:mouseup={() => showPassword = false}
          on:mouseleave={() => showPassword = false}
          on:touchstart={() => showPassword = true}
          on:touchend={() => showPassword = false}
          class="absolute inset-y-0 right-0 px-2 flex items-center text-slate-500 hover:text-slate-700 focus:outline-none">
          {#if showPassword}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12s3-7.5 9.75-7.5S21 12 21 12s-3 7.5-9.75 7.5S2.25 12 2.25 12Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223C5.743 5.97 8.294 4.5 12 4.5c6.75 0 9.75 7.5 9.75 7.5a15.68 15.68 0 01-2.438 3.356" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M14.25 14.25a3 3 0 01-4.243-4.243" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18" />
            </svg>
          {/if}
        </button>
      </div>
    </div>
  <button type="submit" disabled={loading} class="btn-primary w-full">{loading ? 'Entrando...' : 'Entrar'}</button>
  </form>
  <div class="text-sm mt-4">
    <a href="/esqueci-senha" class="text-sky-600 hover:underline">Esqueci minha senha</a>
    <span class="mx-2">·</span>
    <a href="/cadastro" class="text-sky-600 hover:underline">Criar conta</a>
  </div>
</div>

<style lang="postcss">
  /* Usa classes globais em src/app.css (.input-form, .btn-primary) */
</style>

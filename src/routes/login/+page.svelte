<script>
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';
  let email = '';
  let password = '';
  let errorMessage = '';
  let loading = false;

  // Se já houver sessão ativa, redireciona para o PDV (/app)
  onMount(async () => {
    if (!supabase) return; // evita erro quando env não está configurado
    console.groupCollapsed('[AuthDebug] /login onMount');
    try {
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
        console.log('[AuthDebug] login OK -> has session, redirect /app', { userId: data.session.user?.id || null });
        // Após logar, vá para a frente de caixa
        window.location.href = '/app';
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
      <input id="login-password" type="password" bind:value={password} class="input-form" required />
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

<script>
  import { supabase } from '$lib/supabaseClient';
  export let params;
  import { onMount } from 'svelte';
  import { addToast } from '$lib/stores/ui';
  import { getFriendlyErrorMessage } from '$lib/errorUtils';
  import AuthLayout from '$lib/components/AuthLayout.svelte';

  let email = '';
  let password = '';
  let errorMessage = '';
  let infoMessage = '';
  let loading = false;
  let showPassword = false;

  // Se já houver sessão ativa, redireciona para o PDV (/app)
  onMount(async () => {
    if (!supabase) return; // evita erro quando env não está configurado
      const { data, error } = await supabase.auth.getSession();
      if (error) console.warn('Erro ao verificar sessão:', error.message);
      if (data.session) {
        window.location.href = '/app';
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
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw error;
      }
      if (data?.session) {
        addToast('Login realizado com sucesso!', 'success');
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
      console.error('Login exception:', err);
      errorMessage = getFriendlyErrorMessage(err);
    } finally {
      loading = false;
    }
  }
</script>

<AuthLayout title="Entrar" subtitle="Acesse sua conta para gerenciar seu negócio">
  {#if infoMessage}
    <div class="auth-success">{infoMessage}</div>
  {/if}
  {#if errorMessage}
    <div class="auth-error">{errorMessage}</div>
  {/if}

  <form on:submit={handleLogin} class="auth-form">
    <div>
      <label for="login-email" class="auth-label">E-mail</label>
      <input id="login-email" type="email" bind:value={email} class="auth-input" placeholder="seu@email.com" required />
    </div>

    <div>
      <label for="login-password" class="auth-label">Senha</label>
      <div class="input-wrapper">
        {#if showPassword}
          <input id="login-password" type="text" bind:value={password} class="auth-input pr-toggle" required />
        {:else}
          <input id="login-password" type="password" bind:value={password} class="auth-input pr-toggle" required />
        {/if}
        <button type="button"
          aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
          title="Pressione e segure para ver a senha"
          on:mousedown={() => showPassword = true}
          on:mouseup={() => showPassword = false}
          on:mouseleave={() => showPassword = false}
          on:touchstart={() => showPassword = true}
          on:touchend={() => showPassword = false}
          class="toggle-btn">
          {#if showPassword}
            <svg xmlns="http://www.w3.org/2000/svg" class="toggle-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12s3-7.5 9.75-7.5S21 12 21 12s-3 7.5-9.75 7.5S2.25 12 2.25 12Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="toggle-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223C5.743 5.97 8.294 4.5 12 4.5c6.75 0 9.75 7.5 9.75 7.5a15.68 15.68 0 01-2.438 3.356" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M14.25 14.25a3 3 0 01-4.243-4.243" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18" />
            </svg>
          {/if}
        </button>
      </div>
    </div>

    <button type="submit" disabled={loading} class="auth-btn">
      {#if loading}<span class="spinner"></span>{/if}
      {loading ? 'Entrando...' : 'Entrar'}
    </button>
  </form>

  <svelte:fragment slot="footer">
    <a href="/esqueci-senha" class="auth-link">Esqueci minha senha</a>
    <span class="sep">·</span>
    <a href="/cadastro" class="auth-link">Criar conta</a>
  </svelte:fragment>
</AuthLayout>

<style>
  .auth-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .input-wrapper {
    position: relative;
  }
  .pr-toggle {
    padding-right: 2.75rem;
  }
  .toggle-btn {
    position: absolute;
    inset: 0 0 0 auto;
    width: 2.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #64748b;
    background: none;
    border: none;
    cursor: pointer;
    transition: color 0.15s;
  }
  .toggle-btn:hover {
    color: #94a3b8;
  }
  .toggle-icon {
    width: 1.25rem;
    height: 1.25rem;
  }
  .sep {
    margin: 0 0.5rem;
    color: #475569;
  }
</style>

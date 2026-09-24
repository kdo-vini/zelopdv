<script>
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';
  import { addToast } from '$lib/stores/ui';
  import { getFriendlyErrorMessage } from '$lib/errorUtils';
  import AuthLayout from '$lib/components/AuthLayout.svelte';
  import GoogleAuthButton from '$lib/components/GoogleAuthButton.svelte';
  import { claimStoredReferral, persistReferralAttributionFromUrl } from '$lib/referrals/client';
  import { capturePostHogEvent, identifyPostHogUser, maskPrivatePath } from '$lib/posthogClient';
  import { deriveLoginRedirectFrom, mapLoginErrorToCode } from '$lib/loginTelemetry';
  import { getSignupHref, trackSignupCta } from '$lib/marketing/signupCta';

  let email = '';
  let password = '';
  let errorMessage = '';
  let infoMessage = '';
  let loading = false;
  let showPassword = false;
  let cadastroHref = '/cadastro';

  async function logSubUserLogin(session, source = 'login') {
    try {
      const token = session?.access_token;
      if (!token) return;
      await fetch('/api/access/audit-login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ source, provider: 'password' }),
      });
    } catch {}
  }

  // Se já houver sessão ativa, redireciona para o PDV (/app)
  onMount(async () => {
    cadastroHref = getSignupHref();
    persistReferralAttributionFromUrl();
    const redirectFrom = deriveLoginRedirectFrom(new URLSearchParams(window.location.search));
    if (!supabase) {
      void capturePostHogEvent('login_viewed', { redirect_from: redirectFrom, has_session: false });
      return; // evita erro quando env não está configurado
    }
      const { data, error } = await supabase.auth.getSession();
      if (error) console.warn('Erro ao verificar sessão:', error.message);
      const hasSession = Boolean(data.session);
      if (hasSession) {
        // capturePostHogEvent faz import/init assíncrono do SDK antes de
        // capturar; sem aguardar, o `window.location.href` abaixo mata a
        // página antes do capture sair, e é justo aqui — sessão já existente
        // — que o sinal de ping-pong pode se perder. Teto curto pra não
        // segurar o redirect indefinidamente se o SDK demorar.
        const capViewed = capturePostHogEvent('login_viewed', { redirect_from: redirectFrom, has_session: true });
        const capBounced = capturePostHogEvent('login_bounced_authenticated', { destination: maskPrivatePath('/app') });
        await Promise.race([
          Promise.all([capViewed, capBounced]),
          new Promise((resolve) => setTimeout(resolve, 400)),
        ]);
        window.location.href = '/app';
      } else {
        void capturePostHogEvent('login_viewed', { redirect_from: redirectFrom, has_session: false });
      }
  });

  /** Processa login com e-mail/senha usando Supabase Auth. */
  async function handleLogin(e) {
    e.preventDefault();
    if (loading) return;
    loading = true;
    errorMessage = '';
    void capturePostHogEvent('login_submitted', { method: 'email' });
    try {
      if (!supabase) { throw new Error('Configuração do Supabase ausente.'); }
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const apiError = new Error(payload?.error || 'Falha ao fazer login.');
        apiError.status = response.status;
        apiError.code = payload?.code;
        throw apiError;
      }
      if (payload?.session?.access_token && payload?.session?.refresh_token) {
        const { data, error } = await supabase.auth.setSession({
          access_token: payload.session.access_token,
          refresh_token: payload.session.refresh_token,
        });
        if (error) {
          throw error;
        }
        if (data?.session) {
          void identifyPostHogUser(data.session.user.id, { email });
          void capturePostHogEvent('user_logged_in', { method: 'email' });
          await logSubUserLogin(data.session, 'login-password');
          await claimStoredReferral(data.session, 'login-password');
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
      }
    } catch (err) {
      console.error('Login exception:', err);
      errorMessage = getFriendlyErrorMessage(err);
      void capturePostHogEvent('login_failed', {
        method: 'email',
        error_code: mapLoginErrorToCode({ status: err?.status, code: err?.code, message: err?.message }),
      });
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

  <GoogleAuthButton placement="top" />

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
          title="Clique para alternar a visualização da senha"
          on:click={() => showPassword = !showPassword}
          on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showPassword = !showPassword; }}}
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

  <GoogleAuthButton placement="bottom" />

  <svelte:fragment slot="footer">
    <a href="/esqueci-senha" class="auth-link">Esqueci minha senha</a>
    <span class="sep">·</span>
    <a href={cadastroHref} class="auth-link" on:click={() => trackSignupCta('login_criar_conta')}>Criar conta</a>
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
    color: var(--text-muted);
    background: none;
    border: none;
    cursor: pointer;
    transition: color 0.15s;
  }
  .toggle-btn:hover {
    color: var(--text-label);
  }
  .toggle-icon {
    width: 1.25rem;
    height: 1.25rem;
  }
  .sep {
    margin: 0 0.5rem;
    color: var(--text-muted);
  }
</style>

<script>
  import { supabase } from '$lib/supabaseClient';
  import { getAuthRedirectUrl } from '$lib/authRedirect';
  import { addToast } from '$lib/stores/ui';
  import { capturePostHogEvent } from '$lib/posthogClient';
  import { mapLoginErrorToCode } from '$lib/loginTelemetry';
  import { onMount } from 'svelte';
  import {
    IN_APP_LABELS,
    buildAndroidBrowserIntent,
    detectInAppBrowser,
    isAndroidUserAgent,
  } from '$lib/inAppBrowser';

  // `top`: botão do Google + divisor acima do formulário (navegador normal).
  // `bottom`: no navegador embutido, uma linha discreta abaixo do formulário.
  export let placement = 'top';

  let loading = false;
  // O Google recusa OAuth dentro do navegador do Instagram/Facebook. Nesses
  // casos trocamos o botão por um aviso: abrir no navegador ou seguir por e-mail.
  let inAppBrowser = null;
  let openBrowserHref = '';
  let linkCopied = false;

  onMount(() => {
    const ua = navigator.userAgent;
    inAppBrowser = detectInAppBrowser(ua);
    if (!inAppBrowser || placement !== 'bottom') return;
    if (isAndroidUserAgent(ua)) openBrowserHref = buildAndroidBrowserIntent(window.location.href);
    void capturePostHogEvent('inapp_browser_detected', {
      app: inAppBrowser,
      surface: window.location.pathname,
    });
  });

  function trackOpenBrowser() {
    void capturePostHogEvent('inapp_open_browser_clicked', {
      app: inAppBrowser,
      surface: window.location.pathname,
    });
  }

  async function copyLink() {
    trackOpenBrowser();
    try {
      await navigator.clipboard.writeText(window.location.href);
      linkCopied = true;
    } catch {
      addToast('Não foi possível copiar. Use o menu ••• e escolha abrir no navegador.', 'error');
    }
  }

  async function handleGoogleAuth() {
    if (loading || !supabase) return;
    loading = true;
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    const isLoginSurface = path === '/login';
    const isSignupSurface = path === '/cadastro';
    // Este componente também vive em /cadastro; `login_submitted` só faz
    // sentido semântico na tela de login — não polui o funil de signup.
    if (isLoginSurface) {
      void capturePostHogEvent('login_submitted', { method: 'google' });
    }
    if (isSignupSurface) {
      void capturePostHogEvent('signup_submitted', { method: 'google' });
    }
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: getAuthRedirectUrl('/auth/callback') },
      });
      if (error) throw error;
      // browser redirects — keep loading=true
    } catch (err) {
      console.error('Google OAuth error:', err);
      if (isLoginSurface) {
        void capturePostHogEvent('login_failed', {
          method: 'google',
          error_code: mapLoginErrorToCode(err),
        });
      }
      addToast('Erro ao conectar com o Google. Tente novamente.', 'error');
      loading = false;
    }
  }
</script>

{#if inAppBrowser}
{#if placement === 'bottom'}
<p class="inapp-note">
  {#if openBrowserHref}
    Prefere Google? <a class="inapp-link" href={openBrowserHref} on:click={trackOpenBrowser}>Abra no navegador</a>
  {:else if linkCopied}
    Link copiado. Cole no Safari para entrar com Google.
  {:else}
    Prefere Google? <button type="button" class="inapp-link" on:click={copyLink}>Copie o link e abra no Safari</button>
  {/if}
</p>
{/if}
{:else if placement === 'top'}
<div>
<button
  type="button"
  class="google-btn"
  disabled={loading}
  aria-label="Continuar com Google"
  on:click={handleGoogleAuth}
>
  {#if loading}
    <span class="google-spinner" aria-hidden="true"></span>
    <span>Redirecionando...</span>
  {:else}
    <svg
      class="google-logo"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
    <span>Continuar com Google</span>
  {/if}
</button>
<div class="auth-divider">ou continue com e-mail</div>
</div>
{/if}

<style>
  .google-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    width: 100%;
    height: 46px;
    padding: 0 1rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-main);
    background-color: var(--bg-panel);
    border: 1px solid var(--border-subtle);
    cursor: pointer;
    transition: background-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
    -webkit-appearance: none;
    appearance: none;
    white-space: nowrap;
  }

  .google-btn:hover:not(:disabled) {
    background-color: var(--bg-panel);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 20%, transparent);
  }

  .google-btn:active:not(:disabled) {
    transform: scale(0.98);
    background-color: var(--bg-input);
  }

  .google-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .google-logo {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .google-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid color-mix(in srgb, var(--primary) 25%, transparent);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: google-spin 0.65s linear infinite;
    flex-shrink: 0;
  }

  .inapp-note {
    margin: 1.5rem 0 0;
    text-align: center;
    font-size: 0.75rem;
    line-height: 1.5;
    color: var(--text-muted);
  }

  .inapp-link {
    display: inline;
    padding: 0;
    font: inherit;
    font-weight: 500;
    color: var(--link);
    background: none;
    border: none;
    text-decoration: underline;
    cursor: pointer;
  }

  @keyframes google-spin {
    to { transform: rotate(360deg); }
  }
</style>

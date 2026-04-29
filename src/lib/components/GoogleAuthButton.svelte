<script>
  import { supabase } from '$lib/supabaseClient';
  import { addToast } from '$lib/stores/ui';

  let loading = false;

  async function handleGoogleAuth() {
    if (loading || !supabase) return;
    loading = true;
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      // browser redirects — keep loading=true
    } catch (err) {
      console.error('Google OAuth error:', err);
      addToast('Erro ao conectar com o Google. Tente novamente.', 'error');
      loading = false;
    }
  }
</script>

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
    font-size: 0.9375rem;
    font-weight: 500;
    color: #1f2937;
    background-color: #ffffff;
    border: 1px solid #d1d5db;
    cursor: pointer;
    transition: background-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
    -webkit-appearance: none;
    appearance: none;
    white-space: nowrap;
  }

  .google-btn:hover:not(:disabled) {
    background-color: #f9fafb;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.18);
  }

  .google-btn:active:not(:disabled) {
    transform: scale(0.98);
    background-color: #f3f4f6;
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
    border: 2px solid rgba(66, 133, 244, 0.25);
    border-top-color: #4285F4;
    border-radius: 50%;
    animation: google-spin 0.65s linear infinite;
    flex-shrink: 0;
  }

  @keyframes google-spin {
    to { transform: rotate(360deg); }
  }
</style>

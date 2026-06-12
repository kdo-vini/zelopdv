<script>
  import { supabase } from '$lib/supabaseClient';
  export let params;
  import { getFriendlyErrorMessage } from '$lib/errorUtils';
  import AuthLayout from '$lib/components/AuthLayout.svelte';
  import GoogleAuthButton from '$lib/components/GoogleAuthButton.svelte';
  import EmailSentHelper from '$lib/components/EmailSentHelper.svelte';
  import { trackLead } from '$lib/metaPixel';
  import { trackGa4Event, trackGoogleAdsInscricao, waitForGtag } from '$lib/googleAds';
  import { getStoredReferralAttribution, persistReferralAttributionFromUrl } from '$lib/referrals/client';
  import { onMount } from 'svelte';

  let email = '';
  let password = '';
  let loading = false;
  let errorMessage = '';
  let successMessage = '';
  let showPassword = false;

  onMount(() => {
    persistReferralAttributionFromUrl();
  });

  /** Cria conta com e-mail/senha; supõe confirmação por e-mail ativa. */
  async function handleSignUp(e) {
    e.preventDefault();
    errorMessage = '';
    successMessage = '';
    if (!supabase) { errorMessage = 'Configuração do Supabase ausente.'; return; }
    if (!email || !password) { errorMessage = 'Informe e-mail e senha'; return; }
    if (password.length < 8) { errorMessage = 'A senha deve ter pelo menos 8 caracteres.'; return; }
    loading = true;
    const referral = getStoredReferralAttribution();
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        referralCode: referral.code || '',
      }),
    });
    const payload = await response.json().catch(() => ({}));
    loading = false;
    if (!response.ok) {
       if (payload?.existingUser) {
         errorMessage = `Este e-mail já está cadastrado. <a href="/login" class="auth-link font-bold">Clique aqui</a> para fazer login.`;
         return;
       }
       errorMessage = getFriendlyErrorMessage(payload?.error || 'Falha ao criar conta.');
       return;
    }

    // Em projetos com confirmação por e-mail, o usuário precisa confirmar antes de logar
    successMessage = 'Conta criada! Verifique seu e-mail para confirmar e então faça login.';
    trackLead();
    // Sinal antecipado pro Google Ads: a conversão no fim do wizard se perde quando o
    // usuário troca de sessão/dispositivo entre confirmação de e-mail e onboarding.
    // O transaction_id (user id) deduplica com o disparo posterior no wizard.
    await waitForGtag();
    trackGa4Event('sign_up', { method: 'email' });
    trackGoogleAdsInscricao({ email, transactionId: payload?.user?.id || '' });
  }
</script>

<AuthLayout title="Criar conta" subtitle="Teste grátis por 30 dias. Sem cartão, sem cobrança automática.">
  {#if successMessage}
    <div class="auth-success">{successMessage}</div>
    <EmailSentHelper {email} />
  {/if}
  {#if errorMessage}
    <div class="auth-error">{@html errorMessage}</div>
  {/if}

  <GoogleAuthButton />
  <div class="auth-divider">ou continue com e-mail</div>

  <form on:submit={handleSignUp} class="auth-form">
    <div>
      <label for="cad-email" class="auth-label">E-mail</label>
      <input id="cad-email" type="email" autocomplete="email" bind:value={email} class="auth-input" placeholder="seu@email.com" required />
    </div>

    <div>
      <label for="cad-password" class="auth-label">Senha</label>
      <div class="input-wrapper">
        {#if showPassword}
          <input id="cad-password" type="text" autocomplete="new-password" bind:value={password} class="auth-input pr-toggle" minlength="8" placeholder="Mínimo 8 caracteres" required />
        {:else}
          <input id="cad-password" type="password" autocomplete="new-password" bind:value={password} class="auth-input pr-toggle" minlength="8" placeholder="Mínimo 8 caracteres" required />
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

    <button disabled={loading} class="auth-btn">
      {#if loading}<span class="spinner"></span>{/if}
      {loading ? 'Criando...' : 'Criar conta'}
    </button>

    <p class="auth-reassurance">Leva menos de 1 minuto · cancele quando quiser</p>
  </form>

  <svelte:fragment slot="footer">
    <a href="/login" class="auth-link">Já tenho conta</a>
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
  .auth-reassurance {
    margin: 0;
    text-align: center;
    font-size: 0.75rem;
    color: var(--text-muted);
  }
</style>

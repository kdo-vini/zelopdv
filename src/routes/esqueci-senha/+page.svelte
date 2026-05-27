<script>
  export let params;
  import AuthLayout from '$lib/components/AuthLayout.svelte';
  import EmailSentHelper from '$lib/components/EmailSentHelper.svelte';
  import { getFriendlyErrorMessage } from '$lib/errorUtils';

  let email = '';
  let message = '';
  let errorMessage = '';
  let loading = false;

  async function handleReset(e) {
    e.preventDefault();
    loading = true;
    message = '';
    errorMessage = '';
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const payload = await response.json().catch(() => ({}));
    loading = false;
    if (!response.ok) errorMessage = getFriendlyErrorMessage(payload?.error || 'Falha ao enviar redefinição.');
    else message = payload?.message || 'Se existir uma conta com este e-mail, enviaremos instruções para redefinir a senha.';
  }
</script>

<AuthLayout title="Esqueci minha senha" subtitle="Informe seu e-mail e enviaremos um link para redefinir sua senha">
  {#if message}
    <div class="auth-success">{message}</div>
    <EmailSentHelper {email} />
  {/if}
  {#if errorMessage}
    <div class="auth-error">{errorMessage}</div>
  {/if}

  <form on:submit={handleReset} class="auth-form">
    <div>
      <label for="reset-email" class="auth-label">E-mail</label>
      <input id="reset-email" type="email" bind:value={email} class="auth-input" placeholder="seu@email.com" required />
    </div>
    <button disabled={loading} class="auth-btn">
      {#if loading}<span class="spinner"></span>{/if}
      {loading ? 'Enviando...' : 'Enviar link de redefinição'}
    </button>
  </form>

  <svelte:fragment slot="footer">
    <a href="/login" class="auth-link">Voltar para o login</a>
  </svelte:fragment>
</AuthLayout>

<style>
  .auth-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
</style>

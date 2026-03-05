<script>
  import { supabase } from '$lib/supabaseClient';
  export let params;
  import AuthLayout from '$lib/components/AuthLayout.svelte';

  let email = '';
  let message = '';
  let errorMessage = '';
  let loading = false;

  async function handleReset(e) {
    e.preventDefault();
    loading = true;
    message = '';
    errorMessage = '';
    const redirectTo = `${window.location.origin}/redefinir-senha`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    loading = false;
    if (error) errorMessage = error.message;
    else message = 'Se existir uma conta com este e-mail, enviaremos instruções para redefinir a senha.';
  }
</script>

<AuthLayout title="Esqueci minha senha" subtitle="Informe seu e-mail e enviaremos um link para redefinir sua senha">
  {#if message}
    <div class="auth-success">{message}</div>
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

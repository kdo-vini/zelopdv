<script>
  import { supabase } from '$lib/supabaseClient';
  export let params;
  let email = '';
  let message = '';
  let errorMessage = '';
  let loading = false;

  async function handleReset(e) {
    e.preventDefault();
    loading = true;
    message = '';
    errorMessage = '';
    const redirectTo = `${window.location.origin}/login`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    loading = false;
    if (error) errorMessage = error.message;
    else message = 'Se existir uma conta com este e-mail, enviaremos instruções para redefinir a senha.';
  }
</script>

<div class="max-w-md mx-auto bg-white dark:bg-slate-800 rounded-lg shadow p-6">
  <h1 class="text-xl font-semibold mb-4">Esqueci minha senha</h1>
  {#if message}
    <div class="mb-4 text-sm text-green-700">{message}</div>
  {/if}
  {#if errorMessage}
    <div class="mb-4 text-sm text-red-600">{errorMessage}</div>
  {/if}
  <form on:submit={handleReset} class="space-y-4">
    <div>
      <label for="reset-email" class="block text-sm mb-1">E-mail</label>
      <input id="reset-email" type="email" bind:value={email} class="input-form" required />
    </div>
    <button disabled={loading} class="btn-primary w-full">{loading ? 'Enviando...' : 'Enviar link de redefinição'}</button>
  </form>
</div>

<style lang="postcss">
  /* Usa classes globais em src/app.css (.input-form, .btn-primary) */
</style>

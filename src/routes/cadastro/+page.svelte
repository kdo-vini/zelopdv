<script>
  import { supabase } from '$lib/supabaseClient';
  export let params;
  let email = '';
  let password = '';
  let confirm = '';
  let loading = false;
  let errorMessage = '';
  let successMessage = '';
  let showPassword = false;
  let showConfirm = false;

  import { getFriendlyErrorMessage } from '$lib/errorUtils';

  /** Cria conta com e-mail/senha; supõe confirmação por e-mail ativa. */
  async function handleSignUp(e) {
    e.preventDefault();
    errorMessage = '';
    successMessage = '';
    if (!supabase) { errorMessage = 'Configuração do Supabase ausente.'; return; }
    if (!email || !password) { errorMessage = 'Informe e-mail e senha'; return; }
    if (password.length < 8) { errorMessage = 'A senha deve ter pelo menos 8 caracteres.'; return; }
    if (password !== confirm) { errorMessage = 'As senhas não conferem'; return; }
    loading = true;
    // Redireciona confirmação para a página de login com aviso
    let redirectTo = '';
    try { redirectTo = `${window.location.origin}/login?confirmed=1`; } catch {}
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo || undefined }
    });
    loading = false;
    if (error) {
       errorMessage = getFriendlyErrorMessage(error);
       return;
    }

    // Se o user já existe, o Supabase pode retornar identities: [] (quando email enumeration protection=true)
    if (data?.user?.identities && data.user.identities.length === 0) {
       errorMessage = `Este e-mail já está cadastrado. <a href="/login" class="underline font-bold">Clique aqui</a> para fazer login.`;
       return;
    }

    // Em projetos com confirmação por e-mail, o usuário precisa confirmar antes de logar
    successMessage = 'Conta criada. Verifique seu e-mail para confirmar e então faça login.';
  }
</script>

<div class="max-w-md mx-auto bg-white dark:bg-slate-800 rounded-lg shadow p-6">
  <h1 class="text-xl font-semibold mb-4">Criar conta</h1>

  {#if successMessage}
    <div class="mb-4 text-sm text-green-700">{successMessage}</div>
  {/if}
  {#if errorMessage}
    <div class="mb-4 text-sm text-red-600">{@html errorMessage}</div>
  {/if}

  <form on:submit={handleSignUp} class="space-y-4">
    <div>
      <label for="cad-email" class="block text-sm mb-1">E-mail</label>
      <input id="cad-email" type="email" bind:value={email} class="input-form" required />
    </div>
    <div>
      <label for="cad-password" class="block text-sm mb-1">Senha</label>
      <div class="relative">
        {#if showPassword}
          <input id="cad-password" type="text" bind:value={password} class="input-form pr-10" minlength="8" required />
        {:else}
          <input id="cad-password" type="password" bind:value={password} class="input-form pr-10" minlength="8" required />
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
    <div>
      <label for="cad-confirm" class="block text-sm mb-1">Confirmar senha</label>
      <div class="relative">
        {#if showConfirm}
          <input id="cad-confirm" type="text" bind:value={confirm} class="input-form pr-10" required />
        {:else}
          <input id="cad-confirm" type="password" bind:value={confirm} class="input-form pr-10" required />
        {/if}
        <button type="button"
          aria-label={showConfirm ? 'Ocultar confirmação' : 'Mostrar confirmação'}
          title="Pressione e segure para ver a confirmação"
          on:mousedown={() => showConfirm = true}
          on:mouseup={() => showConfirm = false}
          on:mouseleave={() => showConfirm = false}
          on:touchstart={() => showConfirm = true}
          on:touchend={() => showConfirm = false}
          class="absolute inset-y-0 right-0 px-2 flex items-center text-slate-500 hover:text-slate-700 focus:outline-none">
          {#if showConfirm}
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
    <button disabled={loading} class="btn-primary w-full">{loading ? 'Criando...' : 'Criar conta'}</button>
  </form>

  <div class="text-sm mt-4">
    <a href="/login" class="text-sky-600 hover:underline">Já tenho conta</a>
  </div>
</div>

<style lang="postcss">
  /* Usa classes globais em src/app.css (.input-form, .btn-primary) */
</style>

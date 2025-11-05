<script>
  import { supabase } from '$lib/supabaseClient';
  let email = '';
  let password = '';
  let confirm = '';
  let loading = false;
  let errorMessage = '';
  let successMessage = '';

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
      // Tratamento amigável para e-mail já existente
      const msg = (error?.message || '').toLowerCase();
      if (error?.status === 400 && (msg.includes('registered') || msg.includes('already')))
        errorMessage = 'Este e-mail já está cadastrado.';
      else errorMessage = error.message;
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
    <div class="mb-4 text-sm text-red-600">{errorMessage}</div>
  {/if}

  <form on:submit={handleSignUp} class="space-y-4">
    <div>
      <label for="cad-email" class="block text-sm mb-1">E-mail</label>
      <input id="cad-email" type="email" bind:value={email} class="input-form" required />
    </div>
    <div>
      <label for="cad-password" class="block text-sm mb-1">Senha</label>
      <input id="cad-password" type="password" bind:value={password} class="input-form" minlength="8" required />
    </div>
    <div>
      <label for="cad-confirm" class="block text-sm mb-1">Confirmar senha</label>
      <input id="cad-confirm" type="password" bind:value={confirm} class="input-form" required />
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

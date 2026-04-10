<script>
  import { supabase } from '$lib/supabaseClient';
  export let params;
  import { getFriendlyErrorMessage } from '$lib/errorUtils';
  import AuthLayout from '$lib/components/AuthLayout.svelte';
  import GoogleAuthButton from '$lib/components/GoogleAuthButton.svelte';
  import EmailSentHelper from '$lib/components/EmailSentHelper.svelte';

  let email = '';
  let password = '';
  let confirm = '';
  let loading = false;
  let errorMessage = '';
  let successMessage = '';
  let showPassword = false;
  let showConfirm = false;

  // Password strength rules
  $: rules = {
    length:   password.length >= 8,
    upper:    /[A-Z]/.test(password),
    number:   /[0-9]/.test(password),
    special:  /[^A-Za-z0-9]/.test(password),
  };
  $: passwordValid = rules.length && rules.upper && rules.number && rules.special;
  $: showChecklist = password.length > 0;

  function validatePassword() {
    if (!rules.length)  return 'A senha deve ter pelo menos 8 caracteres.';
    if (!rules.upper)   return 'A senha deve conter pelo menos uma letra maiúscula.';
    if (!rules.number)  return 'A senha deve conter pelo menos um número.';
    if (!rules.special) return 'A senha deve conter pelo menos um caractere especial (ex: !@#$%).';
    return null;
  }

  /** Cria conta com e-mail/senha; supõe confirmação por e-mail ativa. */
  async function handleSignUp(e) {
    e.preventDefault();
    errorMessage = '';
    successMessage = '';
    if (!supabase) { errorMessage = 'Configuração do Supabase ausente.'; return; }
    if (!email || !password) { errorMessage = 'Informe e-mail e senha'; return; }
    const validationError = validatePassword();
    if (validationError) { errorMessage = validationError; return; }
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
       errorMessage = `Este e-mail já está cadastrado. <a href="/login" class="auth-link font-bold">Clique aqui</a> para fazer login.`;
       return;
    }

    // Em projetos com confirmação por e-mail, o usuário precisa confirmar antes de logar
    successMessage = 'Conta criada! Verifique seu e-mail para confirmar e então faça login.';
  }
</script>

<AuthLayout title="Criar conta" subtitle="Cadastre-se e comece a usar o Zelo PDV">
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
      <input id="cad-email" type="email" bind:value={email} class="auth-input" placeholder="seu@email.com" required />
    </div>

    <div>
      <label for="cad-password" class="auth-label">Senha</label>
      <div class="input-wrapper">
        {#if showPassword}
          <input id="cad-password" type="text" bind:value={password} class="auth-input pr-toggle" minlength="8" placeholder="Mínimo 8 caracteres" required />
        {:else}
          <input id="cad-password" type="password" bind:value={password} class="auth-input pr-toggle" minlength="8" placeholder="Mínimo 8 caracteres" required />
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
      {#if showChecklist}
        <ul class="pw-rules">
          <li class:ok={rules.length}>
            <span class="rule-icon">{rules.length ? '✓' : '·'}</span> Mínimo 8 caracteres
          </li>
          <li class:ok={rules.upper}>
            <span class="rule-icon">{rules.upper ? '✓' : '·'}</span> Uma letra maiúscula
          </li>
          <li class:ok={rules.number}>
            <span class="rule-icon">{rules.number ? '✓' : '·'}</span> Um número
          </li>
          <li class:ok={rules.special}>
            <span class="rule-icon">{rules.special ? '✓' : '·'}</span> Um caractere especial (ex: !@#$%)
          </li>
        </ul>
      {/if}
    </div>

    <div>
      <label for="cad-confirm" class="auth-label">Confirmar senha</label>
      <div class="input-wrapper">
        {#if showConfirm}
          <input id="cad-confirm" type="text" bind:value={confirm} class="auth-input pr-toggle" required />
        {:else}
          <input id="cad-confirm" type="password" bind:value={confirm} class="auth-input pr-toggle" required />
        {/if}
        <button type="button"
          aria-label={showConfirm ? 'Ocultar confirmação' : 'Mostrar confirmação'}
          title="Pressione e segure para ver a confirmação"
          on:mousedown={() => showConfirm = true}
          on:mouseup={() => showConfirm = false}
          on:mouseleave={() => showConfirm = false}
          on:touchstart={() => showConfirm = true}
          on:touchend={() => showConfirm = false}
          class="toggle-btn">
          {#if showConfirm}
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

    <button disabled={loading || !passwordValid} class="auth-btn">
      {#if loading}<span class="spinner"></span>{/if}
      {loading ? 'Criando...' : 'Criar conta'}
    </button>
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
  .pw-rules {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .pw-rules li {
    font-size: 0.78rem;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 0.4rem;
    transition: color 0.2s;
  }
  .pw-rules li.ok {
    color: #22c55e;
  }
  .rule-icon {
    font-weight: 700;
    font-size: 0.85rem;
    width: 1em;
    text-align: center;
  }
</style>

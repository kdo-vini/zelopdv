<script>
  import { supabase } from '$lib/supabaseClient';
  import { addToast } from '$lib/stores/ui';
  import { getFriendlyErrorMessage } from '$lib/errorUtils';
  import AuthLayout from '$lib/components/AuthLayout.svelte';

  let password = '';
  let confirm = '';
  let loading = false;
  let showPassword = false;
  let showConfirm = false;

  async function handleUpdatePassword(e) {
    e.preventDefault();
    if (password !== confirm) {
      addToast('As senhas não conferem', 'error');
      return;
    }
    if (password.length < 8) {
      addToast('A senha deve ter pelo menos 8 caracteres.', 'error');
      return;
    }

    loading = true;
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      addToast('Senha atualizada com sucesso!', 'success');
      // Redireciona para o app após sucesso
      window.location.href = '/app';
    } catch (err) {
      console.error('Update password error:', err);
      addToast(getFriendlyErrorMessage(err), 'error');
    } finally {
      loading = false;
    }
  }
</script>

<AuthLayout title="Criar nova senha" subtitle="Digite sua nova senha abaixo para recuperar o acesso à sua conta">
  <form on:submit={handleUpdatePassword} class="auth-form">
    <div>
      <label for="new-password" class="auth-label">Nova senha</label>
      <div class="input-wrapper">
        <input
          id="new-password"
          type={showPassword ? 'text' : 'password'}
          bind:value={password}
          class="auth-input pr-toggle"
          placeholder="Mínimo 8 caracteres"
          required
        />
        <button type="button"
          on:mousedown={() => showPassword = true}
          on:mouseup={() => showPassword = false}
          on:mouseleave={() => showPassword = false}
          on:touchstart={() => showPassword = true}
          on:touchend={() => showPassword = false}
          class="toggle-btn">
          {#if showPassword}
            <svg xmlns="http://www.w3.org/2000/svg" class="toggle-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="toggle-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
          {/if}
        </button>
      </div>
    </div>

    <div>
      <label for="confirm-password" class="auth-label">Confirmar nova senha</label>
      <div class="input-wrapper">
        <input
          id="confirm-password"
          type={showConfirm ? 'text' : 'password'}
          bind:value={confirm}
          class="auth-input pr-toggle"
          required
        />
        <button type="button"
          on:mousedown={() => showConfirm = true}
          on:mouseup={() => showConfirm = false}
          on:mouseleave={() => showConfirm = false}
          on:touchstart={() => showConfirm = true}
          on:touchend={() => showConfirm = false}
          class="toggle-btn">
          {#if showConfirm}
            <svg xmlns="http://www.w3.org/2000/svg" class="toggle-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="toggle-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
          {/if}
        </button>
      </div>
    </div>

    <button disabled={loading} class="auth-btn" style="margin-top: 0.5rem;">
      {#if loading}<span class="spinner"></span>{/if}
      {loading ? 'Salvando...' : 'Salvar e entrar no sistema'}
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
</style>

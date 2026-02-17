<script>
  import { supabase } from '$lib/supabaseClient';
  import { addToast } from '$lib/stores/ui';
  import { getFriendlyErrorMessage } from '$lib/errorUtils';

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

<div class="max-w-md mx-auto bg-white dark:bg-slate-800 rounded-lg shadow p-6 mt-10">
  <h1 class="text-xl font-semibold mb-2">Criar nova senha</h1>
  <p class="text-sm text-slate-600 dark:text-slate-400 mb-6">Digite sua nova senha abaixo para recuperar o acesso à sua conta.</p>

  <form on:submit={handleUpdatePassword} class="space-y-4">
    <div>
      <label for="new-password" class="block text-sm mb-1 font-medium">Nova senha</label>
      <div class="relative">
        <input 
          id="new-password" 
          type={showPassword ? 'text' : 'password'} 
          bind:value={password} 
          class="input-form pr-10" 
          placeholder="Mínimo 8 caracteres"
          required 
        />
        <button type="button"
          on:mousedown={() => showPassword = true}
          on:mouseup={() => showPassword = false}
          on:mouseleave={() => showPassword = false}
          class="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none">
          {#if showPassword}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
          {/if}
        </button>
      </div>
    </div>

    <div>
      <label for="confirm-password" class="block text-sm mb-1 font-medium">Confirmar nova senha</label>
      <div class="relative">
        <input 
          id="confirm-password" 
          type={showConfirm ? 'text' : 'password'} 
          bind:value={confirm} 
          class="input-form pr-10" 
          required 
        />
        <button type="button"
          on:mousedown={() => showConfirm = true}
          on:mouseup={() => showConfirm = false}
          on:mouseleave={() => showConfirm = false}
          class="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none">
          {#if showConfirm}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
          {/if}
        </button>
      </div>
    </div>

    <button disabled={loading} class="btn-primary w-full py-3 mt-4">
      {loading ? 'Salvando...' : 'Salvar e entrar no sistema'}
    </button>
  </form>
</div>

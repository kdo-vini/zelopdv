<script>
  import { supabase } from '$lib/supabaseClient';
  import { addToast } from '$lib/stores/ui';
  import { onMount } from 'svelte';
  
  export let userId;
  export let onPinSet = () => {};

  let pin = '';
  let confirmPin = '';
  let saving = false;
  
  // Bubble state
  let bubble = { show: false, field: null };
  let bubbleTimer;

  function showBubble(field) {
    bubble = { show: true, field };
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => {
        bubble = { show: false, field: null };
    }, 2000);
  }

  async function savePin() {
    if (pin.length < 4 || pin.length > 6) {
        addToast('PIN deve ter entre 4 e 6 dígitos.', 'warning');
        return;
    }
    if (pin !== confirmPin) {
        addToast('PINs não conferem.', 'warning');
        return;
    }

    saving = true;
    try {
        const { error } = await supabase
            .from('empresa_perfil')
            .update({ pin_admin: pin })
            .eq('user_id', userId);

        if (error) throw error;
        
        addToast('PIN definido com sucesso!', 'success');
        onPinSet(pin); // Callback to update parent state
    } catch (e) {
        addToast('Erro ao salvar PIN: ' + e.message, 'error');
    } finally {
        saving = false;
    }
  }
</script>

<!-- Backdrop (High z-index, cannot close) -->
<div class="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
  <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-700 text-center">
    
    <div class="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
        <span class="text-3xl">🔒</span>
    </div>

    <h2 class="text-xl font-bold text-slate-800 dark:text-white mb-2">Segurança do Sistema</h2>
    <p class="text-slate-600 dark:text-slate-300 mb-6 text-sm">
        Para proteger dados sensíveis (Relatórios, Despesas), defina agora uma <strong>Senha Administrativa (PIN)</strong> de 4 a 6 dígitos.
    </p>

    <div class="space-y-6">
        <div class="relative">
            <input 
                type="password" 
                placeholder="Digite o PIN (4-6 dígitos)" 
                maxlength="6" 
                inputmode="numeric"
                pattern="[0-9]*"
                class="w-full text-center text-2xl tracking-widest font-mono p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400 placeholder:text-base placeholder:tracking-normal" 
                bind:value={pin} 
                on:input={(e) => {
                    if (/\D/.test(e.currentTarget.value)) {
                        showBubble('pin');
                        pin = e.currentTarget.value.replace(/\D/g, '');
                    }
                }}
            />
            {#if bubble.show && bubble.field === 'pin'}
                 <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg shadow-xl whitespace-nowrap z-50 animate-bounce-small">
                    Apenas números!
                    <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800"></div>
                 </div>
            {/if}
        </div>
        
        <div class="relative">
            <input 
                type="password" 
                placeholder="Confirme o PIN" 
                maxlength="6" 
                inputmode="numeric"
                pattern="[0-9]*"
                class="w-full text-center text-2xl tracking-widest font-mono p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400 placeholder:text-base placeholder:tracking-normal" 
                bind:value={confirmPin} 
                on:input={(e) => {
                    if (/\D/.test(e.currentTarget.value)) {
                        showBubble('confirm');
                        confirmPin = e.currentTarget.value.replace(/\D/g, '');
                    }
                }}
            />
            {#if bubble.show && bubble.field === 'confirm'}
                 <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg shadow-xl whitespace-nowrap z-50 animate-bounce-small">
                    Apenas números!
                    <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800"></div>
                 </div>
            {/if}
        </div>
        
        <button class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors shadow-lg shadow-blue-500/30" on:click={savePin} disabled={saving}>
            {saving ? 'Salvando...' : 'Definir Senha Admin'}
        </button>
    </div>
  </div>
</div>

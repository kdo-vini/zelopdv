<script>
  import { adminUnlocked } from '$lib/stores/adminStore';
  import { addToast } from '$lib/stores/ui';
  import { fade } from 'svelte/transition';
  import { supabase } from '$lib/supabaseClient';

  export let correctPin; 
  
  let inputPin = '';
  let errorShake = false;
  
  // Reset Flow State
  let mode = 'lock'; // 'lock', 'sending', 'verify', 'new_pin'
  let resetEmail = '';
  let otpCode = '';
  let newPin = '';
  let loadingRest = false;

  // Bubble feedback
  let showBubble = false;
  let bubbleTimer;
  let showBubbleNew = false;
  let bubbleTimerNew;

  function triggerBubble() {
      showBubble = true;
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => showBubble = false, 2000);
  }
  
  function triggerBubbleNew() {
      showBubbleNew = true;
      clearTimeout(bubbleTimerNew);
      bubbleTimerNew = setTimeout(() => showBubbleNew = false, 2000);
  }

  function unlock() {
    if (inputPin === correctPin) {
        $adminUnlocked = true;
        addToast('Acesso liberado.', 'success');
    } else {
        errorShake = true;
        setTimeout(() => errorShake = false, 400);
        inputPin = '';
        addToast('PIN Incorreto', 'error');
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') unlock();
  }

  // --- Reset Logic ---
  async function startReset() {
    loadingRest = true;
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !user.email) throw new Error('Email não encontrado.');
        resetEmail = user.email;

        const { error } = await supabase.auth.signInWithOtp({
            email: resetEmail,
            options: { shouldCreateUser: false } 
        });
        
        if (error) throw error;
        
        addToast(`Código enviado para ${resetEmail}`, 'info');
        mode = 'verify';
    } catch (e) {
        addToast('Erro ao enviar código: ' + e.message, 'error');
    } finally {
        loadingRest = false;
    }
  }

  async function verifyOtp() {
    loadingRest = true;
    try {
        const { data, error } = await supabase.auth.verifyOtp({
            email: resetEmail,
            token: otpCode,
            type: 'email'
        });

        if (error) throw error;

        mode = 'new_pin';
        addToast('Código verificado!', 'success');
    } catch (e) {
        addToast('Código inválido ou expirado.', 'error');
    } finally {
        loadingRest = false;
    }
  }

  async function saveNewPin() {
    if (newPin.length < 4) {
        addToast('PIN deve ter 4-6 dígitos.', 'warning');
        return;
    }
    loadingRest = true;
    try {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
            .from('empresa_perfil')
            .update({ pin_admin: newPin })
            .eq('user_id', user.id);

        if (error) throw error;

        addToast('Novo PIN definido!', 'success');
        $adminUnlocked = true; // Unlock directly
        // Optionally update correctPin if bound, but unlocking bypasses it anyway
    } catch (e) {
        addToast('Erro ao salvar: ' + e.message, 'error');
    } finally {
        loadingRest = false;
    }
  }
</script>

{#if $adminUnlocked}
  <slot />
{:else}
  <div class="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 animate-in fade-in zoom-in duration-300">
    <div class="mb-6 relative">
        <div class="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center border-4 border-slate-200 dark:border-slate-700">
            <span class="text-4xl">🔐</span>
        </div>
        {#if errorShake}
            <div class="absolute inset-0 border-4 border-red-500 rounded-full animate-ping opacity-20"></div>
        {/if}
    </div>
    
    <h2 class="text-2xl font-bold text-slate-800 dark:text-white mb-2">Área Restrita</h2>
    <p class="text-slate-500 dark:text-slate-400 mb-8 max-w-md mx-auto">
        Esta página contém informações sensíveis. Digite a senha administrativa para continuar.
    </p>

    <div class="flex flex-col gap-4 w-full max-w-xs mx-auto transition-all duration-300">
      
      {#if mode === 'lock'}
        <div class="relative">
            <input 
                type="password" 
                placeholder="PIN" 
                maxlength="6"
                inputmode="numeric"
                pattern="[0-9]*"
                class="w-full text-center text-3xl tracking-[0.5em] font-mono p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all shadow-sm placeholder:text-slate-400 placeholder:tracking-normal placeholder:text-lg"
                class:border-red-500={errorShake}
                bind:value={inputPin}
                on:input={(e) => {
                    if (/\D/.test(e.currentTarget.value)) {
                        triggerBubble();
                        inputPin = e.currentTarget.value.replace(/\D/g, '');
                    }
                }}
                on:keydown={handleKeydown}
                autofocus
            />
            {#if showBubble}
                 <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg shadow-xl whitespace-nowrap z-50 animate-bounce">
                    Números apenas!
                    <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-amber-500"></div>
                 </div>
            {/if}
        </div>
        
        <button 
            class="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-3.5 rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-lg"
            on:click={unlock}
        >
            Desbloquear
        </button>

        <button 
            class="text-xs text-slate-400 hover:text-sky-500 underline mt-2"
            on:click={startReset}
            disabled={loadingRest}
        >
            {loadingRest ? 'Enviando...' : 'Esqueci meu PIN'}
        </button>

      {:else if mode === 'verify'}
        <div class="text-center animate-in slide-in-from-right">
            <p class="text-sm text-slate-500 mb-3">Digite o código enviado para <br/> <strong class="text-slate-300">{resetEmail}</strong></p>
            <input 
                type="text" 
                placeholder="Código OTP (ex: 123456)" 
                class="w-full text-center text-xl font-mono p-3 rounded-lg border border-slate-600 bg-slate-800 text-white mb-3"
                bind:value={otpCode}
            />
            <button 
                class="w-full bg-sky-600 text-white font-bold py-3 rounded-lg hover:bg-sky-500"
                on:click={verifyOtp}
                disabled={loadingRest}
            >
                {loadingRest ? 'Verificando...' : 'Verificar Código'}
            </button>
            <button class="text-xs text-slate-500 mt-3 hover:text-white" on:click={() => mode = 'lock'}>Cancelar</button>
        </div>

      {:else if mode === 'new_pin'}
        <div class="text-center animate-in slide-in-from-right">
            <p class="text-sm text-green-400 mb-3 font-semibold">Código verificado! Defina seu novo PIN.</p>
             <div class="relative mb-3">
                <input 
                    type="password" 
                    placeholder="Novo PIN (4-6 dígitos)" 
                    maxlength="6"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    class="w-full text-center text-2xl tracking-widest font-mono p-3 rounded-lg border border-slate-600 bg-slate-800 text-white focus:border-green-500"
                    bind:value={newPin}
                    on:input={(e) => {
                        if (/\D/.test(e.currentTarget.value)) {
                            triggerBubbleNew();
                            newPin = e.currentTarget.value.replace(/\D/g, '');
                        }
                    }}
                />
                {#if showBubbleNew}
                     <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-amber-500 text-white text-xs font-bold rounded shadow-xl whitespace-nowrap z-50 animate-bounce">
                        Números apenas!
                        <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-amber-500"></div>
                     </div>
                {/if}
            </div>
            <button 
                class="w-full bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-500 shadow-lg shadow-green-900/20"
                on:click={saveNewPin}
                disabled={loadingRest}
            >
                {loadingRest ? 'Salvando...' : 'Definir Novo PIN'}
            </button>
        </div>
      {/if}

    </div>
  </div>
{/if}

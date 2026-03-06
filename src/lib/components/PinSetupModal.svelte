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
    await doSavePin(pin, 'PIN definido com sucesso!');
  }

  async function skipForNow() {
    await doSavePin('0000', 'PIN temporário definido (0000). Altere em Perfil > Segurança.');
  }

  async function doSavePin(value, successMsg) {
    saving = true;
    try {
        const { error } = await supabase
            .from('empresa_perfil')
            .update({ pin_admin: value })
            .eq('user_id', userId);

        if (error) throw error;
        
        addToast(successMsg, 'success');
        onPinSet(value);
    } catch (e) {
        addToast('Erro ao salvar PIN: ' + e.message, 'error');
    } finally {
        saving = false;
    }
  }
</script>

<!-- Backdrop (High z-index, cannot close) -->
<div class="fixed inset-0 z-[200] flex items-center justify-center p-4" style="background: rgba(0,0,0,0.75); backdrop-filter: blur(4px);">
  <div class="rounded-xl shadow-2xl max-w-md w-full p-6 text-center" style="background: var(--bg-card); border: 1px solid var(--border-card);">
    
    <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style="background: color-mix(in srgb, var(--primary) 15%, transparent);">
        <span class="text-3xl">🔒</span>
    </div>

    <h2 class="text-xl font-bold mb-2" style="color: var(--text-main);">Segurança do Sistema</h2>
    <p class="mb-2 text-sm" style="color: var(--text-muted);">
        O <strong style="color: var(--text-main);">PIN Administrativo</strong> protege áreas sensíveis como <strong>Relatórios</strong> e <strong>Despesas</strong>, impedindo que funcionários acessem dados financeiros.
    </p>
    <p class="mb-6 text-xs" style="color: var(--text-muted);">
        Escolha de 4 a 6 dígitos. Você pode alterar depois em <strong>Perfil → Segurança</strong>.
    </p>

    <div class="space-y-4">
        <div class="relative">
            <input 
                type="password" 
                placeholder="Digite o PIN (4-6 dígitos)" 
                maxlength="6" 
                inputmode="numeric"
                pattern="[0-9]*"
                class="w-full text-center text-2xl tracking-widest font-mono p-3 rounded-lg"
                style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
                bind:value={pin} 
                on:input={(e) => {
                    if (/\D/.test(e.currentTarget.value)) {
                        showBubble('pin');
                        pin = e.currentTarget.value.replace(/\D/g, '');
                    }
                }}
            />
            {#if bubble.show && bubble.field === 'pin'}
                 <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-xs font-bold rounded-lg shadow-xl whitespace-nowrap z-50" style="background: var(--warning); color: #fff;">
                    Apenas números!
                    <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent" style="border-top-color: var(--warning);"></div>
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
                class="w-full text-center text-2xl tracking-widest font-mono p-3 rounded-lg"
                style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
                bind:value={confirmPin} 
                on:input={(e) => {
                    if (/\D/.test(e.currentTarget.value)) {
                        showBubble('confirm');
                        confirmPin = e.currentTarget.value.replace(/\D/g, '');
                    }
                }}
            />
            {#if bubble.show && bubble.field === 'confirm'}
                 <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-xs font-bold rounded-lg shadow-xl whitespace-nowrap z-50" style="background: var(--warning); color: #fff;">
                    Apenas números!
                    <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent" style="border-top-color: var(--warning);"></div>
                 </div>
            {/if}
        </div>
        
        <button 
            class="w-full font-bold py-3 rounded-lg transition-colors"
            style="background: var(--primary); color: var(--primary-text);"
            on:click={savePin} disabled={saving}
        >
            {saving ? 'Salvando...' : 'Definir PIN Administrativo'}
        </button>

        <button 
            class="w-full py-2 rounded-lg text-sm font-medium transition-colors"
            style="background: transparent; color: var(--text-muted); border: 1px solid var(--border-subtle);"
            on:click={skipForNow} disabled={saving}
        >
            Configurar depois
        </button>
        <p class="text-[11px]" style="color: var(--text-muted); opacity: 0.7;">Ao pular, o PIN será definido como <strong>0000</strong> temporariamente.</p>
    </div>
  </div>
</div>

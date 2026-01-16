<!--
  Componente: ModalMovCaixa.svelte
  Descrição: Modal para sangria (saída) e suprimento (entrada) de caixa
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { addToast } from '$lib/stores/ui';
  
  const dispatch = createEventDispatcher();
  
  /** @type {boolean} */
  export let open = false;
  
  /** @type {number | null} */
  export let idCaixa = null;
  
  /** @type {number} */
  export let saldoCaixa = 0;
  
  /** @type {boolean} */
  export let imprimirRecibo = true;
  
  let tipo = 'saida'; // 'entrada' | 'saida'
  let valor = 0;
  let motivo = '';
  let salvando = false;
  let erro = '';
  
  async function handleSubmit() {
    try {
      erro = '';
      
      if (!idCaixa) {
        erro = 'É necessário um caixa aberto.';
        return;
      }
      
      const v = Number(valor);
      if (!Number.isFinite(v) || v <= 0) {
        erro = 'Informe um valor válido (maior que 0).';
        return;
      }
      
      // Impede SAÍDA maior que o disponível
      if (tipo === 'saida' && v > Number(saldoCaixa || 0)) {
        erro = `Valor maior que o saldo em caixa (R$ ${Number(saldoCaixa).toFixed(2)}).`;
        return;
      }
      
      salvando = true;
      
      const { data: userData } = await supabase.auth.getUser();
      const id_usuario = userData?.user?.id ?? null;
      if (!id_usuario) {
        throw new Error('Sessão inválida. Faça login novamente.');
      }
      
      // Persiste a movimentação de caixa
      const { data, error } = await supabase
        .from('caixa_movimentacoes')
        .insert({
          id_caixa: idCaixa,
          id_usuario,
          tipo: tipo === 'saida' ? 'sangria' : 'suprimento',
          valor: v,
          motivo: motivo || null
        })
        .select('id, created_at')
        .single();
      
      if (error) throw new Error(error.message);
      
      // Dispatch evento de sucesso com dados para impressão opcional
      dispatch('sucesso', {
        idMov: data?.id,
        idCaixa,
        tipo,
        valor: v,
        motivo: motivo || null,
        created_at: data?.created_at,
        imprimirRecibo
      });
      
      addToast('Movimentação registrada com sucesso.', 'success');
      
      // Reset
      tipo = 'saida';
      valor = 0;
      motivo = '';
      
    } catch (e) {
      erro = e?.message || 'Falha ao registrar a movimentação.';
    } finally {
      salvando = false;
    }
  }
  
  function handleClose() {
    erro = '';
    salvando = false;
    dispatch('close');
  }
  
  function handleKeydown(e) {
    if (e.key === 'Escape') handleClose();
  }
  
  // Reset ao abrir
  $: if (open) {
    tipo = 'saida';
    valor = 0;
    motivo = '';
    erro = '';
    salvando = false;
  }
</script>

{#if open}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    aria-label="Fechar modal de movimentação de caixa"
    on:keydown={handleKeydown}
    on:click|self={handleClose}
  >
    <div class="modal-content text-gray-900 dark:text-gray-100" role="dialog" aria-modal="true" aria-labelledby="titulo-movcaixa">
      <h3 id="titulo-movcaixa" class="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100 mb-4">
        Movimentar Caixa
      </h3>
      <div class="space-y-4">
        <div>
          <fieldset>
            <legend class="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Tipo de movimentação</legend>
            <div class="flex gap-2">
              <button 
                type="button" 
                class="btn-secondary" 
                class:btn-primary={tipo === 'entrada'}
                aria-pressed={tipo === 'entrada'} 
                on:click={() => tipo = 'entrada'}
              >
                Entrada
              </button>
              <button 
                type="button" 
                class="btn-secondary" 
                class:btn-primary={tipo === 'saida'}
                aria-pressed={tipo === 'saida'} 
                on:click={() => tipo = 'saida'}
              >
                Saída
              </button>
            </div>
          </fieldset>
        </div>
        <div>
          <label for="valor-mov" class="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Valor (R$)</label>
          <input id="valor-mov" type="number" min="0.01" step="0.01" bind:value={valor} class="input-form" />
        </div>
        <div>
          <label for="motivo-mov" class="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Motivo/observação (opcional)</label>
          <input id="motivo-mov" type="text" maxlength="140" bind:value={motivo} class="input-form" placeholder="Ex.: Retirada para cofre / Troco adicional" />
        </div>
        <label class="inline-flex items-center gap-2 text-sm dark:text-gray-200">
          <input type="checkbox" bind:checked={imprimirRecibo} /> Imprimir recibo
        </label>

        {#if erro}
          <div class="text-sm text-red-600">{erro}</div>
        {/if}

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" on:click={handleClose}>Cancelar</button>
          <button type="button" class="btn-primary" disabled={salvando} on:click={handleSubmit}>
            {salvando ? 'Registrando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

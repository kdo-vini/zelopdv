<!--
  Componente: ModalValorAvulso.svelte
  Descrição: Modal para adicionar item avulso com valor personalizado
-->
<script>
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  /** @type {boolean} */
  export let open = false;
  
  let nome = 'Item Avulso';
  let valor = 0;
  
  function handleSubmit() {
    if (valor <= 0) return;
    dispatch('adicionar', { 
      nome: nome || 'Item Avulso', 
      valor: Number(valor) 
    });
    // Reset
    nome = 'Item Avulso';
    valor = 0;
  }
  
  function handleClose() {
    dispatch('close');
  }
  
  function handleKeydown(e) {
    if (e.key === 'Escape') handleClose();
  }
  
  // Reset ao abrir
  $: if (open) {
    nome = 'Item Avulso';
    valor = 0;
  }
</script>

{#if open}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    aria-label="Fechar modal de valor avulso"
    on:keydown={handleKeydown}
    on:click|self={handleClose}
  >
    <div class="modal-content text-gray-900 dark:text-gray-100" role="dialog" aria-modal="true" aria-labelledby="titulo-valor-avulso">
      <h3 id="titulo-valor-avulso" class="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100 mb-4">
        Item Avulso / Valor Personalizado
      </h3>
      <form on:submit|preventDefault={handleSubmit} class="space-y-4">
        <div>
          <label for="nome-avulso" class="block text-sm font-medium text-gray-800 dark:text-gray-200">Nome do Item (Opcional)</label>
          <input id="nome-avulso" type="text" bind:value={nome} class="mt-1 input-form" />
        </div>
        <div>
          <label for="valor-avulso" class="block text-sm font-medium text-gray-800 dark:text-gray-200">Valor Total (R$)</label>
          <input
            id="valor-avulso"
            type="number"
            step="0.01"
            min="0.01"
            bind:value={valor}
            class="mt-1 input-form"
            required
          />
        </div>
        <div class="mt-6 flex justify-end">
          <button type="button" on:click={handleClose} class="btn-secondary mr-2">Cancelar</button>
          <button type="submit" class="btn-primary">Adicionar</button>
        </div>
      </form>
    </div>
  </div>
{/if}

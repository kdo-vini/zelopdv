<!--
  Componente: ModalAbrirCaixa.svelte
  Descrição: Modal para abertura de caixa com valor de troco inicial
-->
<script>
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  /** @type {boolean} */
  export let open = false;
  
  let trocoInicial = 0;
  let submitting = false;
  
  function handleSubmit() {
    if (trocoInicial < 0) return;
    submitting = true;
    dispatch('submit', { trocoInicial: Number(trocoInicial) });
  }
  
  function handleClose() {
    dispatch('close');
  }
  
  // Reset ao abrir
  $: if (open) {
    trocoInicial = 0;
    submitting = false;
  }
  
  function handleKeydown(e) {
    if (e.key === 'Escape' && !submitting) {
      // Don't close during submission, but Escape is less critical here since it's a required action
    }
  }
</script>

{#if open}
  <div class="modal-backdrop" on:keydown={handleKeydown}>
    <div class="modal-content">
      <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100 mb-4">Abrir Caixa</h3>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Você precisa abrir o caixa antes de registrar vendas.
      </p>
      <form on:submit|preventDefault={handleSubmit}>
        <label for="troco-inicial" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Valor do Troco Inicial (R$)
        </label>
        <input
          id="troco-inicial"
          type="number"
          step="0.01"
          min="0"
          bind:value={trocoInicial}
          class="mt-1 input-form"
          required
          disabled={submitting}
        />
        <div class="mt-6 flex justify-end">
          <button type="submit" class="btn-primary" disabled={submitting}>
            {submitting ? 'Abrindo...' : 'Abrir Caixa'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

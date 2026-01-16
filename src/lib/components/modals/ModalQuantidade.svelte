<!--
  Componente: ModalQuantidade.svelte
  Descrição: Modal para input de quantidade (produtos por unidade)
-->
<script>
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  /** @type {boolean} */
  export let open = false;
  
  /** @type {{ id: number, nome: string, preco: number, controlar_estoque?: boolean, estoque_atual?: number } | null} */
  export let produto = null;
  
  let quantidade = 1;
  
  function handleSubmit() {
    const qtdInt = Math.floor(Number(quantidade));
    if (!Number.isFinite(qtdInt) || qtdInt <= 0) return;
    dispatch('confirm', { produto, quantidade: qtdInt });
  }
  
  function handleClose() {
    dispatch('close');
  }
  
  function handleKeydown(e) {
    if (e.key === 'Escape') handleClose();
  }
  
  // Reset ao abrir
  $: if (open) {
    quantidade = 1;
  }
</script>

{#if open && produto}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    aria-label="Fechar modal de quantidade"
    on:keydown={handleKeydown}
    on:click|self={handleClose}
  >
    <div class="modal-content text-gray-900 dark:text-gray-100" role="dialog" aria-modal="true" aria-labelledby="titulo-quantidade">
      <h3 id="titulo-quantidade" class="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100 mb-4">
        {produto.nome}
      </h3>
      <form on:submit|preventDefault={handleSubmit} class="space-y-4">
        <div>
          <label for="qtd-input" class="block text-sm font-medium text-gray-800 dark:text-gray-200">Quantidade</label>
          <input
            id="qtd-input"
            type="number"
            min="1"
            step="1"
            bind:value={quantidade}
            class="mt-1 input-form"
            required
          />
          {#if produto.controlar_estoque}
            <p class="mt-1 text-xs text-gray-500">Disponível: {Number(produto.estoque_atual || 0)}</p>
          {/if}
        </div>
        <div class="mt-6 flex justify-end">
          <button type="button" on:click={handleClose} class="btn-secondary mr-2">Cancelar</button>
          <button type="submit" class="btn-primary">Adicionar</button>
        </div>
      </form>
    </div>
  </div>
{/if}

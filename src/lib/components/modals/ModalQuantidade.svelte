<!--
  Componente: ModalQuantidade.svelte
  Descrição: Modal para input de quantidade (produtos por unidade)
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import { estoqueDisponivel, produtoControlaEstoque } from '$lib/stock';
  import { Minus, Plus } from 'lucide-svelte';
  import { zeloSurface } from '$lib/theme/surface';
  import Sheet from '$lib/components/zelo/Sheet.svelte';
  import { Button } from '$lib/components/ui/button';
  
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
  
  // Zelo: botões −/+ só ajustam o mesmo campo; a validação continua em handleSubmit.
  function stepQuantidade(delta) {
    quantidade = Math.max(1, Math.floor(Number(quantidade) || 0) + delta);
  }

  // Reset ao abrir
  $: if (open) {
    quantidade = 1;
  }
</script>

{#if open && produto && $zeloSurface}
  <Sheet
    labelledby="titulo-quantidade"
    title={produto.nome}
    size="sm"
    closable
    closeLabel="Fechar modal de quantidade"
    on:backdrop={handleClose}
    on:close={handleClose}
    on:keydown={handleKeydown}
  >
    <form on:submit|preventDefault={handleSubmit} class="zsheet-form">
      <div class="zsheet-body">
        <div class="z-field">
          <label for="qtd-input" class="z-label">Quantidade</label>
          <div class="zq-row">
            <button type="button" class="zq-step" aria-label="Diminuir quantidade" on:click={() => stepQuantidade(-1)}><Minus size={20} strokeWidth={1.75} /></button>
            <input
              id="qtd-input"
              type="number"
              min="1"
              step="1"
              bind:value={quantidade}
              class="z-input z-num zq-input"
              required
            />
            <button type="button" class="zq-step" aria-label="Aumentar quantidade" on:click={() => stepQuantidade(1)}><Plus size={20} strokeWidth={1.75} /></button>
          </div>
          {#if produtoControlaEstoque(produto)}
            <p class="z-hint">Disponível: <span class="zq-num">{estoqueDisponivel(produto)}</span></p>
          {/if}
        </div>
      </div>
      <div class="zsheet-footer">
        <Button variant="outlined" size="touch" onclick={handleClose}>Cancelar</Button>
        <Button variant="primary" size="touch" type="submit" class="z-primary">Adicionar</Button>
      </div>
    </form>
  </Sheet>
{:else if open && produto}
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
          {#if produtoControlaEstoque(produto)}
            <p class="mt-1 text-xs text-gray-500">Disponível: {estoqueDisponivel(produto)}</p>
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

<style>
  .zq-row { display: flex; align-items: center; gap: 8px; }
  input.z-input.zq-input { flex: 1; min-width: 0; height: 56px; text-align: center; font-size: 22px; font-weight: 500; appearance: textfield; -moz-appearance: textfield; }
  input.zq-input::-webkit-outer-spin-button, input.zq-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .zq-step { flex: 0 0 auto; display: grid; place-items: center; width: 56px; height: 56px; border: 1px solid var(--border-subtle); border-radius: var(--zelo-radius-control); background: var(--bg-panel); color: var(--text-label); transition: border-color var(--zelo-dur-fast) var(--zelo-ease-spring), color var(--zelo-dur-fast); }
  .zq-step:hover { border-color: var(--border-strong); color: var(--text-main); }
  .zq-step:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--focus); }
  .zq-num { font-family: var(--zelo-font-num); font-variant-numeric: tabular-nums; color: var(--text-main); }
</style>

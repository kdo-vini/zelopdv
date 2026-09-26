<!--
  Componente: ModalAbrirCaixa.svelte
  Descrição: Modal para abertura de caixa com valor de troco inicial
-->
<script>
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { zeloSurface } from '$lib/theme/surface';
  import Sheet from '$lib/components/zelo/Sheet.svelte';
  import MorphButton from '$lib/components/zelo/MorphButton.svelte';

  const dispatch = createEventDispatcher();

  /** @type {boolean} */
  export let open = false;
  /** Controlado pelo pai: true enquanto a abertura está em andamento. Volta a false em caso de falha, reabilitando o botão. */
  export let busy = false;
  /** Presentational only (zelo): true when this open-till step leads straight into payment
      (first-use "Receber" flow) — shows the "Antes de receber" eyebrow above the title. */
  export let beforePayment = false;

  let trocoInicial = 0;

  // No desktop, a abertura bloqueia apenas a superfície do PDV. A sidebar
  // continua navegável, como já acontece com a bottom navbar no mobile.
  $: if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('cash-opening-modal-open', open);
  }

  onDestroy(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('cash-opening-modal-open');
    }
  });

  function handleSubmit() {
    if (busy) return;
    if (trocoInicial < 0) return;
    dispatch('submit', { trocoInicial: Number(trocoInicial) });
  }

  function handleClose() {
    dispatch('close');
  }

  // Reset ao abrir
  $: if (open) {
    trocoInicial = 0;
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && !busy) {
      // Don't close during submission, but Escape is less critical here since it's a required action
    }
  }
</script>

{#if open && $zeloSurface}
  <!-- Zelo: sem fechar pelo fundo nem por botão, como no legado (abertura é obrigatória). -->
  <Sheet
    labelledby="abrir-caixa-title"
    title="Abrir caixa"
    eyebrow={beforePayment ? 'Antes de receber' : ''}
    size="sm"
    backdropProps={{ 'data-update-safe': 'true' }}
    panelProps={{ tabindex: '-1' }}
    on:keydown={handleKeydown}
  >
    <p slot="subtitle" class="zsheet-subtitle">
      Você precisa abrir o caixa antes de registrar vendas. Se não usa gaveta,
      vende mais no Pix/cartão ou está só testando, pode deixar R$ 0,00.
    </p>
    <form on:submit|preventDefault={handleSubmit} class="zsheet-form">
      <div class="zsheet-body">
        <div class="z-field">
          <label for="troco-inicial" class="z-label">Troco inicial</label>
          <div class="z-money">
            <span aria-hidden="true">R$</span>
            <input
              id="troco-inicial"
              type="number"
              step="0.01"
              min="0"
              bind:value={trocoInicial}
              required
              disabled={busy}
            />
          </div>
          <p class="z-hint">Troco inicial é apenas o dinheiro que já começa na gaveta para dar troco.</p>
        </div>
      </div>
      <div class="zsheet-footer">
        <MorphButton state={busy ? 'loading' : 'idle'} size="cta" type="submit" class="z-primary" loadingLabel="Abrindo…" label="Abrir caixa" />
      </div>
    </form>
  </Sheet>
{:else if open}
  <div
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="abrir-caixa-title"
    tabindex="-1"
    data-update-safe="true"
    on:keydown={handleKeydown}
  >
    <div class="modal-content">
      <h3 id="abrir-caixa-title" class="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100 mb-4">Abrir Caixa</h3>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Você precisa abrir o caixa antes de registrar vendas. Se não usa gaveta,
        vende mais no Pix/cartão ou está só testando, pode deixar R$ 0,00.
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
          disabled={busy}
        />
        <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Troco inicial é apenas o dinheiro que já começa na gaveta para dar troco.
        </p>
        <div class="mt-6 flex justify-end">
          <button type="submit" class="btn-primary" disabled={busy}>
            {busy ? 'Abrindo...' : 'Abrir Caixa'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

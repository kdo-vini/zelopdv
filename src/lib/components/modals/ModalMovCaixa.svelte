<!--
  Componente: ModalMovCaixa.svelte
  Descrição: Modal para sangria (saída) e suprimento (entrada) de caixa
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { getOfflineContext, isOfflineWriteActive, submitOfflineOperation } from '$lib/offline/runtime';
  import { listOperations } from '$lib/offline/operations';
  import { ensureActiveSubscription } from '$lib/guards';
  import { addToast } from '$lib/stores/ui';
  import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-svelte';
  import { zeloSurface } from '$lib/theme/surface';
  import Sheet from '$lib/components/zelo/Sheet.svelte';
  import Segmented from '$lib/components/zelo/Segmented.svelte';
  import MoneyText from '$lib/components/zelo/MoneyText.svelte';
  import { Button } from '$lib/components/ui/button';

  const TIPO_OPTIONS = [
    { value: 'entrada', label: 'Entrada', icon: ArrowDownToLine },
    { value: 'saida', label: 'Saída', icon: ArrowUpFromLine },
  ];
  
  const dispatch = createEventDispatcher();
  
  /** @type {boolean} */
  export let open = false;
  
  /** @type {number | string | null} */
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
  let movementIntent = null;
  
  async function handleSubmit() {
    if (salvando) return;
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
      
      const context = getOfflineContext();
      let data;
      if (isOfflineWriteActive()) {
        movementIntent ||= crypto.randomUUID();
        const operations = await listOperations(context.ownerUserId);
        const turn = operations.find(operation => operation.type === 'caixa.open' && operation.entityId === String(idCaixa));
        const operation = await submitOfflineOperation('caixa.move', String(idCaixa), {
          id_caixa: idCaixa, tipo: tipo === 'saida' ? 'sangria' : 'suprimento', valor: v, motivo: motivo || null,
        }, { operationId: movementIntent, dependencies: turn ? [turn.operationId] : [] });
        data = { id: operation.operationId, created_at: operation.occurredAt };
      } else {
        const auth = context || await ensureActiveSubscription();
        if (!auth?.ownerUserId) throw new Error('Sessão inválida. Faça login novamente.');
        const result = await supabase.from('caixa_movimentacoes').insert({
          id_caixa: idCaixa, id_usuario: auth.ownerUserId,
          tipo: tipo === 'saida' ? 'sangria' : 'suprimento', valor: v, motivo: motivo || null,
        }).select('id, created_at').single();
        if (result.error) throw new Error(result.error.message);
        if (!result.data?.id) throw new Error('O sistema não confirmou a movimentação. Confira antes de repetir.');
        data = result.data;
      }
      
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
      
      movementIntent = null;
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
    if (salvando) return;
    erro = '';
    salvando = false;
    dispatch('close');
  }
  
  function handleKeydown(e) {
    if (e.key === 'Escape') {
      handleClose();
    } else if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
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

{#if open && $zeloSurface}
  <Sheet
    labelledby="titulo-movcaixa"
    title="Movimentar caixa"
    size="sm"
    closable
    closeLabel="Fechar modal de movimentação de caixa"
    on:backdrop={handleClose}
    on:close={handleClose}
    on:keydown={handleKeydown}
  >
    <p slot="subtitle" class="zsheet-subtitle zm-saldo">Em caixa agora <MoneyText value={saldoCaixa} size="sm" /></p>
    <div class="zsheet-body">
      <div class="z-field">
        <span class="z-label">Tipo de movimentação</span>
        <Segmented label="Tipo de movimentação" size="lg" bind:value={tipo} options={TIPO_OPTIONS} class="zm-seg" />
        <p class="z-hint">{tipo === 'saida' ? 'Sangria: dinheiro que sai da gaveta.' : 'Suprimento: dinheiro que entra na gaveta.'}</p>
      </div>
      <div class="z-field">
        <label for="valor-mov" class="z-label">Valor</label>
        <div class="z-money">
          <span aria-hidden="true">R$</span>
          <input id="valor-mov" type="number" min="0.01" step="0.01" bind:value={valor} />
        </div>
      </div>
      <div class="z-field">
        <label for="motivo-mov" class="z-label">Motivo ou observação <span class="z-optional">(opcional)</span></label>
        <input id="motivo-mov" type="text" maxlength="140" bind:value={motivo} class="z-input" placeholder="Ex.: Retirada para cofre / Troco adicional" />
      </div>
      <label class="z-check">
        <input class="themed-checkbox" type="checkbox" bind:checked={imprimirRecibo} /> Imprimir recibo
      </label>

      {#if erro}
        <p class="z-alert" role="alert">{erro}</p>
      {/if}
    </div>
    <div class="zsheet-footer">
      <Button variant="outlined" size="touch" onclick={handleClose}>Cancelar</Button>
      <Button variant="primary" size="touch" class="z-primary" disabled={salvando} onclick={handleSubmit}>
        {salvando ? 'Registrando...' : 'Confirmar'}
      </Button>
    </div>
  </Sheet>
{:else if open}
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
          <input class="themed-checkbox" type="checkbox" bind:checked={imprimirRecibo} /> Imprimir recibo
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

<style>
  .zm-saldo { display: flex; align-items: baseline; gap: 6px; }
  :global(.zm-seg) { display: flex !important; width: 100%; }
</style>

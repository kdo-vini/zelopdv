<script>
  import { createEventDispatcher } from 'svelte';
  import { Minus, Plus, X } from 'lucide-svelte';
  import { addToast } from '$lib/stores/ui';
  import {
    formatSelectedModifierGroups,
    resolveModifierSelections,
    shouldResetModifierSelections,
    sortModifierGroups
  } from '$lib/zelomenuModifiers';
  import InlineHelper from '$lib/components/ui/InlineHelper.svelte';

  export let open = false;
  export let produto = null;
  export let precoBase = 0;

  const dispatch = createEventDispatcher();
  let selections = {};
  let lastProductKey = '';
  let wasOpen = false;

  $: productKey = `${produto?.id ?? ''}:${precoBase}`;
  $: {
    if (shouldResetModifierSelections({ open, wasOpen, productKey, lastProductKey })) {
      selections = {};
      lastProductKey = productKey;
    }
    wasOpen = open;
  }
  $: groups = sortModifierGroups((produto?.modifierGroups || []).filter((group) => group.active !== false));
  $: selectionInput = groups.map((group) => ({
    groupId: group.id,
    optionSelections: Object.entries(selections[group.id] || {})
      .map(([optionId, quantity]) => ({ optionId, quantity }))
      .filter((option) => Number(option.quantity) > 0)
  }));
  $: resolution = resolveModifierSelections(groups, selectionInput, Number(precoBase || 0));
  $: summary = resolution.ok ? formatSelectedModifierGroups(resolution.selectedGroups) : '';

  function quantityFor(groupId, optionId) {
    return Number(selections[groupId]?.[optionId] || 0);
  }

  function selectedCountFor(groupId) {
    return Object.values(selections[groupId] || {}).filter((quantity) => Number(quantity) > 0).length;
  }

  function isOptionBlocked(group, option) {
    if (!group.allowsQuantity && group.maxSelections === 1) return false;
    if (group.maxSelections == null) return false;
    return !quantityFor(group.id, option.id) && selectedCountFor(group.id) >= group.maxSelections;
  }

  function setQuantity(group, option, quantity) {
    const nextQuantity = Math.max(0, Math.floor(Number(quantity) || 0));
    const capped = group.allowsQuantity && group.maxPerOption != null
      ? Math.min(nextQuantity, group.maxPerOption)
      : nextQuantity;
    if (group.allowsQuantity && group.maxPerOption != null && nextQuantity > group.maxPerOption) {
      addToast(`Você pode escolher no máximo ${group.maxPerOption} de ${option.linkedProduct ? option.linkedProduct.name : option.name}.`, 'warning');
    }
    const groupValues = { ...(selections[group.id] || {}) };
    if (capped === 0) delete groupValues[option.id];
    else groupValues[option.id] = capped;
    selections = { ...selections, [group.id]: groupValues };
  }

  function chooseOption(group, option) {
    const current = quantityFor(group.id, option.id);
    if (group.maxSelections === 1 && !group.allowsQuantity) {
      selections = { ...selections, [group.id]: { [option.id]: current ? 0 : 1 } };
      return;
    }
    if (!current && group.maxSelections != null && selectedCountFor(group.id) >= group.maxSelections) {
      addToast(`Você pode escolher no máximo ${group.maxSelections} ${group.maxSelections === 1 ? 'opção' : 'opções'} em ${group.name}.`, 'warning');
      return;
    }
    setQuantity(group, option, current ? 0 : 1);
  }

  function close() {
    dispatch('close');
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') close();
  }

  function confirm() {
    if (!resolution.ok) return;
    dispatch('confirm', {
      produto,
      preco: resolution.finalUnitPrice,
      selectedOptions: selectionInput,
      modifiers: resolution.selectedGroups
    });
  }
</script>

{#if open}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    aria-label="Fechar montagem do produto"
    on:click|self={close}
    on:keydown={handleKeydown}
  >
    <div class="modal mobile-bottom-nav-dialog" role="dialog" aria-modal="true" aria-labelledby="montavel-title" tabindex="-1">
      <header class="modal-header">
        <div>
          <p class="eyebrow">Produto montável</p>
          <h2 id="montavel-title">{produto?.nome || 'Montar produto'}</h2>
          <p class="base-price">A partir de R$ {Number(precoBase || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <button type="button" class="close" aria-label="Fechar" on:click={close}>
          <X size={18} />
        </button>
      </header>

      <div class="groups">
        {#each groups as group (group.id)}
          <fieldset>
            <legend>
              <span>{group.name}</span>
              <small>
                {#if group.minSelections > 0}Obrigatório · mínimo {group.minSelections}{:else}Opcional{/if}
                {#if group.maxSelections != null} · máximo {group.maxSelections}{/if}
              </small>
            </legend>
            <div class="options">
              {#each group.options.filter((option) => option.active !== false && option.linkedProduct?.available !== false) as option (option.id)}
                {@const quantity = quantityFor(group.id, option.id)}
                {@const isRadio = group.maxSelections === 1 && !group.allowsQuantity}
                {@const blocked = isOptionBlocked(group, option)}
                <div class="option-row" class:selected={quantity > 0} class:blocked>
                  <label class="option-choice">
                    <input
                      type={isRadio ? 'radio' : 'checkbox'}
                      class:themed-radio={isRadio}
                      class:themed-checkbox={!isRadio}
                      name={isRadio ? `modifier-${group.id}` : undefined}
                      checked={quantity > 0}
                      disabled={blocked}
                      on:change={() => chooseOption(group, option)}
                    />
                    <span class="option-name" title={option.linkedProduct?.name || option.name}>{option.linkedProduct?.name || option.name}</span>
                    {#if group.pricingMode === 'somar' && Number(option.linkedProduct?.price ?? option.priceDelta ?? 0) > 0}
                      <span class="option-price">+ R$ {Number(option.linkedProduct?.price ?? option.priceDelta).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    {/if}
                  </label>
                  {#if group.allowsQuantity && quantity > 0}
                    <div class="stepper" aria-label="Quantidade de {option.name}">
                      <button type="button" on:click={() => setQuantity(group, option, quantity - 1)} aria-label="Diminuir">
                        <Minus size={16} />
                      </button>
                      <span aria-live="polite">{quantity}</span>
                      <button type="button" on:click={() => setQuantity(group, option, quantity + 1)} aria-label="Aumentar">
                        <Plus size={16} />
                      </button>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
            {#if group.maxSelections != null && selectedCountFor(group.id) >= group.maxSelections && group.maxSelections > 1}
              <InlineHelper compact message="Você já escolheu o máximo de {group.maxSelections} opções. Desmarque uma para escolher outra." />
            {/if}
          </fieldset>
        {/each}
      </div>

      <footer class="modal-footer">
        {#if !resolution.ok}
          <p class="error" role="alert">{resolution.message}</p>
        {/if}
        <div
          class="summary"
          class:empty={!summary}
          aria-live="polite"
          title={summary || 'Escolha as opções do produto'}
        >
          {summary || 'Escolha as opções do produto'}
        </div>
        <button type="button" class="confirm" disabled={!resolution.ok} on:click={confirm}>
          {#if resolution.ok}
            Adicionar à comanda · R$ {resolution.finalUnitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          {:else}
            Revise as opções acima
          {/if}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 1rem; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px); }
  .modal { width: min(100%, 36rem); max-height: min(90vh, 48rem); overflow: hidden; display: flex; flex-direction: column; background: var(--bg-panel); color: var(--text-main); border: 1px solid var(--border-subtle); border-radius: 14px; box-shadow: var(--shadow-modal); }
  .modal-header, .modal-footer { border-color: var(--border-subtle); }
  .modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding: 1.1rem 1.25rem .95rem; border-bottom: 1px solid var(--border-subtle); }
  .eyebrow { margin: 0 0 .3rem; color: var(--primary); font-size: .625rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
  h2 { margin: 0; font-size: 1.25rem; line-height: 1.2; letter-spacing: -.02em; }
  .base-price { margin: .3rem 0 0; color: var(--text-muted); font-size: .875rem; line-height: 1.2; }
  .close { display: inline-grid; place-items: center; flex: 0 0 auto; width: 2.75rem; height: 2.75rem; margin: -.25rem -.4rem 0 0; border: 1px solid transparent; border-radius: .5rem; color: var(--text-muted); background: transparent; cursor: pointer; transition: color var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast); }
  .close:hover { color: var(--text-main); background: var(--bg-panel); border-color: var(--border-subtle); }
  .close:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .groups { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: .25rem 1.25rem .85rem; scrollbar-width: none; -ms-overflow-style: none; }
  .groups::-webkit-scrollbar { width: 0; height: 0; }
  fieldset { margin: 0; padding: .9rem 0 1rem; border: 0; border-bottom: 1px solid var(--border-subtle); }
  fieldset:last-child { border-bottom: 0; }
  legend { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: 0; font-weight: 750; line-height: 1.2; }
  legend small { max-width: 52%; color: var(--text-muted); font-size: .625rem; font-weight: 650; line-height: 1.25; text-align: right; }
  .options { display: grid; gap: .5rem; margin-top: .7rem; }
  .option-row { display: flex; align-items: center; gap: .75rem; min-height: 3rem; padding: .65rem .75rem; border: 1px solid var(--border-subtle); border-radius: .75rem; background: var(--bg-panel); transition: background var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast); }
  .option-row:hover { border-color: color-mix(in srgb, var(--primary) 55%, var(--border-subtle)); background: color-mix(in srgb, var(--primary) 5%, var(--bg-panel)); }
  .option-row:focus-within { outline: 2px solid color-mix(in srgb, var(--primary) 55%, transparent); outline-offset: 1px; }
  .option-row.selected { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 11%, var(--bg-panel)); }
  .option-row.selected .option-name { font-weight: 650; }
  .option-row.blocked { opacity: .45; }
  .option-row.blocked .option-choice { cursor: not-allowed; }
  .option-choice { min-width: 0; flex: 1; display: flex; align-items: center; gap: .7rem; border: 0; padding: 0; color: inherit; background: transparent; text-align: left; cursor: pointer; }
  .option-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.25; }
  .option-price { margin-left: auto; color: var(--text-muted); font-size: .875rem; white-space: nowrap; }
  .stepper { display: flex; align-items: center; gap: .5rem; }
  .stepper button { display: inline-grid; place-items: center; width: 2.75rem; height: 2.75rem; border: 1px solid var(--border-subtle); border-radius: .5rem; color: var(--text-main); background: var(--bg-card); line-height: 1; cursor: pointer; transition: background var(--transition-fast), border-color var(--transition-fast); }
  .stepper button:hover { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 8%, var(--bg-card)); }
  .stepper button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .stepper span { min-width: 1.1rem; color: var(--text-main); text-align: center; font-size: .875rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .modal-footer { min-height: 7.25rem; display: flex; flex-direction: column; justify-content: flex-end; gap: .5rem; padding: .8rem 1.25rem 1rem; border-top: 1px solid var(--border-subtle); background: color-mix(in srgb, var(--bg-card) 94%, var(--bg-panel)); }
  .summary { display: -webkit-box; height: 2.55rem; margin: 0; overflow: hidden; color: var(--text-label); font-size: .875rem; line-height: 1.25rem; line-clamp: 2; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .summary.empty { color: var(--text-muted); }
  .error { min-height: 1.1rem; margin: 0; color: var(--accent); font-size: .875rem; line-height: 1.1rem; overflow-wrap: anywhere; }
  .confirm { display: inline-flex; align-items: center; justify-content: center; width: 100%; min-height: 3rem; border: 0; border-radius: .5rem; padding: .8rem 1rem; color: var(--primary-text); background: var(--primary); font-weight: 750; cursor: pointer; transition: filter var(--transition-fast), transform var(--transition-fast); }
  .confirm:hover:not(:disabled) { filter: brightness(1.06); }
  .confirm:active:not(:disabled) { transform: translateY(1px); }
  .confirm:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
  .confirm:disabled { cursor: not-allowed; opacity: .5; }
  @media (max-width: 640px) {
    .modal-backdrop { align-items: end; padding: 0; }
    .modal { width: 100%; max-height: min(92vh, calc(100dvh - var(--mobile-bottom-nav-offset))); border-radius: 1rem 1rem 0 0; }
    .modal-header { padding-inline: 1rem; }
    .groups { padding-inline: 1rem; }
    .modal-footer { padding-inline: 1rem; padding-bottom: max(1rem, env(safe-area-inset-bottom)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .close, .option-row, .stepper button, .confirm {
      transition: none;
    }
  }
</style>

<script>
  import { tick } from 'svelte';
  import { X, Plus, Trash2, AlertTriangle, Loader2 } from 'lucide-svelte';
  import { supabase } from '$lib/supabaseClient';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import { pdvCache } from '$lib/stores/pdvCache';
  import { formatMoney } from '$lib/formatMoney';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Select from '$lib/components/ui/select/index.js';
  import {
    DEFAULT_MARGEM_DESEJADA,
    MAX_TAXA_PLATAFORMA,
    computeRow,
    parseCurrencyInput,
    formatCurrencyInput,
    formatPercent,
  } from '$lib/tools/pricingSheet.js';
  import {
    NICHES,
    UNIT_OPTIONS,
    DEFAULT_PLATFORM_FEE,
    getNiche,
    marginPresets,
    isIngredientCompatible,
    ingredientCost,
    ingredientsTotal,
    wizardResult,
  } from '$lib/tools/pricingWizard.js';

  /**
   * Wizard modal "Adicionar produto" — entrevista guiada (5 passos) que
   * substitui o form inline da planilha de precificação. Insere direto em
   * `produtos` (mesma tabela do cadastro do PDV).
   * @type {{
   *   open?: boolean,
   *   ownerUserId?: string | null,
   *   onclose?: () => void,
   *   onsaved?: (row: any) => void,
   * }}
   */
  let { open = false, ownerUserId = null, onclose, onsaved } = $props();

  const STEP_TITLES = [
    'O que você vende',
    'Custo do produto',
    'Embalagem e taxas',
    'Margem desejada',
    'Preço sugerido',
  ];
  const STEP_SHORT = ['O que', 'Custos', 'Extras', 'Margem', 'Resultado'];
  const TOTAL_STEPS = 5;

  function firstNicheId() {
    return NICHES?.[0]?.id ?? '';
  }

  function createIngredientRow() {
    return {
      id: crypto.randomUUID(),
      nome: '',
      purchaseQuantity: null,
      purchaseUnit: 'kg',
      purchasePrice: null,
      usageQuantity: null,
      usageUnit: 'g',
    };
  }

  let step = $state(1);
  let attemptedNext = $state(false);

  let productName = $state('');
  let productNameInput = $state(/** @type {HTMLInputElement | null} */ (null));
  let nicheId = $state(firstNicheId());

  let costMode = $state('total'); // 'total' | 'ingredientes'
  let custoTotal = $state(/** @type {number | null} */ (null));
  let ingredientRows = $state([createIngredientRow()]);

  let embalagem = $state(/** @type {number | null} */ (null));
  let outros = $state(/** @type {number | null} */ (null));
  let vendePorApp = $state(false);
  let taxa = $state(DEFAULT_PLATFORM_FEE);

  let margemPreset = $state('equilibrada'); // 'competitiva' | 'equilibrada' | 'premium' | 'personalizada'
  let margemPersonalizada = $state(DEFAULT_MARGEM_DESEJADA);

  let vouCobrar = $state(/** @type {number | null} */ (null));

  let saving = $state(false);
  let saveError = $state('');

  let wasOpen = false;

  function resetWizard() {
    step = 1;
    attemptedNext = false;
    productName = '';
    nicheId = firstNicheId();
    costMode = 'total';
    custoTotal = null;
    ingredientRows = [createIngredientRow()];
    embalagem = null;
    outros = null;
    const niche = getNiche(nicheId);
    vendePorApp = !!niche?.defaultPlatformFee;
    taxa = DEFAULT_PLATFORM_FEE;
    margemPreset = 'equilibrada';
    margemPersonalizada = DEFAULT_MARGEM_DESEJADA;
    vouCobrar = null;
    saving = false;
    saveError = '';
  }

  $effect(() => {
    if (open && !wasOpen) {
      resetWizard();
      void tick().then(() => productNameInput?.focus());
    }
    wasOpen = open;
  });

  $effect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  });

  function selectNiche(id) {
    const niche = getNiche(id);
    if (!niche) return;
    nicheId = id;
    vendePorApp = !!niche.defaultPlatformFee;
    taxa = DEFAULT_PLATFORM_FEE;
  }

  function setCostMode(mode) {
    costMode = mode;
  }

  function addIngredientRow() {
    ingredientRows = [...ingredientRows, createIngredientRow()];
  }

  function removeIngredientRow(id) {
    if (ingredientRows.length === 1) return;
    ingredientRows = ingredientRows.filter((r) => r.id !== id);
  }

  function clampNumberOrNull(raw, min = 0, max = 999999) {
    if (raw === '' || raw === null || raw === undefined) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.min(max, Math.max(min, n));
  }

  // Campo de dinheiro (digits-as-cents): string vazia/sem dígito vira null.
  function parseMoneyFieldValue(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    return digits ? parseCurrencyInput(raw) : null;
  }

  function onMoneyInput(getSet, event) {
    const parsed = parseMoneyFieldValue(event.currentTarget.value);
    getSet(parsed);
    event.currentTarget.value = formatCurrencyInput(parsed);
  }

  function onTaxaInput(event) {
    const raw = Number(event.currentTarget.value);
    taxa = Number.isFinite(raw) ? Math.min(MAX_TAXA_PLATAFORMA, Math.max(0, raw)) : DEFAULT_PLATFORM_FEE;
  }

  function clampMargem(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_MARGEM_DESEJADA;
    return Math.min(80, Math.max(1, n));
  }

  function onMargemCustomInput(event) {
    margemPersonalizada = clampMargem(event.currentTarget.value);
  }

  let niche = $derived(getNiche(nicheId) ?? NICHES?.[0]);
  let presets = $derived.by(() => marginPresets(nicheId) ?? {});
  let margem = $derived(
    margemPreset === 'personalizada' ? clampMargem(margemPersonalizada) : Number(presets[margemPreset] ?? DEFAULT_MARGEM_DESEJADA)
  );
  let taxaEfetiva = $derived(vendePorApp ? taxa : 0);

  let custoBase = $derived.by(() =>
    costMode === 'ingredientes' ? ingredientsTotal(ingredientRows) : custoTotal ?? 0
  );

  let wizardCalc = $derived.by(() =>
    wizardResult({
      custoBase,
      embalagem: embalagem ?? 0,
      outros: outros ?? 0,
      taxa: taxaEfetiva,
      margem,
    })
  );

  let marginBlocked = $derived(margem + taxaEfetiva >= 100);

  let liveCalc = $derived.by(() =>
    computeRow({
      custo: wizardCalc.custoDireto,
      venda: vouCobrar,
      margemDesejada: margem,
      taxaPlataforma: taxaEfetiva,
    })
  );

  // Toda vez que o passo 5 é (re)aberto, o campo "Vou cobrar" é preenchido
  // de novo com o preço sugerido — o dono pode arredondar a partir dali.
  $effect(() => {
    if (step === 5) {
      vouCobrar = wizardCalc.sugerido;
    }
  });

  let canContinueStep1 = $derived(productName.trim().length > 0);
  let canContinueStep2 = $derived(custoBase > 0);
  let canContinueStep4 = $derived(!marginBlocked);
  let canSave = $derived(vouCobrar > 0 && !saving);

  function stepBlockedMessage(currentStep) {
    if (currentStep === 1 && !canContinueStep1) return 'Informe o nome do produto para continuar.';
    if (currentStep === 2 && !canContinueStep2) return 'Informe o custo do produto para continuar.';
    if (currentStep === 4 && marginBlocked) {
      return `A margem desejada (${formatPercent(margem)}) mais a taxa do app (${formatPercent(taxaEfetiva)}) passam de 100%. Ajuste a margem ou a taxa.`;
    }
    return '';
  }

  function canContinueCurrentStep() {
    if (step === 1) return canContinueStep1;
    if (step === 2) return canContinueStep2;
    if (step === 4) return canContinueStep4;
    return true;
  }

  function next() {
    if (!canContinueCurrentStep()) {
      attemptedNext = true;
      return;
    }
    attemptedNext = false;
    if (step < TOTAL_STEPS) step += 1;
  }

  function back() {
    attemptedNext = false;
    if (step > 1) step -= 1;
  }

  function isDirty() {
    if (productName.trim()) return true;
    if (custoTotal) return true;
    if (embalagem) return true;
    if (outros) return true;
    if (ingredientRows.some((r) => r.nome || r.purchaseQuantity || r.purchasePrice || r.usageQuantity)) return true;
    return step > 1;
  }

  async function requestClose() {
    if (saving) return;
    if (isDirty()) {
      const ok = await confirmAction('Fechar sem salvar?', 'As informações digitadas neste produto serão perdidas.');
      if (!ok) return;
    }
    resetWizard();
    onclose?.();
  }

  async function handleSave() {
    if (!canSave) return;
    saving = true;
    saveError = '';
    try {
      const payload = {
        id_usuario: ownerUserId,
        nome: productName.trim(),
        preco: vouCobrar,
        custo_unitario: wizardCalc.custoDireto,
        margem_desejada: margem,
        taxa_plataforma: vendePorApp ? taxa : null,
        na_precificacao: true,
        id_categoria: null,
      };
      const { data, error } = await supabase
        .from('produtos')
        .insert(payload)
        .select('id, nome, preco, custo_unitario, margem_desejada, taxa_plataforma, tipo_produto')
        .single();
      if (error) throw error;
      pdvCache.invalidateProdutos();
      addToast('Produto adicionado à planilha!', 'success');
      onsaved?.(data);
      resetWizard();
      onclose?.();
    } catch (err) {
      console.error('[PricingWizardModal] handleSave', err);
      saveError = 'Não foi possível salvar o produto. Tente novamente.';
    } finally {
      saving = false;
    }
  }

  function manageFocus(node) {
    const previous = document.activeElement;
    function keydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        void requestClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = [...node.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(
        (el) => el.getClientRects().length
      );
      if (!elements.length) return;
      if (event.shiftKey && document.activeElement === elements[0]) {
        event.preventDefault();
        elements.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === elements.at(-1)) {
        event.preventDefault();
        elements[0]?.focus();
      }
    }
    node.addEventListener('keydown', keydown);
    return {
      destroy() {
        node.removeEventListener('keydown', keydown);
        if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
      },
    };
  }

  function unitLabel(value) {
    return UNIT_OPTIONS?.find((u) => u.value === value)?.label ?? value;
  }
</script>

{#if open}
  <dialog
    open
    class="pwiz-backdrop"
    aria-modal="true"
    aria-labelledby="wizard-title"
    tabindex="-1"
    use:manageFocus
    onclick={(e) => {
      if (e.target === e.currentTarget) void requestClose();
    }}
  >
    <div class="wizard-box" role="document">
      <header class="wizard-header">
        <div class="wizard-header-copy">
          <p class="wizard-eyebrow">Novo produto · Passo {step} de {TOTAL_STEPS}</p>
          <h2 id="wizard-title" class="wizard-title">{STEP_TITLES[step - 1]}</h2>
        </div>
        <button type="button" class="wizard-close" aria-label="Fechar" onclick={requestClose} disabled={saving}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>

      <div class="wizard-progress" aria-hidden="true">
        <div class="wizard-progress-fill" style={`transform: scaleX(${step / TOTAL_STEPS});`}></div>
      </div>

      <div class="wizard-body">
        {#if saveError}
          <div class="error-banner" role="alert">{saveError}</div>
        {/if}

        {#if step === 1}
          <label class="field-block" for="wizard-product-name">
            <span class="field-label">Nome do produto</span>
            <input
              id="wizard-product-name"
              class="field-input"
              type="text"
              placeholder={niche?.placeholder || 'Ex.: Marmita executiva'}
              bind:value={productName}
              bind:this={productNameInput}
            />
          </label>

          <div class="field-block">
            <span class="field-label">Segmento (opcional)</span>
            <p class="field-help">Escolher um segmento pré-configura margens comuns para esse tipo de negócio.</p>
            <div class="niche-chips">
              {#each NICHES as n}
                <button
                  type="button"
                  class="niche-chip"
                  class:chip-selected={nicheId === n.id}
                  onclick={() => selectNiche(n.id)}
                >
                  {n.label}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if step === 2}
          <div class="mode-grid">
            <button type="button" class="mode-card" class:mode-card-active={costMode === 'total'} onclick={() => setCostMode('total')}>
              <strong>Sei o custo total</strong>
              <p>Você já sabe quanto custa produzir ou comprar uma unidade.</p>
            </button>
            <button
              type="button"
              class="mode-card"
              class:mode-card-active={costMode === 'ingredientes'}
              onclick={() => setCostMode('ingredientes')}
            >
              <strong>Calcular pelos ingredientes</strong>
              <p>Você informa o que comprou e o quanto usa em cada unidade.</p>
            </button>
          </div>

          {#if costMode === 'total'}
            <label class="field-block" for="wizard-custo-total">
              <span class="field-label">Custo total da unidade</span>
              <div class="currency-field">
                <span class="currency-prefix" aria-hidden="true">R$</span>
                <input
                  id="wizard-custo-total"
                  class="field-input currency-input tabular-nums"
                  type="text"
                  inputmode="numeric"
                  placeholder="0,00"
                  value={formatCurrencyInput(custoTotal)}
                  oninput={(e) => onMoneyInput((v) => (custoTotal = v), e)}
                />
              </div>
            </label>
          {:else}
            <div class="ingredient-list">
              {#each ingredientRows as row, index (row.id)}
                <div class="ingredient-row">
                  <div class="ingredient-row-head">
                    <strong>Ingrediente {index + 1}</strong>
                    <div class="ingredient-row-actions">
                      <span class="row-cost tabular-nums">{formatMoney(ingredientCost(row))}</span>
                      <button
                        type="button"
                        class="icon-button-ghost"
                        aria-label={`Remover ingrediente ${index + 1}`}
                        onclick={() => removeIngredientRow(row.id)}
                        disabled={ingredientRows.length === 1}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <label class="field-block">
                    <span class="field-label">Nome</span>
                    <input class="field-input" type="text" placeholder="Ex.: Peito de frango" bind:value={row.nome} />
                  </label>

                  <div class="ingredient-pair">
                    <label class="field-block">
                      <span class="field-label">Quantidade comprada</span>
                      <input
                        class="field-input tabular-nums"
                        type="number"
                        min="0"
                        step="0.001"
                        value={row.purchaseQuantity}
                        oninput={(e) => (row.purchaseQuantity = clampNumberOrNull(e.currentTarget.value))}
                      />
                    </label>
                    <label class="field-block">
                      <span class="field-label">Unidade</span>
                      <Select.Root type="single" bind:value={row.purchaseUnit}>
                        <Select.Trigger class="field-input unit-trigger">{unitLabel(row.purchaseUnit)}</Select.Trigger>
                        <Select.Content>
                          {#each UNIT_OPTIONS as u}
                            <Select.Item value={u.value} label={u.label} />
                          {/each}
                        </Select.Content>
                      </Select.Root>
                    </label>
                  </div>

                  <label class="field-block">
                    <span class="field-label">Preço pago</span>
                    <div class="currency-field">
                      <span class="currency-prefix" aria-hidden="true">R$</span>
                      <input
                        class="field-input currency-input tabular-nums"
                        type="text"
                        inputmode="numeric"
                        placeholder="0,00"
                        value={formatCurrencyInput(row.purchasePrice)}
                        oninput={(e) => onMoneyInput((v) => (row.purchasePrice = v), e)}
                      />
                    </div>
                  </label>

                  <div class="ingredient-pair">
                    <label class="field-block">
                      <span class="field-label">Quantidade usada</span>
                      <input
                        class="field-input tabular-nums"
                        type="number"
                        min="0"
                        step="0.001"
                        value={row.usageQuantity}
                        oninput={(e) => (row.usageQuantity = clampNumberOrNull(e.currentTarget.value))}
                      />
                    </label>
                    <label class="field-block">
                      <span class="field-label">Unidade</span>
                      <Select.Root type="single" bind:value={row.usageUnit}>
                        <Select.Trigger class="field-input unit-trigger">{unitLabel(row.usageUnit)}</Select.Trigger>
                        <Select.Content>
                          {#each UNIT_OPTIONS as u}
                            <Select.Item value={u.value} label={u.label} />
                          {/each}
                        </Select.Content>
                      </Select.Root>
                    </label>
                  </div>

                  {#if !isIngredientCompatible(row) && row.purchaseQuantity && row.usageQuantity}
                    <p class="warning-line">
                      <AlertTriangle size={14} aria-hidden="true" />
                      As unidades comprada e usada precisam ser da mesma família (peso, volume ou unidade).
                    </p>
                  {/if}
                </div>
              {/each}
            </div>

            <button type="button" class="secondary-btn" onclick={addIngredientRow}>
              <Plus size={16} aria-hidden="true" />
              Adicionar ingrediente
            </button>

            <div class="running-total">
              <span>Total dos ingredientes</span>
              <strong class="tabular-nums">{formatMoney(ingredientsTotal(ingredientRows))}</strong>
            </div>
          {/if}
        {/if}

        {#if step === 3}
          <label class="field-block" for="wizard-embalagem">
            <span class="field-label">Embalagem</span>
            <div class="currency-field">
              <span class="currency-prefix" aria-hidden="true">R$</span>
              <input
                id="wizard-embalagem"
                class="field-input currency-input tabular-nums"
                type="text"
                inputmode="numeric"
                placeholder="0,00"
                value={formatCurrencyInput(embalagem)}
                oninput={(e) => onMoneyInput((v) => (embalagem = v), e)}
              />
            </div>
          </label>

          <label class="field-block" for="wizard-outros">
            <span class="field-label">Outro custo por unidade</span>
            <div class="currency-field">
              <span class="currency-prefix" aria-hidden="true">R$</span>
              <input
                id="wizard-outros"
                class="field-input currency-input tabular-nums"
                type="text"
                inputmode="numeric"
                placeholder="0,00"
                value={formatCurrencyInput(outros)}
                oninput={(e) => onMoneyInput((v) => (outros = v), e)}
              />
            </div>
          </label>

          <label class="toggle-line">
            <input class="themed-checkbox" type="checkbox" bind:checked={vendePorApp} />
            <span>Vendo por app (iFood etc.)</span>
          </label>

          {#if vendePorApp}
            <label class="field-block" for="wizard-taxa">
              <span class="field-label">Taxa da plataforma (%)</span>
              <input
                id="wizard-taxa"
                class="field-input tabular-nums"
                type="number"
                min="0"
                max={MAX_TAXA_PLATAFORMA}
                step="0.1"
                value={taxa}
                oninput={onTaxaInput}
              />
            </label>
          {/if}
        {/if}

        {#if step === 4}
          <div class="preset-grid">
            <button
              type="button"
              class="preset-card"
              class:preset-card-active={margemPreset === 'competitiva'}
              onclick={() => (margemPreset = 'competitiva')}
            >
              <strong>Competitiva</strong>
              <span>{formatPercent(presets.competitiva)}</span>
            </button>
            <button
              type="button"
              class="preset-card"
              class:preset-card-active={margemPreset === 'equilibrada'}
              onclick={() => (margemPreset = 'equilibrada')}
            >
              <strong>Equilibrada</strong>
              <span>{formatPercent(presets.equilibrada)}</span>
            </button>
            <button
              type="button"
              class="preset-card"
              class:preset-card-active={margemPreset === 'premium'}
              onclick={() => (margemPreset = 'premium')}
            >
              <strong>Premium</strong>
              <span>{formatPercent(presets.premium)}</span>
            </button>
          </div>

          <button
            type="button"
            class="preset-card preset-card-wide"
            class:preset-card-active={margemPreset === 'personalizada'}
            onclick={() => (margemPreset = 'personalizada')}
          >
            <strong>Personalizar</strong>
            {#if margemPreset === 'personalizada'}
              <input
                class="field-input tabular-nums margem-custom-input"
                type="number"
                min="1"
                max="80"
                step="1"
                value={margemPersonalizada}
                onclick={(e) => e.stopPropagation()}
                oninput={onMargemCustomInput}
              />
            {:else}
              <span>De 1% a 80%</span>
            {/if}
          </button>

          {#if niche?.commonRange}
            <p class="field-help">Margem comum no seu segmento: {niche.commonRange}</p>
          {/if}

          {#if marginBlocked}
            <div class="error-banner" role="alert">{stepBlockedMessage(4)}</div>
          {/if}
        {/if}

        {#if step === 5}
          <div class="result-spotlight">
            <span>Preço sugerido</span>
            <strong class="tabular-nums">{formatMoney(wizardCalc.sugerido)}</strong>
          </div>
          <div class="result-minimum">
            <span>Preço mínimo (sem lucro)</span>
            <strong class="tabular-nums">{formatMoney(wizardCalc.precoMinimo)}</strong>
          </div>

          <label class="field-block" for="wizard-vou-cobrar">
            <span class="field-label">Vou cobrar</span>
            <div class="currency-field">
              <span class="currency-prefix" aria-hidden="true">R$</span>
              <input
                id="wizard-vou-cobrar"
                class="field-input currency-input tabular-nums"
                type="text"
                inputmode="numeric"
                placeholder="0,00"
                value={formatCurrencyInput(vouCobrar)}
                oninput={(e) => onMoneyInput((v) => (vouCobrar = v), e)}
              />
            </div>
          </label>

          <div class="breakdown-grid">
            <div class="breakdown-item">
              <span>Custo direto</span>
              <strong class="tabular-nums">{formatMoney(wizardCalc.custoDireto)}</strong>
            </div>
            {#if vendePorApp}
              <div class="breakdown-item">
                <span>Taxa do app</span>
                <strong class="tabular-nums">{liveCalc.taxaValor == null ? '—' : formatMoney(liveCalc.taxaValor)}</strong>
              </div>
            {/if}
            <div class="breakdown-item">
              <span>Lucro por unidade</span>
              <strong class="tabular-nums">{liveCalc.lucro == null ? '—' : formatMoney(liveCalc.lucro)}</strong>
            </div>
            <div class="breakdown-item">
              <span>Margem</span>
              <strong class="tabular-nums">{formatPercent(liveCalc.margem)}</strong>
            </div>
            <div class="breakdown-item">
              <span>CMV</span>
              <strong class="tabular-nums">{formatPercent(liveCalc.cmv)}</strong>
            </div>
          </div>
        {/if}
      </div>

      <footer class="wizard-footer">
        {#if attemptedNext && stepBlockedMessage(step) && step !== 4}
          <p class="footer-hint">{stepBlockedMessage(step)}</p>
        {/if}
        {#if step === 5}
          <p class="footer-hint">O produto também entra no cadastro do PDV.</p>
        {/if}
        <div class="wizard-footer-actions">
          {#if step === 1}
            <Button type="button" variant="outline" size="lg" class="wizard-btn" onclick={requestClose} disabled={saving}>
              Cancelar
            </Button>
          {:else}
            <Button type="button" variant="outline" size="lg" class="wizard-btn" onclick={back} disabled={saving}>
              Voltar
            </Button>
          {/if}

          {#if step < 5}
            <Button type="button" size="lg" class="wizard-btn" onclick={next}>
              {step === 4 ? 'Ver resultado' : 'Continuar'}
            </Button>
          {:else}
            <Button type="button" size="lg" class="wizard-btn" onclick={handleSave} disabled={!canSave}>
              {#if saving}<Loader2 class="w-4 h-4 animate-spin" aria-hidden="true" />{/if}
              Salvar na planilha
            </Button>
          {/if}
        </div>
      </footer>
    </div>
  </dialog>
{/if}

<style>
  .pwiz-backdrop {
    position: fixed;
    inset: 0;
    width: auto;
    max-width: none;
    height: auto;
    margin: 0;
    border: 0;
    padding: 0;
    background: color-mix(in srgb, var(--bg-app) 60%, transparent);
    display: flex;
    /* Acima da bottom nav global (z-index 1100 em MobileBottomNav.svelte) —
       este é um sheet full-screen, não um modal de rota comum: precisa cobrir
       o chrome do app, inclusive a nav inferior, enquanto está aberto. */
    z-index: 1200;
  }

  .pwiz-backdrop::backdrop {
    background: transparent;
  }

  .wizard-box {
    display: flex;
    flex-direction: column;
    width: 100%;
    /* Fallback para navegadores sem suporte a dvh; dvh por cima quando disponível. */
    height: 100vh;
    height: 100dvh;
    background: var(--bg-card);
    overflow: hidden;
  }

  .wizard-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 1rem 1.1rem 0.75rem;
    flex-shrink: 0;
  }

  .wizard-header-copy {
    min-width: 0;
  }

  .wizard-eyebrow {
    margin: 0 0 0.2rem;
    color: var(--text-muted);
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.18em;
  }

  .wizard-title {
    margin: 0;
    color: var(--text-main);
    font-size: 1.25rem;
    font-weight: 700;
    line-height: 1.25;
  }

  .wizard-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    flex-shrink: 0;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .wizard-close:hover:not(:disabled) {
    background: var(--sidebar-item-hover-bg);
    color: var(--text-main);
  }

  .wizard-close:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .wizard-progress {
    flex-shrink: 0;
    height: 3px;
    margin: 0 1.1rem 0.9rem;
    border-radius: 999px;
    background: var(--border-subtle);
    overflow: hidden;
  }

  .wizard-progress-fill {
    height: 100%;
    width: 100%;
    transform-origin: left;
    background: var(--primary);
    transition: transform var(--transition-normal);
  }

  .wizard-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0 1.1rem 1.25rem;
    overflow-y: auto;
  }

  .error-banner {
    padding: 0.6rem 0.85rem;
    border-radius: 0.5rem;
    border: 1px solid color-mix(in srgb, var(--error) 25%, transparent);
    background: color-mix(in srgb, var(--error) 10%, transparent);
    color: var(--status-error-text);
    font-size: 0.875rem;
  }

  .field-block {
    display: block;
  }

  .field-label {
    display: block;
    margin-bottom: 0.375rem;
    color: var(--text-label);
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.18em;
  }

  .field-help {
    margin: 0 0 0.6rem;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .field-input {
    display: block;
    width: 100%;
    min-height: 2.75rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border-subtle);
    background: var(--bg-input);
    color: var(--text-main);
    font-size: 1rem;
    outline: none;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .field-input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 1px var(--primary);
  }

  :global(.unit-trigger) {
    width: 100%;
    justify-content: space-between;
  }

  .currency-field {
    position: relative;
  }

  .currency-prefix {
    position: absolute;
    top: 50%;
    left: 0.75rem;
    transform: translateY(-50%);
    color: var(--text-muted);
    font-size: 0.875rem;
    font-weight: 600;
    pointer-events: none;
  }

  .currency-input {
    padding-left: 2.25rem;
  }

  .niche-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .niche-chip {
    display: inline-flex;
    align-items: center;
    min-height: 2.5rem;
    padding: 0 0.85rem;
    border-radius: 999px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-panel);
    color: var(--text-label);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: border-color var(--transition-fast), background var(--transition-fast), color var(--transition-fast);
  }

  .niche-chip:hover {
    border-color: color-mix(in srgb, var(--primary) 40%, transparent);
  }

  .chip-selected {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 14%, var(--bg-panel));
    color: var(--text-main);
    font-weight: 700;
  }

  .mode-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.65rem;
  }

  .mode-card,
  .preset-card {
    text-align: left;
    border-radius: 0.75rem;
    border: 1px solid var(--border-subtle);
    background: var(--bg-panel);
    padding: 0.85rem 1rem;
    cursor: pointer;
    transition: border-color var(--transition-fast), background var(--transition-fast);
  }

  .mode-card strong,
  .preset-card strong {
    display: block;
    color: var(--text-main);
    font-size: 0.875rem;
  }

  .mode-card p {
    margin: 0.3rem 0 0;
    color: var(--text-muted);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .mode-card-active,
  .preset-card-active {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, var(--bg-panel));
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .preset-card span {
    display: block;
    margin-top: 0.25rem;
    color: var(--text-muted);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .preset-card-wide {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .preset-card-wide strong {
    flex-shrink: 0;
  }

  .margem-custom-input {
    max-width: 6rem;
    text-align: right;
  }

  .toggle-line {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 2.75rem;
    color: var(--text-main);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .ingredient-list {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .ingredient-row {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    padding: 0.85rem;
    border-radius: 0.75rem;
    border: 1px solid var(--border-subtle);
    background: var(--bg-panel);
  }

  .ingredient-row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .ingredient-row-head strong {
    color: var(--text-main);
    font-size: 0.875rem;
  }

  .ingredient-row-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .row-cost {
    color: var(--text-label);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .icon-button-ghost {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border: 0;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  .icon-button-ghost:hover:not(:disabled) {
    background: var(--status-error-bg);
    color: var(--status-error-text);
  }

  .icon-button-ghost:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .ingredient-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }

  .warning-line {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    color: var(--status-warning-text);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .secondary-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    align-self: flex-start;
    min-height: 2.75rem;
    padding: 0 0.9rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border-subtle);
    background: var(--bg-panel);
    color: var(--text-main);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .secondary-btn:hover {
    border-color: var(--primary);
  }

  .running-total {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.7rem 0.9rem;
    border-radius: 0.5rem;
    border: 1px dashed var(--border-subtle);
    background: var(--bg-panel);
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .running-total strong {
    color: var(--text-main);
    font-size: 1rem;
  }

  .result-spotlight,
  .result-minimum {
    padding: 1rem;
    border-radius: 0.75rem;
    border: 1px solid color-mix(in srgb, var(--primary) 18%, var(--border-subtle));
    background: color-mix(in srgb, var(--primary) 8%, var(--bg-panel));
  }

  .result-spotlight span,
  .result-minimum span {
    display: block;
    color: var(--text-label);
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.18em;
  }

  .result-spotlight strong {
    display: block;
    margin-top: 0.3rem;
    color: var(--primary);
    font-size: 1.875rem;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .result-minimum {
    background: var(--bg-panel);
    border-color: var(--border-subtle);
  }

  .result-minimum strong {
    display: block;
    margin-top: 0.3rem;
    color: var(--text-main);
    font-size: 1.25rem;
    font-weight: 700;
  }

  .breakdown-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .breakdown-item {
    padding: 0.7rem 0.85rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border-subtle);
    background: var(--bg-panel);
  }

  .breakdown-item span {
    display: block;
    margin-bottom: 0.25rem;
    color: var(--text-muted);
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .breakdown-item strong {
    color: var(--text-main);
    font-size: 1rem;
  }

  .wizard-footer {
    flex-shrink: 0;
    padding: 0.85rem 1.1rem;
    padding-bottom: max(0.85rem, env(safe-area-inset-bottom));
    border-top: 1px solid var(--border-subtle);
    background: var(--bg-card);
  }

  .footer-hint {
    margin: 0 0 0.6rem;
    color: var(--status-warning-text);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .wizard-footer-actions {
    display: flex;
    gap: 0.6rem;
  }

  :global(.wizard-btn) {
    flex: 1;
    height: 44px !important;
    padding-inline: 1rem;
  }

  @media (min-width: 768px) {
    .pwiz-backdrop {
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }

    .wizard-box {
      width: 100%;
      max-width: 40rem;
      height: auto;
      max-height: calc(100dvh - 3rem);
      border-radius: 0.875rem;
      border: 1px solid var(--border-card);
      box-shadow: var(--shadow-modal);
    }

    .mode-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .ingredient-pair {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .breakdown-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .wizard-progress-fill {
      transition: none;
    }
  }
</style>

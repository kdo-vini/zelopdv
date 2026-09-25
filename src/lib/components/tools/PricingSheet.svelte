<script>
  import { onMount } from 'svelte';
  import {
    Trash2,
    Loader2,
    ArrowUpDown,
    Plus,
    Check,
    AlertTriangle,
    CheckCircle2,
    TrendingDown,
    CircleDashed,
    Info,
  } from 'lucide-svelte';
  import { supabase } from '$lib/supabaseClient';
  import { ensureActiveSubscription } from '$lib/guards';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import { logAuditAction } from '$lib/accessControl';
  import { pdvCache } from '$lib/stores/pdvCache';
  import { formatMoney } from '$lib/formatMoney';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Select from '$lib/components/ui/select/index.js';
  import PricingSheetImport from './PricingSheetImport.svelte';
  import PricingWizardModal from './PricingWizardModal.svelte';
  import {
    DEFAULT_MARGEM_DESEJADA,
    STATUS_LABELS,
    MAX_TAXA_PLATAFORMA,
    computeRow,
    summarize,
    parseCurrencyInput,
    formatCurrencyInput,
    formatPercent,
    formatMarkup,
  } from '$lib/tools/pricingSheet.js';

  const VENDA_WARNING_KEY = 'zelopdv_pricing_venda_warning_ack';

  const STATUS_ICON = {
    ok: CheckCircle2,
    abaixo: TrendingDown,
    prejuizo: AlertTriangle,
    incompleto: CircleDashed,
  };

  const FIELD_LABELS = {
    custo_unitario: 'Custo',
    preco: 'Venda',
    margem_desejada: 'Meta',
    taxa_plataforma: 'Taxa',
  };

  const FIELD_ARIA_LABELS = {
    custo_unitario: (nome) => `Custo de ${nome}`,
    preco: (nome) => `Preço de venda de ${nome}`,
    margem_desejada: (nome) => `Margem desejada de ${nome}`,
    taxa_plataforma: (nome) => `Taxa da plataforma de ${nome}`,
  };

  let ownerUserId = $state(/** @type {string | null} */ (null));
  let isSubUser = $state(false);
  let canEdit = $derived(!isSubUser || !!(permissions && permissions['produtos.gerenciar']));
  /** @type {Record<string, boolean> | null} */
  let permissions = $state(null);

  let ready = $state(false);
  let loading = $state(true);
  let loadError = $state('');

  let rows = $state(/** @type {any[]} */ ([]));
  /** @type {Map<string|number, {preco:number, custo_unitario:number|null, margem_desejada:number}>} */
  let savedValues = new Map();

  // Estado de feedback de salvamento por campo (`${id}:${field}` -> 'saved').
  // Objeto simples reativo via $state; 'saving' não precisa de estado visual
  // próprio hoje, só bloqueia reentrância indiretamente pelo fluxo async.
  let fieldStatus = $state(/** @type {Record<string, 'saving'|'saved'>} */ ({}));
  const saveTimers = {};
  let liveMessage = $state('');

  function fieldKey(id, field) {
    return `${id}:${field}`;
  }

  function scheduleClearSaved(key) {
    if (saveTimers[key]) clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(() => {
      delete fieldStatus[key];
      delete saveTimers[key];
    }, 1500);
  }

  let sortBy = $state('nome');
  const sortOptions = [
    { value: 'nome', label: 'Nome' },
    { value: 'margem', label: 'Margem' },
    { value: 'status', label: 'Status' },
  ];

  let vendaWarningAcknowledged = $state(false);

  let importOpen = $state(false);
  let wizardOpen = $state(false);

  onMount(async () => {
    try {
      vendaWarningAcknowledged = sessionStorage.getItem(VENDA_WARNING_KEY) === '1';
    } catch {}

    const authCtx = await ensureActiveSubscription({ requireProfile: true });
    if (!authCtx) return;
    ownerUserId = authCtx.ownerUserId;
    isSubUser = authCtx.isSubUser;
    permissions = authCtx.permissions || null;
    ready = true;
    await loadRows();
  });

  function normalizeRow(p) {
    return {
      id: p.id,
      nome: p.nome,
      preco: Number(p.preco ?? 0),
      custo_unitario: p.custo_unitario == null ? null : Number(p.custo_unitario),
      margem_desejada: p.margem_desejada == null ? DEFAULT_MARGEM_DESEJADA : Number(p.margem_desejada),
      taxa_plataforma: p.taxa_plataforma == null ? null : Number(p.taxa_plataforma),
      tipo_produto: p.tipo_produto,
    };
  }

  async function loadRows() {
    if (!ownerUserId) return;
    loading = true;
    loadError = '';
    try {
      const { data, error } = await supabase
        .from('produtos')
        .select('id, nome, preco, custo_unitario, margem_desejada, taxa_plataforma, tipo_produto')
        .eq('id_usuario', ownerUserId)
        .eq('na_precificacao', true)
        .order('nome');
      if (error) throw error;
      const normalized = (data || []).map(normalizeRow);
      rows = normalized;
      savedValues = new Map(
        normalized.map((r) => [
          r.id,
          { preco: r.preco, custo_unitario: r.custo_unitario, margem_desejada: r.margem_desejada, taxa_plataforma: r.taxa_plataforma },
        ])
      );
    } catch (err) {
      console.error('[PricingSheet] loadRows', err);
      loadError = 'Não foi possível carregar a planilha de preços. Tente novamente.';
    } finally {
      loading = false;
    }
  }

  function findRow(id) {
    return rows.find((r) => r.id === id);
  }

  function updateRow(id, field, value) {
    const row = findRow(id);
    if (row) row[field] = value;
  }

  async function commitField(id, field, dbColumn) {
    if (!canEdit) return;
    const row = findRow(id);
    const saved = savedValues.get(id);
    if (!row || !saved) return;
    const current = row[field];
    const previous = saved[field];
    if (current === previous) return;

    // `produtos.preco` é NOT NULL — venda vazia/zerada nunca pode ir ao banco.
    if (field === 'preco' && !(current > 0)) {
      row[field] = previous;
      addToast('O preço de venda precisa ser maior que zero.', 'error');
      return;
    }

    if (field === 'preco' && !vendaWarningAcknowledged) {
      const ok = await confirmAction('Alterar preço de venda', 'Isso muda o preço cobrado no caixa.');
      if (!ok) {
        row[field] = previous;
        return;
      }
      vendaWarningAcknowledged = true;
      try {
        sessionStorage.setItem(VENDA_WARNING_KEY, '1');
      } catch {}
    }

    const key = fieldKey(id, field);
    fieldStatus[key] = 'saving';

    const { data, error } = await supabase
      .from('produtos')
      .update({ [dbColumn]: current })
      .eq('id', id)
      .eq('id_usuario', ownerUserId)
      .select('id');

    // RLS nega em silêncio: um update sem permissão retorna 0 linhas e sem erro.
    if (error || !data?.length) {
      console.error('[PricingSheet] commitField', field, error || 'nenhuma linha atualizada');
      row[field] = previous;
      delete fieldStatus[key];
      addToast('Não foi possível salvar a alteração. Tente novamente.', 'error');
      return;
    }

    saved[field] = current;
    fieldStatus[key] = 'saved';
    liveMessage = `${FIELD_LABELS[field]} de ${row.nome} salvo.`;
    scheduleClearSaved(key);

    if (field === 'preco') {
      pdvCache.invalidateProdutos();
      if (isSubUser) {
        logAuditAction({
          ownerUserId,
          action: 'produto.preco_editado_planilha',
          entityType: 'produto',
          entityId: String(id),
          details: { antes: previous, depois: current, nome: row.nome },
        });
      }
    }
  }

  // Campo de dinheiro (digits-as-cents): string vazia/sem dígito vira null
  // (custo/venda "ausente" para computeRow), não 0 — 0 é um valor válido e
  // distinto de "não preenchido" no módulo de cálculo.
  function parseMoneyFieldValue(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    return digits ? parseCurrencyInput(raw) : null;
  }

  function onCurrencyInput(id, field, event) {
    const parsed = parseMoneyFieldValue(event.currentTarget.value);
    updateRow(id, field, parsed);
    // Se o texto digitado não muda o valor parseado (ex.: caractere não
    // numérico, ou mesmo dígito de antes), Svelte não re-renderiza o input
    // (o `value` vinculado não mudou) e o texto cru digitado fica na tela —
    // força a reformatação manualmente.
    event.currentTarget.value = formatCurrencyInput(parsed);
  }

  function onMetaInput(id, event) {
    const raw = Number(event.currentTarget.value);
    const clamped = Number.isFinite(raw) ? Math.min(99.9, Math.max(0, raw)) : DEFAULT_MARGEM_DESEJADA;
    updateRow(id, 'margem_desejada', clamped);
  }

  // Taxa vazia ou 0 vira null no banco (produto sem taxa de plataforma).
  function onTaxaInput(id, event) {
    const raw = event.currentTarget.value;
    if (raw === '') {
      updateRow(id, 'taxa_plataforma', null);
      return;
    }
    const num = Number(raw);
    const clamped = Number.isFinite(num) ? Math.min(MAX_TAXA_PLATAFORMA, Math.max(0, num)) : null;
    updateRow(id, 'taxa_plataforma', clamped ? clamped : null);
  }

  function commitOnEnter(event) {
    if (event.key === 'Enter') event.currentTarget.blur();
  }

  async function removeFromSheet(row) {
    if (!canEdit) return;
    const ok = await confirmAction(
      'Tirar da planilha',
      `"${row.nome}" sai da planilha de preços, mas continua no cadastro de produtos do PDV.`
    );
    if (!ok) return;
    const { data, error } = await supabase
      .from('produtos')
      .update({ na_precificacao: false })
      .eq('id', row.id)
      .eq('id_usuario', ownerUserId)
      .select('id');
    if (error || !data?.length) {
      console.error('[PricingSheet] removeFromSheet', error || 'nenhuma linha atualizada');
      addToast('Não foi possível remover o produto da planilha. Tente novamente.', 'error');
      return;
    }
    rows = rows.filter((r) => r.id !== row.id);
    savedValues.delete(row.id);
    addToast('Produto removido da planilha.', 'success');
  }

  function openImport() {
    importOpen = true;
  }

  function closeImport() {
    importOpen = false;
  }

  async function onImported(count, total) {
    closeImport();
    if (total && count < total) {
      addToast(`${count} de ${total} produto(s) importado(s). Os demais não puderam ser importados.`, 'warning');
    } else {
      addToast(`${count} produto(s) importado(s) para a planilha.`, 'success');
    }
    await loadRows();
  }

  function openWizard() {
    wizardOpen = true;
  }

  function closeWizard() {
    wizardOpen = false;
  }

  function onWizardSaved(data) {
    const row = normalizeRow(data);
    rows = [...rows, row];
    savedValues.set(row.id, {
      preco: row.preco,
      custo_unitario: row.custo_unitario,
      margem_desejada: row.margem_desejada,
      taxa_plataforma: row.taxa_plataforma,
    });
  }

  let rowsWithCalc = $derived.by(() =>
    rows.map((r) => ({
      ...r,
      calc: computeRow({ custo: r.custo_unitario, venda: r.preco, margemDesejada: r.margem_desejada, taxaPlataforma: r.taxa_plataforma }),
    }))
  );

  const statusOrder = { prejuizo: 0, abaixo: 1, incompleto: 2, ok: 3 };

  let displayedRows = $derived.by(() => {
    const list = [...rowsWithCalc];
    if (sortBy === 'nome') {
      list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    } else if (sortBy === 'margem') {
      list.sort((a, b) => {
        const ma = a.calc.margem;
        const mb = b.calc.margem;
        if (ma == null && mb == null) return a.nome.localeCompare(b.nome, 'pt-BR');
        if (ma == null) return 1;
        if (mb == null) return -1;
        return ma - mb;
      });
    } else if (sortBy === 'status') {
      list.sort((a, b) => {
        const diff = statusOrder[a.calc.status] - statusOrder[b.calc.status];
        return diff !== 0 ? diff : a.nome.localeCompare(b.nome, 'pt-BR');
      });
    }
    return list;
  });

  let summary = $derived.by(() =>
    summarize(
      rows.map((r) => ({ custo: r.custo_unitario, venda: r.preco, margemDesejada: r.margem_desejada, taxaPlataforma: r.taxa_plataforma }))
    )
  );

  let sortLabel = $derived(sortOptions.find((o) => o.value === sortBy)?.label ?? 'Nome');

  function statusClass(status) {
    return `status-chip status-${status}`;
  }

  // Uma linha só, em português claro, no lugar dos 9 números da versão antiga.
  function primaryLineText(calc) {
    if (calc.status === 'incompleto') return 'Informe custo e preço de venda para calcular a margem.';
    if (calc.status === 'prejuizo') return 'Prejuízo: a venda não cobre o custo.';
    return `Margem ${formatPercent(calc.margem)} · meta ${formatPercent(calc.meta)}`;
  }

  function secondaryLineText(calc) {
    if (calc.diferenca == null || calc.diferenca <= 0) return '';
    return `Para bater a meta: cobre ${formatMoney(calc.sugerido)} (+${formatMoney(calc.diferenca)})`;
  }

  function lineTone(status) {
    if (status === 'prejuizo') return 'error';
    if (status === 'abaixo') return 'warning';
    return 'neutral';
  }
</script>

<div class="pricing-sheet">
  <span class="sr-only" role="status" aria-live="polite">{liveMessage}</span>

  {#if !ready}
    <div class="state-block">
      <Loader2 class="w-6 h-6 animate-spin" aria-hidden="true" />
      <span>Carregando planilha de preços...</span>
    </div>
  {:else}
    {#if !canEdit}
      <p class="readonly-note">Você está vendo a planilha em modo leitura. Fale com o titular da conta para editar preços.</p>
    {/if}

    <!-- Resumo -->
    <div class="summary-grid">
      <div class="summary-card">
        <span class="summary-label">Produtos na planilha</span>
        <strong class="summary-value">{summary.total}</strong>
      </div>
      <div class="summary-card">
        <span class="summary-label">Margem média</span>
        <strong class="summary-value">{formatPercent(summary.margemMedia)}</strong>
      </div>
      <div class="summary-card">
        <span class="summary-label">CMV médio</span>
        <strong class="summary-value">{formatPercent(summary.cmvMedio)}</strong>
      </div>
      <div class="summary-card">
        <span class="summary-label">Abaixo da meta</span>
        <strong
          class="summary-value"
          style={`color: ${summary.abaixoDaMeta > 0 ? 'var(--status-warning-text)' : 'var(--text-main)'};`}
        >
          {summary.abaixoDaMeta}
          {#if summary.emPrejuizo > 0}
            <span class="summary-sub" style="color: var(--status-error-text);">(+{summary.emPrejuizo} em prejuízo)</span>
          {/if}
        </strong>
      </div>
    </div>

    <details class="help-disclosure">
      <summary class="help-disclosure-summary">
        <Info class="help-disclosure-icon" size={15} aria-hidden="true" />
        O que é CMV e margem?
      </summary>
      <div class="help-disclosure-content">
        <p><strong>CMV:</strong> quanto do preço de venda vai só para pagar o custo do produto.</p>
        <p><strong>Margem:</strong> quanto sobra de cada venda antes das despesas fixas do negócio.</p>
        <p><strong>Taxa do app:</strong> quanto a plataforma fica de cada venda. Ela entra na margem e no preço sugerido.</p>
      </div>
    </details>

    <!-- Toolbar: adicionar produto (abre o wizard) / importar do cadastro -->
    {#if canEdit}
      <div class="toolbar-row">
        <Button type="button" class="toolbar-add-btn" onclick={openWizard}>
          <Plus class="w-4 h-4" aria-hidden="true" />
          Adicionar produto
        </Button>
        <button type="button" class="link-btn" onclick={openImport}>Importar do meu cadastro</button>
      </div>
    {/if}

    <!-- Planilha -->
    <div class="sheet-shell">
      <div class="sheet-toolbar">
        <h2 class="sheet-title">Planilha de preços</h2>
        <label class="sort-control">
          <ArrowUpDown class="w-3.5 h-3.5" aria-hidden="true" />
          <Select.Root bind:value={sortBy}>
            <Select.Trigger class="field-input sort-trigger">
              {sortLabel}
            </Select.Trigger>
            <Select.Content>
              {#each sortOptions as opt}
                <Select.Item value={opt.value} label={opt.label} />
              {/each}
            </Select.Content>
          </Select.Root>
        </label>
      </div>

      {#if loading}
        <div class="state-block">
          <Loader2 class="w-6 h-6 animate-spin" aria-hidden="true" />
          <span>Carregando produtos...</span>
        </div>
      {:else if loadError}
        <div class="load-error-block">
          <span>{loadError}</span>
          <Button variant="outline" size="sm" onclick={loadRows}>Tentar de novo</Button>
        </div>
      {:else if displayedRows.length === 0}
        <div class="empty-state">
          <p>Adicione seu primeiro produto ou importe do cadastro.</p>
          {#if canEdit}
            <Button type="button" onclick={openWizard}>
              <Plus class="w-4 h-4" aria-hidden="true" />
              Adicione seu primeiro produto
            </Button>
            <button type="button" class="link-btn" onclick={openImport}>Importar do meu cadastro</button>
          {/if}
        </div>
      {:else}
        <!-- Mobile: linhas dentro de um único frame -->
        <div class="mobile-rows">
          {#each displayedRows as row (row.id)}
            {@const Icon = STATUS_ICON[row.calc.status]}
            {@const primary = primaryLineText(row.calc)}
            {@const secondary = secondaryLineText(row.calc)}
            {@const tone = lineTone(row.calc.status)}
            <div class="mobile-row">
              <div class="mobile-row-head">
                <strong class="mobile-row-name">{row.nome}</strong>
                <span class={statusClass(row.calc.status)}>
                  <Icon class="w-3 h-3" aria-hidden="true" />
                  {STATUS_LABELS[row.calc.status]}
                </span>
              </div>
              <div class="mobile-fields">
                <label class="mobile-field">
                  <span class="field-label">Custo</span>
                  <div class="currency-field">
                    <span class="currency-prefix" aria-hidden="true">R$</span>
                    <input
                      class="field-input currency-input tabular-nums"
                      class:input-missing-custo={row.custo_unitario == null}
                      type="text"
                      inputmode="numeric"
                      placeholder="0,00"
                      value={formatCurrencyInput(row.custo_unitario)}
                      oninput={(e) => onCurrencyInput(row.id, 'custo_unitario', e)}
                      onblur={() => commitField(row.id, 'custo_unitario', 'custo_unitario')}
                      onkeydown={commitOnEnter}
                      disabled={!canEdit}
                      aria-label={FIELD_ARIA_LABELS.custo_unitario(row.nome)}
                      aria-describedby={row.custo_unitario == null ? `custo-missing-m-${row.id}` : undefined}
                    />
                    {#if fieldStatus[fieldKey(row.id, 'custo_unitario')] === 'saved'}
                      <Check class="save-check" aria-hidden="true" />
                    {/if}
                  </div>
                  {#if row.custo_unitario == null}
                    <span id={`custo-missing-m-${row.id}`} class="missing-custo-hint">
                      <AlertTriangle class="w-3.5 h-3.5" aria-hidden="true" />
                      Sem custo
                    </span>
                  {/if}
                </label>
                <label class="mobile-field">
                  <span class="field-label">Venda</span>
                  <div class="currency-field">
                    <span class="currency-prefix" aria-hidden="true">R$</span>
                    <input
                      class="field-input currency-input tabular-nums"
                      type="text"
                      inputmode="numeric"
                      placeholder="0,00"
                      value={formatCurrencyInput(row.preco)}
                      oninput={(e) => onCurrencyInput(row.id, 'preco', e)}
                      onblur={() => commitField(row.id, 'preco', 'preco')}
                      onkeydown={commitOnEnter}
                      disabled={!canEdit}
                      aria-label={FIELD_ARIA_LABELS.preco(row.nome)}
                    />
                    {#if fieldStatus[fieldKey(row.id, 'preco')] === 'saved'}
                      <Check class="save-check" aria-hidden="true" />
                    {/if}
                  </div>
                </label>
                <label class="mobile-field">
                  <span class="field-label">Meta %</span>
                  <div class="meta-field-wrap">
                    <input
                      class="field-input tabular-nums"
                      type="number"
                      min="0"
                      max="99.9"
                      step="0.1"
                      value={row.margem_desejada}
                      oninput={(e) => onMetaInput(row.id, e)}
                      onblur={() => commitField(row.id, 'margem_desejada', 'margem_desejada')}
                      onkeydown={commitOnEnter}
                      disabled={!canEdit}
                      aria-label={FIELD_ARIA_LABELS.margem_desejada(row.nome)}
                    />
                    {#if fieldStatus[fieldKey(row.id, 'margem_desejada')] === 'saved'}
                      <Check class="save-check" aria-hidden="true" />
                    {/if}
                  </div>
                </label>
                <label class="mobile-field">
                  <span class="field-label">Taxa app %</span>
                  <div class="meta-field-wrap">
                    <input
                      class="field-input tabular-nums"
                      type="number"
                      min="0"
                      max={MAX_TAXA_PLATAFORMA}
                      step="0.1"
                      value={row.taxa_plataforma}
                      oninput={(e) => onTaxaInput(row.id, e)}
                      onblur={() => commitField(row.id, 'taxa_plataforma', 'taxa_plataforma')}
                      onkeydown={commitOnEnter}
                      disabled={!canEdit}
                      aria-label={FIELD_ARIA_LABELS.taxa_plataforma(row.nome)}
                    />
                    {#if fieldStatus[fieldKey(row.id, 'taxa_plataforma')] === 'saved'}
                      <Check class="save-check" aria-hidden="true" />
                    {/if}
                  </div>
                </label>
              </div>

              <div class="mobile-primary">
                <p class="mobile-primary-line" class:tone-warning={tone === 'warning'} class:tone-error={tone === 'error'}>
                  {primary}
                </p>
                {#if secondary}
                  <p class="mobile-secondary-line" class:tone-warning={tone === 'warning'} class:tone-error={tone === 'error'}>
                    {secondary}
                  </p>
                {/if}
              </div>

              <details class="row-details">
                <summary class="row-details-summary">Ver detalhes</summary>
                <div class="row-details-grid">
                  <div class="row-details-item">
                    <span class="detail-label">CMV</span>
                    <strong class="detail-value">{formatPercent(row.calc.cmv)}</strong>
                  </div>
                  <div class="row-details-item">
                    <span class="detail-label">Lucro/un</span>
                    <strong class="detail-value">{row.calc.lucro == null ? '—' : formatMoney(row.calc.lucro)}</strong>
                  </div>
                  <div class="row-details-item">
                    <span class="detail-label">Markup</span>
                    <strong class="detail-value">{formatMarkup(row.calc.markup)}</strong>
                  </div>
                  <div class="row-details-item">
                    <span class="detail-label">Sugerido</span>
                    <strong class="detail-value">{row.calc.sugerido == null ? '—' : formatMoney(row.calc.sugerido)}</strong>
                  </div>
                  <div class="row-details-item">
                    <span class="detail-label">Taxa por venda</span>
                    <strong class="detail-value">{row.calc.taxaValor ? formatMoney(row.calc.taxaValor) : '—'}</strong>
                  </div>
                </div>
              </details>

              {#if canEdit}
                <button type="button" class="remove-btn" onclick={() => removeFromSheet(row)}>
                  <Trash2 class="w-3.5 h-3.5" aria-hidden="true" />
                  Tirar da planilha
                </button>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Desktop: tabela -->
        <div class="desktop-table">
          <table class="sheet-table">
            <thead>
              <tr>
                <th scope="col" class="col-header text-left px-3 py-2">Produto</th>
                <th scope="col" class="col-header text-right px-3 py-2">Custo</th>
                <th scope="col" class="col-header text-right px-3 py-2">Venda</th>
                <th scope="col" class="col-header text-right px-3 py-2">Meta</th>
                <th scope="col" class="col-header text-right px-3 py-2">Taxa</th>
                <th scope="col" class="col-header text-right px-3 py-2">Margem</th>
                <th scope="col" class="col-header text-right px-3 py-2">CMV</th>
                <th scope="col" class="col-header text-right px-3 py-2">Sugerido</th>
                <th scope="col" class="col-header px-3 py-2"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {#each displayedRows as row (row.id)}
                {@const Icon = STATUS_ICON[row.calc.status]}
                <tr>
                  <td class="px-3 py-2 row-name-cell">
                    <div class="row-name">{row.nome}</div>
                    <span class={statusClass(row.calc.status)}>
                      <Icon class="w-3 h-3" aria-hidden="true" />
                      {STATUS_LABELS[row.calc.status]}
                    </span>
                  </td>
                  <td class="px-3 py-2 text-right">
                    <div class="currency-field cell-currency">
                      <span class="currency-prefix" aria-hidden="true">R$</span>
                      <input
                        class="cell-input currency-input tabular-nums"
                        class:input-missing-custo={row.custo_unitario == null}
                        type="text"
                        inputmode="numeric"
                        placeholder="0,00"
                        value={formatCurrencyInput(row.custo_unitario)}
                        oninput={(e) => onCurrencyInput(row.id, 'custo_unitario', e)}
                        onblur={() => commitField(row.id, 'custo_unitario', 'custo_unitario')}
                        onkeydown={commitOnEnter}
                        disabled={!canEdit}
                        aria-label={FIELD_ARIA_LABELS.custo_unitario(row.nome)}
                        aria-describedby={row.custo_unitario == null ? `custo-missing-d-${row.id}` : undefined}
                      />
                      {#if fieldStatus[fieldKey(row.id, 'custo_unitario')] === 'saved'}
                        <Check class="save-check" aria-hidden="true" />
                      {/if}
                    </div>
                    {#if row.custo_unitario == null}
                      <span id={`custo-missing-d-${row.id}`} class="missing-custo-hint missing-custo-hint-table">
                        <AlertTriangle class="w-3.5 h-3.5" aria-hidden="true" />
                        Sem custo
                      </span>
                    {/if}
                  </td>
                  <td class="px-3 py-2 text-right">
                    <div class="currency-field cell-currency">
                      <span class="currency-prefix" aria-hidden="true">R$</span>
                      <input
                        class="cell-input currency-input tabular-nums"
                        type="text"
                        inputmode="numeric"
                        placeholder="0,00"
                        value={formatCurrencyInput(row.preco)}
                        oninput={(e) => onCurrencyInput(row.id, 'preco', e)}
                        onblur={() => commitField(row.id, 'preco', 'preco')}
                        onkeydown={commitOnEnter}
                        disabled={!canEdit}
                        aria-label={FIELD_ARIA_LABELS.preco(row.nome)}
                      />
                      {#if fieldStatus[fieldKey(row.id, 'preco')] === 'saved'}
                        <Check class="save-check" aria-hidden="true" />
                      {/if}
                    </div>
                  </td>
                  <td class="px-3 py-2 text-right">
                    <div class="meta-field-wrap">
                      <input
                        class="cell-input cell-meta tabular-nums"
                        type="number"
                        min="0"
                        max="99.9"
                        step="0.1"
                        value={row.margem_desejada}
                        oninput={(e) => onMetaInput(row.id, e)}
                        onblur={() => commitField(row.id, 'margem_desejada', 'margem_desejada')}
                        onkeydown={commitOnEnter}
                        disabled={!canEdit}
                        aria-label={FIELD_ARIA_LABELS.margem_desejada(row.nome)}
                      />
                      {#if fieldStatus[fieldKey(row.id, 'margem_desejada')] === 'saved'}
                        <Check class="save-check" aria-hidden="true" />
                      {/if}
                    </div>
                  </td>
                  <td class="px-3 py-2 text-right">
                    <div class="meta-field-wrap">
                      <input
                        class="cell-input cell-meta tabular-nums"
                        type="number"
                        min="0"
                        max={MAX_TAXA_PLATAFORMA}
                        step="0.1"
                        value={row.taxa_plataforma}
                        oninput={(e) => onTaxaInput(row.id, e)}
                        onblur={() => commitField(row.id, 'taxa_plataforma', 'taxa_plataforma')}
                        onkeydown={commitOnEnter}
                        disabled={!canEdit}
                        aria-label={FIELD_ARIA_LABELS.taxa_plataforma(row.nome)}
                      />
                      {#if fieldStatus[fieldKey(row.id, 'taxa_plataforma')] === 'saved'}
                        <Check class="save-check" aria-hidden="true" />
                      {/if}
                    </div>
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">
                    <div class="margem-cell">
                      <span>{formatPercent(row.calc.margem)}</span>
                      {#if row.calc.taxaValor}
                        <span class="margem-hint">Taxa {formatMoney(row.calc.taxaValor)}</span>
                      {/if}
                    </div>
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">{formatPercent(row.calc.cmv)}</td>
                  <td class="px-3 py-2 text-right tabular-nums">
                    <div class="sugerido-cell">
                      <strong>{row.calc.sugerido == null ? '—' : formatMoney(row.calc.sugerido)}</strong>
                      {#if row.calc.diferenca > 0}
                        <span class="sugerido-hint">+{formatMoney(row.calc.diferenca)}</span>
                      {/if}
                    </div>
                  </td>
                  <td class="px-3 py-2 text-right">
                    {#if canEdit}
                      <button
                        type="button"
                        class="icon-btn-danger"
                        title="Tirar da planilha"
                        aria-label={`Tirar ${row.nome} da planilha`}
                        onclick={() => removeFromSheet(row)}
                      >
                        <Trash2 class="w-4 h-4" aria-hidden="true" />
                      </button>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}
</div>

{#if ready && canEdit}
  <button class="mobile-create-fab" type="button" aria-label="Adicionar produto" onclick={openWizard}>
    <Plus class="mobile-create-fab-icon" aria-hidden="true" />
  </button>
{/if}

<PricingSheetImport open={importOpen} {ownerUserId} onclose={closeImport} onimported={onImported} />
<PricingWizardModal open={wizardOpen} {ownerUserId} onclose={closeWizard} onsaved={onWizardSaved} />

<style>
  .pricing-sheet {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    max-width: 72rem;
    margin: 0 auto;
  }

  .state-block {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    padding: 2.5rem 1rem;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .load-error-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 2.5rem 1rem;
    color: var(--status-error-text);
    font-size: 0.875rem;
    text-align: center;
  }

  .readonly-note {
    margin: 0;
    padding: 0.65rem 0.9rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border-subtle);
    background: var(--bg-panel);
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  /* Disclosure "O que é CMV e margem?" — mesmo visual do InlineHelper que
     substitui (borda, raio, fundo), com o padrão de cor/peso do "Ver detalhes". */
  .help-disclosure {
    border: 1px solid var(--border-subtle);
    border-radius: 0.55rem;
    background: var(--bg-card);
    padding: 0.55rem 0.7rem;
  }

  .help-disclosure-summary {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    min-height: 44px;
    cursor: pointer;
    color: var(--primary);
    font-size: 0.875rem;
    font-weight: 600;
    list-style: none;
  }

  .help-disclosure-summary::-webkit-details-marker {
    display: none;
  }

  .help-disclosure-summary :global(svg) {
    flex: 0 0 auto;
    color: var(--primary);
  }

  .help-disclosure[open] .help-disclosure-summary {
    margin-bottom: 0.35rem;
  }

  .help-disclosure-content {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding-top: 0.15rem;
    color: var(--text-muted);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .help-disclosure-content p {
    margin: 0;
  }

  .help-disclosure-content strong {
    color: var(--text-label);
  }

  /* Resumo */
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .summary-card {
    padding: 0.9rem 1rem;
    border-radius: 0.75rem;
    border: 1px solid var(--border-subtle);
    background: var(--bg-card);
  }

  .summary-label {
    display: block;
    margin-bottom: 0.3rem;
    color: var(--text-muted);
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.18em;
  }

  .summary-value {
    display: block;
    color: var(--text-main);
    font-size: 1.25rem;
    font-weight: 700;
  }

  .summary-sub {
    display: block;
    margin-top: 0.15rem;
    font-size: 0.875rem;
    font-weight: 600;
  }

  /* Toolbar: adicionar produto / importar */
  .toolbar-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  :global(.toolbar-add-btn) {
    display: none;
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

  .field-input {
    display: block;
    width: 100%;
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

  .field-input:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  /* Custo ausente na planilha: destaca o campo para o dono preencher. */
  .field-input.input-missing-custo,
  .cell-input.input-missing-custo {
    border-color: var(--status-warning-border);
  }

  .field-input.input-missing-custo:focus,
  .cell-input.input-missing-custo:focus {
    box-shadow: 0 0 0 1px var(--status-warning-border);
  }

  .missing-custo-hint {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.35rem;
    color: var(--status-warning-text);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .missing-custo-hint-table {
    margin-top: 0.3rem;
    justify-content: flex-end;
    width: 100%;
  }

  .currency-field,
  .meta-field-wrap {
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

  .save-check {
    position: absolute;
    top: 50%;
    right: 0.6rem;
    width: 1rem;
    height: 1rem;
    transform: translateY(-50%);
    color: var(--status-success-text);
    opacity: 0;
    pointer-events: none;
    animation: save-check-fade 1.5s ease forwards;
  }

  @keyframes save-check-fade {
    0% { opacity: 0; }
    10% { opacity: 1; }
    80% { opacity: 1; }
    100% { opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .save-check {
      animation: none;
      opacity: 1;
    }
  }

  .link-btn {
    background: transparent;
    border: 0;
    padding: 0;
    color: var(--primary);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .link-btn:hover {
    text-decoration: underline;
  }

  /* Planilha */
  .sheet-shell {
    border-radius: 0.75rem;
    border: 1px solid var(--border-card);
    background: var(--bg-card);
    overflow: hidden;
  }

  .sheet-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.9rem 1rem;
    border-bottom: 1px solid var(--border-subtle);
    flex-wrap: wrap;
  }

  .sheet-title {
    margin: 0;
    color: var(--text-main);
    font-size: 1rem;
    font-weight: 700;
  }

  .sort-control {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--text-muted);
  }

  :global(.sort-trigger) {
    min-width: 9rem;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    margin: 1rem;
    padding: 2.25rem 1rem;
    border: 1px dashed var(--border-subtle);
    border-radius: 0.75rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  /* Status chip — cor nunca sozinha: ícone + texto sempre juntos. */
  :global(.status-chip) {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.6rem;
    border-radius: 9999px;
    border: 1px solid transparent;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  :global(.status-ok) {
    background: var(--status-success-bg);
    border-color: var(--status-success-border);
    color: var(--status-success-text);
  }

  :global(.status-abaixo) {
    background: var(--status-warning-bg);
    border-color: var(--status-warning-border);
    color: var(--status-warning-text);
  }

  :global(.status-prejuizo) {
    background: var(--status-error-bg);
    border-color: var(--status-error-border);
    color: var(--status-error-text);
  }

  :global(.status-incompleto) {
    background: color-mix(in srgb, white 6%, transparent);
    border-color: var(--border-subtle);
    color: var(--text-muted);
  }

  /* Mobile rows — um único frame, sem card dentro de card */
  .mobile-rows {
    display: flex;
    flex-direction: column;
  }

  .mobile-row {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    padding: 0.9rem 1rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .mobile-row:last-child {
    border-bottom: 0;
  }

  .mobile-row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .mobile-row-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-main);
    font-size: 0.875rem;
  }

  .mobile-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .mobile-field .field-input {
    min-height: 2.75rem;
  }

  .mobile-primary {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .mobile-primary-line {
    margin: 0;
    color: var(--text-label);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .mobile-secondary-line {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .tone-warning {
    color: var(--status-warning-text);
  }

  .tone-error {
    color: var(--status-error-text);
  }

  .row-details {
    border-top: 1px dashed var(--border-subtle);
    padding-top: 0.5rem;
  }

  .row-details-summary {
    cursor: pointer;
    color: var(--primary);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .row-details[open] .row-details-summary {
    margin-bottom: 0.5rem;
  }

  .row-details-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem 0.75rem;
  }

  .row-details-item {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .detail-label {
    color: var(--text-muted);
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .detail-value {
    color: var(--text-label);
    font-size: 0.875rem;
  }

  .remove-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    align-self: flex-start;
    min-height: 2.75rem;
    padding: 0.35rem 0;
    border: 0;
    background: transparent;
    color: var(--status-error-text);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .desktop-table {
    display: none;
    overflow-x: auto;
  }

  .sheet-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  .sheet-table thead tr {
    border-bottom: 1px solid var(--border-subtle);
  }

  .sheet-table tbody tr {
    border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 70%, transparent);
  }

  .sheet-table tbody tr:last-child {
    border-bottom: 0;
  }

  .row-name-cell {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.3rem;
  }

  .row-name {
    color: var(--text-main);
    font-weight: 600;
    white-space: nowrap;
  }

  .cell-currency {
    display: inline-block;
    width: 7rem;
  }

  .cell-input {
    width: 100%;
    padding: 0.35rem 0.5rem;
    border-radius: 0.375rem;
    border: 1px solid var(--border-subtle);
    background: var(--bg-input);
    color: var(--text-main);
    font-size: 0.875rem;
    outline: none;
    text-align: right;
  }

  .cell-input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 1px var(--primary);
  }

  .cell-input:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .cell-meta {
    width: 5rem;
  }

  .meta-field-wrap {
    display: inline-block;
    width: 5rem;
  }

  .sugerido-cell {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.15rem;
  }

  .sugerido-hint {
    color: var(--status-warning-text);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .margem-cell {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.1rem;
  }

  .margem-hint {
    color: var(--text-muted);
    font-size: 0.875rem;
    font-weight: 400;
  }

  .icon-btn-danger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: 0;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .icon-btn-danger:hover {
    background: var(--status-error-bg);
    color: var(--status-error-text);
  }

  .mobile-create-fab {
    display: none;
  }

  @media (min-width: 640px) {
    .summary-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @media (min-width: 768px) {
    .mobile-rows {
      display: none;
    }

    .desktop-table {
      display: block;
    }

    :global(.toolbar-add-btn) {
      display: inline-flex;
    }
  }

  @media (max-width: 767px) {
    .field-input,
    .cell-input {
      font-size: 1rem;
    }

    .mobile-create-fab {
      position: fixed;
      right: 1rem;
      bottom: calc(1rem + var(--mobile-bottom-nav-offset));
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 3.5rem;
      height: 3.5rem;
      border: 1px solid var(--primary);
      border-radius: 50%;
      background: var(--primary);
      color: var(--primary-text);
      cursor: pointer;
      transition: background var(--transition-fast), border-color var(--transition-fast);
    }

    .mobile-create-fab:hover {
      background: var(--primary-hover);
      border-color: var(--primary-hover);
    }

    .mobile-create-fab :global(svg) {
      width: 1.5rem;
      height: 1.5rem;
    }
  }
</style>

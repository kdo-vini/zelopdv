<script>
  import { onMount } from 'svelte';
  import { Trash2, Loader2, ArrowUpDown } from 'lucide-svelte';
  import { supabase } from '$lib/supabaseClient';
  import { ensureActiveSubscription } from '$lib/guards';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import { logAuditAction } from '$lib/accessControl';
  import { pdvCache } from '$lib/stores/pdvCache';
  import { formatMoney } from '$lib/formatMoney';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Select from '$lib/components/ui/select/index.js';
  import PricingSheetImport from './PricingSheetImport.svelte';
  import {
    DEFAULT_MARGEM_DESEJADA,
    STATUS_LABELS,
    computeRow,
    summarize,
    parseCurrencyInput,
    formatCurrencyInput,
    formatPercent,
  } from '$lib/tools/pricingSheet.js';

  const VENDA_WARNING_KEY = 'zelopdv_pricing_venda_warning_ack';

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

  let sortBy = $state('nome');
  const sortOptions = [
    { value: 'nome', label: 'Nome' },
    { value: 'margem', label: 'Margem' },
    { value: 'status', label: 'Status' },
  ];

  let vendaWarningAcknowledged = $state(false);

  // Form "Adicionar produto"
  let formNome = $state('');
  let formCusto = $state(/** @type {number | null} */ (null));
  let formVenda = $state(/** @type {number | null} */ (null));
  let formMeta = $state(DEFAULT_MARGEM_DESEJADA);
  let formError = $state('');
  let saving = $state(false);

  let importOpen = $state(false);

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
        .select('id, nome, preco, custo_unitario, margem_desejada, tipo_produto')
        .eq('id_usuario', ownerUserId)
        .eq('na_precificacao', true)
        .order('nome');
      if (error) throw error;
      const normalized = (data || []).map(normalizeRow);
      rows = normalized;
      savedValues = new Map(
        normalized.map((r) => [r.id, { preco: r.preco, custo_unitario: r.custo_unitario, margem_desejada: r.margem_desejada }])
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
      addToast('Não foi possível salvar a alteração. Tente novamente.', 'error');
      return;
    }

    saved[field] = current;

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

  async function addProduto(event) {
    event.preventDefault();
    formError = '';
    if (!formNome.trim()) {
      formError = 'Informe o nome do produto.';
      return;
    }
    if (!(formVenda > 0)) {
      formError = 'Informe um preço de venda maior que zero.';
      return;
    }
    saving = true;
    try {
      const payload = {
        id_usuario: ownerUserId,
        nome: formNome.trim(),
        preco: formVenda,
        custo_unitario: formCusto,
        margem_desejada: formMeta,
        na_precificacao: true,
        id_categoria: null,
      };
      const { data, error } = await supabase
        .from('produtos')
        .insert(payload)
        .select('id, nome, preco, custo_unitario, margem_desejada, tipo_produto')
        .single();
      if (error) throw error;
      const row = normalizeRow(data);
      rows = [...rows, row];
      savedValues.set(row.id, { preco: row.preco, custo_unitario: row.custo_unitario, margem_desejada: row.margem_desejada });
      pdvCache.invalidateProdutos();
      addToast('Produto adicionado à planilha!', 'success');
      formNome = '';
      formCusto = null;
      formVenda = null;
      formMeta = DEFAULT_MARGEM_DESEJADA;
    } catch (err) {
      console.error('[PricingSheet] addProduto', err);
      formError = 'Não foi possível salvar o produto. Tente novamente.';
    } finally {
      saving = false;
    }
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

  let formPreview = $derived.by(() => computeRow({ custo: formCusto, venda: formVenda, margemDesejada: formMeta }));

  let rowsWithCalc = $derived.by(() =>
    rows.map((r) => ({ ...r, calc: computeRow({ custo: r.custo_unitario, venda: r.preco, margemDesejada: r.margem_desejada }) }))
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
    summarize(rows.map((r) => ({ custo: r.custo_unitario, venda: r.preco, margemDesejada: r.margem_desejada })))
  );

  let sortLabel = $derived(sortOptions.find((o) => o.value === sortBy)?.label ?? 'Nome');

  function statusClass(status) {
    return `status-chip status-${status}`;
  }
</script>

<div class="pricing-sheet">
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
        <strong class="summary-value" style="color: var(--status-warning-text);">
          {summary.abaixoDaMeta}
          {#if summary.emPrejuizo > 0}
            <span class="summary-sub" style="color: var(--status-error-text);">(+{summary.emPrejuizo} em prejuízo)</span>
          {/if}
        </strong>
      </div>
    </div>

    <!-- Form: adicionar produto -->
    {#if canEdit}
      <form class="add-card" onsubmit={addProduto}>
        <div class="add-card-head">
          <h2 class="add-card-title">Adicionar produto</h2>
          <button type="button" class="link-btn" onclick={openImport}>Importar do meu cadastro</button>
        </div>
        <p class="add-card-copy">
          Este produto também passa a existir no cadastro do PDV, disponível para venda no caixa.
        </p>

        {#if formError}
          <div class="error-banner" role="alert">{formError}</div>
        {/if}

        <div class="add-grid">
          <label class="block">
            <span class="field-label">Nome do produto</span>
            <input class="field-input" type="text" placeholder="Ex.: Marmita executiva" bind:value={formNome} />
          </label>
          <label class="block">
            <span class="field-label">Preço de compra (custo)</span>
            <div class="currency-field">
              <span class="currency-prefix" aria-hidden="true">R$</span>
              <input
                class="field-input currency-input tabular-nums"
                type="text"
                inputmode="numeric"
                placeholder="0,00"
                value={formatCurrencyInput(formCusto)}
                oninput={(e) => {
                  formCusto = parseMoneyFieldValue(e.currentTarget.value);
                  e.currentTarget.value = formatCurrencyInput(formCusto);
                }}
              />
            </div>
          </label>
          <label class="block">
            <span class="field-label">Preço de venda</span>
            <div class="currency-field">
              <span class="currency-prefix" aria-hidden="true">R$</span>
              <input
                class="field-input currency-input tabular-nums"
                type="text"
                inputmode="numeric"
                placeholder="0,00"
                value={formatCurrencyInput(formVenda)}
                oninput={(e) => {
                  formVenda = parseMoneyFieldValue(e.currentTarget.value);
                  e.currentTarget.value = formatCurrencyInput(formVenda);
                }}
              />
            </div>
          </label>
          <label class="block">
            <span class="field-label">Margem desejada (%)</span>
            <input
              class="field-input tabular-nums"
              type="number"
              min="0"
              max="99.9"
              step="0.1"
              value={formMeta}
              oninput={(e) => {
                const raw = Number(e.currentTarget.value);
                formMeta = Number.isFinite(raw) ? Math.min(99.9, Math.max(0, raw)) : DEFAULT_MARGEM_DESEJADA;
              }}
            />
          </label>
        </div>

        <div class="preview-row">
          <div class="preview-item">
            <span>CMV</span>
            <strong>{formatPercent(formPreview.cmv)}</strong>
          </div>
          <div class="preview-item">
            <span>Margem</span>
            <strong>{formatPercent(formPreview.margem)}</strong>
          </div>
          <div class="preview-item">
            <span>Lucro/un</span>
            <strong>{formPreview.lucro == null ? '—' : formatMoney(formPreview.lucro)}</strong>
          </div>
          <div class="preview-item">
            <span>Preço sugerido</span>
            <strong>{formPreview.sugerido == null ? '—' : formatMoney(formPreview.sugerido)}</strong>
          </div>
        </div>

        <div class="add-actions">
          <Button type="submit" disabled={saving}>
            {#if saving}<Loader2 class="w-4 h-4 animate-spin" aria-hidden="true" />{/if}
            Salvar
          </Button>
        </div>
      </form>
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
        <div class="state-block error-text">{loadError}</div>
      {:else if displayedRows.length === 0}
        <div class="empty-state">
          <p>Adicione seu primeiro produto ou importe do cadastro.</p>
          {#if canEdit}
            <button type="button" class="link-btn" onclick={openImport}>Importar do meu cadastro</button>
          {/if}
        </div>
      {:else}
        <!-- Mobile: linhas dentro de um único frame -->
        <div class="mobile-rows">
          {#each displayedRows as row (row.id)}
            <div class="mobile-row">
              <div class="mobile-row-head">
                <strong class="mobile-row-name">{row.nome}</strong>
                <span class={statusClass(row.calc.status)}>{STATUS_LABELS[row.calc.status]}</span>
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
                    />
                  </div>
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
                    />
                  </div>
                </label>
                <label class="mobile-field">
                  <span class="field-label">Meta %</span>
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
                  />
                </label>
              </div>
              <div class="mobile-calc">
                <div><span>CMV</span><strong>{formatPercent(row.calc.cmv)}</strong></div>
                <div><span>Margem</span><strong>{formatPercent(row.calc.margem)}</strong></div>
                <div><span>Lucro/un</span><strong>{row.calc.lucro == null ? '—' : formatMoney(row.calc.lucro)}</strong></div>
                <div><span>Sugerido</span><strong>{row.calc.sugerido == null ? '—' : formatMoney(row.calc.sugerido)}</strong></div>
              </div>
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
                <th class="col-header text-left px-3 py-2">Produto</th>
                <th class="col-header text-right px-3 py-2">Custo</th>
                <th class="col-header text-right px-3 py-2">Venda</th>
                <th class="col-header text-right px-3 py-2">Margem desejada</th>
                <th class="col-header text-right px-3 py-2">CMV</th>
                <th class="col-header text-right px-3 py-2">Margem</th>
                <th class="col-header text-right px-3 py-2">Lucro/un</th>
                <th class="col-header text-right px-3 py-2">Sugerido</th>
                <th class="col-header text-left px-3 py-2">Status</th>
                <th class="col-header px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {#each displayedRows as row (row.id)}
                <tr>
                  <td class="px-3 py-2 row-name">{row.nome}</td>
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
                      />
                    </div>
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
                      />
                    </div>
                  </td>
                  <td class="px-3 py-2 text-right">
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
                    />
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">{formatPercent(row.calc.cmv)}</td>
                  <td class="px-3 py-2 text-right tabular-nums">{formatPercent(row.calc.margem)}</td>
                  <td class="px-3 py-2 text-right tabular-nums">{row.calc.lucro == null ? '—' : formatMoney(row.calc.lucro)}</td>
                  <td class="px-3 py-2 text-right tabular-nums">{row.calc.sugerido == null ? '—' : formatMoney(row.calc.sugerido)}</td>
                  <td class="px-3 py-2">
                    <span class={statusClass(row.calc.status)}>{STATUS_LABELS[row.calc.status]}</span>
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

<PricingSheetImport open={importOpen} {ownerUserId} onclose={closeImport} onimported={onImported} />

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
    font-size: 0.9rem;
  }

  .error-text {
    color: var(--status-error-text);
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
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
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
    font-size: 0.75rem;
    font-weight: 600;
  }

  /* Form adicionar produto */
  .add-card {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 1.1rem;
    border-radius: 0.85rem;
    border: 1px solid var(--border-card);
    background: var(--bg-card);
  }

  .add-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .add-card-title {
    margin: 0;
    color: var(--text-main);
    font-size: 1rem;
    font-weight: 700;
  }

  .add-card-copy {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .add-grid {
    display: grid;
    grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: 0.85rem;
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

  .preview-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
    padding: 0.75rem;
    border-radius: 0.6rem;
    border: 1px dashed var(--border-subtle);
    background: var(--bg-panel);
  }

  .preview-item {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .preview-item span {
    color: var(--text-muted);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .preview-item strong {
    color: var(--text-main);
    font-size: 1rem;
  }

  .add-actions {
    display: flex;
    justify-content: flex-end;
  }

  .link-btn {
    background: transparent;
    border: 0;
    padding: 0;
    color: var(--primary);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
  }

  .link-btn:hover {
    text-decoration: underline;
  }

  .error-banner {
    padding: 0.6rem 0.85rem;
    border-radius: 0.5rem;
    border: 1px solid color-mix(in srgb, var(--error) 25%, transparent);
    background: color-mix(in srgb, var(--error) 10%, transparent);
    color: var(--status-error-text);
    font-size: 0.875rem;
  }

  /* Planilha */
  .sheet-shell {
    border-radius: 0.85rem;
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
    font-size: 0.95rem;
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
    font-size: 0.9rem;
  }

  /* Status chip */
  :global(.status-chip) {
    display: inline-flex;
    align-items: center;
    padding: 0.2rem 0.6rem;
    border-radius: 9999px;
    border: 1px solid transparent;
    font-size: 0.7rem;
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
    gap: 0.6rem;
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
    font-size: 0.9rem;
  }

  .mobile-fields {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .mobile-field .field-input {
    min-height: 2.5rem;
  }

  .mobile-calc {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.4rem 0.75rem;
    padding-top: 0.4rem;
    border-top: 1px dashed var(--border-subtle);
  }

  .mobile-calc div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .mobile-calc span {
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .mobile-calc strong {
    color: var(--text-label);
    font-size: 0.8125rem;
  }

  .remove-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    align-self: flex-start;
    padding: 0.35rem 0;
    border: 0;
    background: transparent;
    color: var(--status-error-text);
    font-size: 0.75rem;
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
    font-size: 0.8125rem;
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
    border-radius: 0.4rem;
    border: 1px solid var(--border-subtle);
    background: var(--bg-input);
    color: var(--text-main);
    font-size: 0.8125rem;
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

  .icon-btn-danger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: 0;
    border-radius: 0.4rem;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .icon-btn-danger:hover {
    background: var(--status-error-bg);
    color: var(--status-error-text);
  }

  @media (min-width: 640px) {
    .summary-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .add-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 768px) {
    .mobile-rows {
      display: none;
    }

    .desktop-table {
      display: block;
    }
  }

  @media (max-width: 767px) {
    .field-input,
    .cell-input {
      font-size: 1rem;
    }
  }
</style>

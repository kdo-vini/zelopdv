<script>
  import { onMount, onDestroy } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { ensureActiveSubscription } from '$lib/guards';
  import { addToast } from '$lib/stores/ui';
  import {
    STANDARD_PAYMENT_FORMS,
    calculateExpectedDrawer,
    calculateMovementSummary,
    calculatePaymentSummary,
    calculatePlatformFees
  } from '$lib/finance/caixa';
  import { formatPaymentMethod } from '$lib/finance/paymentMethods';
  import { startOfflineRuntime, getOfflineContext, submitOfflineOperation, offlineRequest, onOfflineChange } from '$lib/offline/runtime';
  import { loadCashSnapshot } from '$lib/finance/offlineCash';
  import { listOperations, readSnapshot, saveSnapshot } from '$lib/offline/operations';

  let loading = true;
  let errorMessage = '';
  let caixa = null; // { id, data_abertura, valor_inicial }
  let vendas = []; // vendas do caixa
  let vendasPagamentos = []; // pagamentos das vendas (para múltiplos)
  let vendasTaxasPlataforma = []; // taxas de plataforma (iFood, etc.)
  let movs = []; // movimentações de caixa (sangria/suprimento)

  let valorEmGaveta = 0;
  let fechando = false;
  let closeIntent = null;
  let provisional = false;
  let unsubscribeOffline;
  let refreshing = false;
  let destroyed = false;
  onDestroy(() => { destroyed = true; unsubscribeOffline?.(); });
  async function refreshLocalCash() {
    if (refreshing || fechando || destroyed) return;
    refreshing = true;
    try {
      const snapshot = await loadCashSnapshot(supabase, ownerUserId);
      if (destroyed || getOfflineContext()?.ownerUserId !== ownerUserId) return;
      caixa = snapshot.caixa; vendas = snapshot.vendas; vendasPagamentos = snapshot.pagamentos;
      vendasTaxasPlataforma = snapshot.taxas; movs = snapshot.movs; provisional = !!snapshot.provisional;
    } finally { refreshing = false; }
  }

  // Ao montar, localiza o caixa aberto do usuário e carrega as vendas atreladas
  let uid = null;
  let ownerUserId = null;
  let operadorUserId = null;
  onMount(async () => {
    try {
      const authCtx = await ensureActiveSubscription();
      if (!authCtx) return;
      uid = authCtx.userId;
      ownerUserId = authCtx.ownerUserId;
      operadorUserId = authCtx.userId;
      await startOfflineRuntime(authCtx);
      if (getOfflineContext()?.enabled || getOfflineContext()?.registered) {
        await refreshLocalCash();
        if (!destroyed) unsubscribeOffline = onOfflineChange(() => { void refreshLocalCash().catch(() => {}); });
        return;
      }
      // caixa aberto do usuário
      const { data: cs, error: cErr } = await supabase
        .from('caixas')
        .select('id, data_abertura, valor_inicial')
        .eq('id_usuario', ownerUserId || uid)
        .is('data_fechamento', null)
        .order('data_abertura', { ascending: false })
        .limit(1);
      if (cErr) throw cErr;
      if (!cs || cs.length === 0) {
        caixa = null;
        loading = false;
        return;
      }
      caixa = cs[0];

      const { data: vs, error: vErr } = await supabase
        .from('vendas')
        .select('id, numero_venda, valor_total, forma_pagamento, valor_recebido, valor_troco, valor_desconto, id_cliente, pessoas!vendas_id_cliente_fkey(nome)')
        .eq('id_caixa', caixa.id)
        .order('id', { ascending: true });
      if (vErr) throw vErr;
      vendas = vs || [];

      // Pagamentos de vendas (para forma_pagamento = 'multiplo')
      vendasPagamentos = [];
      vendasTaxasPlataforma = [];
      const ids = (vendas || []).map(v => v.id);
      if (ids.length) {
        const { data: pags, error: pErr } = await supabase
          .from('vendas_pagamentos')
          .select('id_venda, forma_pagamento, valor')
          .in('id_venda', ids);
        if (pErr) throw pErr;
        vendasPagamentos = pags || [];

        const { data: taxas } = await supabase
          .from('vendas_taxas_plataforma')
          .select('id_venda, plataforma_id, plataforma_nome, taxa_pct, valor_bruto, valor_taxa')
          .in('id_venda', ids);
        vendasTaxasPlataforma = taxas || [];
      }

      // Movimentações do caixa (sangria/suprimento)
      const { data: ms, error: mErr } = await supabase
        .from('caixa_movimentacoes')
        .select('tipo, valor')
        .eq('id_caixa', caixa.id);
      if (mErr) throw mErr;
      movs = ms || [];
    } catch (err) {
      errorMessage = err?.message || 'Erro ao carregar caixa.';
    } finally {
      loading = false;
    }
  });

  $: resumoPagamentos = calculatePaymentSummary(vendas, vendasPagamentos);
  $: totais = {
    dinheiro: resumoPagamentos.dinheiro,
    cartao_debito: resumoPagamentos.cartaoDebito,
    cartao_credito: resumoPagamentos.cartaoCredito,
    cartao_legacy: resumoPagamentos.cartaoLegacy,
    pix: resumoPagamentos.pix,
    vale_refeicao: resumoPagamentos.valeRefeicao,
    fiado: resumoPagamentos.fiado,
  };
  $: formasExtras = Object.entries(resumoPagamentos.totalsByForm || {})
    .filter(([forma, valor]) => !STANDARD_PAYMENT_FORMS.has(forma) && Number(valor || 0) > 0)
    .map(([forma, valor]) => ({ forma, valor }));
  $: totalCartao = resumoPagamentos.totalCartao;
  $: totalGeral = resumoPagamentos.totalGeral;
  $: totalDescontos = (vendas || []).reduce((a, v) => a + Number(v.valor_desconto || 0), 0);
  $: resumoTaxas = calculatePlatformFees(vendasTaxasPlataforma);
  $: totalCustosPlataforma = resumoTaxas.total;
  $: totalDinheiroLiquido = resumoPagamentos.dinheiro;
  $: resumoMovs = calculateMovementSummary(movs);
  $: totalSangria = resumoMovs.sangria;
  $: totalSuprimento = resumoMovs.suprimento;
  $: fiadosDoCaixa = [
    ...(vendas || [])
      .filter((v) => v.forma_pagamento === 'fiado')
      .map((v) => ({
        id: `venda-${v.id}`,
        venda: v.numero_venda,
        nome: Array.isArray(v.pessoas) ? v.pessoas[0]?.nome : v.pessoas?.nome,
        valor: Number(v.valor_total || 0)
      })),
    ...(vendasPagamentos || [])
      .filter((p) => p.forma_pagamento === 'fiado')
      .map((p) => {
        const venda = (vendas || []).find((v) => v.id === p.id_venda);
        return {
          id: `pagamento-${p.id_venda}-${p.valor}`,
          venda: venda?.numero_venda,
          nome: Array.isArray(venda?.pessoas) ? venda.pessoas[0]?.nome : venda?.pessoas?.nome,
          valor: Number(p.valor || 0)
        };
      })
  ];
  $: esperadoEmGaveta = caixa ? calculateExpectedDrawer({
    valorInicial: caixa.valor_inicial,
    dinheiroLiquido: totalDinheiroLiquido,
    sangria: totalSangria,
    suprimento: totalSuprimento
  }) : 0;
  $: diferenca = Number(valorEmGaveta || 0) - Number(esperadoEmGaveta || 0);

  /**
   * Fecha o caixa atual registrando data, valor contado e diferença.
   */
  async function fecharCaixa() {
    if (!caixa || fechando) return;
    fechando = true;
    try {
      if (getOfflineContext()?.enabled) {
        closeIntent ||= crypto.randomUUID();
        const operations = await listOperations(ownerUserId);
        const dependencies = operations.filter(o => String(o.payload.id_caixa) === String(caixa.id) || o.type === 'caixa.open' && o.entityId === String(caixa.id)).map(o => o.operationId);
        await submitOfflineOperation('caixa.close', caixa.id, { id_caixa: caixa.id, valor_contado_em_gaveta: Number(valorEmGaveta) }, {
          operationId: closeIntent, dependencies,
          projection: { key: 'caixa.aberto', value: { ...caixa, data_fechamento: new Date().toISOString(), provisional: true } }
        });
        addToast('Fechamento salvo neste aparelho. Os totais serão conferidos após sincronizar.', 'success');
        caixa = null;
        return;
      }
      const savedIntent = await readSnapshot(ownerUserId, `caixa.closeIntent:${caixa.id}`);
      closeIntent ||= savedIntent || crypto.randomUUID();
      await saveSnapshot(ownerUserId, `caixa.closeIntent:${caixa.id}`, closeIntent);
      const response = await offlineRequest('/api/caixa/close', { method: 'POST', body: JSON.stringify({ clientOperationId: closeIntent, id_caixa: caixa.id, valor_contado_em_gaveta: Number(valorEmGaveta) }) });
      if (!['applied', 'already_applied'].includes(response.status)) throw new Error('Não foi possível confirmar o fechamento. Os dados continuam preservados.');
      await saveSnapshot(ownerUserId, 'caixa.aberto', { ...caixa, data_fechamento: new Date().toISOString() });

      addToast('Caixa fechado com sucesso.', 'success');
      window.location.href = '/gestao';
    } catch (err) {
      errorMessage = err?.message || 'Erro ao fechar caixa.';
    } finally {
      fechando = false;
    }
  }
</script>

<div class="mb-6 flex items-end justify-between border-b border-slate-700/60 pb-4">
  <div>
    <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">Financeiro / Fechar Caixa</p>
    <h1 class="text-xl font-bold text-slate-100 tracking-tight">Fechar Caixa</h1>
    {#if provisional}<p class="text-sm mt-2" style="color: var(--text-muted);">Valores provisórios deste aparelho. Lançamentos de outros aparelhos serão considerados quando sincronizarem; diferenças posteriores ficam registradas como ajustes.</p>{/if}
  </div>
</div>
{#if errorMessage}
  <div class="mb-4 text-sm text-red-600">{errorMessage}</div>
{/if}

{#if loading}
  <div>Carregando...</div>
{:else}
  {#if !caixa}
    <div class="text-sm" style="color: var(--text-muted);">Nenhum caixa aberto encontrado para seu usuário.</div>
  {:else}
    <section class="rounded-xl p-4 space-y-4" style="background: var(--bg-card); border: 1px solid var(--border-card);">
      <div class="grid sm:grid-cols-2 gap-4">
        <div>
          <div class="text-sm" style="color: var(--text-muted);">Data de abertura</div>
          <div class="font-medium" style="color: var(--text-main);">{new Date(caixa.data_abertura).toLocaleString()}</div>
        </div>
        <div>
          <div class="text-sm" style="color: var(--text-muted);">Troco inicial</div>
          <div class="font-medium" style="color: var(--text-main);">R$ {Number(caixa.valor_inicial || 0).toFixed(2)}</div>
        </div>
      </div>

      <div class="grid sm:grid-cols-5 gap-4">
        <div class="p-3 rounded-lg border" style="background: var(--bg-panel); border-color: var(--border-subtle);">
          <div class="text-xs" style="color: var(--text-muted);">Dinheiro</div>
          <div class="text-lg font-semibold" style="color: var(--text-main);">R$ {Number(totais.dinheiro).toFixed(2)}</div>
        </div>
        <div class="p-3 rounded-lg border" style="background: var(--bg-panel); border-color: var(--border-subtle);">
          <div class="text-xs" style="color: var(--text-muted);">Cartão</div>
          <div class="text-lg font-semibold" style="color: var(--text-main);">R$ {Number(totalCartao).toFixed(2)}</div>
          <div class="text-xs mt-1" style="color: var(--text-muted);">Débito R$ {Number(totais.cartao_debito).toFixed(2)} · Crédito R$ {Number(totais.cartao_credito).toFixed(2)}{totais.cartao_legacy>0?` · Outros R$ ${Number(totais.cartao_legacy).toFixed(2)}`:''}</div>
        </div>
        <div class="p-3 rounded-lg border" style="background: var(--bg-panel); border-color: var(--border-subtle);">
          <div class="text-xs" style="color: var(--text-muted);">Pix</div>
          <div class="text-lg font-semibold" style="color: var(--text-main);">R$ {Number(totais.pix).toFixed(2)}</div>
        </div>
        <div class="p-3 rounded-lg border" style="background: var(--bg-panel); border-color: var(--border-subtle);">
          <div class="text-xs" style="color: var(--text-muted);">{formatPaymentMethod('vale_refeicao')}</div>
          <div class="text-lg font-semibold" style="color: var(--text-main);">R$ {Number(totais.vale_refeicao).toFixed(2)}</div>
        </div>
        <div class="p-3 rounded-lg border" style="background: var(--bg-panel); border-color: var(--border-subtle);">
          <div class="text-xs" style="color: var(--text-muted);">Total</div>
          <div class="text-lg font-semibold" style="color: var(--text-main);">R$ {Number(totalGeral).toFixed(2)}</div>
        </div>
      </div>

      {#if totais.fiado > 0 || formasExtras.length > 0}
        <div class="grid sm:grid-cols-3 gap-4">
          {#if totais.fiado > 0}
            <div class="p-3 rounded-lg border" style="background: var(--bg-panel); border-color: var(--border-subtle);">
              <div class="text-xs" style="color: var(--text-muted);">Fiado</div>
              <div class="text-lg font-semibold" style="color: var(--text-main);">R$ {Number(totais.fiado).toFixed(2)}</div>
            </div>
          {/if}
          {#each formasExtras as item}
            <div class="p-3 rounded-lg border" style="background: var(--bg-panel); border-color: var(--border-subtle);">
              <div class="text-xs" style="color: var(--text-muted);">{formatPaymentMethod(item.forma)}</div>
              <div class="text-lg font-semibold" style="color: var(--text-main);">R$ {Number(item.valor).toFixed(2)}</div>
            </div>
          {/each}
        </div>
      {/if}

      {#if fiadosDoCaixa.length > 0}
        <section class="fiado-summary" aria-labelledby="fiados-caixa-title">
          <div>
            <h2 id="fiados-caixa-title">Fiados lançados neste caixa</h2>
            <p>Confira quem ficou responsável por cada valor em aberto.</p>
          </div>
          <ul>
            {#each fiadosDoCaixa as fiado (fiado.id)}
              <li>
                <div><strong>{fiado.nome || 'Cliente não identificado'}</strong><span>{fiado.venda ? `Venda #${fiado.venda}` : 'Venda registrada'}</span></div>
                <strong>R$ {Number(fiado.valor).toFixed(2)}</strong>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if totalDescontos > 0}
        <div class="p-3 rounded-sm border bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
          <div class="text-xs text-amber-700 dark:text-amber-400">Descontos aplicados</div>
          <div class="text-lg font-semibold text-amber-700 dark:text-amber-400">−R$ {Number(totalDescontos).toFixed(2)}</div>
          <div class="text-xs text-amber-600 dark:text-amber-500 mt-1">Valor "perdido" em promoções/descontos neste caixa.</div>
        </div>
      {/if}

      {#if resumoTaxas.byPlatform.length > 0}
        <div class="p-3 rounded-sm border bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800">
          <div class="flex items-center justify-between">
            <div class="text-xs text-rose-700 dark:text-rose-400">Custos de plataforma (comissões)</div>
            <div class="text-lg font-semibold text-rose-700 dark:text-rose-400">−R$ {Number(totalCustosPlataforma).toFixed(2)}</div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
            {#each resumoTaxas.byPlatform as plat}
              <div class="flex items-center justify-between gap-2 px-2 py-1 rounded-sm bg-white/60 dark:bg-slate-800/60">
                <span class="text-xs font-medium" style="color: var(--text-main);">{plat.nome}</span>
                <span class="text-xs font-semibold text-rose-700 dark:text-rose-400">−R$ {Number(plat.total).toFixed(2)}</span>
              </div>
            {/each}
          </div>
          <div class="text-xs text-rose-600 dark:text-rose-500 mt-2">Não impacta o saldo da gaveta (comissão é descontada do repasse da plataforma).</div>
        </div>
      {/if}

      <div class="grid sm:grid-cols-3 gap-4 items-end">
        <div>
          <label for="valor-em-gaveta" class="block text-sm mb-1">Valor contado na gaveta</label>
          <input id="valor-em-gaveta" type="number" step="0.01" min="0" class="input-form" bind:value={valorEmGaveta} />
        </div>
        <div>
          <div class="text-sm" style="color: var(--text-muted);">Esperado na gaveta</div>
          <div class="text-lg font-semibold">R$ {Number(esperadoEmGaveta).toFixed(2)}</div>
          <div class="text-xs mt-1" style="color: var(--text-muted);">Inclui troco inicial, vendas em dinheiro (recebido − troco), sangrias e suprimentos.</div>
        </div>
        <div>
          <div class="text-sm" style="color: var(--text-muted);">Diferença</div>
          <div class="text-lg font-semibold" style={`color: ${diferenca === 0 ? 'var(--text-main)' : diferenca > 0 ? 'var(--success)' : 'var(--error)'}`}>R$ {Number(diferenca).toFixed(2)}</div>
        </div>
      </div>

      <div class="flex justify-end gap-2">
  <a href="/app" class="btn-secondary">Voltar ao PDV</a>
        <button class="btn-primary" disabled={fechando} on:click={fecharCaixa}>{fechando ? 'Fechando...' : 'Fechar Caixa'}</button>
      </div>
    </section>
  {/if}
{/if}

<style lang="postcss">
  /* Usa classes globais em src/app.css (.input-form, .btn-*) */
  .fiado-summary { padding: 1rem 0; border-top: 1px solid var(--border-card); }
  .fiado-summary h2 { margin: 0; color: var(--text-main); font-size: .875rem; }
  .fiado-summary p { margin: .25rem 0 0; color: var(--text-muted); font-size: .875rem; }
  .fiado-summary ul { display: grid; gap: .375rem; padding: 0; margin: .875rem 0 0; list-style: none; }
  .fiado-summary li { display: flex; align-items: center; justify-content: space-between; gap: .75rem; min-height: 44px; padding: .5rem .75rem; border: 1px solid var(--border-card); border-radius: 8px; background: var(--bg-input); }
  .fiado-summary li div { min-width: 0; display: grid; gap: .125rem; }
  .fiado-summary li div strong { overflow: hidden; color: var(--text-main); font-size: .875rem; text-overflow: ellipsis; white-space: nowrap; }
  .fiado-summary li span { color: var(--text-muted); font-size: .875rem; }
  .fiado-summary li > strong { color: var(--status-warning-text); font-size: .875rem; font-variant-numeric: tabular-nums; }
</style>

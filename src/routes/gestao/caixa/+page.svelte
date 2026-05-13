<script>
  import { onMount } from 'svelte';
  export let params;
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

  let loading = true;
  let errorMessage = '';
  let caixa = null; // { id, data_abertura, valor_inicial }
  let vendas = []; // vendas do caixa
  let vendasPagamentos = []; // pagamentos das vendas (para múltiplos)
  let vendasTaxasPlataforma = []; // taxas de plataforma (iFood, etc.)
  let movs = []; // movimentações de caixa (sangria/suprimento)

  let valorEmGaveta = 0;
  let fechando = false;

  // Ao montar, localiza o caixa aberto do usuário e carrega as vendas atreladas
  let uid = null;
  let ownerUserId = null;
  let operadorUserId = null;
  onMount(async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
  uid = userData?.user?.id;
      if (!uid) {
        window.location.href = '/login';
        return;
      }
      const authCtx = await ensureActiveSubscription();
      if (authCtx) {
        ownerUserId = authCtx.ownerUserId;
        operadorUserId = authCtx.userId;
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
        .select('id, numero_venda, valor_total, forma_pagamento, valor_recebido, valor_troco, valor_desconto')
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
    if (!caixa) return;
    fechando = true;
    try {
      const { error } = await supabase
        .from('caixas')
        .update({
          data_fechamento: new Date().toISOString(),
          valor_fechamento: Number(valorEmGaveta),
          diferenca_fechamento: Number(diferenca)
        })
        .eq('id', caixa.id);
      if (error) throw error;

      // Registra histórico do fechamento do dia para relatórios (até 30 dias)
      try {
        await supabase.from('caixa_fechamentos').insert({
          id_caixa: caixa.id,
          id_usuario: ownerUserId || uid,
          id_operador: operadorUserId || uid,
          data_fechamento: new Date().toISOString(),
          total_dinheiro: Number(totais.dinheiro || 0),
          total_cartao: Number(totalCartao || 0),
          total_pix: Number(totais.pix || 0),
          total_geral: Number(totalGeral || 0),
          valor_inicial: Number(caixa.valor_inicial || 0),
          valor_esperado_em_gaveta: Number(esperadoEmGaveta || 0),
          valor_contado_em_gaveta: Number(valorEmGaveta || 0),
          diferenca: Number(diferenca || 0),
          quantidade_vendas: (vendas || []).length
        });
      } catch (e) {
        console.warn('Falha ao registrar histórico de fechamento:', e?.message || e);
      }

      addToast('Caixa fechado com sucesso.', 'success');
      window.location.href = '/gestao';
    } catch (err) {
      errorMessage = err?.message || 'Erro ao fechar caixa.';
    } finally {
      fechando = false;
    }
  }
</script>

<p class="text-[10px] font-bold uppercase tracking-[0.2em] mb-1" style="color: var(--text-muted);">Financeiro / Fechar Caixa</p>
<h1 class="text-2xl font-semibold mb-4">Fechar Caixa</h1>
{#if errorMessage}
  <div class="mb-4 text-sm text-red-600">{errorMessage}</div>
{/if}

{#if loading}
  <div>Carregando...</div>
{:else}
  {#if !caixa}
    <div class="text-sm text-slate-600">Nenhum caixa aberto encontrado para seu usuário.</div>
  {:else}
    <section class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-4">
      <div class="grid sm:grid-cols-2 gap-4">
        <div>
          <div class="text-sm text-slate-500">Data de abertura</div>
          <div class="font-medium">{new Date(caixa.data_abertura).toLocaleString()}</div>
        </div>
        <div>
          <div class="text-sm text-slate-500">Troco inicial</div>
          <div class="font-medium">R$ {Number(caixa.valor_inicial || 0).toFixed(2)}</div>
        </div>
      </div>

      <div class="grid sm:grid-cols-4 gap-4">
        <div class="p-3 rounded border bg-white dark:bg-slate-800">
          <div class="text-xs text-slate-500">Dinheiro</div>
          <div class="text-lg font-semibold">R$ {Number(totais.dinheiro).toFixed(2)}</div>
        </div>
        <div class="p-3 rounded border bg-white dark:bg-slate-800">
          <div class="text-xs text-slate-500">Cartão</div>
          <div class="text-lg font-semibold">R$ {Number(totalCartao).toFixed(2)}</div>
          <div class="text-xs text-slate-500 mt-1">Débito R$ {Number(totais.cartao_debito).toFixed(2)} · Crédito R$ {Number(totais.cartao_credito).toFixed(2)}{totais.cartao_legacy>0?` · Outros R$ ${Number(totais.cartao_legacy).toFixed(2)}`:''}</div>
        </div>
        <div class="p-3 rounded border bg-white dark:bg-slate-800">
          <div class="text-xs text-slate-500">Pix</div>
          <div class="text-lg font-semibold">R$ {Number(totais.pix).toFixed(2)}</div>
        </div>
        <div class="p-3 rounded border bg-white dark:bg-slate-800">
          <div class="text-xs text-slate-500">Total</div>
          <div class="text-lg font-semibold">R$ {Number(totalGeral).toFixed(2)}</div>
        </div>
      </div>

      {#if totais.fiado > 0 || formasExtras.length > 0}
        <div class="grid sm:grid-cols-3 gap-4">
          {#if totais.fiado > 0}
            <div class="p-3 rounded border bg-white dark:bg-slate-800">
              <div class="text-xs text-slate-500">Fiado</div>
              <div class="text-lg font-semibold">R$ {Number(totais.fiado).toFixed(2)}</div>
            </div>
          {/if}
          {#each formasExtras as item}
            <div class="p-3 rounded border bg-white dark:bg-slate-800">
              <div class="text-xs text-slate-500">{item.forma.replace(/_/g, ' ')}</div>
              <div class="text-lg font-semibold">R$ {Number(item.valor).toFixed(2)}</div>
            </div>
          {/each}
        </div>
      {/if}

      {#if totalDescontos > 0}
        <div class="p-3 rounded border bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
          <div class="text-xs text-amber-700 dark:text-amber-400">Descontos aplicados</div>
          <div class="text-lg font-semibold text-amber-700 dark:text-amber-400">−R$ {Number(totalDescontos).toFixed(2)}</div>
          <div class="text-[11px] text-amber-600 dark:text-amber-500 mt-1">Valor "perdido" em promoções/descontos neste caixa.</div>
        </div>
      {/if}

      {#if resumoTaxas.byPlatform.length > 0}
        <div class="p-3 rounded border bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800">
          <div class="flex items-center justify-between">
            <div class="text-xs text-rose-700 dark:text-rose-400">Custos de plataforma (comissões)</div>
            <div class="text-lg font-semibold text-rose-700 dark:text-rose-400">−R$ {Number(totalCustosPlataforma).toFixed(2)}</div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
            {#each resumoTaxas.byPlatform as plat}
              <div class="flex items-center justify-between gap-2 px-2 py-1 rounded bg-white/60 dark:bg-slate-800/60">
                <span class="text-xs font-medium text-slate-700 dark:text-slate-200">{plat.nome}</span>
                <span class="text-xs font-semibold text-rose-700 dark:text-rose-400">−R$ {Number(plat.total).toFixed(2)}</span>
              </div>
            {/each}
          </div>
          <div class="text-[11px] text-rose-600 dark:text-rose-500 mt-2">Não impacta o saldo da gaveta (comissão é descontada do repasse da plataforma).</div>
        </div>
      {/if}

      <div class="grid sm:grid-cols-3 gap-4 items-end">
        <div>
          <label for="valor-em-gaveta" class="block text-sm mb-1">Valor contado na gaveta</label>
          <input id="valor-em-gaveta" type="number" step="0.01" min="0" class="input-form" bind:value={valorEmGaveta} />
        </div>
        <div>
          <div class="text-sm text-slate-500">Esperado na gaveta</div>
          <div class="text-lg font-semibold">R$ {Number(esperadoEmGaveta).toFixed(2)}</div>
          <div class="text-[11px] text-slate-500 mt-1">Inclui troco inicial, vendas em dinheiro (recebido − troco), sangrias e suprimentos.</div>
        </div>
        <div>
          <div class="text-sm text-slate-500">Diferença</div>
          <div class="text-lg font-semibold {diferenca === 0 ? 'text-slate-900' : (diferenca > 0 ? 'text-green-700' : 'text-red-700')}">R$ {Number(diferenca).toFixed(2)}</div>
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
</style>

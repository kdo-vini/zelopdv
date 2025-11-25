<script>
  import { onMount } from 'svelte';
  export let params;
  import { supabase } from '$lib/supabaseClient';

  let loading = true;
  let errorMessage = '';
  let caixa = null; // { id, data_abertura, valor_inicial }
  let vendas = []; // vendas do caixa
  let vendasPagamentos = []; // pagamentos das vendas (para múltiplos)
  let movs = []; // movimentações de caixa (sangria/suprimento)

  let valorEmGaveta = 0;
  let fechando = false;

  // Ao montar, localiza o caixa aberto do usuário e carrega as vendas atreladas
  let uid = null;
  onMount(async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
  uid = userData?.user?.id;
      if (!uid) {
        window.location.href = '/login';
        return;
      }
      // caixa aberto do usuário
      const { data: cs, error: cErr } = await supabase
        .from('caixas')
        .select('id, data_abertura, valor_inicial')
        .eq('id_usuario', uid)
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
        .select('id, valor_total, forma_pagamento, valor_recebido, valor_troco')
        .eq('id_caixa', caixa.id)
        .order('id', { ascending: true });
      if (vErr) throw vErr;
      vendas = vs || [];

      // Pagamentos de vendas (para forma_pagamento = 'multiplo')
      vendasPagamentos = [];
      const ids = (vendas || []).map(v => v.id);
      if (ids.length) {
        const { data: pags, error: pErr } = await supabase
          .from('vendas_pagamentos')
          .select('id_venda, forma_pagamento, valor')
          .in('id_venda', ids);
        if (pErr) throw pErr;
        vendasPagamentos = pags || [];
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

  // Totais por forma de pagamento do caixa corrente (inclui múltiplos via vendas_pagamentos)
  $: singleDinheiro = (vendas || []).filter(v => v.forma_pagamento === 'dinheiro').reduce((a, v) => a + Number(v.valor_total || 0), 0);
  $: singleDebito = (vendas || []).filter(v => v.forma_pagamento === 'cartao_debito').reduce((a, v) => a + Number(v.valor_total || 0), 0);
  $: singleCredito = (vendas || []).filter(v => v.forma_pagamento === 'cartao_credito').reduce((a, v) => a + Number(v.valor_total || 0), 0);
  $: singlePix = (vendas || []).filter(v => v.forma_pagamento === 'pix').reduce((a, v) => a + Number(v.valor_total || 0), 0);
  $: pagDinheiro = (vendasPagamentos || []).filter(p => p.forma_pagamento === 'dinheiro').reduce((a, p) => a + Number(p.valor || 0), 0);
  $: pagDebito = (vendasPagamentos || []).filter(p => p.forma_pagamento === 'cartao_debito').reduce((a, p) => a + Number(p.valor || 0), 0);
  $: pagCredito = (vendasPagamentos || []).filter(p => p.forma_pagamento === 'cartao_credito').reduce((a, p) => a + Number(p.valor || 0), 0);
  $: pagPix = (vendasPagamentos || []).filter(p => p.forma_pagamento === 'pix').reduce((a, p) => a + Number(p.valor || 0), 0);
  $: totais = {
    dinheiro: Number(singleDinheiro + pagDinheiro),
    cartao_debito: Number(singleDebito + pagDebito),
    cartao_credito: Number(singleCredito + pagCredito),
    cartao_legacy: (vendas || []).filter(v => v.forma_pagamento === 'cartao').reduce((a, v) => a + Number(v.valor_total || 0), 0),
    pix: Number(singlePix + pagPix),
  };
  $: totalCartao = Number(totais.cartao_debito + totais.cartao_credito + totais.cartao_legacy);
  $: totalGeral = Number(totais.dinheiro + totalCartao + totais.pix);

  // Dinheiro líquido das vendas: recebido - troco (singles) + soma de pagamentos em dinheiro (múltiplos já vêm líquidos)
  $: totalDinheiroLiquido = (
    (vendas || [])
      .filter(v => v.forma_pagamento === 'dinheiro')
      .reduce((a, v) => a + Number(v.valor_recebido || 0) - Number(v.valor_troco || 0), 0)
    + (vendasPagamentos || []).filter(p => p.forma_pagamento === 'dinheiro').reduce((a, p) => a + Number(p.valor || 0), 0)
  );

  // Totais de movimentações
  $: totalSangria = (movs || []).filter(m => m.tipo === 'sangria').reduce((a, m) => a + Number(m.valor || 0), 0);
  $: totalSuprimento = (movs || []).filter(m => m.tipo === 'suprimento').reduce((a, m) => a + Number(m.valor || 0), 0);

  // Caixa esperado na gaveta: valor_inicial + dinheiro líquido - sangrias + suprimentos
  $: esperadoEmGaveta = caixa ? Number(caixa.valor_inicial || 0) + Number(totalDinheiroLiquido || 0) - Number(totalSangria || 0) + Number(totalSuprimento || 0) : 0;
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
          id_usuario: uid,
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

      alert('Caixa fechado com sucesso.');
      window.location.href = '/admin';
    } catch (err) {
      errorMessage = err?.message || 'Erro ao fechar caixa.';
    } finally {
      fechando = false;
    }
  }
</script>

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

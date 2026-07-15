<script>
  import { onMount } from 'svelte';
  import { Search, WalletCards, CircleDollarSign, ReceiptText, ArrowDownLeft, ArrowUpRight, RefreshCw, Users } from 'lucide-svelte';
  import { supabase } from '$lib/supabaseClient';
  import { ensureActiveSubscription } from '$lib/guards';
  import { logAuditAction } from '$lib/accessControl';
  import { addToast } from '$lib/stores/ui';
  import { printPagamentoFiado } from '$lib/printService';
  import { buildFiadoStatement, getFiadoState } from '$lib/finance/fiado';

  let pessoas = [];
  let pessoaSelecionada = null;
  let selectedPessoaId = '';
  let busca = '';
  let lancamentos = [];
  let loading = true;
  let loadingHistory = false;
  let salvando = false;
  let errorMsg = '';
  let valorPagamento = '';
  // Recebimentos no fiado não alteram o caixa nem imprimem por padrão:
  // o operador confirma explicitamente quando essas ações são necessárias.
  let addAoCaixa = false;
  let imprimirRecibo = false;
  let ownerUserId = '';
  let operadorUserId = '';
  let isSubUser = false;

  $: pessoasFiltradas = pessoas.filter((p) => p.nome.toLocaleLowerCase('pt-BR').includes(busca.trim().toLocaleLowerCase('pt-BR')));
  $: estadoAtual = getFiadoState(pessoaSelecionada?.saldo_fiado || 0);
  $: valorDigitado = Number(valorPagamento || 0);
  $: saldoPrevisto = Number(pessoaSelecionada?.saldo_fiado || 0) - (Number.isFinite(valorDigitado) ? valorDigitado : 0);
  $: estadoPrevisto = getFiadoState(saldoPrevisto);
  $: extrato = buildFiadoStatement(lancamentos);

  function money(value) {
    return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
  }

  function formatDate(value) {
    return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function entryIcon(natureza) {
    return natureza === 'debito_venda' || natureza === 'saldo_inicial' ? ArrowDownLeft : ArrowUpRight;
  }

  function entryState(natureza) {
    return natureza === 'debito_venda' || natureza === 'saldo_inicial' ? 'debit' : 'credit';
  }

  async function loadPessoas() {
    if (!ownerUserId) return;
    const { data, error } = await supabase
      .from('pessoas')
      .select('id,nome,tipo,saldo_fiado,contato')
      .eq('id_usuario', ownerUserId)
      .order('nome');
    if (error) throw error;
    pessoas = data || [];
  }

  async function selecionar(id) {
    selectedPessoaId = id;
    pessoaSelecionada = pessoas.find((p) => p.id === id) || null;
    lancamentos = [];
    if (!pessoaSelecionada) return;

    loadingHistory = true;
    try {
      const { data, error } = await supabase
        .from('fiado_lancamentos')
        .select('id,natureza,valor,descricao,created_at,id_venda')
        .eq('id_pessoa', pessoaSelecionada.id)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      lancamentos = data || [];
    } catch (error) {
      errorMsg = 'Não foi possível carregar o extrato. Confirme se a atualização de fiado já foi aplicada.';
    } finally {
      loadingHistory = false;
    }
  }

  async function refreshPessoa() {
    await loadPessoas();
    if (selectedPessoaId) await selecionar(selectedPessoaId);
  }

  async function registrarPagamento() {
    if (salvando) return;
    if (!pessoaSelecionada) {
      addToast('Selecione uma pessoa para receber o pagamento.', 'warning');
      return;
    }
    if (!Number.isFinite(valorDigitado) || valorDigitado <= 0) {
      addToast('Informe um valor maior que zero.', 'error');
      return;
    }

    salvando = true;
    try {
      let caixaId = null;
      if (addAoCaixa) {
        const { data: caixa, error: caixaError } = await supabase
          .from('caixas')
          .select('id')
          .eq('id_usuario', ownerUserId)
          .is('data_fechamento', null)
          .order('data_abertura', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (caixaError) throw caixaError;
        caixaId = caixa?.id || null;
      }

      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? `fiado-pagamento:${crypto.randomUUID()}`
        : `fiado-pagamento:${Date.now()}`;
      const { data, error } = await supabase.rpc('fiado_registrar_pagamento_v2', {
        p_id_pessoa: pessoaSelecionada.id,
        p_valor: valorDigitado,
        p_adicionar_ao_caixa: addAoCaixa,
        p_id_caixa: caixaId,
        p_idempotency_key: idempotencyKey
      });
      if (error) throw error;

      if (isSubUser) {
        logAuditAction({
          ownerUserId,
          action: 'fiado.pagamento_registrado',
          entityType: 'pessoa',
          entityId: pessoaSelecionada.id,
          details: { nome: pessoaSelecionada.nome, valor: valorDigitado, addAoCaixa }
        });
      }

      const saldoAnterior = Number(data?.saldo_anterior ?? pessoaSelecionada.saldo_fiado ?? 0);
      const saldoAtual = Number(data?.saldo_atual ?? saldoAnterior - valorDigitado);
      if (imprimirRecibo) {
        const { data: perfil } = await supabase
          .from('empresa_perfil')
          .select('nome_exibicao,documento,contato,endereco,largura_bobina,rodape_recibo')
          .eq('user_id', ownerUserId)
          .maybeSingle();
        await printPagamentoFiado({
          estabelecimento: {
            nome_exibicao: perfil?.nome_exibicao || 'ZeloPDV',
            documento: perfil?.documento || null,
            contato: perfil?.contato || null,
            endereco: perfil?.endereco || null,
            largura_bobina: perfil?.largura_bobina || '80mm',
            rodape_recibo: perfil?.rodape_recibo || 'Obrigado!'
          },
          pagamento: { nomePessoa: pessoaSelecionada.nome, valor: valorDigitado, saldoAnterior, saldoAtual }
        });
      }

      const credito = Math.max(0, -saldoAtual);
      addToast(credito > 0 ? `Pagamento registrado. Crédito disponível: ${money(credito)}.` : 'Pagamento registrado.', 'success');
      valorPagamento = '';
      await refreshPessoa();
    } catch (error) {
      addToast(error?.message || 'Não foi possível registrar o pagamento.', 'error');
    } finally {
      salvando = false;
    }
  }

  onMount(async () => {
    try {
      const authCtx = await ensureActiveSubscription({ requireProfile: true });
      if (!authCtx) return;
      ownerUserId = authCtx.ownerUserId;
      operadorUserId = authCtx.userId;
      isSubUser = authCtx.isSubUser;
      await loadPessoas();
    } catch (error) {
      errorMsg = error?.message || 'Não foi possível carregar o fichário.';
    } finally {
      loading = false;
    }
  });
</script>

<section class="fichario-page" aria-busy={loading}>
  <header class="page-header">
    <div>
      <p class="page-path">Financeiro / Fichário</p>
      <h1>Fiado</h1>
      <p class="page-intro">Acompanhe o que cada pessoa deve, os créditos disponíveis e cada movimento da ficha.</p>
    </div>
    <a class="secondary-action" href="/gestao/pessoas"><Users size={16} />Gerenciar pessoas</a>
  </header>

  {#if errorMsg}
    <div class="feedback error" role="alert">{errorMsg}</div>
  {/if}

  {#if loading}
    <div class="loading-layout" aria-label="Carregando fichário"><div></div><div></div></div>
  {:else}
    <div class="fichario-layout">
      <aside class="people-panel" aria-label="Pessoas cadastradas">
        <label class="search-field">
          <Search size={17} aria-hidden="true" />
          <span class="sr-only">Buscar pessoa</span>
          <input bind:value={busca} placeholder="Buscar pessoa" autocomplete="off" />
        </label>
        <p class="people-count">{pessoasFiltradas.length} {pessoasFiltradas.length === 1 ? 'pessoa' : 'pessoas'}</p>

        {#if pessoasFiltradas.length === 0}
          <div class="empty-list"><Users size={28} aria-hidden="true" /><p>Nenhuma pessoa encontrada.</p></div>
        {:else}
          <div class="people-list">
            {#each pessoasFiltradas as pessoa (pessoa.id)}
              {@const estado = getFiadoState(pessoa.saldo_fiado)}
              <button class:active={pessoa.id === selectedPessoaId} class="person-row" on:click={() => selecionar(pessoa.id)} aria-pressed={pessoa.id === selectedPessoaId}>
                <span class="person-name">{pessoa.nome}</span>
                <span class="balance {estado.key}">{estado.label} · {money(estado.value)}</span>
              </button>
            {/each}
          </div>
        {/if}
      </aside>

      <main class="detail-panel">
        {#if !pessoaSelecionada}
          <div class="empty-detail"><WalletCards size={48} aria-hidden="true" /><h2>Escolha uma pessoa</h2><p>Busque pelo nome para ver a ficha e registrar um pagamento.</p></div>
        {:else}
          <div class="detail-heading">
            <div><p class="section-label">Ficha de {pessoaSelecionada.tipo === 'funcionario' ? 'funcionário' : 'cliente'}</p><h2>{pessoaSelecionada.nome}</h2></div>
            <button class="icon-action" on:click={refreshPessoa} aria-label="Atualizar ficha" title="Atualizar ficha"><RefreshCw size={18} /></button>
          </div>

          <section class="balance-summary" aria-label="Situação atual do fiado">
            <div><span>Situação atual</span><strong class={estadoAtual.key}>{estadoAtual.label}</strong></div>
            <output class="balance-value {estadoAtual.key}">{money(estadoAtual.value)}</output>
          </section>

          <section class="payment-form" aria-labelledby="payment-title">
            <div class="form-heading"><CircleDollarSign size={20} aria-hidden="true" /><div><h3 id="payment-title">Receber pagamento</h3><p>O pagamento pode quitar a dívida ou deixar crédito para a próxima compra.</p></div></div>
            <div class="payment-controls">
              <label><span>Valor recebido</span><input type="number" min="0.01" step="0.01" inputmode="decimal" bind:value={valorPagamento} placeholder="0,00" /></label>
              <div class="prediction" aria-live="polite"><span>Depois deste pagamento</span><strong class={estadoPrevisto.key}>{estadoPrevisto.label}: {money(estadoPrevisto.value)}</strong></div>
              <button class="primary-action" disabled={salvando} on:click={registrarPagamento}>{salvando ? 'Registrando...' : 'Registrar pagamento'}</button>
            </div>
            <div class="payment-options">
              <label><input class="themed-checkbox" type="checkbox" bind:checked={addAoCaixa} /><span>Adicionar ao caixa atual</span></label>
              <label><input class="themed-checkbox" type="checkbox" bind:checked={imprimirRecibo} /><span>Imprimir recibo</span></label>
            </div>
          </section>

          <section class="statement" aria-labelledby="statement-title">
            <div class="statement-heading"><div><h3 id="statement-title">Extrato</h3><p>Cada compra e pagamento fica registrado na ficha.</p></div></div>
            {#if loadingHistory}
              <div class="statement-loading">Carregando extrato…</div>
            {:else if extrato.length === 0}
              <div class="statement-empty"><ReceiptText size={28} aria-hidden="true" /><p>Ainda não há movimentos desta pessoa após a implantação do extrato.</p></div>
            {:else}
              <ol class="statement-list">
                {#each extrato as entry (entry.id)}
                  {@const Icon = entryIcon(entry.natureza)}
                  <li class="statement-entry">
                    <span class="entry-icon {entryState(entry.natureza)}"><Icon size={17} /></span>
                    <div class="entry-main"><strong>{entry.meta.label}</strong><span>{entry.descricao || 'Movimento de fiado'} · {formatDate(entry.created_at)}</span></div>
                    <div class="entry-values"><strong class:debit={Number(entry.valor) > 0} class:credit={Number(entry.valor) < 0}>{Number(entry.valor) > 0 ? '+' : '−'}{money(Math.abs(Number(entry.valor)))}</strong><span>Saldo: {money(getFiadoState(entry.balanceAfter).value)} {entry.balanceAfter < 0 ? 'de crédito' : ''}</span></div>
                  </li>
                {/each}
              </ol>
            {/if}
          </section>
        {/if}
      </main>
    </div>
  {/if}
</section>

<style>
  .fichario-page { max-width: 1180px; margin: 0 auto; padding: 1.5rem; color: var(--text-label); }
  .page-header { display: flex; align-items: end; justify-content: space-between; gap: 1rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 1rem; margin-bottom: 1.25rem; }
  .page-path, .section-label, .people-count { margin: 0 0 .25rem; color: var(--text-muted); font-size: .625rem; line-height: 1.2; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; }
  h1, h2, h3, p { margin-top: 0; } h1, h2 { margin-bottom: .375rem; color: var(--text-main); font-size: 1.25rem; letter-spacing: -.01em; } h2 { margin-bottom: 0; } h3 { margin-bottom: .25rem; color: var(--text-main); font-size: .875rem; }
  .page-intro { max-width: 58ch; margin-bottom: 0; color: var(--text-muted); font-size: .875rem; line-height: 1.5; }
  .secondary-action, .primary-action, .icon-action { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: .5rem; border-radius: 8px; font: inherit; font-size: .875rem; font-weight: 600; cursor: pointer; text-decoration: none; transition: background-color 180ms ease, color 180ms ease, border-color 180ms ease; }
  .secondary-action { flex: none; padding: 0 .875rem; border: 1px solid var(--border-subtle); background: transparent; color: var(--text-label); }.secondary-action:hover { background: var(--bg-panel); color: var(--text-main); }.secondary-action:focus-visible, .primary-action:focus-visible, .icon-action:focus-visible, .person-row:focus-visible, input:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent); }
  .feedback { padding: .75rem 1rem; margin-bottom: 1rem; border: 1px solid var(--status-error-border); border-radius: 8px; background: var(--status-error-bg); color: var(--status-error-text); font-size: .875rem; }.fichario-layout { display: grid; grid-template-columns: minmax(230px, .72fr) minmax(0, 1.6fr); gap: 1.25rem; align-items: start; }.people-panel, .detail-panel { min-width: 0; border: 1px solid var(--border-card); border-radius: 12px; background: var(--bg-card); }.people-panel { padding: .75rem; }.detail-panel { padding: 1.25rem; }
  .search-field { display: flex; align-items: center; gap: .5rem; min-height: 44px; padding: 0 .75rem; border: 1px solid var(--border-subtle); border-radius: 8px; color: var(--text-muted); background: var(--bg-input); }.search-field:focus-within { border-color: var(--primary); }.search-field input, .payment-controls input { min-width: 0; width: 100%; border: 0; background: transparent; color: var(--text-main); font: inherit; }.search-field input::placeholder, .payment-controls input::placeholder { color: var(--text-muted); }.search-field input:focus, .payment-controls input:focus { outline: 0; box-shadow: none; }.people-count { margin: 1rem .5rem .5rem; }.people-list { display: grid; gap: .25rem; max-height: calc(100vh - 16rem); overflow-y: auto; }.person-row { width: 100%; min-height: 54px; display: grid; gap: .25rem; align-content: center; padding: .625rem .75rem; border: 1px solid transparent; border-radius: 8px; background: transparent; text-align: left; color: var(--text-label); cursor: pointer; }.person-row:hover, .person-row.active { background: var(--bg-panel); border-color: var(--border-subtle); }.person-row.active { border-color: var(--primary); }.person-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-main); font-size: .875rem; font-weight: 600; }.balance { color: var(--text-muted); font-size: .75rem; font-variant-numeric: tabular-nums; }.balance.devedor, .debit { color: var(--status-warning-text); }.balance.credor, .credit { color: var(--status-success-text); }.balance.neutro { color: var(--text-muted); }.empty-list, .empty-detail, .statement-empty { display: grid; place-items: center; gap: .5rem; color: var(--text-muted); text-align: center; }.empty-list { min-height: 12rem; padding: 1rem; font-size: .875rem; }.empty-list p, .empty-detail p, .statement-empty p { margin-bottom: 0; }.empty-detail { min-height: 24rem; }.empty-detail h2 { margin: .25rem 0 0; }
  .detail-heading, .statement-heading { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }.icon-action { width: 44px; padding: 0; border: 1px solid var(--border-subtle); background: transparent; color: var(--text-label); }.icon-action:hover { background: var(--bg-panel); color: var(--text-main); }.balance-summary { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin: 1.25rem 0; padding: 1rem 0; border-block: 1px solid var(--border-card); }.balance-summary span, .prediction span, .entry-values span { display: block; color: var(--text-muted); font-size: .75rem; }.balance-summary strong { display: block; margin-top: .25rem; font-size: .875rem; }.balance-value { font-size: 1.25rem; line-height: 1; font-weight: 700; font-variant-numeric: tabular-nums; }.balance-value.devedor, .devedor { color: var(--status-warning-text); }.balance-value.credor, .credor { color: var(--status-success-text); }.balance-value.neutro, .neutro { color: var(--text-main); }
  .payment-form { padding-bottom: 1.25rem; border-bottom: 1px solid var(--border-card); }.form-heading { display: flex; gap: .625rem; color: var(--primary); }.form-heading p, .statement-heading p { margin-bottom: 0; color: var(--text-muted); font-size: .875rem; line-height: 1.45; }.payment-controls { display: grid; grid-template-columns: minmax(140px, 1fr) minmax(170px, 1.2fr) auto; gap: .75rem; align-items: end; margin-top: 1rem; }.payment-controls label { display: grid; gap: .375rem; color: var(--text-label); font-size: .75rem; font-weight: 600; }.payment-controls input { min-height: 44px; box-sizing: border-box; padding: 0 .75rem; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-input); font-variant-numeric: tabular-nums; }.payment-controls input:focus { border-color: var(--primary); }.prediction { min-height: 44px; padding: .5rem .75rem; box-sizing: border-box; border-radius: 8px; background: var(--bg-input); }.prediction strong { display: block; margin-top: .125rem; font-size: .875rem; font-variant-numeric: tabular-nums; }.primary-action { padding: 0 1rem; border: 0; background: var(--primary); color: var(--primary-text); }.primary-action:hover:not(:disabled) { background: var(--primary-hover); }.primary-action:disabled { cursor: wait; opacity: .65; }.payment-options { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: .75rem; }.payment-options label { min-height: 28px; display: inline-flex; align-items: center; gap: .5rem; color: var(--text-label); font-size: .875rem; cursor: pointer; }
  .statement { padding-top: 1.25rem; }.statement-list { display: grid; margin: 1rem 0 0; padding: 0; list-style: none; }.statement-entry { display: grid; grid-template-columns: 32px minmax(0, 1fr) max-content; gap: .75rem; align-items: center; padding: .875rem 0; border-bottom: 1px solid var(--border-card); }.entry-icon { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; background: var(--bg-input); }.entry-icon.debit { color: var(--status-warning-text); }.entry-icon.credit { color: var(--status-success-text); }.entry-main { min-width: 0; display: grid; gap: .125rem; }.entry-main strong { color: var(--text-main); font-size: .875rem; }.entry-main span { overflow: hidden; color: var(--text-muted); font-size: .75rem; text-overflow: ellipsis; white-space: nowrap; }.entry-values { display: grid; gap: .125rem; text-align: right; font-variant-numeric: tabular-nums; }.entry-values strong { font-size: .875rem; }.statement-loading, .statement-empty { min-height: 9rem; margin-top: 1rem; border: 1px dashed var(--border-subtle); border-radius: 8px; }.loading-layout { display: grid; grid-template-columns: minmax(230px, .72fr) minmax(0, 1.6fr); gap: 1.25rem; }.loading-layout div { min-height: 28rem; border-radius: 12px; background: var(--bg-card); animation: pulse 1.2s ease-in-out infinite alternate; } @keyframes pulse { to { background: var(--bg-panel); } } .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
  @media (max-width: 760px) { .fichario-page { padding: 1rem; }.page-header { align-items: start; flex-direction: column; }.secondary-action { width: 100%; }.fichario-layout, .loading-layout { grid-template-columns: 1fr; }.people-panel { padding: .75rem; }.people-list { max-height: 19rem; }.detail-panel { padding: 1rem; }.payment-controls { grid-template-columns: 1fr; }.primary-action { width: 100%; }.statement-entry { grid-template-columns: 32px minmax(0, 1fr); }.entry-values { grid-column: 2; text-align: left; }.entry-main span { white-space: normal; }.payment-options { display: grid; gap: .625rem; }.balance-summary { align-items: start; flex-direction: column; } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; } }
</style>

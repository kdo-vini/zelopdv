<script>
  import { onMount } from 'svelte';
  import { Search, WalletCards, CircleDollarSign, ReceiptText, ArrowDownLeft, ArrowUpRight, RefreshCw, Users, MessageCircle, MoreHorizontal, Filter, ArrowLeft, ChevronDown, TriangleAlert, X } from 'lucide-svelte';
  import { supabase } from '$lib/supabaseClient';
  import { ensureActiveSubscription } from '$lib/guards';
  import { logAuditAction } from '$lib/accessControl';
  import { addToast } from '$lib/stores/ui';
  import { printPagamentoFiado } from '$lib/printService';
  import { buildFiadoStatement, getFiadoState } from '$lib/finance/fiado';
  import { normalizeBrazilianPhone } from '$lib/masks';

  let pessoas = [];
  let pessoaSelecionada = null;
  let selectedPessoaId = '';
  let busca = '';
  let lancamentos = [];
  let loading = true;
  let loadingHistory = false;
  let salvando = false;
  let excluindoPagamentoId = null;
  let pagamentoPendenteExclusao = null;
  let errorMsg = '';
  let valorPagamento = '';
  // Recebimentos no fiado não alteram o caixa nem imprimem por padrão:
  // o operador confirma explicitamente quando essas ações são necessárias.
  let addAoCaixa = false;
  let imprimirRecibo = false;
  let ownerUserId = '';
  let operadorUserId = '';
  let isSubUser = false;
  let vendasDetalhes = {};
  let vendasItensMap = {};
  let expandedEntries = new Set();
  let sheetOpen = false;
  let showPaymentForm = false;
  let paymentSheetOpen = false;
  let selectedFilter = 'todos';
  let menuOpen = false;
  let filterOpen = false;

  $: pessoasFiltradas = pessoas.filter((p) => p.nome.toLocaleLowerCase('pt-BR').includes(busca.trim().toLocaleLowerCase('pt-BR')));
  $: estadoAtual = getFiadoState(pessoaSelecionada?.saldo_fiado || 0);
  $: valorDigitado = Number(valorPagamento || 0);
  $: saldoPrevisto = Number(pessoaSelecionada?.saldo_fiado || 0) - (Number.isFinite(valorDigitado) ? valorDigitado : 0);
  $: estadoPrevisto = getFiadoState(saldoPrevisto);
  $: extrato = buildFiadoStatement(lancamentos);
  $: extratoFiltrado = selectedFilter === 'todos' ? extrato : extrato.filter((e) => {
    if (selectedFilter === 'debitos') return e.natureza === 'debito_venda' || e.natureza === 'saldo_inicial';
    if (selectedFilter === 'creditos') return e.natureza === 'pagamento' || e.natureza === 'estorno_venda';
    return true;
  });

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

  function toggleEntry(id) {
    if (expandedEntries.has(id)) {
      expandedEntries.delete(id);
    } else {
      expandedEntries.add(id);
    }
    expandedEntries = expandedEntries;
  }

  function tipoPedidoLabel(tipo) {
    const map = { retirada: 'Retirada', delivery: 'Delivery', mesa: 'Mesa' };
    return map[tipo] || tipo || 'Retirada';
  }

  function avatarInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }

  function closeMenu() {
    menuOpen = false;
  }

  function togglePaymentForm() {
    if (isMobileViewport()) {
      paymentSheetOpen = true;
    } else {
      showPaymentForm = !showPaymentForm;
    }
  }

  function isMobileViewport() {
    return typeof window !== 'undefined' && window.innerWidth < 760;
  }

  function closePaymentSheet() {
    paymentSheetOpen = false;
    valorPagamento = '';
  }

  function buildCobrancaUrl() {
    const phone = normalizeBrazilianPhone(pessoaSelecionada?.contato);
    if (!phone) return null;
    const nome = pessoaSelecionada.nome;
    const valor = money(estadoAtual.value);
    const text = `*${nome}*, identificamos que o seu saldo em fiado é de *${valor}*. Gostaríamos de solicitar a regularização. Entre em contato para acertar!`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }

  function buildConsumoUrl() {
    const phone = normalizeBrazilianPhone(pessoaSelecionada?.contato);
    if (!phone) return null;
    const nome = pessoaSelecionada.nome;
    const valor = money(estadoAtual.value);
    const debitos = extrato.filter(e => e.natureza === 'debito_venda').slice(0, 10);
    const linhas = debitos.map(e => {
      const d = new Date(e.created_at);
      const data = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      const itens = vendasItensMap[e.id_venda];
      if (itens && itens.length > 0) {
        return itens.map(it => `${data} — ${it.nome_produto_na_venda} — ${money(Number(it.preco_unitario_na_venda))}`).join('\n');
      }
      return `${data} — ${e.descricao || 'Compra'} — ${money(Math.abs(Number(e.valor)))}`;
    });
    const detalhes = linhas.length > 0 ? `\n\nCompras registradas:\n${linhas.join('\n')}` : '';
    const text = `*${nome}*, seu saldo em fiado é de *${valor}*${detalhes}\n\nRegularize quando puder!`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
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
    showPaymentForm = true;
    paymentSheetOpen = false;
    if (!pessoaSelecionada) return;
    if (isMobileViewport()) window.scrollTo({ top: 0, behavior: 'auto' });

    loadingHistory = true;
    try {
      const { data, error } = await supabase
        .from('fiado_lancamentos')
        .select('id,natureza,valor,descricao,created_at,id_venda,id_caixa,id_caixa_movimentacao')
        .eq('id_pessoa', pessoaSelecionada.id)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      lancamentos = data || [];

      // Fetch sale details for debito_venda entries
      const vendaIds = [...new Set(
        lancamentos
          .filter(l => l.natureza === 'debito_venda' && l.id_venda)
          .map(l => l.id_venda)
      )];
      vendasDetalhes = {};
      vendasItensMap = {};
      if (vendaIds.length > 0) {
        const [vendasRes, itensRes] = await Promise.all([
          supabase.from('vendas').select('id, numero_venda, valor_total, tipo_pedido, created_at').in('id', vendaIds),
          supabase.from('vendas_itens').select('id_venda, nome_produto_na_venda, quantidade, preco_unitario_na_venda').in('id_venda', vendaIds)
        ]);
        if (vendasRes.data) for (const v of vendasRes.data) vendasDetalhes[v.id] = v;
        if (itensRes.data) {
          for (const item of itensRes.data) {
            if (!vendasItensMap[item.id_venda]) vendasItensMap[item.id_venda] = [];
            vendasItensMap[item.id_venda].push(item);
          }
        }
      }
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
      paymentSheetOpen = false;
      showPaymentForm = false;
      await refreshPessoa();
    } catch (error) {
      addToast(error?.message || 'Não foi possível registrar o pagamento.', 'error');
    } finally {
      salvando = false;
    }
  }

  function solicitarExclusaoPagamento(entry) {
    if (excluindoPagamentoId || entry?.natureza !== 'pagamento') return;
    pagamentoPendenteExclusao = entry;
  }

  function fecharExclusaoPagamento() {
    if (!excluindoPagamentoId) pagamentoPendenteExclusao = null;
  }

  function handleExclusaoKeydown(event) {
    if (event.key === 'Escape') fecharExclusaoPagamento();
  }

  async function excluirPagamento() {
    const entry = pagamentoPendenteExclusao;
    if (excluindoPagamentoId || !entry) return;
    const valor = Math.abs(Number(entry.valor || 0));

    excluindoPagamentoId = entry.id;
    try {
      const { data, error } = await supabase.rpc('fiado_excluir_pagamento', {
        p_id_lancamento: entry.id
      });
      if (error) throw error;

      if (isSubUser) {
        logAuditAction({
          ownerUserId,
          action: 'fiado.pagamento_excluido',
          entityType: 'pessoa',
          entityId: pessoaSelecionada.id,
          details: { nome: pessoaSelecionada.nome, lancamentoId: entry.id, valor }
        });
      }

      addToast(`Pagamento de ${money(Number(data?.valor_excluido ?? valor))} excluído.`, 'success');
      await refreshPessoa();
    } catch (error) {
      addToast(error?.message || 'Não foi possível excluir o pagamento.', 'error');
    } finally {
      excluindoPagamentoId = null;
      pagamentoPendenteExclusao = null;
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
      const pessoaIdFromUrl = new URLSearchParams(window.location.search).get('p');
      if (pessoaIdFromUrl && pessoas.some((pessoa) => pessoa.id === pessoaIdFromUrl)) {
        await selecionar(pessoaIdFromUrl);
      }
    } catch (error) {
      errorMsg = error?.message || 'Não foi possível carregar o fichário.';
    } finally {
      loading = false;
    }
  });
</script>

<svelte:window on:keydown={handleExclusaoKeydown} />

<section class="fichario-page" aria-busy={loading}>
  <div class="fichario-shell">
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
    <div class="loading-layout" aria-label="Carregando fichário">
      <div class="skeleton-panel">
        <div class="skeleton" style="height:44px;border-radius:8px"></div>
        <div class="skeleton" style="height:72px;border-radius:14px"></div>
        <div class="skeleton" style="height:72px;border-radius:14px"></div>
        <div class="skeleton" style="height:72px;border-radius:14px"></div>
      </div>
      <div class="skeleton-panel">
        <div class="skeleton" style="height:200px;border-radius:16px"></div>
        <div class="skeleton" style="height:160px;border-radius:16px;margin-top:24px"></div>
      </div>
    </div>
  {:else}
      <div class="fichario-layout" class:has-selection={Boolean(pessoaSelecionada)}>
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
              <button class="person-card" class:active={pessoa.id === selectedPessoaId} on:click={() => selecionar(pessoa.id)} aria-pressed={pessoa.id === selectedPessoaId}>
                <span class="person-avatar">{avatarInitials(pessoa.nome)}</span>
                <div class="person-info">
                  <span class="person-name">{pessoa.nome}</span>
                  <span class="person-balance {estado.key}">{money(estado.value)}</span>
                </div>
                <span class="person-status-dot {estado.key}" aria-hidden="true"></span>
              </button>
            {/each}
          </div>
        {/if}
      </aside>

      <main class="detail-panel">
        {#if !pessoaSelecionada}
          <div class="empty-detail"><WalletCards size={48} aria-hidden="true" /><h2>Escolha uma pessoa</h2><p>Busque pelo nome para ver a ficha e registrar um pagamento.</p></div>
        {:else}
          <!-- Header Card -->
          <div class="header-card">
            <button class="mobile-back" on:click={() => selecionar('')} aria-label="Voltar para pessoas" title="Voltar para pessoas">
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
            <div class="header-left">
              <span class="header-avatar">{avatarInitials(pessoaSelecionada.nome)}</span>
              <div class="header-text">
                <h2 class="header-name">{pessoaSelecionada.nome}</h2>
                <span class="header-badge {estadoAtual.key}">{estadoAtual.label}</span>
              </div>
            </div>
            <div class="header-actions">
              <button class="icon-action" on:click={refreshPessoa} aria-label="Atualizar ficha" title="Atualizar ficha"><RefreshCw size={16} /></button>
              <div class="menu-wrapper">
                <button class="icon-action" on:click={() => (menuOpen = !menuOpen)} aria-label="Mais opções" title="Mais opções"><MoreHorizontal size={16} /></button>
                {#if menuOpen}
                  <!-- svelte-ignore a11y-click-events-have-key-events -->
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <div class="menu-dropdown" on:click|self={closeMenu}>
                    <a class="menu-item" href="/gestao/pessoas" on:click={closeMenu}>Gerenciar pessoas</a>
                    <button class="menu-item" on:click={closeMenu}>Fechar</button>
                  </div>
                {/if}
              </div>
            </div>
          </div>

          <!-- Hero Card -->
          <section class="hero-card" aria-label="Resumo financeiro">
            <div class="hero-top">
              <span class="hero-label">Saldo em fiado</span>
            </div>
            <output class="hero-balance {estadoAtual.key}">{money(estadoAtual.value)}</output>
            <div class="hero-actions">
              <button class="hero-btn-primary" on:click={togglePaymentForm}>
                <CircleDollarSign size={18} /> Registrar pagamento
              </button>
              {#if estadoAtual.key === 'devedor' && buildCobrancaUrl()}
                <button class="hero-btn-ghost" on:click={() => (sheetOpen = true)}>
                  <MessageCircle size={18} /> Cobrar cliente
                </button>
              {/if}
            </div>
          </section>

          <!-- Payment Card (inline, desktop only) -->
          {#if showPaymentForm}
            <section class="payment-card" aria-labelledby="payment-title">
              <div class="form-heading">
                <CircleDollarSign size={20} aria-hidden="true" />
                <div>
                  <h3 id="payment-title">Receber pagamento</h3>
                  <p>O pagamento pode quitar a dívida ou deixar crédito para a próxima compra.</p>
                </div>
              </div>
              <div class="payment-body">
                <label class="payment-field">
                  <span>Valor recebido</span>
                  <input type="number" min="0.01" step="0.01" inputmode="decimal" bind:value={valorPagamento} placeholder="0,00" />
                </label>
                <div class="prediction" aria-live="polite">
                  <span>Depois deste pagamento</span>
                  <strong class={estadoPrevisto.key}>{estadoPrevisto.label}: {money(estadoPrevisto.value)}</strong>
                </div>
                <div class="payment-options">
                  <label><input class="themed-checkbox" type="checkbox" bind:checked={addAoCaixa} /><span>Adicionar ao caixa atual</span></label>
                  <label><input class="themed-checkbox" type="checkbox" bind:checked={imprimirRecibo} /><span>Imprimir recibo</span></label>
                </div>
                <button class="payment-submit" disabled={salvando} on:click={registrarPagamento}>
                  {salvando ? 'Registrando...' : 'Registrar pagamento'}
                </button>
              </div>
            </section>
          {/if}

          <!-- History Card -->
          <section class="history-card" aria-labelledby="statement-title">
            <div class="history-header">
              <div>
                <h3 id="statement-title">Extrato</h3>
                <p>Cada compra e pagamento fica registrado na ficha.</p>
              </div>
              <span class="filter-trigger">
                <button class="filter-btn" on:click={() => (filterOpen = !filterOpen)} aria-label="Filtrar extrato" aria-expanded={filterOpen}>
                  <Filter size={14} aria-hidden="true" />
                </button>
                {#if filterOpen}
                  <!-- svelte-ignore a11y-click-events-have-key-events -->
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <div class="filter-dropdown" on:click|self={() => (filterOpen = false)}>
                    <button class="filter-option" class:active={selectedFilter === 'todos'} on:click={() => { selectedFilter = 'todos'; filterOpen = false; }}>Todos</button>
                    <button class="filter-option" class:active={selectedFilter === 'debitos'} on:click={() => { selectedFilter = 'debitos'; filterOpen = false; }}>Compras</button>
                    <button class="filter-option" class:active={selectedFilter === 'creditos'} on:click={() => { selectedFilter = 'creditos'; filterOpen = false; }}>Pagamentos</button>
                  </div>
                {/if}
              </span>
            </div>
            {#if loadingHistory}
              <div class="statement-loading">
                <div class="skeleton" style="height:64px;border-radius:10px"></div>
                <div class="skeleton" style="height:64px;border-radius:10px"></div>
                <div class="skeleton" style="height:64px;border-radius:10px"></div>
              </div>
            {:else if extratoFiltrado.length === 0}
              <div class="statement-empty">
                <ReceiptText size={28} aria-hidden="true" />
                <p>Ainda não há movimentos nesta pessoa após a implantação do extrato.</p>
              </div>
            {:else}
              <ol class="statement-list">
                {#each extratoFiltrado as entry (entry.id)}
                  {@const Icon = entryIcon(entry.natureza)}
                  {@const venda = vendasDetalhes[entry.id_venda]}
                  {@const itens = vendasItensMap[entry.id_venda] || []}
                  {@const isDebito = entry.natureza === 'debito_venda' && venda}
                  <li class="statement-entry">
                    <span class="entry-icon {entryState(entry.natureza)}"><Icon size={16} /></span>
                    <div class="entry-main">
                      <strong>{entry.meta.label}</strong>
                      <span>{entry.descricao || 'Movimento de fiado'} · {formatDate(entry.created_at)}</span>
                      {#if isDebito && itens.length > 0}
                        <button class="detail-toggle" on:click={() => toggleEntry(entry.id)} aria-expanded={expandedEntries.has(entry.id)}>
                          Venda #{venda.numero_venda} · {tipoPedidoLabel(venda.tipo_pedido)}
                           <ChevronDown class={expandedEntries.has(entry.id) ? 'toggle-chevron open' : 'toggle-chevron'} size={12} aria-hidden="true" />
                        </button>
                        {#if expandedEntries.has(entry.id)}
                          <ul class="detail-items">
                            {#each itens as item}
                              <li><span>{item.quantidade}x {item.nome_produto_na_venda}</span><span>{money(Number(item.preco_unitario_na_venda))}</span></li>
                            {/each}
                          </ul>
                        {/if}
                      {/if}
                    </div>
                    <div class="entry-values">
                      <div class="entry-numbers">
                        <strong class:debit={Number(entry.valor) > 0} class:credit={Number(entry.valor) < 0}>{Number(entry.valor) > 0 ? '+' : '−'}{money(Math.abs(Number(entry.valor)))}</strong>
                        <span>Saldo: {money(getFiadoState(entry.balanceAfter).value)} {entry.balanceAfter < 0 ? 'de crédito' : ''}</span>
                      </div>
                      {#if entry.natureza === 'pagamento'}
                        <button
                          class="entry-delete"
                          type="button"
                          disabled={excluindoPagamentoId === entry.id}
                          on:click={() => solicitarExclusaoPagamento(entry)}
                          aria-label={`Excluir pagamento de ${money(Math.abs(Number(entry.valor)))}`}
                          title="Excluir pagamento"
                        >
                          <X size={15} aria-hidden="true" />
                        </button>
                      {/if}
                    </div>
                  </li>
                {/each}
              </ol>
            {/if}
          </section>
        {/if}
      </main>
    </div>
    {/if}
  </div>
</section>

{#if sheetOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="sheet-overlay" on:click|self={() => (sheetOpen = false)}>
    <div class="sheet" role="dialog" aria-label="Enviar WhatsApp">
      <div class="sheet-handle"></div>
      <h3>Enviar para {pessoaSelecionada?.nome}</h3>

      <button class="sheet-option" on:click={() => { window.open(buildCobrancaUrl(), '_blank'); sheetOpen = false; }}>
        <div class="sheet-option-icon sheet-option-icon--green"><MessageCircle size={18} /></div>
        <div class="sheet-option-text">
          <span class="sheet-option-title">Cobrar saldo</span>
          <span class="sheet-option-desc">Mensagem com o valor devedor</span>
        </div>
      </button>
      <div class="sheet-option-preview">*{pessoaSelecionada?.nome}*, identificamos que o seu saldo em fiado é de *{money(estadoAtual.value)}*. Gostaríamos de solicitar a regularização. Entre em contato para acertar!</div>

      <button class="sheet-option" on:click={() => { window.open(buildConsumoUrl(), '_blank'); sheetOpen = false; }}>
        <div class="sheet-option-icon sheet-option-icon--blue"><ReceiptText size={18} /></div>
        <div class="sheet-option-text">
          <span class="sheet-option-title">Cobrar com extrato</span>
          <span class="sheet-option-desc">Saldo + compras recentes</span>
        </div>
      </button>
      <div class="sheet-option-preview">*{pessoaSelecionada?.nome}*, seu saldo em fiado é de *{money(estadoAtual.value)}*.

{#each extrato.filter(e => e.natureza === 'debito_venda').slice(0, 10) as entry}
  {@const d = new Date(entry.created_at)}{@const itens = vendasItensMap[entry.id_venda]}
  {#if itens && itens.length > 0}{#each itens as it}{String(d.getDate()).padStart(2, '0')}/{String(d.getMonth() + 1).padStart(2, '0')} — {it.nome_produto_na_venda} — {money(Number(it.preco_unitario_na_venda))}
{/each}{:else}{String(d.getDate()).padStart(2, '0')}/{String(d.getMonth() + 1).padStart(2, '0')} — {entry.descricao || 'Compra'} — {money(Math.abs(Number(entry.valor)))}
{/if}{/each}

Regularize quando puder!</div>

      <button class="sheet-cancel" on:click={() => (sheetOpen = false)}>Cancelar</button>
    </div>
  </div>
{/if}

{#if paymentSheetOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="sheet-overlay" on:click|self={closePaymentSheet}>
    <div class="sheet" role="dialog" aria-label="Registrar pagamento">
      <div class="sheet-handle"></div>
      <h3>Receber pagamento</h3>
      <p class="sheet-subtitle">O pagamento pode quitar a dívida ou deixar crédito.</p>

      <label class="payment-field">
        <span>Valor recebido</span>
        <input type="number" min="0.01" step="0.01" inputmode="decimal" bind:value={valorPagamento} placeholder="0,00" />
      </label>

      <div class="prediction" aria-live="polite">
        <span>Depois deste pagamento</span>
        <strong class={estadoPrevisto.key}>{estadoPrevisto.label}: {money(estadoPrevisto.value)}</strong>
      </div>

      <div class="payment-options">
        <label><input class="themed-checkbox" type="checkbox" bind:checked={addAoCaixa} /><span>Adicionar ao caixa atual</span></label>
        <label><input class="themed-checkbox" type="checkbox" bind:checked={imprimirRecibo} /><span>Imprimir recibo</span></label>
      </div>

      <div class="sheet-actions">
        <button class="sheet-cancel" on:click={closePaymentSheet}>Cancelar</button>
        <button class="payment-submit" disabled={salvando} on:click={registrarPagamento}>
          {salvando ? 'Registrando...' : 'Registrar pagamento'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if pagamentoPendenteExclusao}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="confirm-overlay" on:click|self={fecharExclusaoPagamento}>
    <section
      class="confirm-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-payment-title"
      aria-describedby="delete-payment-description"
      tabindex="-1"
    >
      <div class="confirm-dialog-icon"><TriangleAlert size={20} aria-hidden="true" /></div>
      <div class="confirm-dialog-copy">
        <p class="confirm-eyebrow">Excluir pagamento</p>
        <h3 id="delete-payment-title">Excluir pagamento recebido?</h3>
        <p id="delete-payment-description">
          O pagamento de <strong>{money(Math.abs(Number(pagamentoPendenteExclusao.valor || 0)))}</strong>
          será removido e o valor voltará para o saldo de {pessoaSelecionada?.nome || 'da pessoa'}.
        </p>
        <p class="confirm-warning">Essa ação não pode ser desfeita.</p>
      </div>
      <div class="confirm-actions">
        <button class="confirm-cancel" type="button" disabled={Boolean(excluindoPagamentoId)} on:click={fecharExclusaoPagamento}>Cancelar</button>
        <button class="confirm-danger" type="button" disabled={Boolean(excluindoPagamentoId)} on:click={excluirPagamento}>
          {excluindoPagamentoId ? 'Excluindo...' : 'Excluir pagamento'}
        </button>
      </div>
    </section>
  </div>
{/if}

<style>
  /* ── Page shell ── */
  .fichario-page { max-width: 1180px; margin: 0 auto; padding: 2rem; color: var(--text-label); }
  .page-header { display: flex; align-items: end; justify-content: space-between; gap: 1rem; padding-bottom: 1.5rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border-subtle); }
  .page-path, .section-label, .people-count { margin: 0 0 .25rem; color: var(--text-muted); font-size: .625rem; line-height: 1.2; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; }
  h1, h2, h3, p { margin-top: 0; }
  h1 { margin-bottom: .375rem; color: var(--text-main); font-size: 1.5rem; letter-spacing: -.01em; }
  h2 { margin-bottom: 0; color: var(--text-main); font-size: 1.25rem; letter-spacing: -.01em; }
  h3 { margin-bottom: .25rem; color: var(--text-main); font-size: 1rem; }
  .page-intro { max-width: 58ch; margin-bottom: 0; color: var(--text-muted); font-size: .875rem; line-height: 1.5; }

  /* ── Buttons ── */
  .secondary-action, .icon-action { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: .5rem; border-radius: 10px; font: inherit; font-size: .875rem; font-weight: 600; cursor: pointer; text-decoration: none; transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease; }
  .secondary-action { flex: none; padding: 0 .875rem; border: 1px solid var(--border-subtle); background: transparent; color: var(--text-label); }
  .secondary-action:hover { background: var(--bg-panel); color: var(--text-main); }
  .icon-action { width: 40px; padding: 0; border: 1px solid var(--border-subtle); background: transparent; color: var(--text-label); }
  .icon-action:hover { background: var(--bg-panel); color: var(--text-main); border-color: var(--border-strong); }
  :global(.secondary-action:focus-visible), :global(.icon-action:focus-visible), :global(button:focus-visible), :global(input:focus-visible), :global(select:focus-visible) { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent); }

  /* ── Feedback ── */
  .feedback { padding: .75rem 1rem; margin-bottom: 1rem; border: 1px solid var(--status-error-border); border-radius: 10px; background: var(--status-error-bg); color: var(--status-error-text); font-size: .875rem; }

  /* ── Two-column layout ── */
  .fichario-layout { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 1.5rem; align-items: start; }
  .people-panel { min-width: 0; border: 1px solid var(--border-card); border-radius: 14px; background: var(--bg-card); padding: 1rem; position: sticky; top: 1rem; }
  .detail-panel { min-width: 0; display: flex; flex-direction: column; gap: 1.5rem; }

  /* ── Search ── */
  .search-field { display: flex; align-items: center; gap: .5rem; min-height: 44px; padding: 0 .75rem; border: 1px solid var(--border-subtle); border-radius: 10px; color: var(--text-muted); background: var(--bg-input); }
  .search-field:focus-within { border-color: var(--primary); }
  .search-field input { min-width: 0; width: 100%; border: 0; background: transparent; color: var(--text-main); font: inherit; }
  .search-field input::placeholder { color: var(--text-muted); }
  .search-field input:focus { outline: 0; box-shadow: none; }
  .people-count { margin: 1rem .5rem .5rem; }

  /* ── Person cards ── */
  .people-list { display: grid; gap: .375rem; max-height: calc(100vh - 14rem); overflow-y: auto; padding-right: .25rem; }
  .person-card { width: 100%; min-height: 72px; display: flex; align-items: center; gap: .75rem; padding: .625rem .75rem; border: 1px solid transparent; border-radius: 14px; background: transparent; text-align: left; color: var(--text-label); cursor: pointer; transition: background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease; }
  .person-card:hover { background: var(--bg-panel); border-color: var(--border-subtle); box-shadow: 0 1px 3px rgba(0, 0, 0, .08); }
  .person-card.active { background: color-mix(in srgb, var(--primary) 6%, var(--bg-panel)); border-color: var(--primary); box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 22%, transparent); }
  .person-avatar { width: 36px; height: 36px; border-radius: 50%; background: color-mix(in srgb, var(--primary) 12%, transparent); color: var(--primary); display: grid; place-items: center; font-size: .8125rem; font-weight: 700; flex-shrink: 0; }
  .person-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .125rem; }
  .person-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-main); font-size: .875rem; font-weight: 600; }
  .person-balance { font-size: .75rem; font-variant-numeric: tabular-nums; }
  .person-balance.devedor, .person-status-dot.devedor { color: var(--status-warning-text); }
  .person-balance.credor, .person-status-dot.credor { color: var(--status-success-text); }
  .person-balance.neutro, .person-status-dot.neutro { color: var(--text-muted); }
  .person-status-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex-shrink: 0; }

  /* ── Empty states ── */
  .empty-list, .empty-detail { display: grid; place-items: center; gap: .5rem; color: var(--text-muted); text-align: center; }
  .empty-list { min-height: 12rem; padding: 1rem; font-size: .875rem; }
  .empty-list p, .empty-detail p { margin-bottom: 0; }
  .empty-detail { min-height: 24rem; }
  .empty-detail h2 { margin: .25rem 0 0; }

  /* ── Header card ── */
  .header-card { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.5rem 2rem; background: var(--bg-card); border: 1px solid var(--border-card); border-radius: 16px; }
  .header-left { display: flex; align-items: center; gap: 1rem; min-width: 0; }
  .header-avatar { width: 48px; height: 48px; border-radius: 50%; background: color-mix(in srgb, var(--primary) 12%, transparent); color: var(--primary); display: grid; place-items: center; font-size: 1.125rem; font-weight: 700; flex-shrink: 0; }
  .header-text { display: flex; flex-direction: column; gap: .25rem; min-width: 0; }
  .header-name { font-size: 1.75rem; font-weight: 700; color: var(--text-main); letter-spacing: -.02em; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .header-badge { display: inline-flex; align-items: center; padding: .25rem .625rem; border-radius: 999px; font-size: .75rem; font-weight: 600; width: fit-content; }
  .header-badge.devedor { background: var(--status-warning-bg); color: var(--status-warning-text); border: 1px solid var(--status-warning-border); }
  .header-badge.credor { background: var(--status-success-bg); color: var(--status-success-text); border: 1px solid var(--status-success-border); }
  .header-badge.neutro { background: var(--bg-input); color: var(--text-muted); border: 1px solid var(--border-subtle); }
  .header-actions { display: flex; align-items: center; gap: .5rem; flex-shrink: 0; }
  .menu-wrapper { position: relative; }
  .menu-dropdown { position: absolute; top: calc(100% + 4px); right: 0; min-width: 180px; background: var(--bg-card); border: 1px solid var(--border-card); border-radius: 10px; padding: .25rem; box-shadow: 0 8px 24px rgba(0, 0, 0, .25); z-index: 20; }
  .menu-item { display: block; width: 100%; padding: .5rem .75rem; border: 0; border-radius: 8px; background: transparent; color: var(--text-label); font: inherit; font-size: .8125rem; text-align: left; text-decoration: none; cursor: pointer; transition: background-color 150ms ease; }
  .menu-item:hover { background: var(--bg-panel); color: var(--text-main); }

  /* ── Hero card ── */
  .hero-card { padding: 2rem; background: var(--bg-card); border: 1px solid var(--border-card); border-radius: 16px; }
  .hero-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: .5rem; }
  .hero-label { color: var(--text-muted); font-size: .875rem; font-weight: 500; }
  .hero-badge { display: inline-flex; align-items: center; padding: .25rem .625rem; border-radius: 999px; font-size: .75rem; font-weight: 600; }
  .hero-badge.devedor { background: var(--status-warning-bg); color: var(--status-warning-text); border: 1px solid var(--status-warning-border); }
  .hero-badge.credor { background: var(--status-success-bg); color: var(--status-success-text); border: 1px solid var(--status-success-border); }
  .hero-badge.neutro { background: var(--bg-input); color: var(--text-muted); border: 1px solid var(--border-subtle); }
  .hero-balance { display: block; font-size: 2.75rem; line-height: 1.1; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -.02em; margin-bottom: 1.5rem; }
  .hero-balance.devedor { color: var(--status-warning-text); }
  .hero-balance.credor { color: var(--status-success-text); }
  .hero-balance.neutro { color: var(--text-main); }
  .hero-actions { display: flex; gap: .75rem; }
  .hero-btn-primary { min-height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: .5rem; padding: 0 1.25rem; border: 0; border-radius: 12px; background: var(--primary); color: var(--primary-text); font: inherit; font-size: .9375rem; font-weight: 600; cursor: pointer; transition: background-color 150ms ease, box-shadow 150ms ease; }
  .hero-btn-primary:hover { background: var(--primary-hover); box-shadow: 0 2px 8px color-mix(in srgb, var(--primary) 30%, transparent); }
  .hero-btn-ghost { min-height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: .5rem; padding: 0 1.25rem; border: 1px solid var(--status-success-border); border-radius: 12px; background: var(--status-success-bg); color: var(--status-success-text); font: inherit; font-size: .9375rem; font-weight: 600; cursor: pointer; transition: background-color 150ms ease, border-color 150ms ease; }
  .hero-btn-ghost:hover { background: color-mix(in srgb, var(--success) 15%, transparent); border-color: var(--success); }

  /* ── Payment card ── */
  .payment-card { padding: 1.5rem 2rem; background: var(--bg-card); border: 1px solid var(--border-card); border-radius: 16px; }
  .form-heading { display: flex; gap: .75rem; color: var(--primary); }
  .form-heading p, .history-header p { margin-bottom: 0; color: var(--text-muted); font-size: .875rem; line-height: 1.45; }
  .payment-body { margin-top: 1.25rem; display: grid; gap: 1rem; }
  .payment-field { display: grid; gap: .375rem; }
  .payment-field span { color: var(--text-label); font-size: .8125rem; font-weight: 600; }
  .payment-field input { min-height: 48px; box-sizing: border-box; padding: 0 .875rem; border: 1px solid var(--border-subtle); border-radius: 10px; background: var(--bg-input); color: var(--text-main); font: inherit; font-size: 1rem; font-variant-numeric: tabular-nums; }
  .payment-field input:focus { border-color: var(--primary); outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 16%, transparent); }
  .payment-field input::placeholder { color: var(--text-muted); }
  .prediction { min-height: 48px; padding: .625rem .875rem; box-sizing: border-box; border-radius: 10px; background: var(--bg-input); border: 1px solid var(--border-subtle); }
  .prediction span { display: block; color: var(--text-muted); font-size: .75rem; }
  .prediction strong { display: block; margin-top: .125rem; font-size: .9375rem; font-variant-numeric: tabular-nums; }
  .prediction strong.devedor { color: var(--status-warning-text); }
  .prediction strong.credor { color: var(--status-success-text); }
  .prediction strong.neutro { color: var(--text-main); }
  .payment-options { display: flex; flex-wrap: wrap; gap: 1rem; }
  .payment-options label { min-height: 28px; display: inline-flex; align-items: center; gap: .5rem; color: var(--text-label); font-size: .875rem; cursor: pointer; }
  .payment-submit { min-height: 48px; display: flex; align-items: center; justify-content: center; padding: 0 1.25rem; border: 0; border-radius: 12px; background: var(--primary); color: var(--primary-text); font: inherit; font-size: .9375rem; font-weight: 600; cursor: pointer; transition: background-color 150ms ease; }
  .payment-submit:hover:not(:disabled) { background: var(--primary-hover); }
  .payment-submit:disabled { cursor: wait; opacity: .65; }

  /* ── History card ── */
  .history-card { padding: 1.5rem 2rem; background: var(--bg-card); border: 1px solid var(--border-card); border-radius: 16px; }
  .history-header { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
  /* ── Filter icon + popup ── */
  .filter-trigger { position: relative; flex-shrink: 0; }
  .filter-btn { width: 32px; height: 32px; display: grid; place-items: center; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-input); color: var(--text-muted); cursor: pointer; transition: border-color 150ms, color 150ms, box-shadow 150ms; }
  .filter-btn:hover { border-color: var(--border-strong); color: var(--text-label); }
  .filter-btn:focus-visible { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 14%, transparent); }
  .filter-btn[aria-expanded="true"] { border-color: var(--primary); color: var(--primary); }
  .filter-dropdown { position: absolute; top: calc(100% + 4px); right: 0; min-width: 140px; background: var(--bg-card); border: 1px solid var(--border-card); border-radius: 10px; padding: .25rem; box-shadow: 0 8px 24px rgba(0,0,0,.25); z-index: 20; }
  .filter-option { display: block; width: 100%; padding: .5rem .75rem; border: 0; border-radius: 7px; background: transparent; color: var(--text-label); font: inherit; font-size: .8125rem; text-align: left; cursor: pointer; transition: background 150ms; }
  .filter-option:hover { background: var(--bg-panel); }
  .filter-option.active { background: color-mix(in srgb, var(--primary) 8%, transparent); color: var(--primary); font-weight: 600; }
  .statement-list { display: grid; margin: 1.25rem 0 0; padding: 0; list-style: none; }
  .statement-entry { display: grid; grid-template-columns: 36px minmax(0, 1fr) max-content; gap: .75rem; align-items: center; padding: 1rem 0; border-bottom: 1px solid var(--border-card); }
  .statement-entry:last-child { border-bottom: none; }
  .entry-icon { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 50%; background: var(--bg-input); }
  .entry-icon.debit { color: var(--status-warning-text); }
  .entry-icon.credit { color: var(--status-success-text); }
  .entry-main { min-width: 0; display: grid; gap: .125rem; }
  .entry-main strong { color: var(--text-main); font-size: .875rem; }
  .entry-main span { overflow: hidden; color: var(--text-muted); font-size: .75rem; text-overflow: ellipsis; white-space: nowrap; }
  .entry-values { display: flex; align-items: center; justify-content: flex-end; gap: .75rem; min-width: 0; font-variant-numeric: tabular-nums; }
  .entry-numbers { display: grid; gap: .125rem; text-align: right; }
  .entry-values strong { font-size: .875rem; }
  .entry-values strong.debit { color: var(--status-warning-text); }
  .entry-values strong.credit { color: var(--status-success-text); }
  .entry-values span { display: block; color: var(--text-muted); font-size: .75rem; }
  .entry-delete { width: 36px; height: 36px; display: inline-grid; flex: 0 0 36px; place-items: center; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--text-muted); cursor: pointer; line-height: 0; transition: color 150ms ease; }
  .entry-delete:hover:not(:disabled) { color: var(--status-error-text); }
  .entry-delete:focus-visible { outline: 2px solid var(--status-error-text); outline-offset: 2px; color: var(--status-error-text); }
  .entry-delete:disabled { cursor: wait; opacity: .55; }
  .statement-loading { display: grid; gap: .75rem; min-height: 9rem; margin-top: 1rem; }
  .statement-empty { display: grid; place-items: center; gap: .5rem; min-height: 9rem; margin-top: 1rem; border: 1px dashed var(--border-subtle); border-radius: 10px; color: var(--text-muted); text-align: center; }
  .statement-empty p { margin-bottom: 0; }

  /* ── Skeleton ── */
  .skeleton { border: 1px solid var(--border-card); border-radius: 12px; background: linear-gradient(90deg, var(--bg-panel) 0%, color-mix(in srgb, var(--bg-panel) 60%, var(--bg-card)) 50%, var(--bg-panel) 100%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite; }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  .skeleton-panel { display: flex; flex-direction: column; gap: .75rem; }
  .loading-layout { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 1.5rem; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }

  /* ── Detail toggle ── */
  .detail-toggle { display: inline-flex; align-items: center; gap: .25rem; margin-top: .25rem; padding: .125rem .375rem; border: 0; border-radius: 4px; background: transparent; color: var(--text-label); font: inherit; font-size: .75rem; font-weight: 600; cursor: pointer; transition: background-color 150ms ease; }
  .detail-toggle:hover { background: var(--bg-panel); }
  .toggle-chevron { display: inline-block; transition: transform 150ms ease; }
  .toggle-chevron.open { transform: rotate(180deg); }
  .detail-items { margin: .375rem 0 0; padding: 0; list-style: none; }
  .detail-items li { display: flex; justify-content: space-between; gap: .5rem; padding: .125rem 0; font-size: .75rem; color: var(--text-muted); }
  .detail-items li span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail-items li span:last-child { flex-shrink: 0; font-variant-numeric: tabular-nums; color: var(--text-label); }

  /* ── Native ZeloPDV confirmation ── */
  .confirm-overlay { position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; padding: 1rem; background: color-mix(in srgb, var(--bg-app) 76%, transparent); backdrop-filter: blur(3px); }
  .confirm-dialog { width: min(100%, 420px); padding: 1.25rem; border: 1px solid var(--border-card); border-radius: 16px; background: var(--bg-card); box-shadow: var(--shadow-modal); }
  .confirm-dialog-icon { width: 40px; height: 40px; display: grid; place-items: center; margin-bottom: .875rem; border-radius: 12px; background: var(--status-error-bg); color: var(--status-error-text); }
  .confirm-dialog-copy h3 { margin-bottom: .5rem; color: var(--text-main); font-size: 1rem; }
  .confirm-eyebrow { margin-bottom: .375rem; color: var(--status-error-text); font-size: .625rem; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
  .confirm-dialog-copy p { color: var(--text-label); font-size: .8125rem; line-height: 1.5; }
  .confirm-dialog-copy p strong { color: var(--text-main); font-variant-numeric: tabular-nums; }
  .confirm-dialog-copy .confirm-warning { margin-bottom: 0; color: var(--text-muted); font-size: .75rem; }
  .confirm-actions { display: flex; justify-content: flex-end; gap: .625rem; margin-top: 1.25rem; }
  .confirm-cancel, .confirm-danger { min-height: 44px; padding: 0 1rem; border-radius: 10px; font: inherit; font-size: .8125rem; font-weight: 600; cursor: pointer; transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease; }
  .confirm-cancel { border: 1px solid var(--border-subtle); background: transparent; color: var(--text-label); }
  .confirm-cancel:hover:not(:disabled) { border-color: var(--border-strong); background: var(--bg-panel); color: var(--text-main); }
  .confirm-danger { border: 1px solid var(--error); background: var(--error); color: var(--primary-text); }
  .confirm-danger:hover:not(:disabled) { filter: brightness(1.08); }
  .confirm-cancel:disabled, .confirm-danger:disabled { cursor: wait; opacity: .65; }

  /* ── Bottom sheet ── */
  .sheet-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, .5); display: flex; align-items: flex-end; justify-content: center; z-index: 100; }
  .sheet { background: var(--bg-panel); border-radius: 14px 14px 0 0; width: 100%; max-width: 420px; padding: .625rem 1rem 1.25rem; }
  .sheet-handle { width: 32px; height: 3px; background: var(--border-subtle); border-radius: 2px; margin: 0 auto .75rem; }
  .sheet h3 { font-size: .875rem; color: var(--text-main); margin-bottom: .625rem; }
  .sheet-subtitle { margin-bottom: .75rem; color: var(--text-muted); font-size: .8125rem; }
  .sheet-option { display: flex; align-items: center; gap: .625rem; width: 100%; padding: .75rem; border: 1px solid var(--border-subtle); border-radius: 10px; background: transparent; cursor: pointer; text-align: left; color: var(--text-label); font: inherit; transition: border-color 150ms, background 150ms; }
  .sheet-option:hover { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 4%, transparent); }
  .sheet-option-icon { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; flex-shrink: 0; }
  .sheet-option-icon--green { background: var(--status-success-bg); color: var(--success); }
  .sheet-option-icon--blue { background: var(--accent-light); color: var(--primary); }
  .sheet-option-text { flex: 1; min-width: 0; }
  .sheet-option-title { display: block; font-size: .8125rem; font-weight: 600; color: var(--text-main); }
  .sheet-option-desc { display: block; font-size: .6875rem; color: var(--text-muted); margin-top: .0625rem; }
  .sheet-option-preview { box-sizing: border-box; width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: 6px; padding: .5rem .625rem; margin: .375rem 0 .625rem; font-size: .6875rem; color: var(--text-muted); line-height: 1.45; white-space: pre-line; max-height: 8rem; overflow-y: auto; }
  .sheet-cancel { width: 100%; min-height: 44px; margin-top: .25rem; background: transparent; border: 1px solid var(--border-subtle); border-radius: 8px; color: var(--text-muted); font: inherit; font-size: .8125rem; font-weight: 600; cursor: pointer; transition: background 150ms, color 150ms; }
  .sheet-cancel:hover { background: var(--bg-input); color: var(--text-label); }
  .sheet-actions { display: flex; align-items: center; justify-content: space-between; gap: .75rem; margin-top: .75rem; }
  .sheet-actions .sheet-cancel { width: auto; min-width: 80px; margin-top: 0; padding: 0 .5rem; border-color: transparent; font-size: .75rem; }
  .sheet-actions .payment-submit { flex: 0 0 auto; min-width: 184px; }

  /* ── Mobile ── */
  @media (max-width: 760px) {
    .fichario-page { padding: 1rem; }
    .page-header { align-items: start; flex-direction: column; }
    .secondary-action { width: 100%; }
    .fichario-layout, .loading-layout { grid-template-columns: 1fr; }
    .people-panel { padding: .75rem; position: static; }
    .people-list { max-height: 16rem; }
    .person-card { min-height: 60px; padding: .5rem .625rem; gap: .625rem; border-radius: 12px; }
    .person-avatar { width: 32px; height: 32px; font-size: .75rem; }
    .detail-panel { gap: 1rem; }
    .header-card { padding: 1.25rem; border-radius: 14px; }
    .header-avatar { width: 40px; height: 40px; font-size: 1rem; }
    .header-name { font-size: 1.375rem; }
    .hero-card { padding: 1.25rem; border-radius: 14px; }
    .hero-balance { font-size: 2.25rem; margin-bottom: 1rem; }
    .hero-actions { flex-direction: column; gap: .5rem; }
    .hero-btn-primary, .hero-btn-ghost { width: 100%; }
    .payment-card { display: none; }
    .history-card { padding: 1.25rem; border-radius: 14px; }
    .history-header { flex-direction: column; gap: .75rem; }
    .filter-trigger { align-self: flex-end; }
    .statement-entry { grid-template-columns: 32px minmax(0, 1fr); gap: .625rem; }
    .entry-values { grid-column: 2; justify-content: space-between; text-align: left; }
    .entry-numbers { text-align: left; }
    .entry-main span { white-space: normal; }
    .detail-toggle { min-height: 44px; width: 100%; justify-content: flex-start; }
    .sheet { padding: .625rem .75rem 1rem; }
    .sheet-option-preview { margin-left: 0; }
  }

  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; } }

  /* ── Fichário workspace ── */
  .fichario-page {
    width: 100%;
    max-width: 1280px;
    height: calc(100dvh - 4rem);
    min-height: 640px;
    margin: 0 auto;
    padding: 0;
  }

  .fichario-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--border-card);
    border-radius: 16px;
    background: var(--bg-input);
  }

  .fichario-shell .page-header {
    flex: 0 0 auto;
    margin: 0;
    padding: 1.25rem 1.5rem;
    border-bottom-color: var(--border-card);
  }

  .fichario-shell .feedback {
    flex: 0 0 auto;
    margin: .75rem 1rem 0;
  }

  .fichario-layout {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    flex: 1 1 auto;
    min-height: 0;
    gap: 0;
  }

  .fichario-layout .people-panel {
    position: static;
    min-height: 0;
    overflow-y: auto;
    border: 0;
    border-right: 1px solid var(--border-card);
    border-radius: 0;
    background: transparent;
    padding: 1rem;
  }

  .fichario-layout .people-list {
    max-height: none;
  }

  .fichario-layout .detail-panel {
    min-height: 0;
    overflow-y: auto;
    gap: 1rem;
    padding: 1rem 1.25rem 1.25rem;
  }

  .mobile-back {
    display: none;
  }

  .fichario-layout .header-card {
    flex: 0 0 auto;
    padding: 1rem 0;
    border: 0;
    border-bottom: 1px solid var(--border-card);
    border-radius: 0;
    background: transparent;
  }

  .fichario-layout .header-name {
    font-size: 1.25rem;
  }

  .fichario-layout .hero-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto auto;
    align-items: end;
    gap: .25rem 1rem;
    flex: 0 0 auto;
    padding: 1rem 0 1.25rem;
    border: 0;
    border-bottom: 1px solid var(--border-card);
    border-radius: 0;
    background: transparent;
  }

  .fichario-layout .hero-top {
    grid-column: 1;
    margin: 0;
  }

  .fichario-layout .hero-balance {
    grid-column: 1;
    margin: 0;
    font-size: 2.25rem;
  }

  .fichario-layout .hero-actions {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: end;
    justify-content: flex-end;
  }

  .fichario-layout .payment-card {
    flex: 0 0 auto;
    padding: 1rem;
    border-radius: 12px;
  }

  .fichario-layout .payment-body {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
    grid-template-areas:
      "field prediction submit"
      "options options submit";
    align-items: end;
    column-gap: .75rem;
  }

  .fichario-layout .payment-field { grid-area: field; }
  .fichario-layout .prediction { grid-area: prediction; }
  .fichario-layout .payment-options { grid-area: options; }
  .fichario-layout .payment-submit { grid-area: submit; min-width: 180px; }

  .fichario-layout .history-card {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 220px;
    overflow: hidden;
    padding: 1rem;
    border-radius: 12px;
  }

  .fichario-layout .statement-list {
    min-height: 0;
    overflow-y: auto;
  }

  .sheet-overlay {
    align-items: center;
    justify-content: flex-end;
    padding: 1rem;
  }

  .sheet {
    border: 1px solid var(--border-subtle);
    border-radius: 14px;
    width: min(400px, 100%);
    padding: 1rem;
  }

  @media (max-width: 760px) {
    .fichario-page {
      height: auto;
      min-height: calc(100dvh - 4rem);
      padding: 0;
    }

    .fichario-shell {
      min-height: calc(100dvh - 4rem);
      overflow: visible;
      border: 0;
      border-radius: 0;
      background: transparent;
    }

    .fichario-shell .page-header {
      align-items: flex-start;
      gap: .875rem;
      padding: .25rem 0 1rem;
    }

    .fichario-shell .page-intro {
      max-width: 34ch;
    }

    .fichario-shell .secondary-action {
      width: 100%;
    }

    .fichario-layout {
      display: block;
    }

    .fichario-layout .people-panel {
      display: block;
      max-height: none;
      margin-top: 1rem;
      overflow: visible;
      border: 1px solid var(--border-card);
      border-radius: 12px;
      background: var(--bg-card);
      padding: .75rem;
    }

    .fichario-layout .detail-panel {
      display: flex;
      overflow: visible;
      padding: 1rem 0 2rem;
    }

    .fichario-layout.has-selection .people-panel {
      display: none;
    }

    .fichario-layout:not(.has-selection) .detail-panel {
      display: flex;
    }

    .fichario-layout:not(.has-selection) .empty-detail {
      width: 100%;
      min-height: 17rem;
      padding: 1rem;
    }

    .fichario-layout.has-selection .detail-panel {
      gap: .75rem;
    }

    .fichario-layout .header-card {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: .75rem;
      padding: 1rem;
      border: 1px solid var(--border-card);
      border-radius: 12px;
      background: var(--bg-card);
    }

    .fichario-layout .mobile-back {
      display: inline-flex;
      width: 40px;
      height: 40px;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      padding: 0;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      background: transparent;
      color: var(--text-label);
      cursor: pointer;
    }

    .fichario-layout .header-left {
      gap: .625rem;
    }

    .fichario-layout .header-avatar {
      width: 40px;
      height: 40px;
      font-size: .875rem;
    }

    .fichario-layout .header-name {
      font-size: 1.25rem;
    }

    .fichario-layout .header-actions {
      gap: .375rem;
    }

    .fichario-layout .header-actions .icon-action {
      width: 40px;
    }

    .fichario-layout .hero-card {
      grid-template-columns: 1fr;
      grid-template-rows: auto;
      gap: .375rem;
      padding: 1rem;
      border: 1px solid var(--border-card);
      border-radius: 12px;
      background: var(--bg-card);
    }

    .fichario-layout .hero-top,
    .fichario-layout .hero-balance,
    .fichario-layout .hero-actions {
      grid-column: 1;
      grid-row: auto;
    }

    .fichario-layout .hero-balance {
      margin: .125rem 0 .5rem;
      font-size: 2.25rem;
    }

    .fichario-layout .hero-actions {
      flex-direction: column;
      gap: .5rem;
    }

    .fichario-layout .hero-btn-primary,
    .fichario-layout .hero-btn-ghost {
      width: 100%;
    }

    .fichario-layout .payment-card {
      display: none;
    }

    .fichario-layout .history-card {
      min-height: 0;
      overflow: visible;
      padding: 1rem;
      border-radius: 12px;
    }

    .fichario-layout .statement-list {
      overflow: visible;
    }

    .sheet-overlay {
      align-items: flex-end;
      justify-content: center;
      padding: 0;
    }

    .sheet {
      border-bottom: 0;
      border-radius: 14px 14px 0 0;
      max-width: 420px;
    }
  }
</style>

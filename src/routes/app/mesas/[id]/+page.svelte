<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabaseClient';
  import { hasMesasAddon } from '$lib/guards';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import { pdvCache } from '$lib/stores/pdvCache';

  let userId = '';
  let addonActive = false;
  let ready = false;

  let mesaId = '';
  let mesa = null;
  let comanda = null;
  let itens = [];
  let produtos = [];
  let categorias = [];
  let loading = true;
  let savingItem = false;

  // Filtros / busca
  let busca = '';
  let categoriaFiltro = null; // id_categoria | null para "Todos"

  // Fechamento
  let closeModalOpen = false;
  let preContaOpen = false;
  let closing = false;
  let formaPagamento = 'dinheiro';
  let valorRecebido = 0;
  let pessoaFiadoId = null;
  let pessoas = [];
  let idCaixaAberto = null;
  let recibo = null; // dados da venda fechada (mostra após close)
  let recibosOpen = false;
  let nomeEmpresa = '';

  $: troco = formaPagamento === 'dinheiro'
    ? Math.max(0, Number(valorRecebido || 0) - total)
    : 0;
  $: faltaPagar = formaPagamento === 'dinheiro'
    ? Math.max(0, total - Number(valorRecebido || 0))
    : 0;

  $: mesaId = $page.params.id;

  $: subtotal = itens.reduce((acc, it) => acc + Number(it.preco_unitario) * Number(it.quantidade), 0);
  $: desconto = comanda ? Number(comanda.desconto || 0) : 0;
  $: couvert = comanda ? Number(comanda.couvert_valor || 0) : 0;
  $: taxaPct = comanda ? Number(comanda.taxa_servico_pct || 0) : 0;
  $: taxaValor = (subtotal + couvert - desconto) * (taxaPct / 100);
  $: total = Math.max(0, subtotal + couvert - desconto + taxaValor);

  $: produtosFiltrados = produtos.filter(p => {
    if (p.ativo === false) return false;
    if (categoriaFiltro != null && p.id_categoria !== categoriaFiltro) return false;
    if (busca.trim() && !p.nome.toLowerCase().includes(busca.trim().toLowerCase())) return false;
    return true;
  });

  onMount(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id || '';
    if (!userId) {
      window.location.href = '/login';
      return;
    }

    addonActive = await hasMesasAddon(userId);
    if (!addonActive) {
      ready = true;
      return;
    }

    pdvCache.setUserId(userId);
    ready = true;

    await Promise.all([
      loadMesaAndComanda(),
      loadProdutos(),
      loadCaixaEPerfil(),
    ]);
  });

  async function loadCaixaEPerfil() {
    // Open caixa (optional — id_caixa is nullable, but we attach when available)
    const { data: caixas } = await supabase
      .from('caixas')
      .select('id')
      .eq('id_usuario', userId)
      .is('data_fechamento', null)
      .order('data_abertura', { ascending: false })
      .limit(1);
    idCaixaAberto = caixas?.[0]?.id ?? null;

    // Empresa name for receipt
    const { data: perfil } = await supabase
      .from('empresa_perfil')
      .select('nome_exibicao')
      .eq('user_id', userId)
      .maybeSingle();
    nomeEmpresa = perfil?.nome_exibicao || '';
  }

  async function loadPessoasFiado() {
    if (pessoas.length > 0) return;
    const { data } = await supabase
      .from('pessoas')
      .select('id, nome, saldo_fiado')
      .order('nome', { ascending: true });
    pessoas = data || [];
  }

  async function loadMesaAndComanda() {
    loading = true;

    const { data: m, error: mErr } = await supabase
      .from('mesas')
      .select('*')
      .eq('id', mesaId)
      .maybeSingle();

    if (mErr || !m) {
      addToast('Mesa não encontrada.', 'error');
      goto('/app/mesas');
      return;
    }
    mesa = m;

    // Find or create the open comanda for this mesa
    let { data: c } = await supabase
      .from('comandas')
      .select('*')
      .eq('id_mesa', mesaId)
      .eq('status', 'aberta')
      .maybeSingle();

    if (!c) {
      const { data: created, error: insErr } = await supabase
        .from('comandas')
        .insert({
          id_mesa: mesaId,
          id_usuario: userId,
          status: 'aberta',
          num_pessoas: 1,
        })
        .select()
        .single();
      if (insErr) {
        addToast('Erro ao abrir comanda: ' + insErr.message, 'error');
        return;
      }
      c = created;
      // Mesa para 'ocupada'
      await supabase.from('mesas').update({ status: 'ocupada' }).eq('id', mesaId);
      mesa.status = 'ocupada';
    }
    comanda = c;

    await loadItens();
    loading = false;
  }

  async function loadItens() {
    const { data, error } = await supabase
      .from('comanda_itens')
      .select('*, produtos(nome)')
      .eq('id_comanda', comanda.id)
      .order('created_at', { ascending: true });
    if (error) {
      addToast('Erro ao carregar itens: ' + error.message, 'error');
      return;
    }
    itens = (data || []).map(i => ({
      ...i,
      nome_produto: i.produtos?.nome || '(produto removido)',
    }));
  }

  async function loadProdutos() {
    produtos = await pdvCache.getProdutos();
    categorias = await pdvCache.getCategorias();
  }

  async function adicionarProduto(produto) {
    if (!comanda || savingItem) return;
    savingItem = true;

    // If item already in comanda, increment quantity instead of duplicating
    const existing = itens.find(i => i.id_produto === produto.id);
    if (existing) {
      const newQty = Number(existing.quantidade) + 1;
      const { error } = await supabase
        .from('comanda_itens')
        .update({ quantidade: newQty })
        .eq('id', existing.id);
      if (error) {
        addToast('Erro ao atualizar item: ' + error.message, 'error');
      } else {
        itens = itens.map(i => i.id === existing.id ? { ...i, quantidade: newQty } : i);
      }
      savingItem = false;
      return;
    }

    const { data, error } = await supabase
      .from('comanda_itens')
      .insert({
        id_comanda: comanda.id,
        id_produto: produto.id,
        quantidade: 1,
        preco_unitario: produto.preco,
      })
      .select('*')
      .single();

    savingItem = false;

    if (error) {
      addToast('Erro ao adicionar item: ' + error.message, 'error');
      return;
    }
    itens = [...itens, { ...data, nome_produto: produto.nome }];
  }

  async function alterarQuantidade(item, delta) {
    const novaQtd = Number(item.quantidade) + delta;
    if (novaQtd <= 0) {
      const ok = await confirmAction('Remover item', `Remover "${item.nome_produto}" da comanda?`);
      if (!ok) return;
      const { error } = await supabase.from('comanda_itens').delete().eq('id', item.id);
      if (error) {
        addToast('Erro ao remover: ' + error.message, 'error');
        return;
      }
      itens = itens.filter(i => i.id !== item.id);
      return;
    }
    const { error } = await supabase
      .from('comanda_itens')
      .update({ quantidade: novaQtd })
      .eq('id', item.id);
    if (error) {
      addToast('Erro ao atualizar: ' + error.message, 'error');
      return;
    }
    itens = itens.map(i => i.id === item.id ? { ...i, quantidade: novaQtd } : i);
  }

  async function atualizarComanda(campo, valor) {
    const { error } = await supabase
      .from('comandas')
      .update({ [campo]: valor })
      .eq('id', comanda.id);
    if (error) {
      addToast('Erro ao salvar: ' + error.message, 'error');
      return;
    }
    comanda = { ...comanda, [campo]: valor };
  }

  async function cancelarComanda() {
    const ok = await confirmAction(
      'Cancelar comanda',
      'Tem certeza? Todos os itens serão removidos e a mesa voltará a ficar livre.'
    );
    if (!ok) return;

    await supabase.from('comandas').update({ status: 'cancelada', fechada_em: new Date().toISOString() }).eq('id', comanda.id);
    await supabase.from('mesas').update({ status: 'livre' }).eq('id', mesaId);
    addToast('Comanda cancelada.', 'info');
    goto('/app/mesas');
  }

  async function abrirCloseModal() {
    if (itens.length === 0) {
      addToast('Adicione itens antes de fechar a mesa.', 'warning');
      return;
    }
    formaPagamento = 'dinheiro';
    valorRecebido = total;
    pessoaFiadoId = null;
    closeModalOpen = true;
    // Update mesa status para 'fechando' (cosmético)
    if (mesa.status !== 'fechando') {
      await supabase.from('mesas').update({ status: 'fechando' }).eq('id', mesaId);
      mesa = { ...mesa, status: 'fechando' };
    }
    if (formaPagamento === 'fiado') loadPessoasFiado();
  }

  async function onFormaChange() {
    if (formaPagamento === 'fiado') await loadPessoasFiado();
  }

  function fecharCloseModal() {
    if (closing) return;
    closeModalOpen = false;
  }

  async function fecharMesa() {
    if (closing) return;

    // Validations
    if (itens.length === 0) {
      addToast('Comanda vazia.', 'warning');
      return;
    }
    if (formaPagamento === 'dinheiro' && Number(valorRecebido || 0) < total) {
      addToast('Valor recebido menor que o total.', 'warning');
      return;
    }
    if (formaPagamento === 'fiado' && !pessoaFiadoId) {
      addToast('Selecione o cliente para o fiado.', 'warning');
      return;
    }

    closing = true;
    try {
      const valorTotal = Math.round(total * 100) / 100;
      const valorRecebidoFinal = formaPagamento === 'dinheiro' ? Number(valorRecebido) : null;
      const valorTroco = formaPagamento === 'dinheiro' ? Math.max(0, Number(valorRecebido) - valorTotal) : 0;
      const idClienteForVenda = formaPagamento === 'fiado' ? pessoaFiadoId : null;

      // 1. Insert venda
      const dadosVenda = {
        valor_total: valorTotal,
        forma_pagamento: formaPagamento,
        valor_recebido: valorRecebidoFinal,
        valor_troco: valorTroco,
        id_usuario: userId,
        id_caixa: idCaixaAberto,
        id_cliente: idClienteForVenda,
        valor_desconto: Math.round(desconto * 100) / 100 || 0,
        tipo_pedido: 'mesa',
        taxa_entrega: 0,
      };

      const { data: venda, error: vendaErr } = await supabase
        .from('vendas')
        .insert(dadosVenda)
        .select('id, numero_venda')
        .single();
      if (vendaErr) throw new Error(vendaErr.message);
      const vendaId = venda.id;

      // 2. Insert vendas_itens (mapping comanda_itens, snapshot, qty rounded to int)
      const itensPayload = itens.map(i => ({
        id_usuario: userId,
        id_venda: vendaId,
        id_produto: i.id_produto ?? null,
        quantidade: Math.max(1, Math.round(Number(i.quantidade))),
        nome_produto_na_venda: i.nome_produto || '',
        preco_unitario_na_venda: Number(i.preco_unitario),
      }));

      const { error: itensErr } = await supabase.from('vendas_itens').insert(itensPayload);
      if (itensErr) {
        await supabase.from('vendas').delete().eq('id', vendaId);
        throw new Error(itensErr.message);
      }

      // 3. Fiado: lançar débito
      if (formaPagamento === 'fiado' && pessoaFiadoId) {
        const { error: rpcErr } = await supabase.rpc('fiado_lancar_debito', {
          p_id_pessoa: pessoaFiadoId,
          p_valor: valorTotal,
        });
        if (rpcErr) {
          console.error('[Mesa.fechar] fiado RPC falhou:', rpcErr.message);
          addToast('Venda registrada, mas falha ao atualizar saldo fiado. Verifique manualmente.', 'warning');
        }
      }

      // 4. Stock decrement (best-effort, only for produtos.controlar_estoque)
      const baixas = [];
      for (const it of itens) {
        if (!it.id_produto) continue;
        const prod = produtos.find(p => p.id === it.id_produto);
        if (prod?.controlar_estoque) {
          baixas.push(
            supabase.rpc('decrementar_estoque', {
              p_id: it.id_produto,
              p_qtd: Math.max(1, Math.round(Number(it.quantidade))),
            })
          );
        }
      }
      if (baixas.length > 0) {
        const results = await Promise.allSettled(baixas);
        results.forEach((r, idx) => {
          if (r.status === 'rejected' || r.value?.error) {
            console.warn('[Mesa.fechar] stock decrement falhou item', idx);
          }
        });
      }

      // 5. Comanda → fechada
      await supabase
        .from('comandas')
        .update({
          status: 'fechada',
          fechada_em: new Date().toISOString(),
          id_venda: vendaId,
          total_calculado: valorTotal,
        })
        .eq('id', comanda.id);

      // 6. Mesa → livre
      await supabase.from('mesas').update({ status: 'livre' }).eq('id', mesaId);

      // 7. Build receipt and show
      recibo = {
        numero_venda: venda.numero_venda,
        mesa_numero: mesa.numero,
        empresa: nomeEmpresa,
        itens: itens.map(i => ({
          nome: i.nome_produto,
          quantidade: i.quantidade,
          preco_unitario: i.preco_unitario,
          subtotal: Number(i.quantidade) * Number(i.preco_unitario),
        })),
        subtotal,
        couvert,
        desconto,
        taxa_pct: taxaPct,
        taxa_valor: taxaValor,
        total: valorTotal,
        num_pessoas: comanda.num_pessoas || 1,
        forma_pagamento: formaPagamento,
        valor_recebido: valorRecebidoFinal,
        valor_troco: valorTroco,
        data: new Date(),
      };
      closeModalOpen = false;
      recibosOpen = true;
      addToast(`Mesa ${mesa.numero} fechada. Venda #${venda.numero_venda || vendaId} registrada.`, 'success');
    } catch (e) {
      addToast('Erro ao fechar mesa: ' + (e.message || e), 'error');
    } finally {
      closing = false;
    }
  }

  function formaPagamentoLabel(f) {
    return ({
      dinheiro: 'Dinheiro',
      cartao_credito: 'Cartão de crédito',
      cartao_debito: 'Cartão de débito',
      pix: 'PIX',
      fiado: 'Fiado',
    })[f] || f;
  }

  function imprimir() {
    window.print();
  }

  function fecharRecibo() {
    recibosOpen = false;
    goto('/app/mesas');
  }

  function statusLabel(s) {
    return ({ livre: 'Livre', ocupada: 'Ocupada', fechando: 'Fechando' })[s] || s;
  }
</script>

<svelte:head>
  <title>{mesa ? `Mesa ${mesa.numero}` : 'Mesa'} — Zelo PDV</title>
</svelte:head>

{#if !ready}
  <div class="centered-state">
    <p style="color: var(--text-muted);">Carregando…</p>
  </div>
{:else if !addonActive}
  <div class="upsell-card">
    <div class="upsell-icon">🪑</div>
    <h1 class="upsell-title">Módulo Mesas não está ativo</h1>
    <p class="upsell-desc">+R$ 30/mês — total R$ 89/mês.</p>
    <a href="/assinatura?addon=mesas" class="btn-primary">Ativar Módulo Mesas</a>
  </div>
{:else if loading || !comanda}
  <div class="centered-state">
    <p style="color: var(--text-muted);">Carregando comanda…</p>
  </div>
{:else}
  <div class="comanda-shell">
    <!-- LADO PRODUTOS -->
    <section class="produtos-side">
      <div class="produtos-header">
        <a href="/app/mesas" class="back-link">← Mesas</a>
        <h1 class="mesa-title">
          Mesa <strong>{mesa.numero}</strong>
          <span class="status-pill" data-status={mesa.status}>{statusLabel(mesa.status)}</span>
        </h1>
      </div>

      <div class="filter-row">
        <input
          class="search-input"
          type="search"
          bind:value={busca}
          placeholder="Buscar produto…"
        />
      </div>

      {#if categorias.length > 0}
        <div class="categoria-tabs">
          <button
            class="cat-tab"
            class:active={categoriaFiltro === null}
            on:click={() => categoriaFiltro = null}
          >Todos</button>
          {#each categorias as cat}
            <button
              class="cat-tab"
              class:active={categoriaFiltro === cat.id}
              on:click={() => categoriaFiltro = cat.id}
            >{cat.nome}</button>
          {/each}
        </div>
      {/if}

      <div class="produtos-grid">
        {#each produtosFiltrados as p (p.id)}
          <button
            class="produto-card"
            on:click={() => adicionarProduto(p)}
            disabled={savingItem}
            type="button"
          >
            <span class="produto-nome">{p.nome}</span>
            <span class="produto-preco">R$ {Number(p.preco).toFixed(2)}</span>
          </button>
        {/each}
        {#if produtosFiltrados.length === 0}
          <p style="color: var(--text-muted); padding: 1rem;">Nenhum produto encontrado.</p>
        {/if}
      </div>
    </section>

    <!-- LADO COMANDA -->
    <aside class="comanda-side">
      <div class="comanda-header">
        <h2 class="comanda-title">Comanda</h2>
        <span class="comanda-itens-count">{itens.length} item{itens.length === 1 ? '' : 's'}</span>
      </div>

      <div class="num-pessoas">
        <label class="field-inline">
          <span>Pessoas:</span>
          <input
            type="number"
            min="1"
            max="50"
            bind:value={comanda.num_pessoas}
            on:change={() => atualizarComanda('num_pessoas', Number(comanda.num_pessoas) || 1)}
          />
        </label>
      </div>

      <div class="itens-list">
        {#if itens.length === 0}
          <p class="empty-itens">Nenhum item. Clique em um produto pra adicionar.</p>
        {:else}
          {#each itens as item (item.id)}
            <div class="item-row">
              <div class="item-info">
                <span class="item-nome">{item.nome_produto}</span>
                <span class="item-preco">R$ {Number(item.preco_unitario).toFixed(2)}</span>
              </div>
              <div class="qty-stepper">
                <button class="qty-btn" on:click={() => alterarQuantidade(item, -1)} aria-label="Diminuir">−</button>
                <span class="qty-val">{item.quantidade}</span>
                <button class="qty-btn" on:click={() => alterarQuantidade(item, +1)} aria-label="Aumentar">+</button>
              </div>
              <div class="item-subtotal">
                R$ {(Number(item.preco_unitario) * Number(item.quantidade)).toFixed(2)}
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <div class="ajustes">
        <details>
          <summary>Taxa, couvert e desconto</summary>
          <div class="ajustes-grid">
            <label class="field">
              <span class="field-label">Taxa serviço (%)</span>
              <input
                type="number" min="0" max="30" step="0.5"
                bind:value={comanda.taxa_servico_pct}
                on:change={() => atualizarComanda('taxa_servico_pct', Number(comanda.taxa_servico_pct) || 0)}
              />
            </label>
            <label class="field">
              <span class="field-label">Couvert (R$)</span>
              <input
                type="number" min="0" step="0.5"
                bind:value={comanda.couvert_valor}
                on:change={() => atualizarComanda('couvert_valor', Number(comanda.couvert_valor) || 0)}
              />
            </label>
            <label class="field">
              <span class="field-label">Desconto (R$)</span>
              <input
                type="number" min="0" step="0.5"
                bind:value={comanda.desconto}
                on:change={() => atualizarComanda('desconto', Number(comanda.desconto) || 0)}
              />
            </label>
          </div>
        </details>
      </div>

      <div class="totais">
        <div class="total-row"><span>Subtotal</span><span>R$ {subtotal.toFixed(2)}</span></div>
        {#if couvert > 0}
          <div class="total-row"><span>Couvert</span><span>+R$ {couvert.toFixed(2)}</span></div>
        {/if}
        {#if desconto > 0}
          <div class="total-row"><span>Desconto</span><span style="color: var(--success);">−R$ {desconto.toFixed(2)}</span></div>
        {/if}
        {#if taxaPct > 0}
          <div class="total-row"><span>Taxa serviço ({taxaPct}%)</span><span>+R$ {taxaValor.toFixed(2)}</span></div>
        {/if}
        <div class="total-row total-final">
          <span>Total</span>
          <span>R$ {total.toFixed(2)}</span>
        </div>
        {#if comanda.num_pessoas > 1 && total > 0}
          <div class="total-row" style="font-size:0.8rem; color: var(--text-muted);">
            <span>Por pessoa ({comanda.num_pessoas})</span>
            <span>R$ {(total / comanda.num_pessoas).toFixed(2)}</span>
          </div>
        {/if}
      </div>

      <div class="comanda-actions">
        <button class="btn-secondary" on:click={() => preContaOpen = true} disabled={itens.length === 0}>
          Pré-conta
        </button>
        <button class="btn-primary" on:click={abrirCloseModal} disabled={itens.length === 0}>
          Fechar mesa
        </button>
      </div>
      <button class="btn-link-cancel" on:click={cancelarComanda}>Cancelar comanda</button>
    </aside>
  </div>
{/if}

<!-- ============================ PRÉ-CONTA MODAL ============================ -->
{#if preContaOpen && comanda}
  <div class="modal-overlay" on:click|self={() => preContaOpen = false} role="presentation">
    <div class="modal print-target" role="dialog" aria-modal="true" aria-labelledby="pre-conta-title">
      <div class="modal-print-header">
        {#if nomeEmpresa}<p class="empresa-name">{nomeEmpresa}</p>{/if}
        <h2 id="pre-conta-title" class="modal-title">Pré-conta · Mesa {mesa.numero}</h2>
        <p class="modal-subtitle">{new Date().toLocaleString('pt-BR')}</p>
      </div>

      <div class="recibo-itens">
        {#each itens as it}
          <div class="recibo-item">
            <span>{it.quantidade}× {it.nome_produto}</span>
            <span>R$ {(Number(it.preco_unitario) * Number(it.quantidade)).toFixed(2)}</span>
          </div>
        {/each}
      </div>

      <div class="recibo-totais">
        <div class="total-row"><span>Subtotal</span><span>R$ {subtotal.toFixed(2)}</span></div>
        {#if couvert > 0}<div class="total-row"><span>Couvert</span><span>+R$ {couvert.toFixed(2)}</span></div>{/if}
        {#if desconto > 0}<div class="total-row"><span>Desconto</span><span>−R$ {desconto.toFixed(2)}</span></div>{/if}
        {#if taxaPct > 0}<div class="total-row"><span>Taxa serviço ({taxaPct}%)</span><span>+R$ {taxaValor.toFixed(2)}</span></div>{/if}
        <div class="total-row total-final"><span>Total</span><span>R$ {total.toFixed(2)}</span></div>
        {#if comanda.num_pessoas > 1}
          <div class="total-row split-line">
            <span>{comanda.num_pessoas} pessoas · cada uma</span>
            <span>R$ {(total / comanda.num_pessoas).toFixed(2)}</span>
          </div>
        {/if}
      </div>

      <p class="recibo-footer">Pré-conta — não fiscal. A mesa permanece aberta.</p>

      <div class="modal-actions print-hide">
        <button class="btn-secondary" on:click={() => preContaOpen = false}>Fechar</button>
        <button class="btn-primary" on:click={imprimir}>Imprimir</button>
      </div>
    </div>
  </div>
{/if}

<!-- ============================ FECHAR MESA MODAL ============================ -->
{#if closeModalOpen && comanda}
  <div class="modal-overlay" on:click|self={fecharCloseModal} role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="close-title">
      <h2 id="close-title" class="modal-title">Fechar Mesa {mesa.numero}</h2>

      <div class="close-summary">
        <div class="total-row"><span>Itens</span><span>{itens.length}</span></div>
        <div class="total-row"><span>Subtotal</span><span>R$ {subtotal.toFixed(2)}</span></div>
        {#if couvert > 0}<div class="total-row"><span>Couvert</span><span>+R$ {couvert.toFixed(2)}</span></div>{/if}
        {#if desconto > 0}<div class="total-row"><span>Desconto</span><span style="color: var(--success);">−R$ {desconto.toFixed(2)}</span></div>{/if}
        {#if taxaPct > 0}<div class="total-row"><span>Taxa serviço ({taxaPct}%)</span><span>+R$ {taxaValor.toFixed(2)}</span></div>{/if}
        <div class="total-row total-final"><span>Total</span><span>R$ {total.toFixed(2)}</span></div>
        {#if comanda.num_pessoas > 1}
          <div class="total-row split-line">
            <span>Divisão por {comanda.num_pessoas} pessoas</span>
            <span>R$ {(total / comanda.num_pessoas).toFixed(2)} cada</span>
          </div>
        {/if}
      </div>

      <div class="forma-grid">
        {#each [
          { id: 'dinheiro',       label: 'Dinheiro', icon: '💵' },
          { id: 'cartao_debito',  label: 'Débito',   icon: '💳' },
          { id: 'cartao_credito', label: 'Crédito',  icon: '💳' },
          { id: 'pix',            label: 'PIX',      icon: '📱' },
          { id: 'fiado',          label: 'Fiado',    icon: '📒' },
        ] as forma}
          <button
            class="forma-btn"
            class:active={formaPagamento === forma.id}
            on:click={() => { formaPagamento = forma.id; onFormaChange(); }}
            type="button"
          >
            <span class="forma-icon">{forma.icon}</span>
            <span class="forma-label">{forma.label}</span>
          </button>
        {/each}
      </div>

      {#if formaPagamento === 'dinheiro'}
        <div class="cash-row">
          <label class="field" style="flex:1;">
            <span class="field-label">Valor recebido</span>
            <input
              type="number" min="0" step="0.01"
              bind:value={valorRecebido}
              placeholder={total.toFixed(2)}
            />
          </label>
          <div class="troco-display" class:negative={faltaPagar > 0}>
            {#if faltaPagar > 0}
              <span class="troco-label">Falta</span>
              <span class="troco-value">R$ {faltaPagar.toFixed(2)}</span>
            {:else}
              <span class="troco-label">Troco</span>
              <span class="troco-value">R$ {troco.toFixed(2)}</span>
            {/if}
          </div>
        </div>
      {/if}

      {#if formaPagamento === 'fiado'}
        <label class="field">
          <span class="field-label">Cliente do fiado *</span>
          <select bind:value={pessoaFiadoId}>
            <option value={null}>— Selecione —</option>
            {#each pessoas as p}
              <option value={p.id}>{p.nome}{p.saldo_fiado > 0 ? ` (saldo R$ ${Number(p.saldo_fiado).toFixed(2)})` : ''}</option>
            {/each}
          </select>
        </label>
      {/if}

      <div class="modal-actions">
        <button class="btn-secondary" on:click={fecharCloseModal} disabled={closing}>Cancelar</button>
        <button class="btn-primary" on:click={fecharMesa} disabled={closing}>
          {#if closing}Processando…{:else}Confirmar pagamento{/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ============================ RECIBO (PÓS-FECHAMENTO) ============================ -->
{#if recibosOpen && recibo}
  <div class="modal-overlay" role="presentation">
    <div class="modal print-target" role="dialog" aria-modal="true" aria-labelledby="recibo-title">
      <div class="modal-print-header">
        {#if recibo.empresa}<p class="empresa-name">{recibo.empresa}</p>{/if}
        <h2 id="recibo-title" class="modal-title">
          Recibo · Venda #{recibo.numero_venda || '—'}
        </h2>
        <p class="modal-subtitle">Mesa {recibo.mesa_numero} · {recibo.data.toLocaleString('pt-BR')}</p>
      </div>

      <div class="recibo-itens">
        {#each recibo.itens as it}
          <div class="recibo-item">
            <span>{it.quantidade}× {it.nome}</span>
            <span>R$ {it.subtotal.toFixed(2)}</span>
          </div>
        {/each}
      </div>

      <div class="recibo-totais">
        <div class="total-row"><span>Subtotal</span><span>R$ {recibo.subtotal.toFixed(2)}</span></div>
        {#if recibo.couvert > 0}<div class="total-row"><span>Couvert</span><span>+R$ {recibo.couvert.toFixed(2)}</span></div>{/if}
        {#if recibo.desconto > 0}<div class="total-row"><span>Desconto</span><span>−R$ {recibo.desconto.toFixed(2)}</span></div>{/if}
        {#if recibo.taxa_pct > 0}<div class="total-row"><span>Taxa ({recibo.taxa_pct}%)</span><span>+R$ {recibo.taxa_valor.toFixed(2)}</span></div>{/if}
        <div class="total-row total-final"><span>Total pago</span><span>R$ {recibo.total.toFixed(2)}</span></div>
        <div class="total-row"><span>Forma</span><span>{formaPagamentoLabel(recibo.forma_pagamento)}</span></div>
        {#if recibo.forma_pagamento === 'dinheiro'}
          <div class="total-row"><span>Recebido</span><span>R$ {Number(recibo.valor_recebido).toFixed(2)}</span></div>
          <div class="total-row"><span>Troco</span><span>R$ {Number(recibo.valor_troco).toFixed(2)}</span></div>
        {/if}
        {#if recibo.num_pessoas > 1}
          <div class="total-row split-line">
            <span>{recibo.num_pessoas} pessoas · cada uma</span>
            <span>R$ {(recibo.total / recibo.num_pessoas).toFixed(2)}</span>
          </div>
        {/if}
      </div>

      <p class="recibo-footer">Obrigado pela visita!</p>

      <div class="modal-actions print-hide">
        <button class="btn-secondary" on:click={imprimir}>Imprimir</button>
        <button class="btn-primary" on:click={fecharRecibo}>Voltar para mesas</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .centered-state {
    height: 60vh;
    display: flex; align-items: center; justify-content: center;
  }

  .upsell-card {
    max-width: 480px;
    margin: 4rem auto;
    padding: 2rem;
    text-align: center;
    border-radius: 16px;
    background: var(--bg-card);
    border: 1px solid var(--border-card);
  }
  .upsell-icon { font-size: 3rem; margin-bottom: 0.5rem; }
  .upsell-title { font-size: 1.5rem; font-weight: 700; color: var(--text-main); margin: 0 0 0.5rem; }
  .upsell-desc { color: var(--text-label); margin-bottom: 1.5rem; }

  .comanda-shell {
    display: grid;
    grid-template-columns: 1fr 360px;
    gap: 1rem;
    height: calc(100vh - 4rem);
    min-height: 0;
  }
  @media (max-width: 900px) {
    .comanda-shell {
      grid-template-columns: 1fr;
      height: auto;
    }
  }

  /* === Produtos side === */
  .produtos-side {
    display: flex; flex-direction: column;
    min-width: 0;
    gap: 0.75rem;
    overflow: hidden;
  }
  .produtos-header {
    display: flex; flex-direction: column; gap: 0.4rem;
  }
  .back-link {
    color: var(--text-muted); text-decoration: none;
    font-size: 0.8rem; font-weight: 600;
  }
  .back-link:hover { color: var(--primary); }
  .mesa-title {
    font-size: 1.5rem; font-weight: 700; color: var(--text-main);
    margin: 0; display: flex; align-items: center; gap: 0.6rem;
  }
  .mesa-title strong { font-weight: 800; }

  .status-pill {
    display: inline-block;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-size: 0.7rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.05em;
    background: var(--bg-input); color: var(--text-muted);
    border: 1px solid var(--border-subtle);
  }
  .status-pill[data-status="livre"]    { background: rgba(34,197,94,0.15);  color: #166534; border-color: rgba(34,197,94,0.35); }
  .status-pill[data-status="ocupada"]  { background: rgba(239,68,68,0.15);  color: #991b1b; border-color: rgba(239,68,68,0.35); }
  .status-pill[data-status="fechando"] { background: rgba(245,158,11,0.15); color: #92400e; border-color: rgba(245,158,11,0.35); }

  .filter-row { display: flex; gap: 0.5rem; }
  .search-input {
    flex: 1;
    padding: 0.5rem 0.85rem;
    background: var(--bg-input);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    font-size: 0.9rem;
  }
  .search-input:focus { outline: none; border-color: var(--primary); }

  .categoria-tabs {
    display: flex; gap: 0.4rem; overflow-x: auto;
    padding-bottom: 0.25rem;
  }
  .cat-tab {
    flex-shrink: 0;
    padding: 0.4rem 0.85rem;
    background: var(--bg-input);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 999px;
    font-size: 0.8rem; font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  .cat-tab.active {
    background: var(--primary); color: #fff;
    border-color: var(--primary);
  }

  .produtos-grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
    gap: 0.6rem;
    overflow-y: auto;
    padding-right: 0.25rem;
  }
  .produto-card {
    display: flex; flex-direction: column; justify-content: space-between;
    gap: 0.4rem;
    padding: 0.75rem 0.85rem;
    min-height: 80px;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    color: var(--text-main);
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s, transform 0.1s;
  }
  .produto-card:hover { border-color: var(--primary); }
  .produto-card:active { transform: scale(0.98); }
  .produto-card:disabled { opacity: 0.55; cursor: progress; }
  .produto-nome {
    font-size: 0.85rem; font-weight: 600; line-height: 1.25;
    overflow: hidden; display: -webkit-box;
    -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  }
  .produto-preco {
    font-size: 0.85rem; font-weight: 700; color: var(--primary);
  }

  /* === Comanda side === */
  .comanda-side {
    display: flex; flex-direction: column;
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 12px;
    padding: 1rem;
    gap: 0.75rem;
    overflow-y: auto;
    min-height: 0;
  }

  .comanda-header {
    display: flex; align-items: baseline; justify-content: space-between;
  }
  .comanda-title { font-size: 1.1rem; font-weight: 700; color: var(--text-main); margin: 0; }
  .comanda-itens-count { font-size: 0.75rem; color: var(--text-muted); }

  .num-pessoas { font-size: 0.85rem; }
  .field-inline {
    display: flex; align-items: center; gap: 0.5rem;
    color: var(--text-main);
  }
  .field-inline input[type="number"] {
    width: 70px;
    padding: 0.3rem 0.5rem;
    background: var(--bg-input);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
  }

  .itens-list {
    display: flex; flex-direction: column; gap: 0.35rem;
    border-top: 1px solid var(--border-subtle);
    border-bottom: 1px solid var(--border-subtle);
    padding: 0.5rem 0;
    max-height: 35vh;
    overflow-y: auto;
  }
  .empty-itens {
    color: var(--text-muted); font-size: 0.85rem;
    text-align: center; padding: 1rem 0; margin: 0;
  }

  .item-row {
    display: grid;
    grid-template-columns: 1fr auto 70px;
    gap: 0.5rem; align-items: center;
    padding: 0.35rem 0;
  }
  .item-info { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
  .item-nome {
    font-size: 0.85rem; color: var(--text-main); font-weight: 500;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .item-preco { font-size: 0.7rem; color: var(--text-muted); }

  .qty-stepper { display: flex; align-items: center; gap: 0.25rem; }
  .qty-btn {
    width: 24px; height: 24px;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    color: var(--text-main);
    font-weight: 700; font-size: 0.85rem; line-height: 1;
    cursor: pointer;
  }
  .qty-btn:hover { background: var(--bg-panel); }
  .qty-val {
    min-width: 22px; text-align: center;
    font-weight: 600; color: var(--text-main); font-size: 0.85rem;
  }
  .item-subtotal {
    font-size: 0.85rem; font-weight: 600; color: var(--text-main);
    text-align: right;
  }

  .ajustes details { font-size: 0.85rem; color: var(--text-label); }
  .ajustes summary { cursor: pointer; padding: 0.25rem 0; }
  .ajustes-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.4rem;
    margin-top: 0.4rem;
  }
  .field { display: flex; flex-direction: column; gap: 0.2rem; }
  .field-label {
    font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--text-muted); font-weight: 700;
  }
  .field input[type="number"] {
    padding: 0.35rem 0.5rem;
    background: var(--bg-input);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    font-size: 0.85rem;
  }

  .totais {
    display: flex; flex-direction: column; gap: 0.25rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border-subtle);
  }
  .total-row {
    display: flex; justify-content: space-between;
    font-size: 0.85rem; color: var(--text-label);
  }
  .total-row.total-final {
    font-size: 1.1rem; font-weight: 800; color: var(--text-main);
    margin-top: 0.25rem; padding-top: 0.5rem;
    border-top: 1px dashed var(--border-subtle);
  }

  .comanda-actions {
    display: flex; gap: 0.5rem; margin-top: 0.5rem;
  }
  .btn-primary, .btn-secondary {
    flex: 1;
    padding: 0.65rem 1rem;
    border-radius: 8px;
    font-weight: 600; font-size: 0.9rem;
    cursor: pointer;
    text-decoration: none;
    text-align: center;
    border: none;
  }
  .btn-primary { background: var(--primary); color: #fff; }
  .btn-primary:hover { background: var(--primary-hover); }
  .btn-primary:disabled {
    opacity: 0.55; cursor: not-allowed;
  }
  .btn-secondary {
    background: var(--bg-input); color: var(--text-main);
    border: 1px solid var(--border-subtle);
  }
  .btn-secondary:hover { background: var(--bg-panel); }

  .hint {
    font-size: 0.7rem; color: var(--text-muted);
    margin: 0; text-align: center;
  }

  .btn-link-cancel {
    background: transparent; border: none;
    color: var(--error); cursor: pointer;
    font-size: 0.78rem; padding: 0.25rem;
    text-align: center;
  }
  .btn-link-cancel:hover { text-decoration: underline; }

  /* === Modal genérico === */
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.55);
    display: flex; align-items: center; justify-content: center;
    z-index: 100; padding: 1rem;
    overflow-y: auto;
  }
  .modal {
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 12px;
    padding: 1.5rem;
    width: 100%; max-width: 460px;
    display: flex; flex-direction: column; gap: 0.85rem;
    max-height: 90vh; overflow-y: auto;
  }
  .modal-title { font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin: 0; }
  .modal-subtitle { font-size: 0.8rem; color: var(--text-muted); margin: 0.15rem 0 0; }

  .modal-print-header { text-align: center; padding-bottom: 0.5rem; border-bottom: 1px dashed var(--border-subtle); }
  .empresa-name {
    font-size: 0.95rem; font-weight: 700; color: var(--text-main);
    margin: 0 0 0.25rem; text-transform: uppercase; letter-spacing: 0.05em;
  }

  .close-summary, .recibo-totais {
    display: flex; flex-direction: column; gap: 0.25rem;
    background: var(--bg-input);
    padding: 0.75rem 1rem;
    border-radius: 8px;
  }
  .recibo-totais { background: transparent; padding: 0.5rem 0; border-top: 1px dashed var(--border-subtle); }

  .recibo-itens {
    display: flex; flex-direction: column; gap: 0.25rem;
    padding: 0.5rem 0;
    border-bottom: 1px dashed var(--border-subtle);
    font-size: 0.85rem;
  }
  .recibo-item {
    display: flex; justify-content: space-between;
    color: var(--text-main);
  }
  .split-line {
    border-top: 1px dashed var(--border-subtle);
    padding-top: 0.35rem;
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .recibo-footer {
    font-size: 0.75rem; color: var(--text-muted);
    text-align: center; margin: 0.5rem 0 0;
  }

  /* === Forma de pagamento grid === */
  .forma-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(95px, 1fr));
    gap: 0.4rem;
  }
  .forma-btn {
    display: flex; flex-direction: column; align-items: center; gap: 0.25rem;
    padding: 0.65rem 0.5rem;
    background: var(--bg-card);
    border: 2px solid var(--border-subtle);
    border-radius: 10px;
    color: var(--text-main);
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .forma-btn:hover { border-color: var(--primary); }
  .forma-btn.active {
    border-color: var(--primary);
    background: rgba(14, 165, 233, 0.08);
  }
  .forma-icon { font-size: 1.25rem; }
  .forma-label { font-size: 0.78rem; font-weight: 600; }

  /* === Cash row === */
  .cash-row {
    display: flex; gap: 0.5rem; align-items: stretch;
  }
  .cash-row input[type="number"] {
    padding: 0.5rem 0.65rem;
    background: var(--bg-input);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    font-size: 1rem; font-weight: 600;
  }
  .troco-display {
    display: flex; flex-direction: column; align-items: flex-end;
    justify-content: center;
    padding: 0 0.85rem;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--bg-input);
    min-width: 110px;
  }
  .troco-display.negative { border-color: var(--error); }
  .troco-label {
    font-size: 0.65rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--text-muted);
  }
  .troco-display.negative .troco-label { color: var(--error); }
  .troco-value {
    font-size: 1rem; font-weight: 700; color: var(--text-main);
  }

  .field select {
    padding: 0.5rem 0.65rem;
    background: var(--bg-input);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    font-size: 0.9rem;
  }

  .modal-actions {
    display: flex; justify-content: flex-end; gap: 0.5rem;
    margin-top: 0.25rem;
  }
  .modal-actions .btn-primary, .modal-actions .btn-secondary {
    flex: 0 0 auto;
    padding: 0.6rem 1.1rem;
  }

  /* === Print styles === */
  @media print {
    /* Hide all on the page except the print target */
    :global(body *) { visibility: hidden; }
    .print-target, .print-target * { visibility: visible; }
    .print-target {
      position: absolute; left: 0; top: 0;
      width: 100%; max-width: 380px;
      box-shadow: none; border: none;
      background: #fff !important;
      color: #000 !important;
    }
    .print-target * { color: #000 !important; }
    .print-hide { display: none !important; }
  }
</style>

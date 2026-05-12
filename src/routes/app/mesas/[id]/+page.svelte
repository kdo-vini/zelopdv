<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabaseClient';
  import { hasMesasAddon, hasPedidosAddon } from '$lib/guards';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import { pdvCache } from '$lib/stores/pdvCache';
  import { printVenda } from '$lib/printService';
  import { estoqueDisponivel, produtoControlaEstoque, produtoSemEstoque as semEstoque } from '$lib/stock';

  let userId = '';
  let addonActive = false;
  let pedidosAddonActive = false;
  let ready = false;

  let mesaId = '';
  let mesa = null;
  let comanda = null;
  let itens = [];
  let produtos = [];
  let categorias = [];
  let loading = true;
  let savingItem = false;
  let sendingCozinhaIds = new Set();
  let itensEnviadosCozinha = new Set();

  // Filtros / busca
  let busca = '';
  let categoriaFiltro = null; // id_categoria | null para "Todos"
  let ajustesOpen = false;

  // Transferência de mesa
  let transferModalOpen = false;
  let mesaDestinoId = null;
  let mesasLivres = [];
  let loadingMesasLivres = false;
  let transferring = false;

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
  let perfilImpressao = null;

  // Split de pagamento (modo múltiplo)
  let multiPag = false;
  let pagamentos = []; // [{ forma, valor, pessoaId? }]
  let novoPagForma = 'dinheiro';
  let novoPagValor = 0;
  let novoPagPessoaId = '';
  let erroPagamento = '';

  // Pagamentos parciais (registrados antes de fechar a mesa)
  let pagamentosParciais = []; // [{ id, forma_pagamento, valor, id_pessoa, created_at }]
  let parcialModalOpen = false;
  let parcialForma = 'dinheiro';
  let parcialValor = 0;
  let parcialPessoaId = '';
  let parcialErro = '';
  let savingParcial = false;

  // Drawer da comanda em mobile (escondida por padrão, abre via "Ver comanda")
  let showMobileCart = false;
  function abrirMobileCart() { showMobileCart = true; }
  function fecharMobileCart() { showMobileCart = false; }
  function handleKeydown(e) {
    if (e.key === 'Escape' && showMobileCart) showMobileCart = false;
  }

  $: troco = formaPagamento === 'dinheiro'
    ? Math.max(0, Number(valorRecebido || 0) - alvoPagamentoAtual)
    : 0;
  $: faltaPagar = formaPagamento === 'dinheiro'
    ? Math.max(0, alvoPagamentoAtual - Number(valorRecebido || 0))
    : 0;

  // Split derivados
  $: somaPagamentos = pagamentos.reduce((acc, p) => acc + Number(p?.valor || 0), 0);
  $: restantePagamento = Math.max(0, alvoPagamentoAtual - Number(somaPagamentos || 0));
  $: trocoMulti = (() => {
    if (!multiPag) return 0;
    const somaOutros = pagamentos.filter(p => p.forma !== 'dinheiro').reduce((a, b) => a + Number(b.valor || 0), 0);
    const cashRec = Number((pagamentos.find(p => p.forma === 'dinheiro')?.valor) || 0);
    const requeridoDin = Math.max(0, alvoPagamentoAtual - somaOutros);
    return Math.max(0, cashRec - requeridoDin);
  })();

  $: mesaId = $page.params.id;

  $: subtotal = itens.reduce((acc, it) => acc + Number(it.preco_unitario) * Number(it.quantidade), 0);
  $: desconto = comanda ? Number(comanda.desconto || 0) : 0;
  $: couvert = comanda ? Number(comanda.couvert_valor || 0) : 0;
  $: taxaPct = comanda ? Number(comanda.taxa_servico_pct || 0) : 0;
  $: taxaValor = (subtotal + couvert - desconto) * (taxaPct / 100);
  $: total = Math.max(0, subtotal + couvert - desconto + taxaValor);

  // Pagamentos parciais — total já pago e saldo a pagar
  $: jaPago = pagamentosParciais.reduce((acc, p) => acc + Number(p.valor || 0), 0);
  $: saldoMesa = Math.max(0, total - jaPago);
  $: alvoPagamentoAtual = pagamentosParciais.length > 0 ? saldoMesa : total;

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

    pedidosAddonActive = await hasPedidosAddon(userId);
    pdvCache.setUserId(userId);
    ready = true;

    await Promise.all([
      loadMesaAndComanda(),
      loadProdutos(),
      loadCaixaEPerfil(),
    ]);

    // Carrega pagamentos parciais depois de garantir que a comanda existe
    await loadPagamentosParciais();
  });

  async function loadPagamentosParciais() {
    if (!comanda?.id) return;
    const { data, error } = await supabase
      .from('comanda_pagamentos')
      .select('*')
      .eq('id_comanda', comanda.id)
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('[Mesa] loadPagamentosParciais falhou:', error.message);
      return;
    }
    pagamentosParciais = data || [];
  }

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

    // Perfil completo para impressão
    const { data: perfil } = await supabase
      .from('empresa_perfil')
      .select('nome_exibicao, documento, contato, endereco, largura_bobina, rodape_recibo, logo_url')
      .eq('user_id', userId)
      .maybeSingle();
    nomeEmpresa = perfil?.nome_exibicao || '';
    if (perfil) {
      const pUrl = !perfil.logo_url
        ? supabase.storage.from('logos').getPublicUrl(`${userId}.png`)?.data?.publicUrl
        : null;
      perfilImpressao = { ...perfil, logoUrl: perfil.logo_url || pUrl || null };
    }
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
    await loadItensEnviadosCozinha();
  }

  function cozinhaKeyFromParts(idProduto, nome) {
    return `${idProduto ?? 'sem-produto'}::${String(nome || '').trim().toLowerCase()}`;
  }

  function cozinhaKeyFromItem(item) {
    return cozinhaKeyFromParts(item?.id_produto, item?.nome_produto);
  }

  function itemEnviadoCozinha(item) {
    return itensEnviadosCozinha.has(cozinhaKeyFromItem(item));
  }

  function isSendingCozinha(item) {
    return sendingCozinhaIds.has(item?.id);
  }

  async function loadItensEnviadosCozinha() {
    if (!pedidosAddonActive || !comanda?.id) {
      itensEnviadosCozinha = new Set();
      return;
    }

    const { data, error } = await supabase
      .from('pedidos')
      .select('id, pedido_itens(id, id_produto, nome, enviado_cozinha)')
      .eq('id_comanda', comanda.id)
      .eq('origem', 'comanda')
      .in('status', ['aberto', 'pronto']);

    if (error) {
      console.warn('[Mesa] loadItensEnviadosCozinha falhou:', error.message);
      return;
    }

    const enviados = new Set();
    for (const pedido of data || []) {
      for (const item of pedido.pedido_itens || []) {
        if (item.enviado_cozinha) {
          enviados.add(cozinhaKeyFromParts(item.id_produto, item.nome));
        }
      }
    }
    itensEnviadosCozinha = enviados;
  }

  async function encontrarItemAbertoNaCozinha(item) {
    if (!comanda?.id) return false;
    const key = cozinhaKeyFromItem(item);

    const { data, error } = await supabase
      .from('pedidos')
      .select('id, pedido_itens(id_produto, nome, enviado_cozinha)')
      .eq('id_comanda', comanda.id)
      .eq('origem', 'comanda')
      .in('status', ['aberto', 'pronto']);

    if (error) throw error;

    return (data || []).some(pedido =>
      (pedido.pedido_itens || []).some(pi =>
        pi.enviado_cozinha && cozinhaKeyFromParts(pi.id_produto, pi.nome) === key
      )
    );
  }

  async function proximoNumeroPedido() {
    const { data, error } = await supabase.rpc('proximo_numero_pedido', { p_id_usuario: userId });
    if (error) throw error;
    return Number(data || 1);
  }

  async function inserirPedidoComRetry(insertBase) {
    const MAX_TENTATIVAS = 3;
    let ultimoErro = null;
    for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
      const numeroPedido = await proximoNumeroPedido();
      const { data, error } = await supabase
        .from('pedidos')
        .insert({ ...insertBase, numero_pedido: numeroPedido })
        .select('id, numero_pedido')
        .single();
      if (!error) return data;
      ultimoErro = error;
      if (error.code !== '23505') throw error;
    }
    throw ultimoErro || new Error('Não foi possível gerar número de pedido único.');
  }

  async function enviarItemCozinha(item) {
    if (!addonActive || !pedidosAddonActive || !comanda?.id || !item || isSendingCozinha(item)) return;

    if (itemEnviadoCozinha(item)) {
      addToast('Item ja enviado para a cozinha.', 'info');
      return;
    }

    sendingCozinhaIds = new Set(sendingCozinhaIds).add(item.id);

    try {
      const duplicado = await encontrarItemAbertoNaCozinha(item);
      if (duplicado) {
        itensEnviadosCozinha = new Set(itensEnviadosCozinha).add(cozinhaKeyFromItem(item));
        addToast('Este item ja esta em um pedido aberto da cozinha.', 'info');
        return;
      }

      const quantidade = Number(item.quantidade || 0);
      const preco = Number(item.preco_unitario || 0);
      const subtotalItem = Math.round(quantidade * preco * 100) / 100;

      const pedido = await inserirPedidoComRetry({
        id_usuario: userId,
        status: 'aberto',
        origem: 'comanda',
        id_comanda: comanda.id,
        observacoes: mesa?.numero ? `Mesa ${mesa.numero}` : 'Comanda',
      });

      const { error: itemErr } = await supabase
        .from('pedido_itens')
        .insert({
          id_pedido: pedido.id,
          id_produto: item.id_produto ?? null,
          nome: item.nome_produto || '',
          preco_unitario: preco,
          quantidade,
          subtotal: subtotalItem,
          enviado_cozinha: true,
          status_cozinha: 'aguardando',
        });

      if (itemErr) {
        await supabase.from('pedidos').delete().eq('id', pedido.id);
        throw itemErr;
      }

      itensEnviadosCozinha = new Set(itensEnviadosCozinha).add(cozinhaKeyFromItem(item));
      addToast('Item enviado para a cozinha.', 'success');
    } catch (error) {
      addToast('Erro ao enviar para a cozinha: ' + (error?.message || error), 'error');
    } finally {
      const next = new Set(sendingCozinhaIds);
      next.delete(item.id);
      sendingCozinhaIds = next;
    }
  }

  async function loadProdutos(forceRefresh = false) {
    produtos = await pdvCache.getProdutos(forceRefresh);
    categorias = await pdvCache.getCategorias();
  }

  async function refreshItensEProdutos() {
    await Promise.all([
      loadItens(),
      loadProdutos(true),
    ]);
  }

  function produtoSemEstoque(produto) {
    return semEstoque(produto);
  }

  function errorMessageFrom(error, fallback = 'Falha ao atualizar a comanda.') {
    return error?.message || String(error || fallback);
  }

  async function adicionarProduto(produto) {
    if (!comanda || savingItem) return;
    if (produtoSemEstoque(produto)) {
      addToast(`Estoque insuficiente para "${produto.nome}".`, 'warning');
      return;
    }

    savingItem = true;

    try {
      const { error } = await supabase.rpc('comanda_aplicar_delta_item', {
        p_id_comanda: comanda.id,
        p_id_produto: produto.id,
        p_delta: 1,
      });

      if (error) {
        throw error;
      }

      await refreshItensEProdutos();
    } catch (error) {
      addToast('Erro ao adicionar item: ' + errorMessageFrom(error), 'error');
    } finally {
      savingItem = false;
    }
  }

  async function alterarQuantidade(item, delta) {
    if (!comanda || savingItem) return;

    const novaQtd = Number(item.quantidade) + delta;
    if (novaQtd <= 0) {
      const ok = await confirmAction('Remover item', `Remover "${item.nome_produto}" da comanda?`);
      if (!ok) return;
    }

    savingItem = true;
    try {
      const { error } = await supabase.rpc('comanda_aplicar_delta_item', {
        p_id_comanda: comanda.id,
        p_id_produto: item.id_produto,
        p_delta: delta,
      });

      if (error) {
        throw error;
      }

      await refreshItensEProdutos();
    } catch (error) {
      addToast('Erro ao atualizar item: ' + errorMessageFrom(error), 'error');
    } finally {
      savingItem = false;
    }
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

    try {
      const { error } = await supabase.rpc('comanda_cancelar_com_estoque', {
        p_id_comanda: comanda.id,
      });
      if (error) throw error;

      addToast('Comanda cancelada.', 'info');
      goto('/app/mesas');
    } catch (error) {
      addToast('Erro ao cancelar comanda: ' + errorMessageFrom(error), 'error');
    }
  }

  async function abrirCloseModal() {
    if (itens.length === 0) {
      addToast('Adicione itens antes de fechar a mesa.', 'warning');
      return;
    }
    // Se já existem parciais cobrindo o total, fecha direto sem cobrar nada novo
    if (saldoMesa <= 0.001 && pagamentosParciais.length > 0) {
      formaPagamento = 'dinheiro';
      valorRecebido = 0;
      pessoaFiadoId = null;
      multiPag = false;
      pagamentos = [];
      erroPagamento = '';
      closeModalOpen = true;
    } else {
      formaPagamento = 'dinheiro';
      valorRecebido = saldoMesa;
      pessoaFiadoId = null;
      multiPag = false;
      pagamentos = [];
      erroPagamento = '';
      novoPagValor = saldoMesa;
      novoPagForma = 'dinheiro';
      novoPagPessoaId = '';
      closeModalOpen = true;
    }
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

    const temParciais = pagamentosParciais.length > 0;
    // Quando há parciais, validamos contra saldoMesa (total - já pago); sem parciais, contra total.
    const alvoPagamento = temParciais ? saldoMesa : total;

    if (alvoPagamento <= 0.001) {
      // Já pagou tudo via parciais — não precisa nada novo
      // Pula validação, vai direto pro insert
    } else if (multiPag) {
      if (somaPagamentos + 0.001 < alvoPagamento) {
        addToast(`Faltam R$ ${(alvoPagamento - somaPagamentos).toFixed(2)} para fechar.`, 'warning');
        return;
      }
      const somaNaoDinheiro = pagamentos
        .filter(p => p.forma !== 'dinheiro')
        .reduce((a, b) => a + Number(b.valor || 0), 0);
      if (somaNaoDinheiro > alvoPagamento + 0.001) {
        addToast('Pagamentos nao-dinheiro nao podem exceder o saldo a pagar.', 'warning');
        return;
      }
      const fiadoLines = pagamentos.filter(p => p.forma === 'fiado');
      if (fiadoLines.length > 1) {
        addToast('Use apenas uma linha de Fiado.', 'warning');
        return;
      }
      if (fiadoLines.length === 1 && !fiadoLines[0].pessoaId) {
        addToast('Selecione cliente para o Fiado.', 'warning');
        return;
      }
    } else {
      if (formaPagamento === 'dinheiro' && Number(valorRecebido || 0) < alvoPagamento) {
        addToast('Valor recebido menor que o saldo a pagar.', 'warning');
        return;
      }
      if (formaPagamento === 'fiado' && !pessoaFiadoId) {
        addToast('Selecione o cliente para o fiado.', 'warning');
        return;
      }
    }

    closing = true;
    try {
      const { error: estoqueErr } = await supabase.rpc('comanda_garantir_estoque_baixado', {
        p_id_comanda: comanda.id,
      });
      if (estoqueErr) throw new Error(estoqueErr.message);

      const valorTotal = Math.round(total * 100) / 100;

      // Monta a lista UNIFICADA de pagamentos da venda (parciais já existentes + novos no fechamento)
      // Cada item: { forma, valor, pessoaId? }
      const linhasNovas = [];

      // 1) Parciais (já confirmados antes)
      for (const pp of pagamentosParciais) {
        linhasNovas.push({
          forma: pp.forma_pagamento,
          valor: Number(pp.valor),
          pessoaId: pp.id_pessoa || null,
        });
      }

      // 2) Pagamento(s) novos no momento do fechamento (só se ainda houver saldo)
      let trocoCalc = 0;
      if (alvoPagamento > 0.001) {
        if (multiPag) {
          for (const p of pagamentos) {
            linhasNovas.push({
              forma: p.forma,
              valor: Number(p.valor),
              pessoaId: p.pessoaId || null,
            });
          }
          // Troco do split: cash recebido - cash requerido (considerando outras formas dentro do alvo)
          const cashNovo = Number(pagamentos.find(p => p.forma === 'dinheiro')?.valor || 0);
          const outrosNovo = pagamentos
            .filter(p => p.forma !== 'dinheiro')
            .reduce((a, b) => a + Number(b.valor || 0), 0);
          const requeridoDinNovo = Math.max(0, alvoPagamento - outrosNovo);
          trocoCalc = Math.max(0, cashNovo - requeridoDinNovo);
        } else {
          linhasNovas.push({
            forma: formaPagamento,
            valor: alvoPagamento, // grava só o saldo, troco fica fora
            pessoaId: formaPagamento === 'fiado' ? pessoaFiadoId : null,
          });
          if (formaPagamento === 'dinheiro') {
            trocoCalc = Math.max(0, Number(valorRecebido) - alvoPagamento);
          }
        }
      }

      // Determina forma_pagamento da venda: se >1 linha distinta, 'multiplo'; senão a forma única.
      const formasUnicas = [...new Set(linhasNovas.map(l => l.forma))];
      const insertForma = formasUnicas.length > 1
        ? 'multiplo'
        : (formasUnicas[0] || formaPagamento || 'dinheiro');

      const insertValorTroco = Math.round(trocoCalc * 100) / 100;
      // valor_recebido só faz sentido quando dinheiro está envolvido no fechamento atual
      let insertValorRecebido = null;
      if (alvoPagamento > 0.001) {
        if (multiPag) {
          const cashNovo = Number(pagamentos.find(p => p.forma === 'dinheiro')?.valor || 0);
          insertValorRecebido = cashNovo || null;
        } else if (formaPagamento === 'dinheiro') {
          insertValorRecebido = Number(valorRecebido);
        }
      }
      // id_cliente vai pro fiado (se houver UM ÚNICO fiado na venda)
      const fiadoUnicas = linhasNovas.filter(l => l.forma === 'fiado');
      const insertIdCliente = fiadoUnicas.length === 1 ? fiadoUnicas[0].pessoaId : null;
      // Para vendas_pagamentos: dinheiro tem troco descontado da última linha de dinheiro (do fechamento)
      // Parciais ficam como digitados (já foram cobrados, sem troco)
      const trocoNovo = trocoCalc;

      // 1. Insert venda
      const dadosVenda = {
        valor_total: valorTotal,
        forma_pagamento: insertForma,
        valor_recebido: insertValorRecebido,
        valor_troco: insertValorTroco,
        id_usuario: userId,
        id_caixa: idCaixaAberto,
        id_cliente: insertIdCliente,
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

      // 2b. Insert vendas_pagamentos — UMA row por linha (parciais + novos)
      // Quando há mais de 1 linha OU temos parciais, persistimos cada forma separadamente.
      // Se houver dinheiro nas linhas NOVAS, descontamos o troco da última linha de dinheiro do fechamento.
      if (linhasNovas.length > 1 || temParciais) {
        // Identifica linha de dinheiro NOVA pra descontar troco (parciais ficam intactos)
        const numParciais = pagamentosParciais.length;
        let trocoRestante = trocoNovo;
        const linhasInsert = linhasNovas.map((l, idx) => {
          let valorFinal = Number(l.valor);
          // Apenas linhas NOVAS (idx >= numParciais) podem ter troco descontado
          if (idx >= numParciais && l.forma === 'dinheiro' && trocoRestante > 0) {
            const desc = Math.min(trocoRestante, valorFinal);
            valorFinal = Math.max(0, valorFinal - desc);
            trocoRestante -= desc;
          }
          return {
            id_venda: vendaId,
            id_usuario: userId,
            forma_pagamento: l.forma,
            valor: Math.round(valorFinal * 100) / 100,
          };
        }).filter(l => l.valor > 0);
        if (linhasInsert.length > 0) {
          const { error: pagErr } = await supabase.from('vendas_pagamentos').insert(linhasInsert);
          if (pagErr) console.warn('[Mesa.fechar] vendas_pagamentos insert falhou:', pagErr.message);
        }
      }

      // 3. Fiado: lançar débito para CADA linha de fiado (parcial OU final)
      const fiadoLines = linhasNovas.filter(l => l.forma === 'fiado' && l.pessoaId);
      for (const f of fiadoLines) {
        const { error: rpcErr } = await supabase.rpc('fiado_lancar_debito', {
          p_id_pessoa: f.pessoaId,
          p_valor: Number(f.valor),
        });
        if (rpcErr) {
          console.error('[Mesa.fechar] fiado RPC falhou:', rpcErr.message);
          addToast('Venda registrada, mas falha ao atualizar saldo fiado. Verifique manualmente.', 'warning');
        }
      }

      // 4. Estoque ja foi reservado em tempo real na comanda.

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

      // 5b. Limpa pagamentos parciais (já viraram vendas_pagamentos)
      if (temParciais) {
        const { error: cleanErr } = await supabase
          .from('comanda_pagamentos')
          .delete()
          .eq('id_comanda', comanda.id);
        if (cleanErr) console.warn('[Mesa.fechar] cleanup parciais falhou:', cleanErr.message);
      }

      // 6. Mesa → livre
      await supabase.from('mesas').update({ status: 'livre' }).eq('id', mesaId);

      // 7. Build receipt and show
      const reciboPagamentos = linhasNovas.length > 0
        ? linhasNovas.map(l => ({ forma: l.forma, valor: Number(l.valor) }))
        : null;
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
        forma_pagamento: insertForma,
        valor_recebido: insertValorRecebido,
        valor_troco: insertValorTroco,
        pagamentos_split: insertForma === 'multiplo' ? reciboPagamentos : null,
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
      multiplo: 'Múltiplo',
    })[f] || f;
  }

  function estabelecimentoFromPerfil() {
    return {
      nome_exibicao: perfilImpressao?.nome_exibicao || nomeEmpresa || 'Zelo PDV',
      documento: perfilImpressao?.documento || null,
      contato: perfilImpressao?.contato || null,
      endereco: perfilImpressao?.endereco || null,
      largura_bobina: perfilImpressao?.largura_bobina || '58mm',
      rodape_recibo: perfilImpressao?.rodape_recibo || 'Obrigado pela preferência!',
      logoUrl: perfilImpressao?.logoUrl || null,
    };
  }

  async function imprimirPreConta() {
    const est = estabelecimentoFromPerfil();
    await printVenda({
      estabelecimento: est,
      venda: {
        mesaNumero: mesa?.numero,
        itens: itens.map(i => ({
          nome: i.nome_produto,
          quantidade: i.quantidade,
          preco_unitario: i.preco_unitario,
        })),
        subtotal,
        desconto,
        total,
        taxaEntrega: couvert > 0 ? couvert : 0,
        formaPagamento: null,
      },
      opcoes: { titulo: `PRÉ-CONTA — MESA ${mesa?.numero || ''}`, naoFiscal: true },
    });
  }

  async function imprimirRecibo() {
    if (!recibo) return;
    const est = estabelecimentoFromPerfil();
    const pags = recibo.pagamentos_split?.length
      ? recibo.pagamentos_split.map(p => ({ forma: p.forma, valor: Number(p.valor) }))
      : [];
    await printVenda({
      estabelecimento: est,
      venda: {
        numeroVenda: recibo.numero_venda,
        mesaNumero: recibo.mesa_numero,
        itens: recibo.itens.map(i => ({
          nome: i.nome,
          quantidade: i.quantidade,
          preco_unitario: i.preco_unitario,
        })),
        subtotal: recibo.subtotal,
        desconto: recibo.desconto,
        total: recibo.total,
        formaPagamento: recibo.pagamentos_split?.length ? 'multiplo' : recibo.forma_pagamento,
        pagamentos: pags,
        valorRecebido: recibo.valor_recebido,
        troco: recibo.valor_troco,
      },
      opcoes: { titulo: `RECIBO — MESA ${recibo.mesa_numero || ''}` },
    });
  }

  function fecharRecibo() {
    recibosOpen = false;
    goto('/app/mesas');
  }

  function statusLabel(s) {
    return ({ livre: 'Livre', ocupada: 'Ocupada', fechando: 'Fechando' })[s] || s;
  }

  function ajustarPessoas(delta) {
    const atual = Number(comanda?.num_pessoas) || 1;
    const novo = Math.min(50, Math.max(1, atual + delta));
    if (novo === atual) return;
    atualizarComanda('num_pessoas', novo);
  }

  // (legado) deixar pra trás — mantém só pra evitar quebras se referenciado
  function scrollParaComanda() { abrirMobileCart(); }

  // === Split de pagamento ===
  function ativarMulti() {
    multiPag = true;
    pagamentos = [];
    erroPagamento = '';
    novoPagForma = formaPagamento === 'fiado' ? 'dinheiro' : (formaPagamento || 'dinheiro');
    novoPagValor = alvoPagamentoAtual;
    novoPagPessoaId = '';
    if (novoPagForma === 'fiado') loadPessoasFiado();
  }

  function cancelarMulti() {
    multiPag = false;
    pagamentos = [];
    erroPagamento = '';
  }

  function nomeForma(f) {
    return ({
      dinheiro: 'Dinheiro',
      cartao_debito: 'Débito',
      cartao_credito: 'Crédito',
      pix: 'PIX',
      fiado: 'Fiado',
    })[f] || f;
  }

  function preencherRestante() {
    novoPagValor = Math.max(0, alvoPagamentoAtual - somaPagamentos);
  }

  function onNovoPagFormaChange() {
    if (novoPagForma === 'fiado') loadPessoasFiado();
  }

  function addPagamento() {
    erroPagamento = '';
    const forma = novoPagForma;
    const valor = Number(novoPagValor || 0);
    if (!forma || valor <= 0) {
      erroPagamento = 'Selecione forma e digite um valor.';
      return;
    }

    const somaNaoDinheiroAtual = pagamentos
      .filter(p => p.forma !== 'dinheiro')
      .reduce((a, b) => a + Number(b.valor || 0), 0);

    if (forma !== 'dinheiro') {
      const novoSomaNC = somaNaoDinheiroAtual + valor;
      if (novoSomaNC > alvoPagamentoAtual + 0.001) {
        erroPagamento = 'Pagamentos não-dinheiro não podem exceder o total.';
        return;
      }
    }

    if (forma === 'fiado') {
      if (pagamentos.some(p => p.forma === 'fiado')) {
        erroPagamento = 'Use apenas uma linha de Fiado.';
        return;
      }
      if (!novoPagPessoaId) {
        erroPagamento = 'Selecione o cliente para o Fiado.';
        return;
      }
      pagamentos = [...pagamentos, { forma, valor, pessoaId: novoPagPessoaId }];
      novoPagPessoaId = '';
    } else {
      pagamentos = [...pagamentos, { forma, valor }];
    }

    novoPagValor = Math.max(0, alvoPagamentoAtual - pagamentos.reduce((a, b) => a + Number(b.valor || 0), 0));
  }

  function removerPagamento(i) {
    pagamentos = pagamentos.filter((_, idx) => idx !== i);
    novoPagValor = Math.max(0, alvoPagamentoAtual - pagamentos.reduce((a, b) => a + Number(b.valor || 0), 0));
    erroPagamento = '';
  }

  // === Pagamentos parciais (rachar ao longo do tempo) ===
  async function abrirParcialModal() {
    if (!comanda) return;
    parcialErro = '';
    parcialForma = 'dinheiro';
    parcialValor = saldoMesa > 0 ? saldoMesa : 0;
    parcialPessoaId = '';
    parcialModalOpen = true;
    await loadPessoasFiado();
  }

  function fecharParcialModal() {
    if (savingParcial) return;
    parcialModalOpen = false;
    parcialErro = '';
  }

  function onParcialFormaChange() {
    if (parcialForma === 'fiado') loadPessoasFiado();
  }

  function preencherParcialSaldo() {
    parcialValor = saldoMesa;
  }

  async function salvarPagamentoParcial() {
    parcialErro = '';
    const valor = Number(parcialValor || 0);
    if (!parcialForma || valor <= 0) {
      parcialErro = 'Selecione forma e digite um valor maior que zero.';
      return;
    }
    if (parcialForma === 'fiado' && !parcialPessoaId) {
      parcialErro = 'Selecione o cliente para o Fiado.';
      return;
    }
    if (valor > saldoMesa + 0.001) {
      parcialErro = `Valor excede o saldo (R$ ${saldoMesa.toFixed(2)}).`;
      return;
    }

    savingParcial = true;
    try {
      const valorRound = Math.round(valor * 100) / 100;
      const payload = {
        id_comanda: comanda.id,
        id_usuario: userId,
        forma_pagamento: parcialForma,
        valor: valorRound,
        id_pessoa: parcialForma === 'fiado' ? parcialPessoaId : null,
      };

      const { data, error } = await supabase
        .from('comanda_pagamentos')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw new Error(error.message);

      pagamentosParciais = [...pagamentosParciais, data];
      addToast(`Pagamento parcial de R$ ${valorRound.toFixed(2)} (${nomeForma(parcialForma)}) registrado.`, 'success');

      // Reset form para o saldo restante
      parcialErro = '';
      parcialForma = 'dinheiro';
      parcialPessoaId = '';
      parcialValor = saldoMesa > 0 ? saldoMesa : 0;

      // Se zerou o saldo, fecha o modal
      if (saldoMesa <= 0.001) parcialModalOpen = false;
    } catch (e) {
      parcialErro = 'Erro ao salvar: ' + (e.message || e);
    } finally {
      savingParcial = false;
    }
  }

  async function removerPagamentoParcial(p) {
    const ok = await confirmAction(
      'Remover pagamento parcial',
      `Remover ${nomeForma(p.forma_pagamento)} de R$ ${Number(p.valor).toFixed(2)}?`
    );
    if (!ok) return;

    const { error } = await supabase
      .from('comanda_pagamentos')
      .delete()
      .eq('id', p.id);
    if (error) {
      addToast('Erro ao remover: ' + error.message, 'error');
      return;
    }
    pagamentosParciais = pagamentosParciais.filter(x => x.id !== p.id);
    addToast('Pagamento parcial removido.', 'info');
  }

  // === Transferência de mesa ===
  async function loadMesasLivres() {
    loadingMesasLivres = true;
    const { data, error } = await supabase
      .from('mesas')
      .select('id, numero, capacidade, status, ativa')
      .eq('id_usuario', userId)
      .eq('ativa', true)
      .eq('status', 'livre')
      .order('numero', { ascending: true });
    loadingMesasLivres = false;
    if (error) {
      addToast('Erro ao carregar mesas: ' + error.message, 'error');
      return;
    }
    mesasLivres = (data || []).filter(m => m.id !== mesaId);
  }

  async function abrirTransferModal() {
    if (!comanda) return;
    mesaDestinoId = null;
    transferModalOpen = true;
    await loadMesasLivres();
  }

  function fecharTransferModal() {
    if (transferring) return;
    transferModalOpen = false;
    mesaDestinoId = null;
  }

  async function transferirMesa() {
    if (transferring || !mesaDestinoId || mesaDestinoId === mesaId) return;

    transferring = true;
    try {
      // Re-check destino (proteção contra concorrência: alguém pode ter ocupado entre listagem e clique)
      const { data: dest, error: destErr } = await supabase
        .from('mesas')
        .select('id, status, ativa, numero')
        .eq('id', mesaDestinoId)
        .maybeSingle();

      if (destErr || !dest) {
        addToast('Mesa destino não encontrada.', 'error');
        return;
      }
      if (!dest.ativa) {
        addToast('A mesa selecionada está inativa.', 'error');
        await loadMesasLivres();
        mesaDestinoId = null;
        return;
      }
      if (dest.status !== 'livre') {
        addToast(`Mesa ${dest.numero} não está mais livre. Selecione outra.`, 'warning');
        await loadMesasLivres();
        mesaDestinoId = null;
        return;
      }

      // 1. Comanda → nova mesa (carrega num_pessoas, itens, ajustes naturalmente via FK)
      const { error: comErr } = await supabase
        .from('comandas')
        .update({ id_mesa: mesaDestinoId })
        .eq('id', comanda.id);
      if (comErr) throw new Error(comErr.message);

      // 2. Mesa destino → ocupada
      const { error: destUpdErr } = await supabase
        .from('mesas')
        .update({ status: 'ocupada' })
        .eq('id', mesaDestinoId);
      if (destUpdErr) console.warn('[Mesa.transferir] update destino falhou:', destUpdErr.message);

      // 3. Mesa origem → livre
      const { error: orgUpdErr } = await supabase
        .from('mesas')
        .update({ status: 'livre' })
        .eq('id', mesaId);
      if (orgUpdErr) console.warn('[Mesa.transferir] update origem falhou:', orgUpdErr.message);

      addToast(`Mesa ${mesa.numero} → Mesa ${dest.numero}: comanda, ${itens.length} ${itens.length === 1 ? 'item' : 'itens'} e ${comanda.num_pessoas || 1} ${(comanda.num_pessoas || 1) === 1 ? 'pessoa' : 'pessoas'} transferidos.`, 'success');
      transferModalOpen = false;
      goto(`/app/mesas/${mesaDestinoId}`);
    } catch (e) {
      addToast('Erro ao transferir: ' + (e.message || e), 'error');
    } finally {
      transferring = false;
    }
  }
</script>

<svelte:head>
  <title>{mesa ? `Mesa ${mesa.numero}` : 'Mesa'} — Zelo PDV</title>
</svelte:head>

<svelte:window on:keydown={handleKeydown}/>

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
        <a href="/app/mesas" class="back-link">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z" clip-rule="evenodd"/>
          </svg>
          Mesas
        </a>
        <div class="title-row">
          <h1 class="mesa-title">Mesa <strong>{mesa.numero}</strong></h1>
          <span class="status-pill" data-status={mesa.status}>
            <span class="status-dot" aria-hidden="true"></span>
            {statusLabel(mesa.status)}
          </span>
        </div>
      </div>

      <div class="filter-row">
        <div class="search-wrap">
          <svg class="search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M9 17a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm5.32-3.27 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
          <input
            class="search-input"
            type="search"
            bind:value={busca}
            placeholder="Buscar produto…"
          />
        </div>
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
            class:sem-estoque={produtoSemEstoque(p)}
            on:click={() => adicionarProduto(p)}
            disabled={savingItem || produtoSemEstoque(p)}
            title={produtoSemEstoque(p) ? 'Sem estoque' : p.nome}
            type="button"
          >
            <span class="produto-nome">{p.nome}</span>
            <span class="produto-preco">R$ {Number(p.preco).toFixed(2)}</span>
            {#if produtoControlaEstoque(p)}
              <span class="produto-estoque" class:stock-empty={produtoSemEstoque(p)}>
                {produtoSemEstoque(p) ? 'Sem estoque' : `${estoqueDisponivel(p)} em estoque`}
              </span>
            {/if}
          </button>
        {/each}
        {#if produtosFiltrados.length === 0}
          <p class="empty-produtos">Nenhum produto encontrado.</p>
        {/if}
      </div>
    </section>

    <!-- LADO COMANDA -->
    <aside class="comanda-side" class:mobile-open={showMobileCart} aria-hidden={!showMobileCart && false}>
      <!-- Drag handle (mobile only): visual + clicável pra minimizar -->
      <button
        type="button"
        class="drag-handle"
        on:click={fecharMobileCart}
        aria-label="Minimizar comanda"
        title="Minimizar comanda"
      >
        <span class="handle-bar" aria-hidden="true"></span>
        <span class="drag-handle-text">Minimizar</span>
      </button>

      <div class="comanda-header">
        <h2 class="comanda-title">COMANDA</h2>
        <span class="comanda-itens-count">{itens.length} {itens.length === 1 ? 'item' : 'itens'}</span>
      </div>

      <div class="pessoas-row">
        <div class="pessoas-info">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="pessoas-icon">
            <path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-7 8a7 7 0 0 1 14 0H3Z"/>
          </svg>
          <span class="pessoas-label">Pessoas</span>
        </div>
        <div class="pessoas-stepper">
          <button
            type="button"
            class="qty-btn"
            on:click={() => ajustarPessoas(-1)}
            disabled={(comanda.num_pessoas || 1) <= 1}
            aria-label="Menos uma pessoa"
          >−</button>
          <span class="pessoas-val">{comanda.num_pessoas || 1}</span>
          <button
            type="button"
            class="qty-btn"
            on:click={() => ajustarPessoas(+1)}
            disabled={(comanda.num_pessoas || 1) >= 50}
            aria-label="Mais uma pessoa"
          >+</button>
        </div>
      </div>

      <div class="itens-list">
        {#if itens.length === 0}
          <div class="empty-itens">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <path d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <p>VAZIO</p>
          </div>
        {:else}
          <ul class="itens-ul">
            {#each itens as item (item.id)}
              <li class="item-card">
                <div class="item-info">
                  <span class="item-nome">{item.nome_produto}</span>
                  <span class="item-preco">R$ {Number(item.preco_unitario).toFixed(2)} · subtotal R$ {(Number(item.preco_unitario) * Number(item.quantidade)).toFixed(2)}</span>
                </div>
                <div class="item-actions">
                  <div class="qty-cluster">
                    <button class="qty-btn qty-minus" on:click={() => alterarQuantidade(item, -1)} disabled={savingItem} aria-label="Diminuir">
                      <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 10Z" clip-rule="evenodd"/></svg>
                    </button>
                    <span class="qty-val">{item.quantidade}</span>
                    <button class="qty-btn qty-plus" on:click={() => alterarQuantidade(item, +1)} disabled={savingItem} aria-label="Aumentar">
                      <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"/></svg>
                    </button>
                  </div>
                  {#if pedidosAddonActive}
                    <button
                      type="button"
                      class="kitchen-btn"
                      class:sent={itemEnviadoCozinha(item)}
                      on:click={() => enviarItemCozinha(item)}
                      disabled={itemEnviadoCozinha(item) || isSendingCozinha(item)}
                      title={itemEnviadoCozinha(item) ? 'Item ja enviado para a cozinha' : 'Enviar item para a cozinha'}
                      aria-label={itemEnviadoCozinha(item) ? 'Item ja enviado para a cozinha' : 'Enviar item para a cozinha'}
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path d="M10 2.5a.75.75 0 0 1 .75.75v1.308a5.75 5.75 0 0 1 5 5.692v.5H4.25v-.5a5.75 5.75 0 0 1 5-5.692V3.25A.75.75 0 0 1 10 2.5Zm-6.5 10a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 .75.75v.25a3.75 3.75 0 0 1-3.75 3.75h-5.5a3.75 3.75 0 0 1-3.75-3.75v-.25Z"/>
                      </svg>
                      <span>{itemEnviadoCozinha(item) ? 'Enviado' : (isSendingCozinha(item) ? '...' : 'Cozinha')}</span>
                    </button>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="ajustes">
        <button
          type="button"
          class="ajustes-toggle"
          class:open={ajustesOpen}
          on:click={() => ajustesOpen = !ajustesOpen}
          aria-expanded={ajustesOpen}
        >
          <span>Taxa, couvert e desconto</span>
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clip-rule="evenodd"/>
          </svg>
        </button>
        {#if ajustesOpen}
          <div class="ajustes-grid">
            <label class="field">
              <span class="field-label" title="Taxa de serviço (%)">Taxa %</span>
              <input
                type="number" inputmode="decimal" min="0" max="30" step="0.5"
                bind:value={comanda.taxa_servico_pct}
                on:change={() => atualizarComanda('taxa_servico_pct', Number(comanda.taxa_servico_pct) || 0)}
              />
            </label>
            <label class="field">
              <span class="field-label" title="Couvert artístico (R$)">Couvert</span>
              <input
                type="number" inputmode="decimal" min="0" step="0.5"
                bind:value={comanda.couvert_valor}
                on:change={() => atualizarComanda('couvert_valor', Number(comanda.couvert_valor) || 0)}
              />
            </label>
            <label class="field">
              <span class="field-label" title="Desconto (R$)">Desconto</span>
              <input
                type="number" inputmode="decimal" min="0" step="0.5"
                bind:value={comanda.desconto}
                on:change={() => atualizarComanda('desconto', Number(comanda.desconto) || 0)}
              />
            </label>
          </div>
        {/if}
      </div>

      <div class="totais">
        <div class="total-row"><span>Subtotal</span><span>R$ {subtotal.toFixed(2)}</span></div>
        {#if couvert > 0}
          <div class="total-row"><span>Couvert</span><span>+R$ {couvert.toFixed(2)}</span></div>
        {/if}
        {#if desconto > 0}
          <div class="total-row"><span>Desconto</span><span style="color: var(--status-success-text);">−R$ {desconto.toFixed(2)}</span></div>
        {/if}
        {#if taxaPct > 0}
          <div class="total-row"><span>Taxa serviço ({taxaPct}%)</span><span>+R$ {taxaValor.toFixed(2)}</span></div>
        {/if}
      </div>

      <div class="total-highlight">
        <div class="total-final-row">
          <span class="total-final-label">Total</span>
          <span class="total-final-value">R$ {total.toFixed(2)}</span>
        </div>
        {#if comanda.num_pessoas > 1 && total > 0}
          <div class="total-split-row">
            <span>Por pessoa ({comanda.num_pessoas})</span>
            <span>R$ {(total / comanda.num_pessoas).toFixed(2)}</span>
          </div>
        {/if}
        {#if pagamentosParciais.length > 0}
          <div class="parcial-summary">
            <div class="parcial-row pago">
              <span>Já pago</span>
              <span>R$ {jaPago.toFixed(2)}</span>
            </div>
            <div class="parcial-row saldo" class:zerado={saldoMesa <= 0.001}>
              <span>{saldoMesa <= 0.001 ? 'Pago integralmente' : 'Saldo a pagar'}</span>
              <span>R$ {saldoMesa.toFixed(2)}</span>
            </div>
            <ul class="parcial-list">
              {#each pagamentosParciais as p (p.id)}
                <li class="parcial-item">
                  <span class="parcial-item-forma">{nomeForma(p.forma_pagamento)}</span>
                  <span class="parcial-item-valor">R$ {Number(p.valor).toFixed(2)}</span>
                  <button
                    type="button"
                    class="parcial-item-remove"
                    on:click={() => removerPagamentoParcial(p)}
                    aria-label="Remover pagamento parcial"
                    title="Remover"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L8.94 10l-5.72 5.72a.75.75 0 1 0 1.06 1.06L10 11.06l5.72 5.72a.75.75 0 1 0 1.06-1.06L11.06 10l5.72-5.72a.75.75 0 0 0-1.06-1.06L10 8.94 4.28 3.22Z" clip-rule="evenodd"/></svg>
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>

      <div class="comanda-actions">
        <button class="btn-secondary" on:click={() => preContaOpen = true} disabled={itens.length === 0}>
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5Z" clip-rule="evenodd"/>
          </svg>
          Pré-conta
        </button>
        <button class="btn-success" on:click={abrirCloseModal} disabled={itens.length === 0}>
          <span>{saldoMesa <= 0.001 && pagamentosParciais.length > 0 ? 'CONFIRMAR FECHAMENTO' : 'FECHAR MESA'}</span>
          <span class="btn-success-badge">R$ {(saldoMesa > 0 || pagamentosParciais.length === 0 ? saldoMesa : 0).toFixed(2)}</span>
        </button>
      </div>

      <button
        type="button"
        class="btn-parcial"
        on:click={abrirParcialModal}
        disabled={itens.length === 0 || saldoMesa <= 0.001}
        title={saldoMesa <= 0.001 ? 'Saldo já zerado' : 'Registrar pagamento parcial sem fechar a mesa'}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm.75 4a.75.75 0 0 0-1.5 0v3.25H6a.75.75 0 0 0 0 1.5h3.25V14a.75.75 0 0 0 1.5 0v-3.25H14a.75.75 0 0 0 0-1.5h-3.25V6Z"/>
        </svg>
        Registrar pagamento parcial
      </button>
      <div class="links-row">
        <button class="btn-link-secondary" on:click={abrirTransferModal} disabled={!comanda}>
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M15.97 2.47a.75.75 0 0 1 1.06 0l3 3a.75.75 0 0 1 0 1.06l-3 3a.75.75 0 1 1-1.06-1.06l1.72-1.72H6.75a.75.75 0 0 1 0-1.5h10.94l-1.72-1.72a.75.75 0 0 1 0-1.06ZM4.03 11.47a.75.75 0 0 1 0 1.06L2.31 14.25H13.25a.75.75 0 0 1 0 1.5H2.31l1.72 1.72a.75.75 0 1 1-1.06 1.06l-3-3a.75.75 0 0 1 0-1.06l3-3a.75.75 0 0 1 1.06 0Z" clip-rule="evenodd"/>
          </svg>
          Trocar de mesa
        </button>
        <span class="links-sep" aria-hidden="true">·</span>
        <button class="btn-link-cancel" on:click={cancelarComanda}>Cancelar comanda</button>
      </div>
    </aside>
  </div>

  <!-- Mobile cart bar (sticky bottom) — só aparece em mobile, quando há itens E comanda fechada -->
  {#if itens.length > 0 && !showMobileCart}
    <div class="mobile-cart-bar" aria-label="Resumo da comanda">
      <div class="mobile-cart-info">
        <span class="mobile-cart-count">{itens.length} {itens.length === 1 ? 'item' : 'itens'}</span>
        <span class="mobile-cart-total">R$ {total.toFixed(2)}</span>
        {#if pagamentosParciais.length > 0 && saldoMesa > 0.001}
          <span class="mobile-cart-saldo">Saldo R$ {saldoMesa.toFixed(2)}</span>
        {/if}
      </div>
      <button type="button" class="mobile-cart-btn" on:click={abrirMobileCart}>
        Ver comanda
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M14.77 12.79a.75.75 0 0 1-1.06-.02L10 8.832l-3.71 3.938a.75.75 0 1 1-1.08-1.04l4.25-4.5a.75.75 0 0 1 1.08 0l4.25 4.5a.75.75 0 0 1-.02 1.06Z" clip-rule="evenodd"/>
        </svg>
      </button>
    </div>
  {/if}
{/if}

<!-- ============================ TRANSFERIR MESA MODAL ============================ -->
{#if transferModalOpen && comanda && mesa}
  <div class="modal-overlay" on:click|self={fecharTransferModal} role="presentation">
    <div class="modal modal-transfer" role="dialog" aria-modal="true" aria-labelledby="transfer-title">
      <div class="transfer-header">
        <h2 id="transfer-title" class="modal-title">Transferir Mesa {mesa.numero}</h2>
        <p class="modal-subtitle">
          {itens.length} {itens.length === 1 ? 'item' : 'itens'} · {comanda.num_pessoas || 1} {(comanda.num_pessoas || 1) === 1 ? 'pessoa' : 'pessoas'} · serão movidos para a mesa selecionada
        </p>
      </div>

      {#if loadingMesasLivres}
        <p class="muted center-text">Carregando mesas livres…</p>
      {:else if mesasLivres.length === 0}
        <div class="transfer-empty">
          <div class="transfer-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
              <rect x="3" y="9" width="18" height="10" rx="2"/>
              <path d="M5 9V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M7 19v2M17 19v2" stroke-linecap="round"/>
            </svg>
          </div>
          <p class="transfer-empty-title">Nenhuma mesa livre disponível</p>
          <p class="transfer-empty-desc">Todas as outras mesas estão ocupadas, fechando ou inativas.</p>
        </div>
      {:else}
        <div class="transfer-grid">
          {#each mesasLivres as m (m.id)}
            <button
              type="button"
              class="transfer-tile"
              class:selected={mesaDestinoId === m.id}
              on:click={() => mesaDestinoId = m.id}
              aria-pressed={mesaDestinoId === m.id}
            >
              <span class="transfer-tile-num">{m.numero}</span>
              {#if m.capacidade}
                <span class="transfer-tile-cap">
                  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-7 8a7 7 0 0 1 14 0H3Z"/>
                  </svg>
                  {m.capacidade}
                </span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}

      <div class="modal-actions">
        <button class="btn-secondary" on:click={fecharTransferModal} disabled={transferring}>
          Cancelar
        </button>
        <button
          class="btn-primary btn-confirm"
          on:click={transferirMesa}
          disabled={transferring || !mesaDestinoId}
        >
          {#if transferring}
            Transferindo…
          {:else}
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M15.97 2.47a.75.75 0 0 1 1.06 0l3 3a.75.75 0 0 1 0 1.06l-3 3a.75.75 0 1 1-1.06-1.06l1.72-1.72H6.75a.75.75 0 0 1 0-1.5h10.94l-1.72-1.72a.75.75 0 0 1 0-1.06ZM4.03 11.47a.75.75 0 0 1 0 1.06L2.31 14.25H13.25a.75.75 0 0 1 0 1.5H2.31l1.72 1.72a.75.75 0 1 1-1.06 1.06l-3-3a.75.75 0 0 1 0-1.06l3-3a.75.75 0 0 1 1.06 0Z" clip-rule="evenodd"/>
            </svg>
            Confirmar transferência
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ============================ PAGAMENTO PARCIAL MODAL ============================ -->
{#if parcialModalOpen && comanda}
  <div class="modal-overlay" on:click|self={fecharParcialModal} role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="parcial-title">
      <div class="transfer-header">
        <h2 id="parcial-title" class="modal-title">Pagamento parcial · Mesa {mesa.numero}</h2>
        <p class="modal-subtitle">
          Registre quanto cada cliente está pagando agora. A mesa permanece aberta até zerar o saldo.
        </p>
      </div>

      <div class="parcial-status">
        <div class="parcial-status-row">
          <span class="parcial-status-label">Total da comanda</span>
          <span class="parcial-status-value">R$ {total.toFixed(2)}</span>
        </div>
        <div class="parcial-status-row">
          <span class="parcial-status-label">Já pago</span>
          <span class="parcial-status-value pago">R$ {jaPago.toFixed(2)}</span>
        </div>
        <div class="parcial-status-row destacado">
          <span class="parcial-status-label">Saldo a pagar</span>
          <span class="parcial-status-value saldo">R$ {saldoMesa.toFixed(2)}</span>
        </div>
      </div>

      <div class="multi-add-form">
        <select class="multi-forma" bind:value={parcialForma} on:change={onParcialFormaChange}>
          <option value="dinheiro">Dinheiro</option>
          <option value="cartao_debito">Débito</option>
          <option value="cartao_credito">Crédito</option>
          <option value="pix">PIX</option>
          <option value="fiado">Fiado</option>
        </select>
        <input
          type="number" inputmode="decimal" min="0.01" step="0.01"
          class="multi-valor"
          bind:value={parcialValor}
          placeholder="0,00"
        />
        <button type="button" class="multi-restante" on:click={preencherParcialSaldo} title="Preencher com o saldo">
          Saldo
        </button>
        <button
          type="button"
          class="multi-add-btn"
          on:click={salvarPagamentoParcial}
          disabled={savingParcial || saldoMesa <= 0.001}
        >
          {#if savingParcial}
            …
          {:else}
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M10 3.5a.75.75 0 0 1 .75.75v5h5a.75.75 0 0 1 0 1.5h-5v5a.75.75 0 0 1-1.5 0v-5h-5a.75.75 0 0 1 0-1.5h5v-5A.75.75 0 0 1 10 3.5Z" clip-rule="evenodd"/>
            </svg>
            Cobrar
          {/if}
        </button>
      </div>

      {#if parcialForma === 'fiado'}
        <select class="multi-fiado-select" bind:value={parcialPessoaId}>
          <option value="">— Cliente do fiado —</option>
          {#each pessoas as p}
            <option value={p.id}>{p.nome}{p.saldo_fiado > 0 ? ` (saldo R$ ${Number(p.saldo_fiado).toFixed(2)})` : ''}</option>
          {/each}
        </select>
      {/if}

      {#if parcialErro}
        <p class="multi-error">{parcialErro}</p>
      {/if}

      {#if pagamentosParciais.length > 0}
        <div class="parcial-history">
          <p class="parcial-history-title">Pagamentos já registrados</p>
          <ul class="multi-list">
            {#each pagamentosParciais as p (p.id)}
              <li class="multi-item">
                <div class="multi-item-info">
                  <span class="multi-item-forma">{nomeForma(p.forma_pagamento)}</span>
                  {#if p.forma_pagamento === 'fiado'}
                    <span class="multi-item-pessoa">{pessoas.find(x => x.id === p.id_pessoa)?.nome || ''}</span>
                  {/if}
                </div>
                <span class="multi-item-valor">R$ {Number(p.valor).toFixed(2)}</span>
                <button
                  type="button"
                  class="multi-item-remove"
                  on:click={() => removerPagamentoParcial(p)}
                  aria-label="Remover"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L8.94 10l-5.72 5.72a.75.75 0 1 0 1.06 1.06L10 11.06l5.72 5.72a.75.75 0 1 0 1.06-1.06L11.06 10l5.72-5.72a.75.75 0 0 0-1.06-1.06L10 8.94 4.28 3.22Z" clip-rule="evenodd"/></svg>
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <div class="modal-actions">
        <button class="btn-secondary" on:click={fecharParcialModal} disabled={savingParcial}>
          {saldoMesa <= 0.001 ? 'Concluir' : 'Fechar'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ============================ PRÉ-CONTA MODAL ============================ -->
{#if preContaOpen && comanda}
  <div class="modal-overlay" on:click|self={() => preContaOpen = false} role="presentation">
    <div class="modal modal-ticket print-target" role="dialog" aria-modal="true" aria-labelledby="pre-conta-title">
      <div class="modal-print-header">
        {#if nomeEmpresa}<p class="empresa-name">{nomeEmpresa}</p>{/if}
        <h2 id="pre-conta-title" class="modal-title">Pré-conta · Mesa {mesa.numero}</h2>
        <p class="modal-subtitle">{new Date().toLocaleString('pt-BR')}</p>
      </div>

      <div class="recibo-itens">
        {#each itens as it}
          <div class="recibo-item">
            <span class="recibo-item-name">{it.quantidade}× {it.nome_produto}</span>
            <span class="recibo-item-value">R$ {(Number(it.preco_unitario) * Number(it.quantidade)).toFixed(2)}</span>
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
        <button class="btn-primary" on:click={imprimirPreConta}>
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M5 2.75A.75.75 0 0 1 5.75 2h8.5a.75.75 0 0 1 .75.75V5h.75A2.75 2.75 0 0 1 18.5 7.75v4A2.75 2.75 0 0 1 15.75 14.5H15v2.75a.75.75 0 0 1-.75.75h-8.5a.75.75 0 0 1-.75-.75V14.5h-.75A2.75 2.75 0 0 1 1.5 11.75v-4A2.75 2.75 0 0 1 4.25 5H5V2.75ZM6.5 5h7V3.5h-7V5Zm0 9.5v3h7v-3h-7Zm8.25-6.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" clip-rule="evenodd"/>
          </svg>
          Imprimir
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ============================ FECHAR MESA MODAL ============================ -->
{#if closeModalOpen && comanda}
  <div class="modal-overlay" on:click|self={fecharCloseModal} role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="close-title">
      <h2 id="close-title" class="modal-title">Fechar Mesa {mesa.numero}</h2>

      <div class="close-hero">
        <span class="close-hero-label">Total a pagar</span>
        <span class="close-hero-value">R$ {total.toFixed(2)}</span>
        {#if comanda.num_pessoas > 1}
          <span class="close-hero-split">{comanda.num_pessoas} pessoas · R$ {(total / comanda.num_pessoas).toFixed(2)} cada</span>
        {/if}
      </div>

      <details class="close-breakdown">
        <summary>Ver detalhamento</summary>
        <div class="close-breakdown-body">
          <div class="total-row"><span>Itens</span><span>{itens.length}</span></div>
          <div class="total-row"><span>Subtotal</span><span>R$ {subtotal.toFixed(2)}</span></div>
          {#if couvert > 0}<div class="total-row"><span>Couvert</span><span>+R$ {couvert.toFixed(2)}</span></div>{/if}
          {#if desconto > 0}<div class="total-row"><span>Desconto</span><span style="color: var(--status-success-text);">−R$ {desconto.toFixed(2)}</span></div>{/if}
          {#if taxaPct > 0}<div class="total-row"><span>Taxa serviço ({taxaPct}%)</span><span>+R$ {taxaValor.toFixed(2)}</span></div>{/if}
        </div>
      </details>

      {#if !multiPag}
        <!-- === Modo single === -->
        <div class="forma-section">
          <p class="forma-section-title">Forma de pagamento</p>
          <div class="forma-grid">
            {#each [
              { id: 'dinheiro',       label: 'Dinheiro' },
              { id: 'cartao_debito',  label: 'Débito'   },
              { id: 'cartao_credito', label: 'Crédito'  },
              { id: 'pix',            label: 'PIX'      },
              { id: 'fiado',          label: 'Fiado'    },
            ] as forma}
              <button
                class="forma-btn"
                class:active={formaPagamento === forma.id}
                on:click={() => { formaPagamento = forma.id; onFormaChange(); }}
                type="button"
                aria-pressed={formaPagamento === forma.id}
              >
                <span class="forma-icon" aria-hidden="true">
                  {#if forma.id === 'dinheiro'}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                      <rect x="2" y="6" width="20" height="12" rx="2"/>
                      <circle cx="12" cy="12" r="2.5"/>
                      <path d="M5 9h0M19 15h0" stroke-linecap="round"/>
                    </svg>
                  {:else if forma.id === 'cartao_debito'}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                      <rect x="2" y="5" width="20" height="14" rx="2"/>
                      <path d="M2 10h20M6 15h4" stroke-linecap="round"/>
                    </svg>
                  {:else if forma.id === 'cartao_credito'}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                      <rect x="2" y="5" width="20" height="14" rx="2"/>
                      <path d="M2 9h20M6 15h2M11 15h2M16 15h2" stroke-linecap="round"/>
                    </svg>
                  {:else if forma.id === 'pix'}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                      <path d="M12 2 22 12 12 22 2 12 12 2Z" stroke-linejoin="round"/>
                      <path d="M7 12 12 7l5 5-5 5-5-5Z" stroke-linejoin="round"/>
                    </svg>
                  {:else if forma.id === 'fiado'}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                      <path d="M4 5a2 2 0 0 1 2-2h11a3 3 0 0 1 3 3v15a2 2 0 0 0-2-2H6a2 2 0 0 1-2-2V5Z" stroke-linejoin="round"/>
                      <path d="M8 8h8M8 12h6" stroke-linecap="round"/>
                    </svg>
                  {/if}
                </span>
                <span class="forma-label">{forma.label}</span>
              </button>
            {/each}
          </div>
        </div>

        {#if formaPagamento === 'dinheiro'}
          <div class="cash-row">
            <label class="field" style="flex:1;">
              <span class="field-label">Valor recebido</span>
              <input
                type="number" inputmode="decimal" min="0" step="0.01"
                bind:value={valorRecebido}
                placeholder={total.toFixed(2)}
              />
            </label>
            <div class="troco-display" class:negative={faltaPagar > 0} class:positive={troco > 0 && faltaPagar === 0}>
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

        <button type="button" class="split-toggle" on:click={ativarMulti}>
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M5.404 14.596A6.5 6.5 0 1 1 16.5 10a1.25 1.25 0 0 1-2.5 0 4 4 0 1 0-.571 2.06l-1.92-1.92a.75.75 0 1 1 1.06-1.06l3.5 3.5a.75.75 0 0 1 0 1.06l-3.5 3.5a.75.75 0 0 1-1.06-1.06l1.92-1.92A6.5 6.5 0 0 1 5.404 14.596Z" clip-rule="evenodd"/>
          </svg>
          Dividir conta entre formas (rachar)
        </button>
      {:else}
        <!-- === Modo múltiplo (split) === -->
        <div class="multi-section">
          <div class="multi-header">
            <span class="forma-section-title">Dividir conta</span>
            <button type="button" class="multi-back-btn" on:click={cancelarMulti}>
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z" clip-rule="evenodd"/>
              </svg>
              Voltar pra forma única
            </button>
          </div>

          <div class="multi-add-form">
            <select class="multi-forma" bind:value={novoPagForma} on:change={onNovoPagFormaChange}>
              <option value="dinheiro">Dinheiro</option>
              <option value="cartao_debito">Débito</option>
              <option value="cartao_credito">Crédito</option>
              <option value="pix">PIX</option>
              <option value="fiado">Fiado</option>
            </select>
            <input
              type="number" inputmode="decimal" min="0" step="0.01"
              class="multi-valor"
              bind:value={novoPagValor}
              placeholder="0,00"
            />
            <button type="button" class="multi-restante" on:click={preencherRestante} title="Preencher com o valor restante">
              Restante
            </button>
            <button type="button" class="multi-add-btn" on:click={addPagamento}>
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M10 3.5a.75.75 0 0 1 .75.75v5h5a.75.75 0 0 1 0 1.5h-5v5a.75.75 0 0 1-1.5 0v-5h-5a.75.75 0 0 1 0-1.5h5v-5A.75.75 0 0 1 10 3.5Z" clip-rule="evenodd"/>
              </svg>
              Adicionar
            </button>
          </div>

          {#if novoPagForma === 'fiado'}
            <select class="multi-fiado-select" bind:value={novoPagPessoaId}>
              <option value="">— Cliente do fiado —</option>
              {#each pessoas as p}
                <option value={p.id}>{p.nome}{p.saldo_fiado > 0 ? ` (saldo R$ ${Number(p.saldo_fiado).toFixed(2)})` : ''}</option>
              {/each}
            </select>
          {/if}

          {#if erroPagamento}
            <p class="multi-error">{erroPagamento}</p>
          {/if}

          {#if pagamentos.length > 0}
            <ul class="multi-list">
              {#each pagamentos as p, i (i)}
                <li class="multi-item">
                  <div class="multi-item-info">
                    <span class="multi-item-forma">{nomeForma(p.forma)}</span>
                    {#if p.forma === 'fiado'}
                      <span class="multi-item-pessoa">{pessoas.find(x => x.id === p.pessoaId)?.nome || ''}</span>
                    {/if}
                  </div>
                  <span class="multi-item-valor">R$ {Number(p.valor).toFixed(2)}</span>
                  <button type="button" class="multi-item-remove" on:click={() => removerPagamento(i)} aria-label="Remover">
                    <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L8.94 10l-5.72 5.72a.75.75 0 1 0 1.06 1.06L10 11.06l5.72 5.72a.75.75 0 1 0 1.06-1.06L11.06 10l5.72-5.72a.75.75 0 0 0-1.06-1.06L10 8.94 4.28 3.22Z" clip-rule="evenodd"/></svg>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}

          <div class="multi-totals">
            <div class="multi-total-row">
              <span>Soma</span>
              <span class="multi-total-value">R$ {Number(somaPagamentos).toFixed(2)}</span>
            </div>
            <div class="multi-total-row" class:has-restante={restantePagamento > 0}>
              <span>{restantePagamento > 0 ? 'Falta' : 'Restante'}</span>
              <span class="multi-total-value">R$ {Number(restantePagamento).toFixed(2)}</span>
            </div>
            {#if trocoMulti > 0}
              <div class="multi-total-row has-troco">
                <span>Troco</span>
                <span class="multi-total-value">R$ {Number(trocoMulti).toFixed(2)}</span>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <div class="modal-actions">
        <button class="btn-secondary" on:click={fecharCloseModal} disabled={closing}>Cancelar</button>
        <button class="btn-primary btn-confirm" on:click={fecharMesa} disabled={closing}>
          {#if closing}
            Processando…
          {:else}
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M16.704 5.296a1 1 0 0 1 0 1.408l-7.5 7.5a1 1 0 0 1-1.408 0l-3.5-3.5a1 1 0 0 1 1.408-1.408L8.5 12.092l6.796-6.796a1 1 0 0 1 1.408 0Z" clip-rule="evenodd"/>
            </svg>
            Confirmar pagamento
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ============================ RECIBO (PÓS-FECHAMENTO) ============================ -->
{#if recibosOpen && recibo}
  <div class="modal-overlay" role="presentation">
    <div class="modal modal-ticket print-target" role="dialog" aria-modal="true" aria-labelledby="recibo-title">
      <div class="recibo-stamp print-hide" aria-hidden="true">PAGO</div>

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
            <span class="recibo-item-name">{it.quantidade}× {it.nome}</span>
            <span class="recibo-item-value">R$ {it.subtotal.toFixed(2)}</span>
          </div>
        {/each}
      </div>

      <div class="recibo-totais">
        <div class="total-row"><span>Subtotal</span><span>R$ {recibo.subtotal.toFixed(2)}</span></div>
        {#if recibo.couvert > 0}<div class="total-row"><span>Couvert</span><span>+R$ {recibo.couvert.toFixed(2)}</span></div>{/if}
        {#if recibo.desconto > 0}<div class="total-row"><span>Desconto</span><span>−R$ {recibo.desconto.toFixed(2)}</span></div>{/if}
        {#if recibo.taxa_pct > 0}<div class="total-row"><span>Taxa ({recibo.taxa_pct}%)</span><span>+R$ {recibo.taxa_valor.toFixed(2)}</span></div>{/if}
        <div class="total-row total-final"><span>Total pago</span><span>R$ {recibo.total.toFixed(2)}</span></div>
        {#if recibo.pagamentos_split && recibo.pagamentos_split.length}
          <div class="total-row"><span>Forma</span><span>Múltiplo</span></div>
          {#each recibo.pagamentos_split as p}
            <div class="total-row split-line"><span>· {formaPagamentoLabel(p.forma)}</span><span>R$ {Number(p.valor).toFixed(2)}</span></div>
          {/each}
          {#if Number(recibo.valor_troco) > 0}
            <div class="total-row"><span>Troco</span><span>R$ {Number(recibo.valor_troco).toFixed(2)}</span></div>
          {/if}
        {:else}
          <div class="total-row"><span>Forma</span><span>{formaPagamentoLabel(recibo.forma_pagamento)}</span></div>
          {#if recibo.forma_pagamento === 'dinheiro'}
            <div class="total-row"><span>Recebido</span><span>R$ {Number(recibo.valor_recebido).toFixed(2)}</span></div>
            <div class="total-row"><span>Troco</span><span>R$ {Number(recibo.valor_troco).toFixed(2)}</span></div>
          {/if}
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
        <button class="btn-secondary" on:click={imprimirRecibo}>
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M5 2.75A.75.75 0 0 1 5.75 2h8.5a.75.75 0 0 1 .75.75V5h.75A2.75 2.75 0 0 1 18.5 7.75v4A2.75 2.75 0 0 1 15.75 14.5H15v2.75a.75.75 0 0 1-.75.75h-8.5a.75.75 0 0 1-.75-.75V14.5h-.75A2.75 2.75 0 0 1 1.5 11.75v-4A2.75 2.75 0 0 1 4.25 5H5V2.75ZM6.5 5h7V3.5h-7V5Zm0 9.5v3h7v-3h-7Z" clip-rule="evenodd"/>
          </svg>
          Imprimir
        </button>
        <button class="btn-primary" on:click={fecharRecibo}>
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clip-rule="evenodd"/>
          </svg>
          Voltar para mesas
        </button>
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
    grid-template-columns: 1fr 380px;
    gap: 1.25rem;
    height: 100%;
    min-height: 0;
    padding: 1rem 1.25rem;
    box-sizing: border-box;
    overflow: hidden;
  }
  @media (max-width: 900px) {
    .comanda-shell {
      grid-template-columns: 1fr;
      height: auto;
      min-height: 100%;
      gap: 1rem;
      /* top maior pra não esconder atrás do hambúrguer da sidebar (top:12px + 36px do botão) */
      padding: 3.25rem 0.85rem 5.5rem;
      overflow-x: hidden;
      overflow-y: visible;
    }
    .produtos-side { overflow: visible; min-width: 0; }
    .produtos-grid {
      flex: none;
      max-height: none;
      overflow: visible;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    }
    .produto-card { min-height: 84px; padding: 0.95rem 1rem; }
    .produto-nome { font-size: 0.95rem; }
    .produto-preco { font-size: 1rem; }
    .comanda-side {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      /* z-index 65 fica acima do hambúrguer da sidebar (z-60),
         então o drawer cobre tudo e o close vira o único caminho de saída */
      z-index: 65;
      transform: translateY(100%);
      transition: transform 0.28s ease;
      border: none;
      border-radius: 0;
      background: var(--bg-app);
      padding: 0.4rem 0.95rem 5.5rem;
      gap: 0.85rem;
      overflow-y: auto;
      max-height: none;
      min-width: 0;
      box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.4);
    }
    .comanda-side.mobile-open { transform: translateY(0); }

    /* Drag handle no topo do drawer — barrinha + label "Minimizar"
       Specificity .comanda-side .drag-handle (0,2,0) ganha do default global (0,1,0) */
    .comanda-side .drag-handle {
      display: flex; flex-direction: column;
      align-items: center; gap: 0.25rem;
      width: 100%;
      background: transparent; border: none;
      padding: 0.5rem 0 0.4rem;
      margin-bottom: 0.25rem;
      cursor: pointer;
      color: var(--text-muted);
      -webkit-tap-highlight-color: transparent;
    }
    .handle-bar {
      width: 44px; height: 5px;
      background: var(--text-muted);
      border-radius: 3px;
      opacity: 0.45;
      transition: opacity 0.15s, transform 0.15s;
    }
    .drag-handle-text {
      font-size: 0.65rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.12em;
      opacity: 0.75;
    }
    .comanda-side .drag-handle:hover .handle-bar,
    .comanda-side .drag-handle:active .handle-bar {
      opacity: 0.85;
      transform: scaleX(1.15);
    }

    .itens-list { max-height: none; flex: none; overflow: visible; }
    .ajustes-grid {
      grid-template-columns: 1fr 1fr 1fr;
      gap: 0.35rem;
    }
    .ajustes-grid .field input { min-width: 0; width: 100%; box-sizing: border-box; }
    .item-card { padding: 0.65rem 0.7rem; }

    /* Tap targets maiores */
    .qty-btn { width: 32px; height: 32px; }
    .qty-btn svg { width: 14px; height: 14px; }
    .pessoas-row { padding: 0.7rem 0.85rem; }

    /* Categoria tabs mais altas */
    .cat-tab { padding: 0.55rem 1rem; font-size: 0.85rem; }

    /* Botões CTA da comanda mais altos pra dedo */
    .btn-primary, .btn-secondary, .btn-success { min-height: 48px; }
  }
  @media (max-width: 420px) {
    .ajustes-grid { grid-template-columns: 1fr 1fr; }
    .ajustes-grid .field:last-child { grid-column: span 2; }
    .comanda-actions { grid-template-columns: 1fr; }
    .produtos-grid { grid-template-columns: repeat(2, 1fr); }
  }

  /* === Mobile Cart Bar (sticky bottom) === */
  .mobile-cart-bar {
    display: none;
  }
  @media (max-width: 900px) {
    .mobile-cart-bar {
      display: flex;
      position: fixed;
      bottom: 0; left: 0; right: 0;
      z-index: 30;
      background: var(--bg-card);
      border-top: 1px solid var(--border-card);
      padding: 0.7rem 0.95rem;
      box-shadow: 0 -8px 20px rgba(0, 0, 0, 0.35);
      align-items: center;
      justify-content: space-between;
      gap: 0.6rem;
    }
    .mobile-cart-info {
      display: flex; flex-direction: column; gap: 0.05rem;
      min-width: 0;
    }
    .mobile-cart-count {
      font-size: 0.7rem; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: 0.05em;
      font-weight: 600;
    }
    .mobile-cart-total {
      font-size: 1.05rem; font-weight: 800; color: var(--text-main);
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.01em;
    }
    .mobile-cart-saldo {
      font-size: 0.7rem; color: var(--status-warning-text);
      font-weight: 700;
    }
    .mobile-cart-btn {
      display: inline-flex; align-items: center; gap: 0.35rem;
      background: var(--primary);
      color: var(--primary-text);
      border: none;
      border-radius: 999px;
      padding: 0.6rem 1.1rem;
      font-size: 0.85rem; font-weight: 700;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.15s;
    }
    .mobile-cart-btn:hover { background: var(--primary-hover); }
    .mobile-cart-btn svg { width: 14px; height: 14px; }
  }

  /* === Produtos side === */
  .produtos-side {
    display: flex; flex-direction: column;
    min-width: 0;
    gap: 0.85rem;
    overflow: hidden;
  }
  .produtos-header {
    display: flex; flex-direction: column; gap: 0.5rem;
  }
  .back-link {
    display: inline-flex; align-items: center; gap: 0.25rem;
    align-self: flex-start;
    color: var(--text-label); text-decoration: none;
    font-size: 0.85rem; font-weight: 600;
    transition: color 0.15s;
  }
  .back-link svg { width: 16px; height: 16px; }
  .back-link:hover { color: var(--primary); }

  .title-row {
    display: flex; align-items: center; gap: 0.75rem;
    flex-wrap: wrap;
  }
  .mesa-title {
    font-size: 1.75rem; font-weight: 800; color: var(--text-main);
    margin: 0; letter-spacing: -0.02em;
  }
  .mesa-title strong { font-weight: 800; }

  .status-pill {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.3rem 0.75rem;
    border-radius: 999px;
    font-size: 0.72rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
    background: var(--bg-input);
    color: var(--text-muted);
    border: 1px solid var(--border-subtle);
  }
  .status-dot {
    width: 8px; height: 8px;
    border-radius: 999px;
    background: currentColor;
    flex-shrink: 0;
  }
  .status-pill[data-status="livre"] {
    background: var(--status-success-bg);
    color: var(--status-success-text);
    border-color: var(--status-success-border);
  }
  .status-pill[data-status="ocupada"] {
    background: var(--status-error-bg);
    color: var(--status-error-text);
    border-color: var(--status-error-border);
  }
  .status-pill[data-status="fechando"] {
    background: var(--status-warning-bg);
    color: var(--status-warning-text);
    border-color: var(--status-warning-border);
  }

  .filter-row { display: flex; gap: 0.5rem; }
  .search-wrap { position: relative; flex: 1; }
  .search-icon {
    position: absolute; left: 0.85rem; top: 50%;
    transform: translateY(-50%);
    width: 16px; height: 16px;
    color: var(--text-muted);
    pointer-events: none;
  }
  .search-input {
    width: 100%;
    padding: 0.6rem 0.85rem 0.6rem 2.4rem;
    background: var(--bg-input);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    font-size: 0.9rem;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .search-input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--accent-light);
  }

  .categoria-tabs {
    display: flex; gap: 0.4rem; overflow-x: auto;
    padding-bottom: 0.25rem;
  }
  .cat-tab {
    flex-shrink: 0;
    padding: 0.45rem 0.95rem;
    background: var(--bg-input);
    color: var(--text-label);
    border: 1px solid var(--border-subtle);
    border-radius: 999px;
    font-size: 0.8rem; font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .cat-tab:hover { color: var(--text-main); border-color: var(--border-strong); }
  .cat-tab.active {
    background: var(--accent-light);
    color: var(--primary);
    border-color: var(--primary);
  }

  .produtos-grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
    gap: 0.6rem;
    overflow-y: auto;
    padding: 0.15rem 0.25rem 0.25rem 0.15rem;
    align-content: start;
  }
  .produto-card {
    display: flex; flex-direction: column;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.85rem 1rem;
    min-height: 72px;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    color: var(--text-main);
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s, transform 0.1s, box-shadow 0.15s, background 0.12s;
  }
  .produto-card:hover {
    border-color: var(--primary);
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(0,0,0,0.18);
  }
  .produto-card:active {
    transform: scale(0.97);
    background: var(--accent-light);
    border-color: var(--primary);
  }
  .produto-card:disabled { opacity: 0.55; cursor: progress; }
  .produto-card.sem-estoque,
  .produto-card.sem-estoque:hover {
    border-color: var(--border-subtle);
    box-shadow: none;
    cursor: not-allowed;
    transform: none;
  }
  .produto-nome {
    font-size: 0.9rem; font-weight: 600; line-height: 1.3;
    overflow: hidden; display: -webkit-box;
    -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  }
  .produto-preco {
    font-size: 0.95rem; font-weight: 700; color: var(--primary);
    font-variant-numeric: tabular-nums;
  }
  .produto-estoque {
    color: var(--text-muted);
    font-size: 0.72rem;
    font-weight: 600;
    line-height: 1.2;
  }
  .produto-estoque.stock-empty { color: var(--status-error-text); }
  .empty-produtos {
    color: var(--text-muted); padding: 1rem;
    grid-column: 1 / -1;
  }

  /* === Comanda side === */
  .comanda-side {
    display: flex; flex-direction: column;
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 14px;
    padding: 1.1rem;
    gap: 0.85rem;
    overflow-y: auto;
    min-height: 0;
  }

  .comanda-header {
    display: flex; align-items: center; justify-content: space-between;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--border-subtle);
    gap: 0.5rem;
  }
  .comanda-title {
    font-size: 1rem; font-weight: 800; color: var(--text-main); margin: 0;
    text-transform: uppercase; letter-spacing: 0.18em;
  }
  /* drag handle: hidden por padrão, aparece só em mobile com drawer aberto */
  .drag-handle { display: none; }
  .comanda-itens-count {
    font-size: 0.72rem; font-weight: 700;
    color: var(--primary);
    background: var(--accent-light);
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    text-transform: lowercase;
  }

  .pessoas-row {
    display: flex; align-items: center; justify-content: space-between;
    background: var(--bg-input);
    padding: 0.55rem 0.85rem;
    border-radius: 10px;
    border: 1px solid var(--border-subtle);
  }
  .pessoas-info {
    display: flex; align-items: center; gap: 0.5rem;
    color: var(--text-label); font-size: 0.85rem; font-weight: 600;
  }
  .pessoas-icon { width: 16px; height: 16px; color: var(--text-muted); }
  .pessoas-stepper {
    display: flex; align-items: center; gap: 0.4rem;
  }
  .pessoas-val {
    min-width: 28px; text-align: center;
    font-weight: 700; color: var(--text-main); font-size: 1rem;
    font-variant-numeric: tabular-nums;
  }

  .itens-list {
    flex: 1;
    display: flex; flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    padding: 0.25rem 0;
  }
  .itens-ul {
    list-style: none; padding: 0; margin: 0;
    display: flex; flex-direction: column; gap: 0.35rem;
  }
  .empty-itens {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 0.5rem;
    color: var(--text-muted);
    padding: 2rem 0;
    opacity: 0.6;
  }
  .empty-itens svg { width: 40px; height: 40px; }
  .empty-itens p {
    font-size: 0.7rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.15em;
    margin: 0;
  }

  .item-card {
    display: flex; align-items: center; gap: 0.6rem;
    padding: 0.55rem 0.7rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    transition: background 0.12s, border-color 0.12s;
  }
  .item-card:hover {
    background: var(--bg-panel);
    border-color: var(--border-strong);
  }
  .item-info {
    display: flex; flex-direction: column; gap: 0.1rem;
    min-width: 0; flex: 1;
  }
  .item-nome {
    font-size: 0.88rem; color: var(--text-main); font-weight: 700;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    line-height: 1.25;
  }
  .item-preco {
    font-size: 0.7rem; color: var(--text-muted);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .item-actions {
    display: inline-flex; align-items: center; gap: 0.35rem;
    flex-shrink: 0;
  }

  .qty-cluster {
    display: inline-flex; align-items: center; gap: 0.15rem;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 2px;
    flex-shrink: 0;
  }
  .qty-btn {
    width: 26px; height: 26px;
    display: inline-flex; align-items: center; justify-content: center;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--text-muted);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .qty-btn svg { width: 13px; height: 13px; }
  .qty-btn:hover:not(:disabled) { color: var(--text-main); background: rgba(255,255,255,0.05); }
  .qty-minus:hover:not(:disabled) { color: var(--status-error-text); background: var(--status-error-bg); }
  .qty-plus:hover:not(:disabled) { color: var(--status-success-text); background: var(--status-success-bg); }
  .qty-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .qty-val {
    min-width: 22px; text-align: center;
    font-weight: 700; color: var(--text-main); font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    padding: 0 0.15rem;
  }

  .kitchen-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem;
    min-height: 30px;
    padding: 0.35rem 0.5rem;
    border: 1px solid rgba(14, 165, 233, 0.35);
    border-radius: 8px;
    background: rgba(14, 165, 233, 0.1);
    color: var(--primary);
    font-size: 0.72rem;
    font-weight: 800;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .kitchen-btn svg { width: 13px; height: 13px; flex-shrink: 0; }
  .kitchen-btn:hover:not(:disabled) {
    background: rgba(14, 165, 233, 0.18);
    border-color: var(--primary);
  }
  .kitchen-btn.sent {
    color: var(--status-success-text);
    border-color: var(--status-success-border);
    background: var(--status-success-bg);
  }
  .kitchen-btn:disabled { opacity: 0.68; cursor: not-allowed; }

  .ajustes { display: flex; flex-direction: column; gap: 0.5rem; }
  .ajustes-toggle {
    display: flex; align-items: center; justify-content: space-between;
    width: 100%;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    padding: 0.55rem 0.85rem;
    color: var(--text-label); font-size: 0.85rem; font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .ajustes-toggle:hover { border-color: var(--border-strong); color: var(--text-main); }
  .ajustes-toggle svg {
    width: 16px; height: 16px;
    transition: transform 0.2s ease;
  }
  .ajustes-toggle.open svg { transform: rotate(180deg); }
  .ajustes-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
  }
  .field {
    display: flex; flex-direction: column; gap: 0.25rem;
    min-width: 0;
  }
  .field-label {
    font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--text-muted); font-weight: 700;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .field input[type="number"] {
    padding: 0.4rem 0.55rem;
    background: var(--bg-input);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    font-size: 0.88rem;
    font-variant-numeric: tabular-nums;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
  .field input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--accent-light);
  }

  .totais {
    display: flex; flex-direction: column; gap: 0.3rem;
  }
  .total-row {
    display: flex; justify-content: space-between;
    font-size: 0.85rem; color: var(--text-label);
    font-variant-numeric: tabular-nums;
  }

  .total-highlight {
    background: var(--accent-light);
    border: 1px solid var(--status-success-border);
    border-color: rgba(14, 165, 233, 0.25);
    border-radius: 12px;
    padding: 0.85rem 1rem;
    display: flex; flex-direction: column; gap: 0.3rem;
    margin-top: 0.25rem;
  }
  .total-final-row {
    display: flex; justify-content: space-between; align-items: baseline;
  }
  .total-final-label {
    font-size: 0.85rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--text-label);
  }
  .total-final-value {
    font-size: 1.6rem; font-weight: 800; color: var(--text-main);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .total-split-row {
    display: flex; justify-content: space-between;
    font-size: 0.78rem; color: var(--text-muted);
    border-top: 1px dashed var(--border-subtle);
    padding-top: 0.4rem;
  }

  .comanda-actions {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }
  .btn-primary, .btn-secondary, .btn-success {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: 10px;
    font-weight: 700; font-size: 0.88rem;
    cursor: pointer;
    text-decoration: none;
    text-align: center;
    border: 1px solid transparent;
    transition: background 0.15s, border-color 0.15s, transform 0.1s, box-shadow 0.15s;
    min-height: 44px;
  }
  .btn-primary svg, .btn-secondary svg, .btn-success svg {
    width: 16px; height: 16px;
    flex-shrink: 0;
  }
  .btn-primary {
    background: var(--primary);
    color: var(--primary-text);
    border-color: var(--primary);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--primary-hover);
    border-color: var(--primary-hover);
  }
  .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
  .btn-secondary {
    background: var(--bg-input);
    color: var(--text-main);
    border-color: var(--border-subtle);
    font-weight: 600;
  }
  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-panel);
    border-color: var(--border-strong);
  }
  .btn-secondary:disabled { opacity: 0.55; cursor: not-allowed; }
  .btn-success {
    background: var(--success);
    color: var(--primary-text);
    border-color: var(--success);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    box-shadow: 0 4px 12px -3px rgba(16, 185, 129, 0.4);
  }
  .btn-success:hover:not(:disabled) {
    filter: brightness(1.08);
    box-shadow: 0 6px 16px -3px rgba(16, 185, 129, 0.55);
  }
  .btn-success:active:not(:disabled) { transform: scale(0.97); }
  .btn-success:disabled {
    background: var(--bg-input);
    color: var(--text-muted);
    border-color: var(--border-subtle);
    box-shadow: none;
    cursor: not-allowed;
  }
  .btn-success-badge {
    background: rgba(0,0,0,0.22);
    padding: 0.18rem 0.5rem;
    border-radius: 6px;
    font-size: 0.78rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
  }
  .btn-success:disabled .btn-success-badge {
    background: var(--bg-card);
  }

  .links-row {
    display: flex; align-items: center; justify-content: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .links-sep { color: var(--text-muted); font-size: 0.78rem; }

  .btn-link-secondary {
    display: inline-flex; align-items: center; gap: 0.3rem;
    background: transparent; border: none;
    color: var(--text-label); cursor: pointer;
    font-size: 0.78rem; padding: 0.35rem;
    text-align: center;
    transition: color 0.15s;
  }
  .btn-link-secondary svg { width: 13px; height: 13px; }
  .btn-link-secondary:hover { color: var(--primary); }
  .btn-link-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-link-cancel {
    background: transparent; border: none;
    color: var(--error); cursor: pointer;
    font-size: 0.78rem; padding: 0.35rem;
    text-align: center;
  }
  .btn-link-cancel:hover { text-decoration: underline; }

  /* === Modal genérico === */
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
    z-index: 100; padding: 1rem;
    overflow-y: auto;
    backdrop-filter: blur(2px);
  }
  .modal {
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 14px;
    padding: 1.5rem;
    width: 100%; max-width: 460px;
    display: flex; flex-direction: column; gap: 0.95rem;
    max-height: 90vh; overflow-y: auto;
    box-shadow: 0 20px 50px rgba(0,0,0,0.4);
    position: relative;
  }
  .modal-ticket { max-width: 380px; }
  .modal-title { font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin: 0; }
  .modal-subtitle { font-size: 0.8rem; color: var(--text-muted); margin: 0.15rem 0 0; }

  .modal-print-header {
    text-align: center;
    padding-bottom: 0.6rem;
    border-bottom: 1px dashed var(--border-subtle);
  }
  .empresa-name {
    font-size: 0.7rem; font-weight: 700; color: var(--text-label);
    margin: 0 0 0.4rem; text-transform: uppercase; letter-spacing: 0.18em;
  }
  .modal-ticket .modal-title {
    font-size: 1rem; font-weight: 600;
  }

  /* Recibo / pré-conta items + totals */
  .recibo-itens {
    display: flex; flex-direction: column; gap: 0.3rem;
    padding: 0.6rem 0;
    border-bottom: 1px dashed var(--border-subtle);
    font-size: 0.85rem;
  }
  .recibo-item {
    display: flex; justify-content: space-between; gap: 0.6rem;
    color: var(--text-main);
  }
  .recibo-item-name { flex: 1; min-width: 0; }
  .recibo-item-value {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .recibo-totais {
    display: flex; flex-direction: column; gap: 0.3rem;
    padding: 0.5rem 0;
  }
  .recibo-totais .total-row.total-final {
    font-size: 1.05rem; font-weight: 800; color: var(--text-main);
    margin-top: 0.4rem; padding-top: 0.5rem;
    border-top: 1px dashed var(--border-subtle);
  }
  .split-line {
    border-top: 1px dashed var(--border-subtle);
    padding-top: 0.4rem; margin-top: 0.2rem;
    font-size: 0.78rem;
    color: var(--text-muted);
  }
  .recibo-footer {
    font-size: 0.75rem; color: var(--text-muted);
    text-align: center; margin: 0.5rem 0 0;
    font-style: italic;
  }

  .recibo-stamp {
    position: absolute;
    top: 0.85rem; right: 0.85rem;
    transform: rotate(-8deg);
    border: 2px solid var(--status-success-text);
    color: var(--status-success-text);
    font-size: 0.85rem; font-weight: 800;
    letter-spacing: 0.15em;
    padding: 0.2rem 0.65rem;
    border-radius: 6px;
    opacity: 0.7;
    pointer-events: none;
  }

  /* === Fechar Mesa modal: hero total === */
  .close-hero {
    display: flex; flex-direction: column; align-items: center; gap: 0.25rem;
    background: var(--accent-light);
    border: 1px solid rgba(14, 165, 233, 0.3);
    border-radius: 12px;
    padding: 1rem 1.25rem;
    text-align: center;
  }
  .close-hero-label {
    font-size: 0.75rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--text-label);
  }
  .close-hero-value {
    font-size: 1.85rem; font-weight: 800; color: var(--text-main);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .close-hero-split {
    font-size: 0.78rem; color: var(--text-muted);
    margin-top: 0.15rem;
  }

  .close-breakdown {
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    background: var(--bg-input);
    overflow: hidden;
  }
  .close-breakdown summary {
    cursor: pointer;
    padding: 0.55rem 0.85rem;
    font-size: 0.82rem; font-weight: 600;
    color: var(--text-label);
    list-style: none;
  }
  .close-breakdown summary::-webkit-details-marker { display: none; }
  .close-breakdown summary::after {
    content: '▾';
    float: right;
    transition: transform 0.2s;
  }
  .close-breakdown[open] summary::after { transform: rotate(180deg); }
  .close-breakdown-body {
    display: flex; flex-direction: column; gap: 0.3rem;
    padding: 0 0.85rem 0.7rem;
  }

  /* === Forma de pagamento === */
  .forma-section {
    display: flex; flex-direction: column; gap: 0.5rem;
  }
  .forma-section-title {
    font-size: 0.7rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--text-muted);
    margin: 0;
  }
  .forma-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(85px, 1fr));
    gap: 0.5rem;
  }
  .forma-btn {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 0.35rem;
    padding: 0.75rem 0.5rem;
    background: var(--bg-input);
    border: 2px solid var(--border-subtle);
    border-radius: 12px;
    color: var(--text-label);
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s, color 0.15s, transform 0.1s;
  }
  .forma-btn:hover {
    border-color: var(--border-strong);
    color: var(--text-main);
  }
  .forma-btn.active {
    border-color: var(--primary);
    background: var(--accent-light);
    color: var(--primary);
  }
  .forma-icon {
    display: inline-flex; align-items: center; justify-content: center;
  }
  .forma-icon svg {
    width: 24px; height: 24px;
  }
  .forma-label { font-size: 0.78rem; font-weight: 600; }

  /* === Cash row === */
  .cash-row {
    display: flex; gap: 0.6rem; align-items: stretch;
  }
  .cash-row input[type="number"] {
    padding: 0.6rem 0.75rem;
    background: var(--bg-input);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    font-size: 1.05rem; font-weight: 700;
    font-variant-numeric: tabular-nums;
    width: 100%;
  }
  .cash-row input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--accent-light);
  }
  .troco-display {
    display: flex; flex-direction: column; align-items: flex-end;
    justify-content: center;
    padding: 0.4rem 1rem;
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    background: var(--bg-input);
    min-width: 130px;
    transition: border-color 0.15s, background 0.15s;
  }
  .troco-display.negative {
    border-color: var(--status-error-border);
    background: var(--status-error-bg);
  }
  .troco-display.positive {
    border-color: var(--status-success-border);
    background: var(--status-success-bg);
  }
  .troco-label {
    font-size: 0.65rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--text-muted);
  }
  .troco-display.negative .troco-label { color: var(--status-error-text); }
  .troco-display.positive .troco-label { color: var(--status-success-text); }
  .troco-value {
    font-size: 1.25rem; font-weight: 800; color: var(--text-main);
    font-variant-numeric: tabular-nums;
  }
  .troco-display.negative .troco-value { color: var(--status-error-text); }
  .troco-display.positive .troco-value { color: var(--status-success-text); }

  .field select {
    padding: 0.55rem 0.7rem;
    background: var(--bg-input);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    font-size: 0.9rem;
  }
  .field select:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--accent-light);
  }

  .modal-actions {
    display: flex; justify-content: flex-end; gap: 0.5rem;
    margin-top: 0.25rem;
  }
  .modal-actions .btn-primary, .modal-actions .btn-secondary {
    flex: 0 0 auto;
    padding: 0.65rem 1.1rem;
  }
  .modal-actions .btn-confirm {
    flex: 1;
    padding: 0.85rem 1.1rem;
    font-size: 0.95rem;
  }

  /* === Pagamentos parciais (na comanda) === */
  .parcial-summary {
    margin-top: 0.6rem;
    padding-top: 0.6rem;
    border-top: 1px dashed var(--border-subtle);
    display: flex; flex-direction: column; gap: 0.3rem;
  }
  .parcial-row {
    display: flex; justify-content: space-between;
    font-size: 0.8rem;
    color: var(--text-label);
    font-variant-numeric: tabular-nums;
  }
  .parcial-row.pago { color: var(--text-muted); }
  .parcial-row.saldo {
    color: var(--status-warning-text);
    font-weight: 700;
  }
  .parcial-row.saldo.zerado { color: var(--status-success-text); }
  .parcial-list {
    list-style: none; padding: 0; margin: 0.25rem 0 0;
    display: flex; flex-direction: column; gap: 0.2rem;
  }
  .parcial-item {
    display: flex; align-items: center; gap: 0.4rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 0.3rem 0.5rem;
    font-size: 0.75rem;
  }
  .parcial-item-forma { flex: 1; color: var(--text-label); font-weight: 600; }
  .parcial-item-valor {
    color: var(--text-main); font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .parcial-item-remove {
    display: inline-flex; align-items: center; justify-content: center;
    width: 20px; height: 20px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .parcial-item-remove svg { width: 10px; height: 10px; }
  .parcial-item-remove:hover {
    background: var(--status-error-bg);
    color: var(--status-error-text);
  }

  .btn-parcial {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
    background: transparent;
    color: var(--text-label);
    border: 1px dashed var(--border-strong);
    padding: 0.55rem 1rem;
    border-radius: 10px;
    font-size: 0.82rem; font-weight: 600;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .btn-parcial svg { width: 14px; height: 14px; }
  .btn-parcial:hover:not(:disabled) {
    color: var(--primary);
    border-color: var(--primary);
    background: var(--accent-light);
  }
  .btn-parcial:disabled { opacity: 0.45; cursor: not-allowed; }

  /* === Modal pagamento parcial === */
  .parcial-status {
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    padding: 0.75rem 1rem;
    display: flex; flex-direction: column; gap: 0.35rem;
  }
  .parcial-status-row {
    display: flex; justify-content: space-between;
    font-size: 0.85rem;
    color: var(--text-label);
    font-variant-numeric: tabular-nums;
  }
  .parcial-status-row.destacado {
    margin-top: 0.25rem;
    padding-top: 0.45rem;
    border-top: 1px dashed var(--border-subtle);
  }
  .parcial-status-label { font-weight: 600; }
  .parcial-status-value.pago { color: var(--text-muted); }
  .parcial-status-value.saldo {
    color: var(--status-warning-text);
    font-weight: 800;
    font-size: 1rem;
  }

  .parcial-history {
    display: flex; flex-direction: column; gap: 0.4rem;
    border-top: 1px dashed var(--border-subtle);
    padding-top: 0.75rem;
  }
  .parcial-history-title {
    font-size: 0.7rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--text-muted);
    margin: 0;
  }

  /* === Split de pagamento === */
  .split-toggle {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
    align-self: center;
    background: transparent;
    border: 1px dashed var(--border-strong);
    color: var(--text-label);
    padding: 0.5rem 1rem;
    border-radius: 999px;
    font-size: 0.78rem; font-weight: 600;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .split-toggle svg { width: 14px; height: 14px; }
  .split-toggle:hover {
    color: var(--primary);
    border-color: var(--primary);
    background: var(--accent-light);
  }

  .multi-section {
    display: flex; flex-direction: column; gap: 0.7rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    padding: 0.85rem;
  }
  .multi-header {
    display: flex; align-items: center; justify-content: space-between;
    gap: 0.5rem;
  }
  .multi-back-btn {
    display: inline-flex; align-items: center; gap: 0.25rem;
    background: transparent; border: none;
    color: var(--text-muted);
    font-size: 0.75rem; font-weight: 600;
    cursor: pointer;
    transition: color 0.15s;
  }
  .multi-back-btn svg { width: 12px; height: 12px; }
  .multi-back-btn:hover { color: var(--primary); }

  .multi-add-form {
    display: grid;
    grid-template-columns: 1fr 1fr auto auto;
    gap: 0.4rem;
    align-items: stretch;
  }
  .multi-forma, .multi-valor, .multi-restante, .multi-add-btn, .multi-fiado-select {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    color: var(--text-main);
    font-size: 0.85rem;
    padding: 0.5rem 0.65rem;
    min-width: 0;
  }
  .multi-forma { font-weight: 600; }
  .multi-valor { font-variant-numeric: tabular-nums; font-weight: 700; }
  .multi-valor:focus, .multi-forma:focus, .multi-fiado-select:focus {
    outline: none; border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--accent-light);
  }
  .multi-restante {
    background: transparent;
    color: var(--text-label);
    cursor: pointer;
    font-size: 0.72rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.05em;
    padding: 0 0.6rem;
    transition: color 0.15s, border-color 0.15s;
  }
  .multi-restante:hover { color: var(--primary); border-color: var(--primary); }
  .multi-add-btn {
    display: inline-flex; align-items: center; gap: 0.25rem;
    background: var(--primary);
    color: var(--primary-text);
    border-color: var(--primary);
    cursor: pointer;
    font-weight: 700;
    transition: background 0.15s;
  }
  .multi-add-btn:hover { background: var(--primary-hover); }
  .multi-add-btn svg { width: 14px; height: 14px; }

  .multi-fiado-select { width: 100%; }

  .multi-error {
    color: var(--status-error-text);
    font-size: 0.78rem;
    margin: 0;
    padding: 0.4rem 0.65rem;
    background: var(--status-error-bg);
    border: 1px solid var(--status-error-border);
    border-radius: 8px;
  }

  .multi-list {
    list-style: none; padding: 0; margin: 0;
    display: flex; flex-direction: column; gap: 0.3rem;
  }
  .multi-item {
    display: flex; align-items: center; gap: 0.5rem;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 0.45rem 0.6rem;
  }
  .multi-item-info {
    display: flex; flex-direction: column; gap: 0.1rem;
    min-width: 0; flex: 1;
  }
  .multi-item-forma {
    font-size: 0.85rem; font-weight: 700; color: var(--text-main);
  }
  .multi-item-pessoa {
    font-size: 0.72rem; color: var(--text-muted);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .multi-item-valor {
    font-size: 0.9rem; font-weight: 700; color: var(--text-main);
    font-variant-numeric: tabular-nums;
  }
  .multi-item-remove {
    display: inline-flex; align-items: center; justify-content: center;
    width: 24px; height: 24px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--text-muted);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .multi-item-remove svg { width: 12px; height: 12px; }
  .multi-item-remove:hover {
    background: var(--status-error-bg);
    color: var(--status-error-text);
  }

  .multi-totals {
    display: flex; flex-direction: column; gap: 0.25rem;
    padding-top: 0.5rem;
    border-top: 1px dashed var(--border-subtle);
  }
  .multi-total-row {
    display: flex; justify-content: space-between;
    font-size: 0.85rem; color: var(--text-label);
  }
  .multi-total-row.has-restante { color: var(--status-warning-text); font-weight: 700; }
  .multi-total-row.has-troco { color: var(--status-success-text); font-weight: 700; }
  .multi-total-value { font-variant-numeric: tabular-nums; font-weight: 600; }

  @media (max-width: 480px) {
    .multi-add-form {
      grid-template-columns: 1fr 1fr;
    }
    .multi-restante, .multi-add-btn {
      grid-column: span 1;
    }
  }

  /* === Modal Transferência === */
  .modal-transfer { max-width: 520px; }
  .transfer-header { display: flex; flex-direction: column; gap: 0.25rem; }
  .center-text { text-align: center; padding: 1rem 0; margin: 0; }

  .transfer-empty {
    display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
    padding: 1.5rem 1rem;
    text-align: center;
  }
  .transfer-empty-icon { color: var(--text-muted); }
  .transfer-empty-icon svg { width: 48px; height: 48px; }
  .transfer-empty-title { font-size: 1rem; font-weight: 700; color: var(--text-main); margin: 0.5rem 0 0; }
  .transfer-empty-desc { font-size: 0.85rem; color: var(--text-label); margin: 0; max-width: 320px; line-height: 1.4; }

  .transfer-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(85px, 1fr));
    gap: 0.55rem;
    max-height: 50vh;
    overflow-y: auto;
    padding: 0.25rem;
  }
  .transfer-tile {
    position: relative;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 0.25rem;
    padding: 0.85rem 0.5rem;
    min-height: 80px;
    background: var(--bg-input);
    border: 2px solid var(--border-subtle);
    border-radius: 12px;
    color: var(--text-main);
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s, transform 0.1s;
  }
  .transfer-tile:hover {
    border-color: var(--border-strong);
    background: var(--bg-panel);
  }
  .transfer-tile.selected {
    border-color: var(--primary);
    background: var(--accent-light);
    transform: scale(1.02);
  }
  .transfer-tile-num {
    font-size: 1.25rem; font-weight: 800;
    color: var(--text-main);
    letter-spacing: -0.02em;
  }
  .transfer-tile.selected .transfer-tile-num { color: var(--primary); }
  .transfer-tile-cap {
    display: inline-flex; align-items: center; gap: 0.25rem;
    font-size: 0.7rem;
    color: var(--text-muted);
  }
  .transfer-tile-cap svg { width: 12px; height: 12px; }

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
    .recibo-stamp { display: none !important; }
  }
</style>

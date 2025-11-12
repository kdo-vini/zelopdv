<!-- 
  Arquivo: src/routes/app/+page.svelte
  Stack: SvelteKit + Tailwind CSS + Supabase
  Descrição: Frente de Caixa (PDV) movida para /app para que a landing fique em /
-->

<script>
  // A S V E L T E K I T
  // Ajuste: Removido o ".js" da importação para deixar o bundler resolver.
  import { supabase } from '$lib/supabaseClient';
  import { onMount, onDestroy } from 'svelte';
  import { waitAuthReady } from '$lib/authStore';
  import { buildReceiptHTML } from '$lib/receipt';
  import { ensureActiveSubscription } from '$lib/guards';

  // --- 1. ESTADO DO PDV ---
  let produtos = [];
  let categorias = [];
  let categoriaAtiva = null; // ID da categoria selecionada
  let subcategorias = [];
  let subcategoriaAtiva = null; // ID da subcategoria selecionada (ou null para todas)
  let busca = '';
  let loading = true;
  let errorMessage = '';
  let gridEl;
  let buscaInputEl;

  // Atalho: '/' foca a busca quando o modal de pagamento não está aberto e o usuário não está digitando em um campo
  function onKeyGlobal(e) {
    try {
      const tag = (e.target?.tagName || '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
      if (!modalPagamentoAberto && !isTyping && e.key === '/') {
        e.preventDefault();
        if (buscaInputEl && typeof buscaInputEl.focus === 'function') buscaInputEl.focus();
      }
    } catch {}
  }

  // O "Carrinho de Compras"
  // Cada item terá: { id, nome, preco, quantidade }
  let comanda = [];

  // --- 2. ESTADO DOS MODAIS (Fluxos Especiais) ---
  
  // Fluxo de quantidade por modal (para itens marcados como "Por unidade")
  let modalQuantidadeAberto = false;
  let produtoQuantidadeSelecionado = null; // produto atual para inserir quantidade
  let quantidadeInput = 1;

  // Módulo 1.3 - Fluxo B (Item Avulso/Valor Personalizado)
  let modalValorAberto = false;
  let valorInput = 0.00;
  let nomeInput = 'Item Avulso';

  // Módulo 1.4 - Pagamento (Ainda não implementado, só a chamada)
  let modalPagamentoAberto = false;
  let formaPagamento = null; // 'dinheiro' | 'cartao_debito' | 'cartao_credito' | 'pix' | 'fiado'
  let valorRecebido = 0;
  let salvandoVenda = false;
  let erroPagamento = '';
  // Opção: imprimir recibo ao confirmar
  let imprimirRecibo = false;
  // Múltiplos pagamentos (split)
  let multiPag = false;
  let pagamentos = []; // { forma: 'dinheiro'|'pix'|'cartao_debito'|'cartao_credito'|'fiado'|'outro', valor: number, pessoaId?: string }
  let novoPagForma = 'dinheiro';
  let novoPagValor = 0;
  let novoPagPessoaId = '';
  // Fiado
  let pessoasFiado = [];
  let pessoaFiadoId = '';
  async function carregarPessoasFiado(){
    if (pessoasFiado.length) return;
    try {
      const { data, error } = await supabase.from('pessoas').select('id, nome').order('nome');
      if (!error) pessoasFiado = data || [];
    } catch {}
  }

  // Módulo 1.5 - Movimentação de Caixa (Entrada/Saída)
  let modalMovCaixaAberto = false;
  let tipoMovCaixa = 'saida'; // 'entrada' | 'saida'  (saida = sangria, entrada = suprimento)
  let valorMovCaixa = 0.00;
  let motivoMovCaixa = '';
  let imprimirReciboMovFlag = true; // default imprime
  let salvandoMovCaixa = false;
  let erroMovCaixa = '';

  // Módulo 1.1 - Controle de Caixa (Simplificado por enquanto)
  let caixaAberto = true; // será verificado no banco
  let modalAbrirCaixaAberto = false;
  let trocoInicialInput = 0.00;
  let idCaixaAberto = null;
  let saldoCaixa = 0; // saldo atual em dinheiro no caixa
  let carregandoSaldo = false;

  // Derivados e helpers de múltiplos pagamentos
  $: somaPagamentos = pagamentos.reduce((acc, p) => acc + Number(p?.valor || 0), 0);
  $: restantePagamento = Math.max(0, Number(totalComanda) - Number(somaPagamentos || 0));
  $: trocoPrevMulti = (() => {
    if (!multiPag) return 0;
    const somaOutros = pagamentos.filter(p => p.forma !== 'dinheiro').reduce((a, b) => a + Number(b.valor || 0), 0);
    const cashRec = Number((pagamentos.find(p => p.forma === 'dinheiro')?.valor) || 0);
    const requeridoDin = Math.max(0, Number(totalComanda) - somaOutros);
    return Math.max(0, cashRec - requeridoDin);
  })();

  function addPagamento() {
    const forma = novoPagForma;
    const valor = Number(novoPagValor || 0);
    if (!forma || valor <= 0) return;
    const total = Number(totalComanda);
    const somaNaoDinheiroAtual = pagamentos.filter(p => p.forma !== 'dinheiro').reduce((a,b)=>a+Number(b.valor||0),0);
    if (forma !== 'dinheiro') {
      const novoSomaNC = somaNaoDinheiroAtual + valor;
      if (novoSomaNC > total) {
        erroPagamento = 'Pagamentos não-dinheiro não podem exceder o total da comanda.';
        return;
      }
    }
    if (forma === 'fiado') {
      // permite apenas 1 linha de fiado
      if (pagamentos.some(p => p.forma === 'fiado')) {
        erroPagamento = 'Use apenas uma linha de Fiado.';
        return;
      }
      if (!novoPagPessoaId) {
        erroPagamento = 'Selecione a pessoa para o Fiado.';
        return;
      }
      pagamentos = [...pagamentos, { forma, valor, pessoaId: novoPagPessoaId }];
      novoPagPessoaId = '';
    } else {
      pagamentos = [...pagamentos, { forma, valor }];
    }
    // Sugere próximo valor = restante
    novoPagValor = Math.max(0, total - pagamentos.reduce((a,b)=>a+Number(b.valor||0),0));
    erroPagamento = '';
  }

  function removerPagamento(idx) {
    pagamentos = pagamentos.filter((_, i) => i !== idx);
    // Ajusta sugestão do próximo valor
    novoPagValor = Math.max(0, Number(totalComanda) - pagamentos.reduce((a,b)=>a+Number(b.valor||0),0));
  }

  // --- 3. CARREGAMENTO DE DADOS ---

  // Efeito: quando o app monta, verifica sessão, caixa e carrega dados do PDV
  onMount(async () => {
    window.addEventListener('keydown', onKeyGlobal);
    await waitAuthReady();
    // Bloqueio: exige assinatura ativa antes de carregar o PDV
    const ok = await ensureActiveSubscription({ requireProfile: true });
    if (!ok) return;
    // Verifica login e carrega dados do PDV
    if (!supabase) {
      errorMessage = 'Configuração do Supabase ausente. Defina as variáveis no .env e reinicie.';
      return;
    }
    console.groupCollapsed('[AuthDebug] /app onMount');
    const getSessionWithTimeout = (ms = 4000) =>
      Promise.race([
        supabase.auth.getSession(),
        new Promise((resolve) => setTimeout(() => resolve({ data: { session: null }, error: null }), ms))
      ]);
    console.time('[AuthDebug] getSession (/app)');
    const { data } = await getSessionWithTimeout(4000);
    console.timeEnd('[AuthDebug] getSession (/app)');
    console.log('[AuthDebug] /app getSession result', { hasSession: Boolean(data?.session), userId: data?.session?.user?.id || null });
    if (data?.session?.user) {
      await verificarCaixaAberto(data.session.user.id);
  await carregarCategorias();
  await carregarProdutos();
  await carregarSubcategorias();
      await atualizarSaldoCaixa();
      loading = false;
    } else {
      console.log('[AuthDebug] /app: no session -> redirect /login');
      window.location.href = '/login';
      return;
    }

    // Mantém sincronizado, caso login/logout aconteça com a página aberta
    supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('[AuthDebug] /app onAuthStateChange', { hasSession: Boolean(session), userId: session?.user?.id || null });
      if (session?.user) {
        await verificarCaixaAberto(session.user.id);
  await carregarCategorias();
  await carregarProdutos();
  await carregarSubcategorias();
        await atualizarSaldoCaixa();
        loading = false;
      } else {
        console.log('[AuthDebug] /app: logout detected -> redirect /login');
        window.location.href = '/login';
      }
    });
    console.groupEnd();
  });

  onDestroy(() => {
    window.removeEventListener('keydown', onKeyGlobal);
  });

  /**
   * Verifica no banco se há um caixa aberto (sem data_fechamento) para o usuário.
   * Seta flags locais para permitir/impedir finalizar vendas.
   */
  async function verificarCaixaAberto(userId) {
    // Verifica no Supabase se o usuário tem um caixa aberto (sem data_fechamento)
    const { data, error } = await supabase
      .from('caixas')
      .select('id, data_abertura, data_fechamento')
      .eq('id_usuario', userId)
      .is('data_fechamento', null)
      .order('data_abertura', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Erro ao verificar caixa:', error.message);
      caixaAberto = false;
      modalAbrirCaixaAberto = true;
      idCaixaAberto = null;
      return;
    }

    if (data && data.length > 0) {
      caixaAberto = true;
      modalAbrirCaixaAberto = false;
      idCaixaAberto = data[0].id;
    } else {
      caixaAberto = false;
      modalAbrirCaixaAberto = true;
      idCaixaAberto = null;
    }
  }

  /** Atualiza o saldo de caixa (dinheiro) do caixa aberto. */
  async function atualizarSaldoCaixa() {
    try {
      if (!caixaAberto || !idCaixaAberto) { saldoCaixa = 0; return; }
      carregandoSaldo = true;
      const pCaixa = supabase.from('caixas').select('valor_inicial').eq('id', idCaixaAberto).single();
      const pVendasDoCaixa = supabase
        .from('vendas')
        .select('id, forma_pagamento, valor_total, valor_troco')
        .eq('id_caixa', idCaixaAberto);
      const pMovs = supabase
        .from('caixa_movimentacoes')
        .select('valor, tipo')
        .eq('id_caixa', idCaixaAberto);

      const [{ data: cx, error: e1 }, { data: vendasAll, error: e2 }, { data: movs, error: e3 }] = await Promise.all([pCaixa, pVendasDoCaixa, pMovs]);
      if (e1) throw e1; if (e2) throw e2; if (e3) throw e3;

      const valorInicial = Number(cx?.valor_inicial || 0);
      const dinheiroLegacy = Array.isArray(vendasAll)
        ? vendasAll.filter(v => v?.forma_pagamento === 'dinheiro').reduce((acc, v) => acc + (Number(v?.valor_total || 0) - Number(v?.valor_troco || 0)), 0)
        : 0;
      let dinheiroMultiplo = 0;
      const ids = Array.isArray(vendasAll) ? vendasAll.map(v => v.id) : [];
      if (ids.length) {
        const { data: pags, error: e4 } = await supabase
          .from('vendas_pagamentos')
          .select('id_venda, forma_pagamento, valor')
          .in('id_venda', ids);
        if (!e4 && Array.isArray(pags)) {
          dinheiroMultiplo = pags.filter(p => p?.forma_pagamento === 'dinheiro').reduce((acc, p) => acc + Number(p?.valor || 0), 0);
        }
      }

      let totalSangria = 0, totalSuprimento = 0;
      if (Array.isArray(movs)) {
        for (const m of movs) {
          const val = Number(m?.valor || 0);
          if (m?.tipo === 'sangria') totalSangria += val;
          else if (m?.tipo === 'suprimento') totalSuprimento += val;
        }
      }
      saldoCaixa = valorInicial + dinheiroLegacy + dinheiroMultiplo - totalSangria + totalSuprimento;
    } catch (err) {
      console.warn('Falha ao atualizar saldo do caixa:', err?.message || err);
    } finally {
      carregandoSaldo = false;
    }
  }

  /** Carrega categorias ordenadas e define a primeira como ativa. */
  async function carregarCategorias() {
    const { data, error } = await supabase
      .from('categorias')
      .select('*')
      .order('ordem', { ascending: true });
    if (error) errorMessage = error.message;
    else {
      categorias = data;
      // Seleciona a primeira categoria automaticamente
      if (data.length > 0) {
        categoriaAtiva = data[0].id;
      }
    }
  }

  /** Carrega subcategorias ordenadas. */
  async function carregarSubcategorias() {
    const { data, error } = await supabase
      .from('subcategorias')
      .select('*')
      .order('ordem', { ascending: true });
    if (error) console.warn('Erro ao carregar subcategorias:', error.message);
    else subcategorias = data || [];
  }

  /** Carrega produtos visíveis no PDV, ordenados por nome. */
  async function carregarProdutos() {
    const { data, error } = await supabase
      .from('produtos')
      .select('*')
      // Não queremos itens como "Mini Salgado Base" aparecendo aqui
      .eq('ocultar_no_pdv', false) 
      .order('nome', { ascending: true });
      
    if (error) errorMessage = error.message;
    else produtos = data;
  }
  
  // --- 4. LÓGICA DA COMANDA (Módulo 1.2) ---

  // Reset de subcategoria ao trocar de categoria
  $: if (categoriaAtiva != null) { subcategoriaAtiva = subcategoriaAtiva && subcategorias.some(s => s.id === subcategoriaAtiva && s.id_categoria === categoriaAtiva) ? subcategoriaAtiva : null; }

  // Filtros
  $: buscaLower = (busca || '').trim().toLowerCase();
  $: subcatsDaCat = subcategorias.filter((s) => s.id_categoria === categoriaAtiva);

  // Filtra os produtos por categoria, subcategoria (opcional) e busca por nome
  $: produtosFiltrados = produtos.filter((p) => {
    if (p.id_categoria !== categoriaAtiva) return false;
    if (subcategoriaAtiva && p.id_subcategoria !== subcategoriaAtiva) return false;
    if (buscaLower && !String(p.nome || '').toLowerCase().includes(buscaLower)) return false;
    return true;
  });

  // Navegação por teclado no grid de produtos
  function gridMoveFocus(delta, byRow = false) {
    if (!gridEl) return;
    const btns = Array.from(gridEl.querySelectorAll('button[data-prod]'));
    if (!btns.length) return;
    const active = document.activeElement;
    let idx = btns.findIndex(b => b === active);
    if (idx < 0) idx = 0;
    let step = delta;
    if (byRow) {
      try {
        const cs = getComputedStyle(gridEl);
        const cols = (cs.gridTemplateColumns || '').split(' ').filter(Boolean).length || 1;
        step = cols * (delta > 0 ? 1 : -1);
      } catch { step = delta; }
    }
    let next = idx + step;
    if (next < 0) next = 0;
    if (next >= btns.length) next = btns.length - 1;
    btns[next].focus();
  }

  // Calcula o total da comanda
  $: totalComanda = comanda.reduce(
    (acc, item) => acc + item.preco * item.quantidade,
    0
  );

  /**
   * Adiciona um produto na comanda.
   * Esta função decide qual fluxo seguir (Normal, Quantidade ou Valor).
   */
  /** Decide qual fluxo usar ao clicar num produto (quantidade para por-unidade, valor avulso, ou normal). */
  function adicionarProduto(produto) {
    if (!caixaAberto) {
      modalAbrirCaixaAberto = true;
      return;
    }

    // Se é marcado como "Por unidade", abre modal para informar a quantidade
    if (produto?.eh_item_por_unidade) {
      produtoQuantidadeSelecionado = produto;
      quantidadeInput = 1;
      modalQuantidadeAberto = true;
      return;
    }

    // Caso padrão: adiciona 1 unidade diretamente (com checagem de estoque)
    if (produto?.id && produto?.controlar_estoque) {
      const existente = comanda.find((i) => i.id_produto === produto.id);
      const qtdAtual = existente?.quantidade || 0;
      const disponivel = Number(produto.estoque_atual || 0);
      if (qtdAtual + 1 > disponivel) {
        alert(`Estoque insuficiente para "${produto.nome}". Restam ${disponivel} unidade(s).`);
        return;
      }
    }
    adicionarItemNaComanda(produto, 1, produto.preco);
  }

  /**
   * Ação final dos modais ou do clique normal.
   * Adiciona ou incrementa o item na comanda.
   */
  /**
   * Adiciona (ou incrementa) um item na comanda.
   * Aceita itens de banco (com id) ou avulsos (sem id).
   */
  function adicionarItemNaComanda(item, qtd, preco) {
    // 'item' pode ser um produto do DB ou um item avulso
    
    // Se o item NÃO TEM ID (é avulso), damos um ID temporário (timestamp)
    const idUnico = item.id ?? Date.now();

    const itemExistente = comanda.find((i) => i.id === idUnico);

    if (itemExistente) {
      // Se existe, incrementa a quantidade
      itemExistente.quantidade += qtd;
      // Atualiza o array para forçar reatividade do Svelte
      comanda = [...comanda]; 
    } else {
      // Se é novo, adiciona nova linha
      comanda = [
        ...comanda,
        {
          id: idUnico,
          id_produto: item.id || null, // ID real do produto no DB
          nome: item.nome,
          preco: preco,
          quantidade: qtd,
        },
      ];
    }
    
    // Fecha modais de adição (se algum estiver aberto)
    modalValorAberto = false;
  }

  // Funções dos botões + e - da comanda
  /** Incrementa a quantidade de um item da comanda. */
  function incrementarItem(id) {
    const item = comanda.find((i) => i.id === id);
    if (item) {
      // Regra de estoque no + da comanda
      if (item.id_produto) {
        const prod = produtos.find((p) => p.id === item.id_produto);
        if (prod?.controlar_estoque) {
          const disponivel = Number(prod.estoque_atual || 0);
          if ((item.quantidade + 1) > disponivel) {
            alert(`Estoque insuficiente para "${item.nome}". Restam ${disponivel} unidade(s).`);
            return;
          }
        }
      }
      item.quantidade++;
      comanda = [...comanda];
    }
  }

  /** Decrementa a quantidade; remove o item se chegar a zero. */
  function decrementarItem(id) {
    const item = comanda.find((i) => i.id === id);
    if (item) {
      item.quantidade--;
      if (item.quantidade <= 0) {
        // Remove se chegar a zero
        comanda = comanda.filter((i) => i.id !== id);
      } else {
        comanda = [...comanda];
      }
    }
  }
  
  /** Limpa toda a comanda mediante confirmação. */
  function limparComanda() {
    if (confirm('Limpar toda a comanda?')) {
      comanda = [];
    }
  }

  // --- Movimentação de Caixa (Entrada/Saída) ---
  function abrirModalMovCaixa() {
    if (!caixaAberto) {
      modalAbrirCaixaAberto = true;
      return;
    }
    tipoMovCaixa = 'saida';
    valorMovCaixa = 0.00;
    motivoMovCaixa = '';
    erroMovCaixa = '';
    salvandoMovCaixa = false;
    modalMovCaixaAberto = true;
  }

  async function confirmarMovCaixa() {
    try {
      erroMovCaixa = '';
      if (!caixaAberto || !idCaixaAberto) {
        erroMovCaixa = 'É necessário um caixa aberto.';
        return;
      }
      const v = Number(valorMovCaixa);
      if (!Number.isFinite(v) || v <= 0) {
        erroMovCaixa = 'Informe um valor válido (maior que 0).';
        return;
      }
      // Atualiza o saldo e impede SAÍDA maior que o disponível
      await atualizarSaldoCaixa();
      if (tipoMovCaixa === 'saida' && v > Number(saldoCaixa || 0)) {
        erroMovCaixa = `Valor maior que o saldo em caixa (R$ ${Number(saldoCaixa).toFixed(2)}).`;
        return;
      }
      salvandoMovCaixa = true;
      const { data: userData } = await supabase.auth.getUser();
      const id_usuario = userData?.user?.id ?? null;
      if (!id_usuario) {
        throw new Error('Sessão inválida. Faça login novamente.');
      }
      // Persiste a movimentação de caixa
      const { data, error } = await supabase
        .from('caixa_movimentacoes')
        .insert({
          id_caixa: idCaixaAberto,
          id_usuario,
          tipo: tipoMovCaixa === 'saida' ? 'sangria' : 'suprimento',
          valor: v,
          motivo: motivoMovCaixa || null
        })
        .select('id, created_at')
        .single();
      if (error) throw new Error(error.message);

      // Sucesso: recibo opcional
      const movInfo = {
        idMov: data?.id,
        idCaixa: idCaixaAberto,
        tipo: tipoMovCaixa, // 'entrada' | 'saida'
        valor: v,
        motivo: motivoMovCaixa || null,
        created_at: data?.created_at
      };
      modalMovCaixaAberto = false;

  if (imprimirReciboMovFlag) {
        try {
          await imprimirReciboMovCaixa(movInfo);
        } catch (e) {
          console.warn('Falha ao imprimir recibo de movimentação:', e?.message || e);
        }
      }
      alert('Movimentação registrada com sucesso.');
      await atualizarSaldoCaixa();
    } catch (e) {
      erroMovCaixa = e?.message || 'Falha ao registrar a movimentação.';
    } finally {
      salvandoMovCaixa = false;
    }
  }
  
  // --- 5. AÇÕES DOS MODAIS ---

  // Módulo 1.1 (Simplificado)
  /** Abre um caixa com o troco inicial para o usuário autenticado. */
  async function handleAbrirCaixa() {
    if (trocoInicialInput < 0) return;
    const { data: userData } = await supabase.auth.getUser();
    const id_usuario = userData?.user?.id ?? null;
    if (!id_usuario) {
      alert('Sessão inválida. Faça login novamente.');
      return;
    }
    const { data, error } = await supabase
      .from('caixas')
      .insert({
        data_abertura: new Date().toISOString(),
        valor_inicial: Number(trocoInicialInput),
        id_usuario
      })
      .select('id')
      .single();
    if (error) {
      alert('Erro ao abrir caixa: ' + error.message);
      return;
    }
    idCaixaAberto = data.id;
    caixaAberto = true;
    modalAbrirCaixaAberto = false;
    await atualizarSaldoCaixa();
  }

  // Removido: Fluxo de quantidade por modal (click adiciona diretamente)

  // Módulo 1.3 - Fluxo B (Valor Avulso)
  /** Fluxo B: adiciona item avulso com nome/valor definidos no modal. */
  function handleAdicionarPorValor() {
    if (valorInput <= 0) return;
    
    adicionarItemNaComanda(
      {
        id: null, // Sem ID de produto
        nome: nomeInput || 'Item Avulso'
      },
      1,
      valorInput
    );
    
    // Reseta o formulário do modal
    valorInput = 0;
    nomeInput = 'Item Avulso';
  }

  // Fluxo: Adicionar por quantidade (itens por unidade)
  function handleAdicionarPorQuantidade() {
    const prod = produtoQuantidadeSelecionado;
    if (!prod) return;
    const qtd = Number(quantidadeInput);
    const qtdInt = Math.floor(qtd);
    if (!Number.isFinite(qtd) || qtdInt <= 0) return;

    // Checagem de estoque levando em conta quantidade já na comanda
    if (prod.id && prod.controlar_estoque) {
      const existente = comanda.find((i) => i.id_produto === prod.id);
      const qtdAtual = existente?.quantidade || 0;
      const disponivel = Number(prod.estoque_atual || 0);
      if (qtdInt + qtdAtual > disponivel) {
        alert(`Estoque insuficiente para "${prod.nome}". Restam ${disponivel} unidade(s).`);
        return;
      }
    }

    adicionarItemNaComanda(prod, qtdInt, prod.preco);
    // Reset/fechar modal
    modalQuantidadeAberto = false;
    produtoQuantidadeSelecionado = null;
    quantidadeInput = 1;
  }
  
  // Módulo 1.4 - Início da Fase 4
  /** Abre o modal de pagamento após validar que há itens. */
  function handleFinalizarVenda() {
    if (comanda.length === 0) {
      alert('A comanda está vazia.'); // TODO: Usar um modal de aviso
      return;
    }
    
    // Abre o modal de pagamento
    // O modal de pagamento cuidará da Fase 4 e 5
    modalPagamentoAberto = true;
    formaPagamento = null;
    valorRecebido = 0;
    multiPag = false;
    pagamentos = [];
    novoPagForma = 'dinheiro';
    novoPagValor = Number(totalComanda);
    novoPagPessoaId = '';
    erroPagamento = '';
    salvandoVenda = false; // garante reset visual ao tentar novamente
  }

  // Módulos 1.4 e 1.5 - Confirmar e persistir a venda
  $: troco = formaPagamento === 'dinheiro' ? Math.max(0, Number(valorRecebido) - Number(totalComanda)) : 0;

  /**
   * Persiste a venda e itens; faz baixa de estoque simples (MVP).
   * Em produção, prefira uma RPC transacional para atomicidade.
   */
  async function confirmarVenda() {
    try {
      erroPagamento = '';
      // Validações de pagamento (single vs múltiplo)
      if (!multiPag) {
        if (!formaPagamento) {
          erroPagamento = 'Selecione a forma de pagamento.';
          return;
        }
        if (formaPagamento === 'dinheiro' && Number(valorRecebido) < Number(totalComanda)) {
          erroPagamento = 'Valor recebido insuficiente para cobrir o total.';
          return;
        }
        if (formaPagamento === 'fiado' && !pessoaFiadoId) {
          erroPagamento = 'Selecione a pessoa para lançar o fiado.';
          return;
        }
      } else {
        // múltiplos pagamentos
        const soma = pagamentos.reduce((acc, p) => acc + Number(p?.valor || 0), 0);
        const total = Number(totalComanda);
        const somaNaoDinheiro = pagamentos.filter(p => p.forma !== 'dinheiro').reduce((a,b)=>a+Number(b.valor||0),0);
        if (soma <= 0) {
          erroPagamento = 'Adicione ao menos um pagamento.';
          return;
        }
        if (soma < total) {
          erroPagamento = 'A soma dos pagamentos é insuficiente para o total.';
          return;
        }
        if (somaNaoDinheiro > total) {
          erroPagamento = 'Pagamentos não-dinheiro não podem exceder o total da comanda.';
          return;
        }
        // Regras: no máximo 1 linha de fiado, e obrigar pessoa
        const fiados = pagamentos.filter(p => p.forma === 'fiado');
        if (fiados.length > 1) {
          erroPagamento = 'Use apenas uma linha para Fiado.';
          return;
        }
        if (fiados.length === 1 && !fiados[0]?.pessoaId) {
          erroPagamento = 'Selecione a pessoa para o Fiado.';
          return;
        }
      }
      if (comanda.length === 0) {
        erroPagamento = 'A comanda está vazia.';
        return;
      }

      salvandoVenda = true;

      // Se for imprimir, abra a janela imediatamente para não ser bloqueada por popup blockers
      let printWin = null;
      if (imprimirRecibo) {
        try {
          printWin = window.open('', '_blank', 'width=320,height=600');
          if (printWin) {
            printWin.document.open();
            printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Recibo</title></head><body style="font-family:sans-serif;padding:12px;font-size:12px;">Preparando recibo...<script>
window.addEventListener('message', function(e){
  try {
    if (e && e.data && e.data.type === 'RECIBO_HTML' && typeof e.data.html === 'string') {
      document.open();
      document.write(e.data.html);
      document.close();
    }
  } catch(err){ console.warn('[ReciboPlaceholder] replace via postMessage falhou:', (err && err.message) || err); }
});
<\/script></body></html>`);
            printWin.document.close();
          }
        } catch (e) {
          console.warn('Popup de impressão bloqueado ou falhou ao abrir:', e?.message || e);
          printWin = null;
        }
      }

      // Usuário autenticado
      const { data: userData } = await supabase.auth.getUser();
      const id_usuario = userData?.user?.id ?? null;

      // Validação de estoque (refresco em tempo real antes de inserir a venda)
      try {
        const idsProdutos = [...new Set(comanda.filter(i => i.id_produto).map(i => i.id_produto))];
        if (idsProdutos.length) {
          const { data: prodsInfo, error: prodErr } = await supabase
            .from('produtos')
            .select('id, nome, controlar_estoque, estoque_atual')
            .in('id', idsProdutos);
          if (!prodErr && prodsInfo) {
            const mapInfo = new Map(prodsInfo.map(p => [p.id, p]));
            // mesma lógica de extrair quantidade efetiva (para nomes como "56x Produto")
            const extrairQuantidadeEfetiva = (item) => {
              if (item?.id_produto && typeof item?.nome === 'string') {
                const m = item.nome.match(/^(\d+)x\s/i);
                if (m) return parseInt(m[1], 10);
              }
              return item.quantidade || 1;
            };
            // Soma quantidade requerida por produto
            const requeridos = new Map();
            for (const it of comanda) {
              if (!it.id_produto) continue;
              const qtdEf = extrairQuantidadeEfetiva(it);
              requeridos.set(it.id_produto, (requeridos.get(it.id_produto) || 0) + Number(qtdEf));
            }
            // Checa insuficiências
            const insuficientes = [];
            for (const [idProd, qtdNec] of requeridos.entries()) {
              const info = mapInfo.get(idProd);
              if (info?.controlar_estoque) {
                const disp = Number(info.estoque_atual || 0);
                if (qtdNec > disp) {
                  insuficientes.push(`${info.nome} (disp: ${disp}, ped: ${qtdNec})`);
                }
              }
            }
            if (insuficientes.length) {
              erroPagamento = `Estoque insuficiente para: ${insuficientes.join(', ')}`;
              salvandoVenda = false;
              return;
            }
          }
        }
      } catch (chkErr) {
        console.warn('Falha ao validar estoque pré-venda (prossegue):', chkErr?.message || chkErr);
      }

      // Inserir a venda
      // Determina payload de pagamento para a venda (single ou múltiplo)
      let insertForma = formaPagamento;
      let insertValorRecebido = formaPagamento === 'dinheiro' ? Number(valorRecebido) : null;
      let insertValorTroco = formaPagamento === 'dinheiro' ? Math.max(0, Number(valorRecebido) - Number(totalComanda)) : 0;
      let cashRecebidoMulti = 0;
      let trocoMulti = 0;
      if (multiPag) {
        insertForma = 'multiplo';
        const somaOutros = pagamentos.filter(p => p.forma !== 'dinheiro').reduce((a, b) => a + Number(b.valor || 0), 0);
        cashRecebidoMulti = Number((pagamentos.find(p => p.forma === 'dinheiro')?.valor) || 0);
        const requeridoEmDinheiro = Math.max(0, Number(totalComanda) - somaOutros);
        trocoMulti = Math.max(0, cashRecebidoMulti - requeridoEmDinheiro);
        insertValorRecebido = cashRecebidoMulti > 0 ? cashRecebidoMulti : null;
        insertValorTroco = trocoMulti;
      }
      const { data: venda, error: vendaError } = await supabase
        .from('vendas')
        .insert({
          valor_total: Number(totalComanda),
          forma_pagamento: insertForma,
          valor_recebido: insertValorRecebido,
          valor_troco: insertValorTroco,
          id_usuario,
          id_caixa: idCaixaAberto
        })
        .select('id')
        .single();

      if (vendaError) {
        throw new Error(vendaError.message);
      }

      // Função auxiliar: extrai quantidade efetiva quando o nome vier como "56x Produto"
      const extrairQuantidadeEfetiva = (item) => {
        if (item?.id_produto && typeof item?.nome === 'string') {
          const m = item.nome.match(/^(\d+)x\s/i);
          if (m) return parseInt(m[1], 10);
        }
        return item.quantidade || 1;
      };

      // Inserir itens da venda (quantidade efetiva e preço unitário coerente)
      const itens = comanda.map((i) => {
        const qtdEfetiva = extrairQuantidadeEfetiva(i);
        // BUGFIX: i.preco já representa o preço unitário do produto no carrinho.
        // Não dividir pelo qtdEfetiva, pois isso distorce a receita (ex.: 0,80 / 40 → 0,02).
        // Para itens avulsos, tratamos o valor inserido como preço unitário também.
        const precoUnit = Number(i.preco);
        return {
          id_usuario,
          id_venda: venda.id,
          id_produto: i.id_produto ?? null,
          quantidade: qtdEfetiva,
          nome_produto_na_venda: i.nome,
          preco_unitario_na_venda: Number(precoUnit)
        };
      });

      const { error: itensError } = await supabase.from('vendas_itens').insert(itens);
      if (itensError) {
        // rollback best-effort
        await supabase.from('vendas').delete().eq('id', venda.id);
        throw new Error(itensError.message);
      }

      // Lançar débito no fiado
      if (!multiPag && formaPagamento === 'fiado' && pessoaFiadoId) {
        try {
          const { error: fiadoErr } = await supabase.rpc('fiado_lancar_debito', { p_id_pessoa: pessoaFiadoId, p_valor: Number(totalComanda) });
          if (fiadoErr) console.warn('fiado_lancar_debito erro:', fiadoErr.message);
        } catch (e) {
          console.warn('fiado_lancar_debito exceção:', e?.message || e);
        }
      } else if (multiPag) {
        const fiado = pagamentos.find(p => p.forma === 'fiado');
        if (fiado && fiado.pessoaId && Number(fiado.valor) > 0) {
          try {
            const { error: fiadoErr } = await supabase.rpc('fiado_lancar_debito', { p_id_pessoa: fiado.pessoaId, p_valor: Number(fiado.valor) });
            if (fiadoErr) console.warn('fiado_lancar_debito erro:', fiadoErr.message);
          } catch (e) {
            console.warn('fiado_lancar_debito exceção:', e?.message || e);
          }
        }
      }

      // Se múltiplos pagamentos, registrar linhas em vendas_pagamentos
      if (multiPag && pagamentos.length) {
        // Valor persistido para dinheiro deve ser o aplicado (descontando o troco)
        const linhas = pagamentos.map(p => {
          const isDin = p.forma === 'dinheiro';
          const aplicadoDin = isDin ? Math.max(0, Number(p.valor || 0) - Number(trocoMulti)) : Number(p.valor || 0);
          return {
            id_venda: venda.id,
            id_usuario,
            forma_pagamento: p.forma,
            valor: isDin ? aplicadoDin : Number(p.valor || 0)
          };
        });
        const { error: pagErr } = await supabase.from('vendas_pagamentos').insert(linhas);
        if (pagErr) console.warn('Falha ao inserir vendas_pagamentos:', pagErr.message);
      }

      // Baixa de estoque simples (MVP): decrementa estoque_atual para itens com controlar_estoque = true
      try {
        const idsProdutos = [...new Set(comanda.filter(i => i.id_produto).map(i => i.id_produto))];
        if (idsProdutos.length) {
          // Busca flags de controle e estoque atual
          const { data: prodsInfo, error: prodErr } = await supabase
            .from('produtos')
            .select('id, controlar_estoque, estoque_atual')
            .in('id', idsProdutos);
          if (!prodErr && prodsInfo) {
            const mapInfo = new Map(prodsInfo.map(p => [p.id, p]));
            // Soma quantidades efetivas vendidas por produto
            const totalPorProduto = new Map();
            for (const item of comanda) {
              if (!item.id_produto) continue;
              const qtdEf = extrairQuantidadeEfetiva(item);
              totalPorProduto.set(item.id_produto, (totalPorProduto.get(item.id_produto) || 0) + Number(qtdEf));
            }
            // Dispara atualizações em paralelo sem bloquear o fluxo de venda
            const updates = [];
            for (const [idProd, totalVendida] of totalPorProduto.entries()) {
              const info = mapInfo.get(idProd);
              if (info?.controlar_estoque) {
                const novoEstoque = Number(info.estoque_atual || 0) - Number(totalVendida || 0);
                updates.push(supabase.from('produtos').update({ estoque_atual: novoEstoque }).eq('id', idProd));
              }
            }
            // Não aguarda; registra resultado de forma assíncrona
            Promise.allSettled(updates).then((res) => {
              const fails = res.filter(r => r.status === 'rejected');
              if (fails.length) console.warn('Algumas baixas de estoque falharam.', fails.length);
            });
          }
        }
      } catch (estoqueErr) {
        console.warn('Falha ao baixar estoque (MVP continua):', estoqueErr?.message || estoqueErr);
      }

      // Captura dados do recibo antes de limpar estado, para evitar nulos na impressão
  const fp = multiPag ? 'multiplo' : formaPagamento;
    const vr = multiPag ? (cashRecebidoMulti || null) : valorRecebido;
    const trocoVal = multiPag ? Number(trocoMulti) : (fp === 'dinheiro' ? Number(troco) : 0);
      const totalVal = Number(totalComanda);
      const itensRecibo = itens;

      // Sucesso: fechar modal e limpar comanda
      modalPagamentoAberto = false;
      comanda = [];
      formaPagamento = null;
      valorRecebido = 0;
    multiPag = false;
    pagamentos = [];
  // Atualiza saldo após a venda (para refletir pagamentos em dinheiro)
  await atualizarSaldoCaixa();

      // Agenda a impressão após a UI atualizar, evitando travar o botão em "Salvando..."
      if (imprimirRecibo) {
        // Prepara detalhamento de pagamentos para recibo (com valores aplicados)
        let printPagamentos = [];
        if (multiPag && Array.isArray(pagamentos) && pagamentos.length) {
          printPagamentos = pagamentos.map((p) => {
            const isDin = p.forma === 'dinheiro';
            const aplicadoDin = isDin ? Math.max(0, Number(p.valor || 0) - Number(trocoMulti || 0)) : Number(p.valor || 0);
            const pessoaNome = p.forma === 'fiado' && p.pessoaId ? (pessoasFiado.find(x => x.id === p.pessoaId)?.nome || null) : null;
            return { forma: p.forma, valor: isDin ? aplicadoDin : Number(p.valor || 0), pessoaNome };
          });
        }
        const payloadRecibo = {
          idVenda: venda.id,
          formaPagamento: fp,
          total: totalVal,
          valorRecebido: fp === 'dinheiro' ? Number(vr) : null,
          troco: trocoVal,
          itens: itensRecibo,
          pagamentos: printPagamentos
        };

        setTimeout(() => {
          try {
            imprimirReciboVenda(payloadRecibo, printWin);
          } catch (e) {
            console.warn('Falha ao imprimir recibo:', e?.message || e);
          }
        }, 60);
      }
    } catch (err) {
      erroPagamento = err?.message ?? 'Erro ao salvar a venda.';
    } finally {
      salvandoVenda = false;
    }
  }

  /**
   * Imprime recibo/nota estilo profissional (iFood-like)
   * Busca dados do perfil (empresa_perfil) do usuário autenticado automaticamente
   * Mostra logo, dados da empresa (somente os preenchidos), itens, totais e forma de pagamento
   */
  async function imprimirReciboVenda({ idVenda, formaPagamento, total, valorRecebido, troco, itens, pagamentos }, targetWin = null) {
  console.groupCollapsed('%c[Recibo] imprimirReciboVenda', 'color:#0a7');
    console.log('[Recibo] params:', { idVenda, formaPagamento, total, valorRecebido, troco, itensCount: itens?.length || 0, pagamentosCount: pagamentos?.length || 0 });
    let perfil = null;
    let logoUrl = null;
    let larguraBobina = '80mm';
    // Busca perfil com timeout para evitar travar o placeholder "Preparando recibo..."
    const withTimeout = (p, ms, label='op') => Promise.race([
      p,
      new Promise((resolve) => setTimeout(() => resolve({ __timeout: true, label }), ms))
    ]);
    try {
      console.time('[Recibo] getUser');
      const userRes = await withTimeout(supabase.auth.getUser(), 800, 'getUser');
      console.timeEnd('[Recibo] getUser');
      if (!userRes?.__timeout) {
        const userId = userRes?.data?.user?.id;
        console.log('[Recibo] userId:', userId);
        if (userId) {
          console.time('[Recibo] fetch perfil');
          const perfilRes = await withTimeout(
            supabase.from('empresa_perfil').select('*').eq('user_id', userId).limit(1).single(),
            800,
            'perfil'
          );
          console.timeEnd('[Recibo] fetch perfil');
          if (!perfilRes?.__timeout && !perfilRes?.error) {
            perfil = perfilRes.data;
            larguraBobina = perfil?.largura_bobina || '80mm';
            console.log('[Recibo] perfil carregado:', perfil);
            // Prefer profile's stored public URL; fallback to conventional storage path
            if (perfil.logo_url) {
              logoUrl = perfil.logo_url;
            } else {
              const pUrl = supabase.storage.from('logos').getPublicUrl(`${userId}.png`);
              logoUrl = pUrl?.data?.publicUrl || null;
            }
            console.log('[Recibo] logoUrl:', logoUrl);
          } else {
            console.warn('[Recibo] perfil não carregado (timeout/erro):', perfilRes?.error?.message || perfilRes?.label || 'timeout');
          }
        } else {
          console.warn('[Recibo] Sem userId — perfil não será carregado');
        }
      } else {
        console.warn('[Recibo] getUser timeout — seguindo com defaults');
      }
    } catch (e) {
      console.warn('[Recibo] Exceção ao montar perfil/logo:', e?.message || e);
    }

    const estabelecimento = {
      nome_exibicao: perfil?.nome_exibicao || 'Zelo PDV',
      documento: perfil?.documento || null,
      contato: perfil?.contato || null,
      endereco: perfil?.endereco || null,
      largura_bobina: larguraBobina,
      logoUrl
    };
    let venda = { idVenda, formaPagamento, total, valorRecebido, troco, itens, pagamentos };
    // Fallback: caso multiplo sem pagamentos no payload, tenta buscar do banco
    if (formaPagamento === 'multiplo' && (!Array.isArray(pagamentos) || pagamentos.length === 0) && idVenda) {
      try {
        const { data: pagsDb, error: pagsErr } = await supabase
          .from('vendas_pagamentos')
          .select('forma_pagamento, valor')
          .eq('id_venda', idVenda)
          .limit(50);
        if (!pagsErr && Array.isArray(pagsDb)) {
          venda.pagamentos = pagsDb.map(p => ({ forma: p.forma_pagamento, valor: Number(p.valor || 0) }));
        }
      } catch {}
    }
    console.log('[Recibo] normalizado:', { estabelecimento, venda });

  const html = buildReceiptHTML({ estabelecimento, venda });

    let w = targetWin;
    if (!w || w.closed) {
      w = window.open('', '_blank', `width=${larguraBobina === '58mm' ? '280' : '380'},height=700`);
    }
    if (!w) {
      console.warn('[Recibo] não foi possível abrir janela de impressão');
      console.groupEnd();
      return;
    }
    try {
      // Tenta sobrescrever conteúdo existente (ex: placeholder "Preparando recibo...")
      w.focus();
      // 1) Envia via postMessage para o placeholder realizar a troca de forma confiável
      try {
        w.postMessage({ type: 'RECIBO_HTML', html }, '*');
      } catch (pmErr) {
        console.warn('[Recibo] postMessage falhou (seguirá com write/Blob):', pmErr?.message || pmErr);
      }
      try {
        w.document.open();
        w.document.write(html);
        w.document.close();
      } catch (writeErr) {
        console.warn('[Recibo] write falhou, tentando via Blob URL:', writeErr?.message || writeErr);
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        w.location.replace(url);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      // 2) Verificação tardia: se ainda estiver com placeholder, força troca via Blob URL
      setTimeout(() => {
        try {
          const stillPlaceholder = !!w && !w.closed && w.document && /Preparando\s+recibo/i.test(w.document.body?.innerText || '');
          if (stillPlaceholder) {
            console.warn('[Recibo] placeholder ainda presente; aplicando fallback Blob URL');
            const blob2 = new Blob([html], { type: 'text/html' });
            const url2 = URL.createObjectURL(blob2);
            w.location.replace(url2);
            setTimeout(() => URL.revokeObjectURL(url2), 5000);
          }
        } catch (chkErr) {
          console.warn('[Recibo] verificação placeholder falhou:', chkErr?.message || chkErr);
        }
      }, 150);
    } catch (e) {
      console.warn('[Recibo] Falha ao escrever recibo na janela:', e?.message || e);
    } finally {
      console.groupEnd();
    }
  }

  /**
   * Imprime recibo simples para Sangria de Caixa
   */
  async function imprimirReciboMovCaixa({ idMov, idCaixa, tipo, valor, motivo, created_at }) {
    let perfil = null;
    let logoUrl = null;
    let larguraBobina = '80mm';
    try {
      const { data: ures } = await supabase.auth.getUser();
      const userId = ures?.user?.id || null;
      if (userId) {
        const { data: perfilRes } = await supabase
          .from('empresa_perfil')
          .select('*')
          .eq('user_id', userId)
          .limit(1)
          .single();
        perfil = perfilRes || null;
        larguraBobina = perfil?.largura_bobina || '80mm';
        if (perfil?.logo_url) {
          logoUrl = perfil.logo_url;
        } else if (userId) {
          const pUrl = supabase.storage.from('logos').getPublicUrl(`${userId}.png`);
          logoUrl = pUrl?.data?.publicUrl || null;
        }
      }
    } catch {}

    const nome = perfil?.nome_exibicao || 'Zelo PDV';
    const doc = perfil?.documento || '';
    const contato = perfil?.contato || '';
    const end = perfil?.endereco || '';
    const dt = created_at ? new Date(created_at) : new Date();
    const dtStr = dt.toLocaleString();

    const titulo = tipo === 'saida' ? 'Sangria de Caixa' : 'Suprimento de Caixa';
    const rotuloValor = tipo === 'saida' ? 'Valor retirado' : 'Valor adicionado';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>${titulo}</title>
    </head><body style="font-family:sans-serif;padding:8px;font-size:12px;width:${larguraBobina};">
      ${logoUrl ? `<img src="${logoUrl}" alt="logo" style="max-width:100%;max-height:60px;display:block;margin:0 auto 6px auto;"/>` : ''}
      <div style="text-align:center;">
        <div style="font-size:14px;font-weight:700;">${nome}</div>
        ${doc ? `<div style=\"color:#555\">${doc}</div>` : ''}
        ${contato ? `<div style=\"color:#555\">${contato}</div>` : ''}
        ${end ? `<div style=\"color:#555\">${end}</div>` : ''}
      </div>
      <div style="border-top:1px dashed #999;margin:8px 0"></div>
      <div style="text-align:center;"><strong>${titulo}</strong></div>
      <div>Movimentação: #${idMov ?? '-'} | Caixa: #${idCaixa ?? '-'}</div>
      <div>Data/Hora: ${dtStr}</div>
      ${motivo ? `<div>Motivo: ${motivo}</div>` : ''}
      <div style="border-top:1px dashed #999;margin:8px 0"></div>
      <div style="font-size:14px;font-weight:700">${rotuloValor}: R$ ${Number(valor).toFixed(2)}</div>
      <div style="border-top:1px dashed #999;margin:8px 0"></div>
      <div style="text-align:center;color:#555;">Obrigado</div>
      <script>window.onload=function(){setTimeout(()=>{try{window.print()}catch(e){}},100)}<\/script>
    </body></html>`;

    let w = window.open('', '_blank', `width=${larguraBobina === '58mm' ? '280' : '380'},height=600`);
    if (!w) return;
    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch (e) {
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      w.location.replace(url);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }

</script>

<!-- --- 6. LAYOUT (HTML com Tailwind CSS) --- -->

<!-- Barra de status do caixa (abaixo do header) -->
<div class="w-full px-4 py-2 mb-2 bg-white border-b border-gray-200 flex items-center justify-between shadow-sm">
  <div class="text-sm text-gray-700">
    <span class="font-medium">Saldo em caixa (dinheiro):</span>
    <span class="ml-1 text-green-700 font-semibold">R$ {Number(saldoCaixa).toFixed(2)}</span>
  </div>
  <div class="text-xs text-gray-500 flex items-center gap-2">
    {#if carregandoSaldo}
      <span>Atualizando…</span>
    {:else}
      <button class="underline hover:text-gray-700" on:click={atualizarSaldoCaixa}>Atualizar</button>
    {/if}
  </div>
  
</div>

<!-- Fundo principal do PDV: ocupa a largura disponível, sem forçar barras -->
<div class="flex w-full min-h-[70vh] bg-transparent overflow-hidden">

  <!-- Coluna 1: Categorias (Fixa) -->
  <nav class="w-24 bg-gray-800 text-white flex-shrink-0 overflow-y-auto">
    <!-- Link para o Admin -->
    <a href="/admin" class="block p-4 text-center hover:bg-gray-700" title="Painel Admin">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8 mx-auto">
        <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
      </svg>
    </a>
    
    {#each categorias as cat (cat.id)}
      <button
        on:click={() => (categoriaAtiva = cat.id)}
        class="w-full h-24 p-2 flex flex-col items-center justify-center text-center text-xs font-medium border-b border-gray-700"
        class:bg-white={categoriaAtiva === cat.id}
        class:text-gray-900={categoriaAtiva === cat.id}
        class:hover:bg-gray-700={categoriaAtiva !== cat.id}
      >
        <!-- TODO: Adicionar ícones aqui -->
        <span>{cat.nome}</span>
      </button>
    {/each}
  </nav>

  <!-- Coluna 2: Produtos (Scrollável) -->
  <main class="flex-1 p-4 overflow-y-auto">
    {#if loading}
      <p>Carregando produtos...</p>
    {:else}
      <!-- Barra de busca e subcategorias -->
      <div class="flex flex-col gap-2 mb-3">
        <div>
          <label for="busca-prod" class="block text-sm font-medium text-gray-700">Buscar produto</label>
          <input id="busca-prod" type="text" class="input-form mt-1" placeholder="Digite um nome..." bind:value={busca} bind:this={buscaInputEl} />
        </div>
        {#if subcatsDaCat.length}
          <div class="flex items-center gap-2 overflow-x-auto py-1">
            <button type="button" class="px-3 py-1 rounded-full border text-sm"
              class:bg-gray-900={subcategoriaAtiva === null}
              class:text-white={subcategoriaAtiva === null}
              class:border-gray-900={subcategoriaAtiva === null}
              on:click={() => subcategoriaAtiva = null}>Todas</button>
            {#each subcatsDaCat as sc (sc.id)}
              <button type="button" class="px-3 py-1 rounded-full border text-sm"
                class:bg-gray-900={subcategoriaAtiva === sc.id}
                class:text-white={subcategoriaAtiva === sc.id}
                class:border-gray-900={subcategoriaAtiva === sc.id}
                on:click={() => subcategoriaAtiva = sc.id}>{sc.nome}</button>
            {/each}
          </div>
        {/if}
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4" bind:this={gridEl}
        role="grid" tabindex="0"
        on:keydown={(e)=>{
          if (e.key==='ArrowRight') { e.preventDefault(); gridMoveFocus(1); }
          if (e.key==='ArrowLeft') { e.preventDefault(); gridMoveFocus(-1); }
          if (e.key==='ArrowDown') { e.preventDefault(); gridMoveFocus(1, true); }
          if (e.key==='ArrowUp') { e.preventDefault(); gridMoveFocus(-1, true); }
          if (e.key==='Enter' || e.key===' ') {
            const el = document.activeElement;
            if (el && el.dataset && el.dataset.prod) { e.preventDefault(); el.click(); }
          }
        }}
      >
        {#each produtosFiltrados as produto (produto.id)}
          <button
            data-prod={produto.id}
            on:click={() => adicionarProduto(produto)}
            class="h-32 bg-white rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-shadow"
          >
            <div class="p-3 flex flex-col justify-between h-full">
              <span class="text-sm font-semibold text-gray-800 text-left leading-tight">
                {produto.nome}
              </span>
              <span class="text-lg font-bold text-blue-600 text-right">
                R$ {Number(produto.preco).toFixed(2)}
              </span>
            </div>
          </button>
        {/each}
        
        <!-- Botão Fixo: Valor Personalizado (Fluxo B) -->
         <button
            on:click={() => modalValorAberto = true}
            class="h-32 bg-yellow-100 border-2 border-dashed border-yellow-400 text-yellow-700 rounded-lg shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-all"
          >
            <div class="p-3 flex flex-col justify-center items-center h-full">
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-8 h-8 mb-1">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span class="text-sm font-semibold text-center leading-tight">
                Item Avulso
              </span>
            </div>
          </button>
      </div>
    {/if}
  </main>

  <!-- Coluna 3: Comanda (Fixa) -->
  <aside class="w-80 lg:w-96 bg-white flex-shrink-0 flex flex-col shadow-lg">
    <!-- Cabeçalho da Comanda -->
    <div class="p-4 border-b">
      <h2 class="text-xl font-bold text-gray-900">Comanda</h2>
    </div>

    <!-- Lista de Itens (Scrollável) -->
    <div class="flex-1 p-4 overflow-y-auto">
      {#if comanda.length === 0}
        <div class="flex items-center justify-center h-full text-gray-500">
          <p>Clique em um item para adicionar</p>
        </div>
      {:else}
        <ul class="space-y-3">
          {#each comanda as item (item.id)}
            <li class="flex items-center space-x-2">
              <!-- Detalhes do Item -->
              <div class="flex-1">
                <p class="text-sm font-medium text-gray-900">{item.nome}</p>
                <p class="text-sm text-gray-600">
                  R$ {Number(item.preco).toFixed(2)}
                </p>
              </div>
              
              <!-- Controles de Quantidade: sempre disponíveis -->
              <div class="flex items-center border border-gray-300 rounded-md bg-white dark:bg-slate-800">
                <button 
                  on:click={() => decrementarItem(item.id)}
                  class="w-9 h-9 text-lg font-bold text-red-600 hover:bg-red-50 dark:hover:bg-slate-700 rounded-l-md"
                >-</button>
                <span class="w-12 h-9 text-center leading-9 text-base font-semibold text-slate-900 dark:text-slate-100">
                  {item.quantidade}
                </span>
                <button 
                  on:click={() => incrementarItem(item.id)}
                  class="w-9 h-9 text-lg font-bold text-green-600 hover:bg-green-50 dark:hover:bg-slate-700 rounded-r-md"
                >+</button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Rodapé da Comanda -->
    <div class="p-4 border-t bg-gray-50 space-y-4">
      <div class="flex justify-between items-center">
        <span class="text-lg font-medium text-gray-700">Total:</span>
        <span class="text-3xl font-bold text-gray-900">
          R$ {Number(totalComanda).toFixed(2)}
        </span>
      </div>
      
      <div class="flex space-x-2">
        <button 
          on:click={abrirModalMovCaixa}
          class="w-full py-3 bg-amber-100 text-amber-800 font-medium rounded-md hover:bg-amber-200 transition-colors"
        >
          Movimentar Caixa
        </button>
        <button 
          on:click={limparComanda}
          class="w-full py-3 bg-red-100 text-red-700 font-medium rounded-md hover:bg-red-200 transition-colors"
        >
          Limpar
        </button>
        <button
          on:click={handleFinalizarVenda}
          disabled={!caixaAberto || comanda.length === 0}
          class="w-full py-3 bg-green-600 text-white font-bold rounded-md hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Finalizar Venda
        </button>
      </div>
    </div>
  </aside>

</div>

<!-- --- 7. MODAIS --- -->

<!-- Modal: Abrir Caixa (Módulo 1.1) -->
{#if modalAbrirCaixaAberto}
  <div class="modal-backdrop">
    <div class="modal-content">
      <h3 class="text-lg font-medium leading-6 text-gray-900 mb-4">Abrir Caixa</h3>
      <p class="text-sm text-gray-600 mb-4">
        Você precisa abrir o caixa antes de registrar vendas.
      </p>
      <form on:submit|preventDefault={handleAbrirCaixa}>
        <label for="troco-inicial" class="block text-sm font-medium text-gray-700">Valor do Troco Inicial (R$)</label>
        <input
          id="troco-inicial"
          type="number"
          step="0.01"
          min="0"
          bind:value={trocoInicialInput}
          class="mt-1 input-form"
          required
        />
        <div class="mt-6 flex justify-end">
          <button type="submit" class="btn-primary">Abrir Caixa</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Modal: Quantidade (somente para itens marcados como "Por unidade") -->
{#if modalQuantidadeAberto}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    aria-label="Fechar modal de quantidade"
    on:keydown={(e) => { if (e.key === 'Escape') { modalQuantidadeAberto = false; produtoQuantidadeSelecionado = null; quantidadeInput = 1; } }}
    on:click|self={() => { modalQuantidadeAberto = false; produtoQuantidadeSelecionado = null; quantidadeInput = 1; }}
  >
    <div class="modal-content text-gray-900 dark:text-gray-100" role="dialog" aria-modal="true" aria-labelledby="titulo-quantidade">
      <h3 id="titulo-quantidade" class="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100 mb-4">
        {produtoQuantidadeSelecionado ? produtoQuantidadeSelecionado.nome : 'Selecionar quantidade'}
      </h3>
      <form on:submit|preventDefault={handleAdicionarPorQuantidade} class="space-y-4">
        <div>
          <label for="qtd-input" class="block text-sm font-medium text-gray-800 dark:text-gray-200">Quantidade</label>
          <input
            id="qtd-input"
            type="number"
            min="1"
            step="1"
            bind:value={quantidadeInput}
            class="mt-1 input-form"
            required
          />
          {#if produtoQuantidadeSelecionado?.controlar_estoque}
            <p class="mt-1 text-xs text-gray-500">Disponível: {Number(produtoQuantidadeSelecionado?.estoque_atual || 0)}</p>
          {/if}
        </div>
        <div class="mt-6 flex justify-end">
          <button type="button" on:click={() => { modalQuantidadeAberto = false; produtoQuantidadeSelecionado = null; quantidadeInput = 1; }} class="btn-secondary mr-2">Cancelar</button>
          <button type="submit" class="btn-primary">Adicionar</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Modal: Valor Avulso (Módulo 1.3 - Fluxo B) -->
{#if modalValorAberto}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    aria-label="Fechar modal de valor avulso"
    on:keydown={(e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { modalValorAberto = false; } }}
    on:click|self={() => modalValorAberto = false}
  >
    <div class="modal-content text-gray-900 dark:text-gray-100" role="dialog" aria-modal="true" aria-labelledby="titulo-valor-avulso">
      <h3 id="titulo-valor-avulso" class="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100 mb-4">
        Item Avulso / Valor Personalizado
      </h3>
      <form on:submit|preventDefault={handleAdicionarPorValor} class="space-y-4">
        <div>
          <label for="nome-avulso" class="block text-sm font-medium text-gray-800 dark:text-gray-200">Nome do Item (Opcional)</label>
          <input id="nome-avulso" type="text" bind:value={nomeInput} class="mt-1 input-form" />
        </div>
        <div>
          <label for="valor-avulso" class="block text-sm font-medium text-gray-800 dark:text-gray-200">Valor Total (R$)</label>
          <input
            id="valor-avulso"
            type="number"
            step="0.01"
            min="0.01"
            bind:value={valorInput}
            class="mt-1 input-form"
            required
          />
        </div>
        <div class="mt-6 flex justify-end">
          <button type="button" on:click={() => modalValorAberto = false} class="btn-secondary mr-2">Cancelar</button>
          <button type="submit" class="btn-primary">Adicionar</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- TODO: Modal de Pagamento (Fase 4) -->
{#if modalPagamentoAberto}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    aria-label="Fechar modal de pagamento"
    on:keydown={(e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;
      if (e.key === 'Escape') { modalPagamentoAberto = false; salvandoVenda = false; erroPagamento = ''; }
      else if (!isTyping) {
        if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); confirmarVenda(); }
        if (!multiPag) {
          if (e.key.toLowerCase() === 'd') { formaPagamento = 'dinheiro'; }
          if (e.key.toLowerCase() === 'x') { formaPagamento = 'pix'; }
          if (e.key.toLowerCase() === 'b') { formaPagamento = 'cartao_debito'; }
          if (e.key.toLowerCase() === 'c') { formaPagamento = 'cartao_credito'; }
          if (e.key.toLowerCase() === 'f') { formaPagamento = 'fiado'; carregarPessoasFiado(); }
        } else {
          if (e.key.toLowerCase() === 'm') { multiPag = !multiPag; }
          if (e.key.toLowerCase() === 'a') { addPagamento(); }
        }
      }
    }}
    on:click|self={() => { modalPagamentoAberto = false; salvandoVenda = false; erroPagamento = ''; }}
  >
    <div class="modal-content text-gray-900 dark:text-gray-100" role="dialog" aria-modal="true" aria-labelledby="titulo-pagamento">
      <h3 id="titulo-pagamento" class="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100 mb-4">
        Finalizar Pagamento
      </h3>
      <div class="space-y-4">
        <div class="flex justify-between items-center">
          <span class="text-gray-600 dark:text-gray-300">Total da Comanda</span>
          <span class="text-2xl font-bold dark:text-gray-100">R$ {Number(totalComanda).toFixed(2)}</span>
        </div>

        <div class="flex items-center justify-between">
          <label class="inline-flex items-center gap-2 text-sm dark:text-gray-200">
            <input type="checkbox" bind:checked={imprimirRecibo} /> Imprimir recibo ao confirmar
          </label>
          <label class="inline-flex items-center gap-2 text-sm dark:text-gray-200">
            <input type="checkbox" bind:checked={multiPag} on:change={() => { if (multiPag && novoPagValor <= 0) { novoPagValor = Number(totalComanda) - somaPagamentos; } }} /> Múltiplos pagamentos
          </label>
        </div>

        {#if !multiPag}
          <div>
            <fieldset>
              <legend class="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Forma de Pagamento</legend>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="btn-secondary" aria-pressed={formaPagamento==='dinheiro'} on:click={() => formaPagamento='dinheiro'}>Dinheiro</button>
                <button type="button" class="btn-secondary" aria-pressed={formaPagamento==='cartao_debito'} on:click={() => formaPagamento='cartao_debito'}>Cartão (Débito)</button>
                <button type="button" class="btn-secondary" aria-pressed={formaPagamento==='cartao_credito'} on:click={() => formaPagamento='cartao_credito'}>Cartão (Crédito)</button>
                <button type="button" class="btn-secondary" aria-pressed={formaPagamento==='pix'} on:click={() => formaPagamento='pix'}>Pix</button>
                <button type="button" class="btn-secondary" aria-pressed={formaPagamento==='fiado'} on:click={async()=>{ formaPagamento='fiado'; await carregarPessoasFiado(); }}>Fiado</button>
              </div>
            </fieldset>
          </div>

          {#if formaPagamento === 'dinheiro'}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div>
                <label for="valor-recebido" class="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Valor Recebido (R$)</label>
                <input id="valor-recebido" type="number" min="0" step="0.01" bind:value={valorRecebido} class="input-form" />
              </div>
              <div>
                <div class="text-sm text-gray-600 dark:text-gray-300 mb-1">Troco</div>
                <div class="text-xl font-semibold dark:text-gray-100">R$ {Number(troco).toFixed(2)}</div>
              </div>
            </div>
          {/if}

          {#if formaPagamento === 'fiado'}
            <div class="grid grid-cols-1 gap-3">
              <div>
                <label for="select-pessoa-fiado" class="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Pessoa (Fiado)</label>
                <select id="select-pessoa-fiado" class="input-form" bind:value={pessoaFiadoId}>
                  <option value="">-- selecione --</option>
                  {#each pessoasFiado as p}
                    <option value={p.id}>{p.nome}</option>
                  {/each}
                </select>
                <p class="text-xs text-gray-500 mt-1">O valor será lançado no saldo de fiado desta pessoa.</p>
              </div>
            </div>
          {/if}
        {:else}
          <!-- UI de múltiplos pagamentos -->
          <div class="space-y-3">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <label for="mp-forma" class="block text-sm font-medium mb-1">Forma</label>
                <select id="mp-forma" class="input-form" bind:value={novoPagForma}>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="pix">Pix</option>
                  <option value="cartao_debito">Cartão (Débito)</option>
                  <option value="cartao_credito">Cartão (Crédito)</option>
                  <option value="fiado">Fiado</option>
                </select>
              </div>
              <div>
                <label for="mp-valor" class="block text-sm font-medium mb-1">{novoPagForma==='dinheiro' ? 'Valor Recebido (R$)' : 'Valor (R$)'}</label>
                <input id="mp-valor" type="number" min="0.01" step="0.01" class="input-form" bind:value={novoPagValor} />
                {#if novoPagForma === 'dinheiro'}
                  <div class="flex flex-wrap items-center gap-2 mt-2 text-sm">
                    <span class="text-gray-600">Sugestões:</span>
                    <button type="button" class="px-2 py-1 rounded border" on:click={() => novoPagValor = Math.max(0.01, Number(restantePagamento))}>Restante</button>
                    <button type="button" class="px-2 py-1 rounded border" on:click={() => novoPagValor = Number(novoPagValor || 0) + 5}>+5,00</button>
                    <button type="button" class="px-2 py-1 rounded border" on:click={() => novoPagValor = Number(novoPagValor || 0) + 10}>+10,00</button>
                  </div>
                {/if}
              </div>
              {#if novoPagForma === 'fiado'}
                <div>
                  <label for="mp-pessoa" class="block text-sm font-medium mb-1">Pessoa (Fiado)</label>
                  <select id="mp-pessoa" class="input-form" bind:value={novoPagPessoaId} on:focus={carregarPessoasFiado}>
                    <option value="">-- selecione --</option>
                    {#each pessoasFiado as p}
                      <option value={p.id}>{p.nome}</option>
                    {/each}
                  </select>
                </div>
              {/if}
            </div>
            <div class="flex justify-end">
              <button type="button" class="btn-secondary" on:click={addPagamento}>Adicionar pagamento</button>
            </div>

            {#if pagamentos.length}
              <div class="border rounded-md divide-y">
                {#each pagamentos as p, i}
                  <div class="flex items-center justify-between p-2">
                    <div class="text-sm">
                      <div class="font-medium capitalize">{p.forma.replace('_',' ')}</div>
                      <div class="text-gray-600">R$ {Number(p.valor).toFixed(2)}{p.forma==='dinheiro' && trocoPrevMulti>0 ? ` (troco prev.: R$ ${Number(trocoPrevMulti).toFixed(2)})` : ''}</div>
                      {#if p.forma==='fiado'}
                        <div class="text-xs text-gray-500">Pessoa: {p.pessoaId}</div>
                      {/if}
                    </div>
                    <button type="button" class="text-red-600 hover:underline" on:click={() => removerPagamento(i)}>remover</button>
                  </div>
                {/each}
              </div>
            {/if}

            <div class="grid grid-cols-2 gap-3">
              <div class="text-sm text-gray-700">Soma dos pagamentos</div>
              <div class="text-right font-semibold">R$ {Number(somaPagamentos).toFixed(2)}</div>
              <div class="text-sm text-gray-700">Restante</div>
              <div class="text-right font-semibold">R$ {Number(restantePagamento).toFixed(2)}</div>
              <div class="text-sm text-gray-700">Troco (previsto)</div>
              <div class="text-right font-semibold">R$ {Number(trocoPrevMulti).toFixed(2)}</div>
            </div>
          </div>
        {/if}

        {#if erroPagamento}
          <div class="text-sm text-red-600">{erroPagamento}</div>
        {/if}

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" on:click={() => { modalPagamentoAberto = false; salvandoVenda = false; erroPagamento=''; }}>Cancelar</button>
          <button type="button" class="btn-primary" disabled={salvandoVenda} on:click={confirmarVenda}>
            {salvandoVenda ? 'Salvando...' : (imprimirRecibo ? 'Confirmar e imprimir' : 'Confirmar venda')}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Modal: Movimentação de Caixa (Entrada/Saída) -->
{#if modalMovCaixaAberto}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    aria-label="Fechar modal de movimentação de caixa"
    on:keydown={(e) => { if (e.key === 'Escape') { modalMovCaixaAberto = false; salvandoMovCaixa = false; erroMovCaixa = ''; } }}
    on:click|self={() => { modalMovCaixaAberto = false; salvandoMovCaixa = false; erroMovCaixa = ''; }}
  >
    <div class="modal-content text-gray-900 dark:text-gray-100" role="dialog" aria-modal="true" aria-labelledby="titulo-movcaixa">
      <h3 id="titulo-movcaixa" class="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100 mb-4">
        Movimentar Caixa
      </h3>
      <div class="space-y-4">
        <div>
          <fieldset>
            <legend class="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Tipo de movimentação</legend>
            <div class="flex gap-2">
              <button type="button" class="btn-secondary" aria-pressed={tipoMovCaixa==='entrada'} on:click={() => tipoMovCaixa='entrada'}>Entrada</button>
              <button type="button" class="btn-secondary" aria-pressed={tipoMovCaixa==='saida'} on:click={() => tipoMovCaixa='saida'}>Saída</button>
            </div>
          </fieldset>
        </div>
        <div>
          <label for="valor-mov" class="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Valor (R$)</label>
          <input id="valor-mov" type="number" min="0.01" step="0.01" bind:value={valorMovCaixa} class="input-form" />
        </div>
        <div>
          <label for="motivo-mov" class="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Motivo/observação (opcional)</label>
          <input id="motivo-mov" type="text" maxlength="140" bind:value={motivoMovCaixa} class="input-form" placeholder="Ex.: Retirada para cofre / Troco adicional" />
        </div>
        <label class="inline-flex items-center gap-2 text-sm dark:text-gray-200">
          <input type="checkbox" bind:checked={imprimirReciboMovFlag} /> Imprimir recibo
        </label>

        {#if erroMovCaixa}
          <div class="text-sm text-red-600">{erroMovCaixa}</div>
        {/if}

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" on:click={() => { modalMovCaixaAberto = false; salvandoMovCaixa = false; erroMovCaixa = ''; }}>Cancelar</button>
          <button type="button" class="btn-primary" disabled={salvandoMovCaixa} on:click={confirmarMovCaixa}>
            {salvandoMovCaixa ? 'Registrando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}


<!-- Estilos removidos: usamos classes globais definidas em src/app.css -->

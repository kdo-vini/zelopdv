<script>
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import { supabase } from '$lib/supabaseClient';
  import { pdvCache } from '$lib/stores/pdvCache';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import { waitAuthReady } from '$lib/authStore';
  import { getAccessContext } from '$lib/accessControl';
  import { clearScreenContext, openAssistantWithContext, screenContext } from '$lib/stores/assistant';
  import * as Select from '$lib/components/ui/select/index.js';
  import ModalModificadores from '$lib/components/modals/ModalModificadores.svelte';
  import { MessageCircle, Pencil, Trash2, Plus, ChevronDown, SlidersHorizontal, ArrowUpDown, List, ExternalLink } from 'lucide-svelte';

  // ─── State: Data ─────────────────────────────────────────────────────────────
  let categorias = [];
  let subcategorias = [];
  let produtos = [];
  let ownerUserId = '';
  let modifierGroupCounts = {};

  // ─── State: Tree Panel ────────────────────────────────────────────────────────
  let expandedCats = new Set();
  let selectedCategoriaId = null;
  let selectedSubcategoriaId = null;

  // Inline editing on the tree
  let editingCatId = null;
  let editingSubId = null;
  let editCatForm = { nome: '', ordem: 0, controlar_estoque_compartilhado: false, estoque_compartilhado_atual: 0 };
  let editSubForm = { nome: '', ordem: 0, id_categoria: null };

  // ─── State: Product Table ─────────────────────────────────────────────────────
  let loading = true;
  let buscaFilter = '';
  let filterOcultosOnly = false;
  let filterEstoqueOnly = false;
  let showFilterDropdown = false;
  let showSortDropdown = false;
  let showDesktopActions = false;
  let showMobileCreateMenu = false;

  // Paginação
  let currentPage = 1;
  const ITEMS_PER_PAGE = 10;
  let sortField = 'nome';
  let sortDesc = false;

  // Seleção em massa
  let selectedItems = new Set();

  // Edição inline
  let editingProdId = null;
  let editProdForm = {};

  $: if ($screenContext?.source === 'gestao-produtos' && (
    editingProdId === null || String($screenContext.entity?.id) !== String(editingProdId)
  )) {
    clearScreenContext();
  }

  // ─── State: Modais de Criação ────────────────────────────────────────────────
  let showCatModal = false;
  let showSubModal = false;
  let showProdModal = false;
  let modifierModalOpen = false;
  let modifierProduct = null;

  let newCatForm = { nome: '', ordem: 0, controlar_estoque_compartilhado: false, estoque_compartilhado_atual: 0 };
  let newSubForm = { nome: '', ordem: 0, id_categoria: null };
  let newProdForm = {
    nome: '',
    preco: 0,
    preco_2: null,
    preco_3: null,
    id_categoria: null,
    id_subcategoria: null,
    eh_item_por_unidade: false,
    ocultar_no_pdv: false,
    controlar_estoque: false,
    estoque_atual: 0
  };

  // Tabelas de preço (Balcão / Revenda / Atacado)
  let tabelasPrecoAtivo = false;
  let nomesTabelas = ['Tabela 1', 'Tabela 2', 'Tabela 3'];

  // ─── Kit Páscoa ───────────────────────────────────────────────────────────────
  let kitPascoaInserted = false;

  $: showKitPascoa = (() => {
    const now = new Date();
    const inSeason = now >= new Date('2026-03-10') && now <= new Date('2026-04-06');
    return inSeason && !kitPascoaInserted;
  })();

  async function aplicarKitPascoa() {
    const ok = await confirmAction(
      'Kit Páscoa 2026',
      'Criar 5 categorias para a Páscoa: Ovos de Páscoa, Trufas & Bombons, Cestas, Colomba Pascal e Avulso?'
    );
    if (!ok) return;

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) { addToast('Sessão expirada.', 'error'); return; }

    const cats = [
      { nome: 'Ovos de Páscoa',   ordem: 1, id_usuario: uid },
      { nome: 'Trufas & Bombons', ordem: 2, id_usuario: uid },
      { nome: 'Cestas',           ordem: 3, id_usuario: uid },
      { nome: 'Colomba Pascal',   ordem: 4, id_usuario: uid },
      { nome: 'Avulso',           ordem: 5, id_usuario: uid },
    ];

    const { error } = await supabase.from('categorias').insert(cats);
    if (error) {
      addToast('Erro ao criar categorias.', 'error');
    } else {
      addToast('🐣 Kit Páscoa ativado! 5 categorias criadas.', 'success');
      kitPascoaInserted = true;
      localStorage.setItem('zelo_kit_pascoa_2026', 'done');
      await carregarCategorias();
    }
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────────
  onMount(async () => {
    await waitAuthReady();
    kitPascoaInserted = localStorage.getItem('zelo_kit_pascoa_2026') === 'done';
    await carregarTudo();
    try {
      // Sequencial (não Promise.all): getAccessContext() já chama getSession()
      // internamente, e rodar os dois em paralelo já foi observado deixando
      // ownerUserId vazio silenciosamente — corrida entre duas chamadas de
      // auth do supabase-js no boot da página.
      const { data: userData } = await supabase.auth.getUser();
      const ctx = await getAccessContext();
      const ownerId = ctx?.ownerUserId;
      ownerUserId = ownerId || userData?.user?.id || '';
      if (!ownerUserId) {
        console.warn('[produtos] ownerUserId vazio após setup — Complementos e opções vai falhar até isso ser corrigido.');
      }

      if (ownerId) {
        const { data: perfil } = await supabase
          .from('empresa_perfil')
          .select('tabelas_preco_ativo, tabela_preco_1_nome, tabela_preco_2_nome, tabela_preco_3_nome')
          .eq('user_id', ownerId)
          .maybeSingle();
        if (perfil) {
          tabelasPrecoAtivo = !!perfil.tabelas_preco_ativo;
          nomesTabelas = [
            perfil.tabela_preco_1_nome || 'Tabela 1',
            perfil.tabela_preco_2_nome || 'Tabela 2',
            perfil.tabela_preco_3_nome || 'Tabela 3',
          ];
        }
      }
    } catch (e) {
      console.warn('[produtos] setup load failed:', e?.message);
    }
  });

  async function carregarTudo() {
    loading = true;
    try {
      await Promise.all([carregarCategorias(), carregarSubcategorias()]);
      await carregarProdutos();
    } finally {
      loading = false;
    }
  }

  async function carregarCategorias() {
    const { data, error } = await supabase
      .from('categorias')
      .select('*')
      .order('ordem', { ascending: true });
    if (error) {
      addToast('Erro ao carregar categorias: ' + error.message, 'error');
    } else {
      categorias = data || [];
    }
  }

  async function carregarSubcategorias() {
    const { data, error } = await supabase
      .from('subcategorias')
      .select('id, id_categoria, nome, ordem')
      .order('ordem', { ascending: true });
    if (error) {
      addToast('Erro ao carregar subcategorias: ' + error.message, 'error');
    } else {
      subcategorias = data || [];
    }
  }

  async function carregarProdutos() {
    loading = true;
    try {
      let q = supabase.from('produtos').select('*, categorias(id, nome, controlar_estoque_compartilhado, estoque_compartilhado_atual)');

      if (selectedSubcategoriaId) {
        q = q.eq('id_subcategoria', selectedSubcategoriaId);
      } else if (selectedCategoriaId) {
        q = q.eq('id_categoria', selectedCategoriaId);
      }

      if (buscaFilter.trim()) {
        q = q.ilike('nome', `%${buscaFilter.trim()}%`);
      }

      const { data, error } = await q.order('nome', { ascending: true });
      if (error) {
        addToast('Erro ao carregar produtos: ' + error.message, 'error');
        produtos = [];
      } else {
        produtos = data || [];
      }

      await carregarResumoMontagens(produtos);

      currentPage = 1;
      selectedItems = new Set();
    } finally {
      loading = false;
    }
  }

  async function carregarResumoMontagens(products) {
    const ids = (products || []).map((product) => product.id).filter((id) => id != null);
    if (!ids.length) {
      modifierGroupCounts = {};
      return;
    }

    const { data, error } = await supabase
      .from('zelomenu_modifier_groups')
      .select('id_produto, ativo')
      .in('id_produto', ids);
    if (error) {
      console.warn('[produtos] resumo de montagens indisponível:', error.message);
      modifierGroupCounts = {};
      return;
    }

    modifierGroupCounts = (data || []).reduce((counts, group) => {
      if (group.ativo !== false) counts[group.id_produto] = (counts[group.id_produto] || 0) + 1;
      return counts;
    }, {});
  }

  function modifierGroupCount(prod) {
    return Number(modifierGroupCounts[prod?.id] || 0);
  }

  function abrirComplementos(prod) {
    modifierProduct = prod;
    modifierModalOpen = true;
  }

  function fecharComplementos() {
    modifierModalOpen = false;
    modifierProduct = null;
    carregarProdutos();
  }

  // ─── Computed: Tree ───────────────────────────────────────────────────────────
  function getSubcats(catId) {
    return subcategorias.filter(s => s.id_categoria === catId);
  }

  function getSubcatCount(catId) {
    return subcategorias.filter(s => s.id_categoria === catId).length;
  }

  function toggleExpand(catId) {
    if (expandedCats.has(catId)) {
      expandedCats.delete(catId);
    } else {
      expandedCats.add(catId);
    }
    expandedCats = expandedCats;
  }

  function selectCategoria(catId) {
    selectedCategoriaId = catId;
    selectedSubcategoriaId = null;
    if (!expandedCats.has(catId)) {
      expandedCats.add(catId);
      expandedCats = expandedCats;
    }
    carregarProdutos();
  }

  function selectSubcategoria(subId, catId) {
    selectedSubcategoriaId = subId;
    selectedCategoriaId = catId;
    carregarProdutos();
  }

  function limparSelecao() {
    selectedCategoriaId = null;
    selectedSubcategoriaId = null;
    carregarProdutos();
  }

  // ─── Computed: Breadcrumb ─────────────────────────────────────────────────────
  $: breadcrumbNomeCat = categorias.find(c => c.id === selectedCategoriaId)?.nome ?? null;
  $: breadcrumbNomeSub = subcategorias.find(s => s.id === selectedSubcategoriaId)?.nome ?? null;

  $: indicadorFiltro = (() => {
    if (selectedSubcategoriaId && breadcrumbNomeCat && breadcrumbNomeSub) {
      return `${breadcrumbNomeCat} → ${breadcrumbNomeSub}`;
    }
    if (selectedCategoriaId && breadcrumbNomeCat) {
      return breadcrumbNomeCat;
    }
    return 'Todos os produtos';
  })();

  // ─── Computed: Products table ─────────────────────────────────────────────────
  $: filteredProdutos = (() => {
    let list = [...produtos];
    if (filterOcultosOnly) list = list.filter(p => p.ocultar_no_pdv);
    if (filterEstoqueOnly) list = list.filter(p => p.controlar_estoque || estoqueProdutoCompartilhado(p));
    return list;
  })();

  $: sortedProdutos = [...filteredProdutos].sort((a, b) => {
    const va = sortField === 'estoque_atual' ? estoqueExibido(a) : (a[sortField] ?? '');
    const vb = sortField === 'estoque_atual' ? estoqueExibido(b) : (b[sortField] ?? '');
    if (va < vb) return sortDesc ? 1 : -1;
    if (va > vb) return sortDesc ? -1 : 1;
    return 0;
  });

  $: totalPages = Math.max(1, Math.ceil(sortedProdutos.length / ITEMS_PER_PAGE));
  $: paginatedProdutos = sortedProdutos.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  $: filteredSubcatsForProdForm = newProdForm.id_categoria
    ? subcategorias.filter(s => String(s.id_categoria) === String(newProdForm.id_categoria))
    : [];

  $: filteredSubcatsForEditForm = editProdForm.id_categoria
    ? subcategorias.filter(s => String(s.id_categoria) === String(editProdForm.id_categoria))
    : [];

  $: newProdCategoriaCompartilhada = categoriaTemEstoqueCompartilhado(newProdForm.id_categoria);
  $: editProdCategoriaCompartilhada = categoriaTemEstoqueCompartilhado(editProdForm.id_categoria);

  function toggleSort(field) {
    if (sortField === field) {
      sortDesc = !sortDesc;
    } else {
      sortField = field;
      sortDesc = false;
    }
  }

  function categoriaTemEstoqueCompartilhado(idCategoria) {
    if (!idCategoria) return false;
    return !!categorias.find((cat) => cat.id === Number(idCategoria))?.controlar_estoque_compartilhado;
  }

  function toSelectId(value) {
    return value === null || value === undefined || value === '' ? null : String(value);
  }

  function toDatabaseId(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function getCategoriaNome(idCategoria) {
    return categorias.find((categoria) => String(categoria.id) === String(idCategoria))?.nome ?? '';
  }

  function getSubcategoriaNome(idSubcategoria) {
    return subcategorias.find((subcategoria) => String(subcategoria.id) === String(idSubcategoria))?.nome ?? '';
  }

  function estoqueProdutoCompartilhado(prod) {
    return !!prod?.categorias?.controlar_estoque_compartilhado;
  }

  function estoqueExibido(prod) {
    return estoqueProdutoCompartilhado(prod)
      ? Number(prod?.categorias?.estoque_compartilhado_atual || 0)
      : Number(prod?.estoque_atual || 0);
  }

  // ─── Seleção em massa ─────────────────────────────────────────────────────────
  function toggleSelectAll(e) {
    if (e.target.checked) {
      paginatedProdutos.forEach(p => selectedItems.add(p.id));
    } else {
      paginatedProdutos.forEach(p => selectedItems.delete(p.id));
    }
    selectedItems = selectedItems;
  }

  function toggleSelect(id) {
    if (selectedItems.has(id)) selectedItems.delete(id);
    else selectedItems.add(id);
    selectedItems = selectedItems;
  }

  // ─── CRUD: Categorias ─────────────────────────────────────────────────────────
  async function criarCategoria(e) {
    e.preventDefault();
    const { data: userData } = await supabase.auth.getUser();
    const id_usuario = userData?.user?.id ?? null;

    const { error } = await supabase.from('categorias').insert({
      nome: newCatForm.nome,
      ordem: newCatForm.ordem,
      controlar_estoque_compartilhado: !!newCatForm.controlar_estoque_compartilhado,
      estoque_compartilhado_atual: newCatForm.controlar_estoque_compartilhado ? Number(newCatForm.estoque_compartilhado_atual || 0) : 0,
      id_usuario
    });

    if (error) {
      addToast('Erro ao criar categoria: ' + error.message, 'error');
      return;
    }

    addToast('Categoria criada com sucesso!', 'success');
    newCatForm = { nome: '', ordem: 0, controlar_estoque_compartilhado: false, estoque_compartilhado_atual: 0 };
    showCatModal = false;
    pdvCache.invalidateCategorias();
    await carregarCategorias();
  }

  function iniciarEdicaoCategoria(cat) {
    editingCatId = cat.id;
    editCatForm = {
      nome: cat.nome,
      ordem: cat.ordem,
      controlar_estoque_compartilhado: !!cat.controlar_estoque_compartilhado,
      estoque_compartilhado_atual: Number(cat.estoque_compartilhado_atual || 0)
    };
    editingSubId = null;
  }

  function cancelarEdicaoCategoria() {
    editingCatId = null;
    editCatForm = { nome: '', ordem: 0, controlar_estoque_compartilhado: false, estoque_compartilhado_atual: 0 };
  }

  async function salvarEdicaoCategoria(e) {
    e.preventDefault();
    const { error } = await supabase
      .from('categorias')
      .update({
        nome: editCatForm.nome,
        ordem: editCatForm.ordem,
        controlar_estoque_compartilhado: !!editCatForm.controlar_estoque_compartilhado,
        estoque_compartilhado_atual: editCatForm.controlar_estoque_compartilhado ? Number(editCatForm.estoque_compartilhado_atual || 0) : 0
      })
      .eq('id', editingCatId);

    if (error) {
      addToast('Erro ao atualizar categoria: ' + error.message, 'error');
      return;
    }

    addToast('Categoria atualizada!', 'success');
    editingCatId = null;
    pdvCache.invalidateCategorias();
    await carregarCategorias();
  }

  async function excluirCategoria(cat) {
    const { count, error: countError } = await supabase
      .from('produtos')
      .select('*', { count: 'exact', head: true })
      .eq('id_categoria', cat.id);

    if (countError) {
      addToast('Erro ao verificar produtos vinculados.', 'error');
      return;
    }

    let mensagem = `Excluir a categoria "${cat.nome}"?`;
    if (count > 0) {
      mensagem = `A categoria "${cat.nome}" possui ${count} produto(s) vinculado(s). Os produtos serão desvinculados da categoria. Confirmar exclusão?`;
    }

    const ok = await confirmAction('Excluir Categoria', mensagem);
    if (!ok) return;

    if (count > 0) {
      const { error: unlinkError } = await supabase
        .from('produtos')
        .update({ id_categoria: null, id_subcategoria: null })
        .eq('id_categoria', cat.id);
      if (unlinkError) {
        addToast('Erro ao desvincular produtos: ' + unlinkError.message, 'error');
        return;
      }
    }

    const { error } = await supabase.from('categorias').delete().eq('id', cat.id);
    if (error) {
      addToast('Erro ao excluir categoria: ' + error.message, 'error');
      return;
    }

    addToast('Categoria excluída.', 'success');
    if (selectedCategoriaId === cat.id) limparSelecao();
    pdvCache.invalidateCategorias();
    pdvCache.invalidateProdutos();
    await Promise.all([carregarCategorias(), carregarSubcategorias()]);
    await carregarProdutos();
  }

  // ─── CRUD: Subcategorias ──────────────────────────────────────────────────────
  async function criarSubcategoria(e) {
    e.preventDefault();
    const { data: userData } = await supabase.auth.getUser();
    const id_usuario = userData?.user?.id ?? null;

    const { error } = await supabase.from('subcategorias').insert({
      nome: newSubForm.nome,
      ordem: newSubForm.ordem,
      id_categoria: toDatabaseId(newSubForm.id_categoria),
      id_usuario
    });

    if (error) {
      addToast('Erro ao criar subcategoria: ' + error.message, 'error');
      return;
    }

    addToast('Subcategoria criada com sucesso!', 'success');
    newSubForm = { nome: '', ordem: 0, id_categoria: null };
    showSubModal = false;
    pdvCache.invalidateSubcategorias();
    await carregarSubcategorias();
  }

  function iniciarEdicaoSubcategoria(sub) {
    editingSubId = sub.id;
    editSubForm = { nome: sub.nome, ordem: sub.ordem, id_categoria: sub.id_categoria };
    editingCatId = null;
  }

  function cancelarEdicaoSubcategoria() {
    editingSubId = null;
    editSubForm = { nome: '', ordem: 0, id_categoria: null };
  }

  async function salvarEdicaoSubcategoria(e) {
    e.preventDefault();
    const { error } = await supabase
      .from('subcategorias')
      .update({ nome: editSubForm.nome, ordem: editSubForm.ordem, id_categoria: editSubForm.id_categoria })
      .eq('id', editingSubId);

    if (error) {
      addToast('Erro ao atualizar subcategoria: ' + error.message, 'error');
      return;
    }

    addToast('Subcategoria atualizada!', 'success');
    editingSubId = null;
    pdvCache.invalidateSubcategorias();
    await carregarSubcategorias();
  }

  async function excluirSubcategoria(sub) {
    const { count, error: countError } = await supabase
      .from('produtos')
      .select('*', { count: 'exact', head: true })
      .eq('id_subcategoria', sub.id);

    if (countError) {
      addToast('Erro ao verificar produtos vinculados.', 'error');
      return;
    }

    let mensagem = `Excluir a subcategoria "${sub.nome}"?`;
    if (count > 0) {
      mensagem = `A subcategoria "${sub.nome}" possui ${count} produto(s) vinculado(s). Os produtos serão desvinculados. Confirmar exclusão?`;
    }

    const ok = await confirmAction('Excluir Subcategoria', mensagem);
    if (!ok) return;

    if (count > 0) {
      const { error: unlinkError } = await supabase
        .from('produtos')
        .update({ id_subcategoria: null })
        .eq('id_subcategoria', sub.id);
      if (unlinkError) {
        addToast('Erro ao desvincular produtos: ' + unlinkError.message, 'error');
        return;
      }
    }

    const { error } = await supabase.from('subcategorias').delete().eq('id', sub.id);
    if (error) {
      addToast('Erro ao excluir subcategoria: ' + error.message, 'error');
      return;
    }

    addToast('Subcategoria excluída.', 'success');
    if (selectedSubcategoriaId === sub.id) {
      selectedSubcategoriaId = null;
      await carregarProdutos();
    }
    pdvCache.invalidateSubcategorias();
    await carregarSubcategorias();
  }

  // ─── CRUD: Produtos ───────────────────────────────────────────────────────────
  async function criarProduto(e) {
    e.preventDefault();
    const { data: userData } = await supabase.auth.getUser();
    const id_usuario = ownerUserId || userData?.user?.id || null;

    const payload = {
      ...newProdForm,
      id_usuario,
      id_categoria: toDatabaseId(newProdForm.id_categoria),
      id_subcategoria: toDatabaseId(newProdForm.id_subcategoria),
      controlar_estoque: newProdCategoriaCompartilhada ? false : newProdForm.controlar_estoque,
      estoque_atual: !newProdCategoriaCompartilhada && newProdForm.controlar_estoque ? newProdForm.estoque_atual : 0
    };

    const { data: createdProduct, error } = await supabase
      .from('produtos')
      .insert(payload)
      .select('id, nome, preco, id_usuario')
      .single();
    if (error) {
      addToast('Erro ao criar produto: ' + error.message, 'error');
      return;
    }

    addToast('Produto criado com sucesso!', 'success');
    newProdForm = {
      nome: '',
      preco: 0,
      preco_2: null,
      preco_3: null,
      id_categoria: null,
      id_subcategoria: null,
      eh_item_por_unidade: false,
      ocultar_no_pdv: false,
      controlar_estoque: false,
      estoque_atual: 0
    };
    showProdModal = false;
    pdvCache.invalidateProdutos();
    await carregarProdutos();
    abrirComplementos(createdProduct);
  }

  function iniciarEdicaoProduto(prod) {
    editingProdId = prod.id;
    editProdForm = {
      ...prod,
      id_categoria: toSelectId(prod.id_categoria),
      id_subcategoria: toSelectId(prod.id_subcategoria)
    };
  }

  function cancelarEdicaoProduto() {
    editingProdId = null;
    editProdForm = {};
  }

  function perguntarSobreProduto(prod) {
    const opened = openAssistantWithContext({
      source: 'gestao-produtos',
      title: `Produto: ${prod.nome}`,
      route: '/gestao/produtos',
      contextType: 'produtos',
      entity: { type: 'product', id: prod.id, name: prod.nome }
    });

    if (!opened) addToast('Não foi possível abrir o contexto deste produto.', 'error');
  }

  async function salvarEdicaoProduto(e) {
    e.preventDefault();
    const { error } = await supabase.from('produtos').update({
      nome: editProdForm.nome,
      preco: editProdForm.preco,
      preco_2: editProdForm.preco_2 ?? null,
      preco_3: editProdForm.preco_3 ?? null,
      id_categoria: toDatabaseId(editProdForm.id_categoria),
      id_subcategoria: toDatabaseId(editProdForm.id_subcategoria),
      eh_item_por_unidade: editProdForm.eh_item_por_unidade,
      ocultar_no_pdv: editProdForm.ocultar_no_pdv,
      controlar_estoque: editProdCategoriaCompartilhada ? false : editProdForm.controlar_estoque,
      estoque_atual: !editProdCategoriaCompartilhada && editProdForm.controlar_estoque ? editProdForm.estoque_atual : 0
    }).eq('id', editingProdId);

    if (error) {
      addToast('Erro ao atualizar produto: ' + error.message, 'error');
      return;
    }

    addToast('Produto atualizado!', 'success');
    editingProdId = null;
    pdvCache.invalidateProdutos();
    await carregarProdutos();
  }

  async function excluirProduto(prod) {
    const ok = await confirmAction('Excluir Produto', `Excluir "${prod.nome}"? Esta ação não pode ser desfeita.`);
    if (!ok) return;

    const { error } = await supabase.from('produtos').delete().eq('id', prod.id);
    if (error) {
      addToast('Erro ao excluir produto: ' + error.message, 'error');
      return;
    }

    addToast('Produto excluído.', 'success');
    pdvCache.invalidateProdutos();
    await carregarProdutos();
  }

  async function excluirEmMassa() {
    if (selectedItems.size === 0) return;
    const ok = await confirmAction(
      'Excluir Produtos',
      `Excluir ${selectedItems.size} produto(s) selecionado(s)? Esta ação não pode ser desfeita.`
    );
    if (!ok) return;

    const ids = Array.from(selectedItems);
    const { error } = await supabase.from('produtos').delete().in('id', ids);
    if (error) {
      addToast('Erro ao excluir produtos: ' + error.message, 'error');
      return;
    }

    addToast(`${ids.length} produto(s) excluído(s).`, 'success');
    pdvCache.invalidateProdutos();
    selectedItems = new Set();
    await carregarProdutos();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  function formatPreco(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
  }

  function getInicialColor(nome) {
    const colors = [
      'var(--primary)', 'var(--warning)', 'var(--error)', 'var(--success)',
      'var(--accent)', 'var(--link)', 'var(--link-hover)', 'var(--text-muted)'
    ];
    const idx = (nome?.charCodeAt(0) ?? 0) % colors.length;
    return colors[idx];
  }

  function abrirModalProduto() {
    // Pré-preenche categoria/subcategoria com a seleção atual
    newProdForm.id_categoria = toSelectId(selectedCategoriaId);
    newProdForm.id_subcategoria = toSelectId(selectedSubcategoriaId);
    showDesktopActions = false;
    showMobileCreateMenu = false;
    showProdModal = true;
  }

  function abrirModalSubcategoria() {
    newSubForm.id_categoria = toSelectId(selectedCategoriaId);
    showDesktopActions = false;
    showMobileCreateMenu = false;
    showSubModal = true;
  }

  function abrirModalCategoria() {
    showDesktopActions = false;
    showMobileCreateMenu = false;
    showCatModal = true;
  }

  function toggleMobileCreateMenu() {
    showMobileCreateMenu = !showMobileCreateMenu;
  }

  // Fecha dropdowns ao clicar fora
  function handleClickOutside(e) {
    if (showFilterDropdown && !e.target.closest('.filter-dropdown-wrapper')) {
      showFilterDropdown = false;
    }
    if (showSortDropdown && !e.target.closest('.sort-dropdown-wrapper')) {
      showSortDropdown = false;
    }
    if (showDesktopActions && !e.target.closest('.desktop-actions-menu')) {
      showDesktopActions = false;
    }
    if (showMobileCreateMenu && !e.target.closest('.mobile-create-menu')) {
      showMobileCreateMenu = false;
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

<!-- ─── Cabeçalho da Página ──────────────────────────────────────────────────── -->
<div class="page-header" style="border-bottom: 1px solid var(--border-subtle);">
  <div class="page-title-block">
    <p class="text-[10px] font-bold uppercase tracking-[0.2em] mb-1" style="color: var(--text-muted);">Gestão / Produtos</p>
    <h1 class="text-xl font-bold tracking-tight" style="color: var(--text-main);">Produtos</h1>
  </div>

  <!-- Botões de ação globais -->
  <div class="desktop-page-actions">
    <button class="btn-primary page-new-product" on:click={abrirModalProduto}>
      <Plus class="w-4 h-4" aria-hidden="true" />
      <span>Novo produto</span>
      <ChevronDown class="w-4 h-4" aria-hidden="true" />
    </button>

    <div class="desktop-actions-menu">
      <button
        class="btn-secondary"
        aria-expanded={showDesktopActions}
        on:click|stopPropagation={() => showDesktopActions = !showDesktopActions}
      >
        <SlidersHorizontal class="w-4 h-4" aria-hidden="true" />
        <span>Ações</span>
        <ChevronDown class="w-4 h-4" aria-hidden="true" />
      </button>
      {#if showDesktopActions}
        <div class="desktop-actions-popover">
          <button class="desktop-action-item" on:click={abrirModalCategoria}>
            <Plus class="w-4 h-4" aria-hidden="true" /> Nova categoria
          </button>
          <button class="desktop-action-item" on:click={abrirModalSubcategoria}>
            <Plus class="w-4 h-4" aria-hidden="true" /> Nova subcategoria
          </button>
          <a class="desktop-action-item" href="https://menu.zelopdv.com.br/admin" target="_blank" rel="noopener">
            <ExternalLink class="w-4 h-4" aria-hidden="true" /> Configurar cardápio
          </a>
        </div>
      {/if}
    </div>
  </div>

</div>

<!-- ─── Kit Páscoa Banner ─────────────────────────────────────────────────────── -->
{#if showKitPascoa}
  <div style="background: color-mix(in srgb, var(--accent) 10%, var(--bg-panel)); border: 1.5px solid color-mix(in srgb, var(--accent) 30%, var(--border-subtle));"
       class="rounded-xl p-4 mb-4 flex items-center justify-between gap-4">
    <div>
      <p class="text-xs font-bold uppercase tracking-wider mb-0.5" style="color: var(--accent);">Especial Páscoa 2026 🥚</p>
      <p class="font-bold text-sm" style="color: var(--text-main);">Kit de categorias pronto para usar</p>
      <p class="text-xs" style="color: var(--text-muted);">Ovos de Páscoa, Trufas, Cestas, Colomba Pascal, Avulso</p>
    </div>
    <div class="flex gap-2 shrink-0">
      <button on:click={aplicarKitPascoa}
        class="px-4 py-2 rounded-lg text-sm font-bold"
        style="background: var(--accent); color: var(--primary-text);">
        Ativar Kit
      </button>
      <button on:click={() => kitPascoaInserted = true} class="px-2 py-2 text-xs rounded-lg"
        style="color: var(--text-muted); background: color-mix(in srgb, var(--text-muted) 10%, transparent);">✕</button>
    </div>
  </div>
{/if}

<!-- ─── Layout Split View ─────────────────────────────────────────────────────── -->
<div class="split-view" style="background: var(--bg-app);">

  <!-- ══════════════════════════════════════════════════════════════════════════
       PAINEL ESQUERDO — Árvore de Categorias
       ══════════════════════════════════════════════════════════════════════ -->
  <aside class="tree-panel" style="background: var(--bg-panel); border-color: var(--border-subtle);">

    <!-- Header do painel -->
    <div class="tree-header" style="border-color: var(--border-subtle);">
      <div class="tree-heading">
        <span class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">
          Categorias
        </span>
        <span class="badge-count" style="background: var(--bg-card); color: var(--text-muted); border-color: var(--border-card);">
          {categorias.length}
        </span>
      </div>
      <button class="tree-add-btn" type="button" on:click={abrirModalCategoria} aria-label="Nova categoria" title="Nova categoria">
        <Plus class="w-4 h-4" aria-hidden="true" />
      </button>
    </div>

    <div class="mobile-category-nav" aria-label="Filtros por categoria">
      <div class="mobile-category-row">
        <button
          class="mobile-category-chip"
          class:active={selectedCategoriaId === null && selectedSubcategoriaId === null}
          on:click={limparSelecao}
        >
          Todos
        </button>
        {#each categorias as cat (cat.id)}
          <button
            class="mobile-category-chip"
            class:active={selectedCategoriaId === cat.id}
            on:click={() => selectCategoria(cat.id)}
          >
            {cat.nome}
          </button>
        {/each}
      </div>

      {#if selectedCategoriaId}
        <div class="mobile-subcategory-row">
          <button
            class="mobile-subcategory-chip"
            class:active={selectedSubcategoriaId === null}
            on:click={() => selectCategoria(selectedCategoriaId)}
          >
            Todas
          </button>
          {#each getSubcats(selectedCategoriaId) as sub (sub.id)}
            <button
              class="mobile-subcategory-chip"
              class:active={selectedSubcategoriaId === sub.id}
              on:click={() => selectSubcategoria(sub.id, selectedCategoriaId)}
            >
              {sub.nome}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Lista -->
    <div class="tree-list">

      <!-- Item: Todos os produtos -->
      <button
        class="tree-item tree-item-root"
        class:tree-item-active={selectedCategoriaId === null && selectedSubcategoriaId === null}
        on:click={limparSelecao}
        style={selectedCategoriaId === null && selectedSubcategoriaId === null
          ? 'background: var(--sidebar-item-active-bg); color: var(--sidebar-item-active-text);'
          : ''}
      >
        <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
        <span class="text-sm font-medium">Todos os produtos</span>
        <span class="ml-auto text-xs" style="color: {selectedCategoriaId === null ? 'inherit' : 'var(--text-muted)'};">
          {produtos.length + filteredProdutos.length > 0 ? '' : ''}
        </span>
      </button>

      <!-- Categorias -->
      {#each categorias as cat (cat.id)}
        <div class="tree-cat-group">

          {#if editingCatId === cat.id}
            <!-- Formulário de edição inline da categoria -->
            <div class="tree-edit-form" style="background: var(--bg-card); border-color: var(--border-subtle);" transition:slide|local={{ duration: 150 }}>
              <form on:submit={salvarEdicaoCategoria} class="flex flex-col gap-2">
                <input
                  class="tree-input"
                  bind:value={editCatForm.nome}
                  placeholder="Nome da categoria"
                  required
                  autofocus
                  style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                />
                <input
                  class="tree-input"
                  type="number"
                  bind:value={editCatForm.ordem}
                  placeholder="Ordem"
                  required
                  style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                />
                <label class="flex items-center gap-2 text-xs" style="color: var(--text-label);">
                  <input class="themed-checkbox compact" type="checkbox" bind:checked={editCatForm.controlar_estoque_compartilhado} />
                  Estoque compartilhado
                </label>
                {#if editCatForm.controlar_estoque_compartilhado}
                  <input
                    class="tree-input"
                    type="number"
                    min="0"
                    step="1"
                    bind:value={editCatForm.estoque_compartilhado_atual}
                    placeholder="Qtd. compartilhada"
                    style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                  />
                {/if}
                <div class="flex gap-2">
                  <button type="submit" class="btn-xs-primary" style="background: var(--primary); color: var(--primary-text);">Salvar</button>
                  <button type="button" class="btn-xs-ghost" on:click={cancelarEdicaoCategoria} style="color: var(--text-muted); border-color: var(--border-subtle);">Cancelar</button>
                </div>
              </form>
            </div>
          {:else}
            <!-- Item da categoria -->
            <div class="tree-item tree-item-cat group"
              class:tree-item-active={selectedCategoriaId === cat.id && selectedSubcategoriaId === null}
              style={selectedCategoriaId === cat.id && selectedSubcategoriaId === null
                ? 'background: var(--sidebar-item-active-bg); color: var(--sidebar-item-active-text);'
                : ''}
              role="button"
              tabindex="0"
              on:click={() => selectCategoria(cat.id)}
              on:keydown={(e) => e.key === 'Enter' && selectCategoria(cat.id)}
            >
              <!-- Seta expandir/colapsar -->
              <button
                class="chevron-btn"
                on:click|stopPropagation={() => toggleExpand(cat.id)}
                aria-label={expandedCats.has(cat.id) ? 'Colapsar' : 'Expandir'}
                style="color: inherit; opacity: 0.6;"
              >
                <svg class="w-3.5 h-3.5 transition-transform duration-150"
                  class:rotate-90={expandedCats.has(cat.id)}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
                </svg>
              </button>

              <span class="flex-1 text-sm font-medium truncate">{cat.nome}</span>
              {#if cat.controlar_estoque_compartilhado}
                <span class="subcat-badge" title="Estoque compartilhado"
                  style="background: color-mix(in srgb, var(--primary) 14%, transparent); color: var(--primary);">
                  {cat.estoque_compartilhado_atual}
                </span>
              {/if}

              <!-- Badge de subcategorias -->
              {#if getSubcatCount(cat.id) > 0}
                <span class="subcat-badge"
                  style="background: var(--accent-light); color: var(--accent);
                    {selectedCategoriaId === cat.id && selectedSubcategoriaId === null ? 'background: color-mix(in srgb, var(--bg-app) 15%, transparent); color: inherit;' : ''}">
                  {getSubcatCount(cat.id)}
                </span>
              {/if}

              <!-- Ações (aparecem no hover) -->
              <div class="tree-item-actions">
                <button
                  class="tree-action-btn"
                  title="Editar categoria"
                  on:click|stopPropagation={() => iniciarEdicaoCategoria(cat)}
                  style="color: var(--text-muted);"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button
                  class="tree-action-btn tree-action-danger"
                  title="Excluir categoria"
                  on:click|stopPropagation={() => excluirCategoria(cat)}
                  style="color: var(--error);"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          {/if}

          <!-- Subcategorias (expandidas) -->
          {#if expandedCats.has(cat.id)}
            <div class="subcat-list" transition:slide|local={{ duration: 150 }}>
              {#each getSubcats(cat.id) as sub (sub.id)}
                {#if editingSubId === sub.id}
                  <!-- Formulário de edição inline da subcategoria -->
                  <div class="tree-edit-form ml-6" style="background: var(--bg-card); border-color: var(--border-subtle);" transition:slide|local={{ duration: 150 }}>
                    <form on:submit={salvarEdicaoSubcategoria} class="flex flex-col gap-2">
                      <input
                        class="tree-input"
                        bind:value={editSubForm.nome}
                        placeholder="Nome da subcategoria"
                        required
                        autofocus
                        style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                      />
                      <div class="flex gap-2">
                        <button type="submit" class="btn-xs-primary" style="background: var(--primary); color: var(--primary-text);">Salvar</button>
                        <button type="button" class="btn-xs-ghost" on:click={cancelarEdicaoSubcategoria} style="color: var(--text-muted); border-color: var(--border-subtle);">Cancelar</button>
                      </div>
                    </form>
                  </div>
                {:else}
                  <div
                    class="tree-item tree-item-sub group"
                    class:tree-item-active={selectedSubcategoriaId === sub.id}
                    style={selectedSubcategoriaId === sub.id
                      ? 'background: var(--sidebar-item-active-bg); color: var(--sidebar-item-active-text);'
                      : ''}
                    role="button"
                    tabindex="0"
                    on:click={() => selectSubcategoria(sub.id, cat.id)}
                    on:keydown={(e) => e.key === 'Enter' && selectSubcategoria(sub.id, cat.id)}
                  >
                    <span class="sub-dot" style="background: {selectedSubcategoriaId === sub.id ? 'currentColor' : 'var(--border-strong)'};"></span>
                    <span class="flex-1 text-sm truncate">{sub.nome}</span>

                    <!-- Ações (hover) -->
                    <div class="tree-item-actions">
                      <button
                        class="tree-action-btn"
                        title="Editar subcategoria"
                        on:click|stopPropagation={() => iniciarEdicaoSubcategoria(sub)}
                        style="color: var(--text-muted);"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        class="tree-action-btn tree-action-danger"
                        title="Excluir subcategoria"
                        on:click|stopPropagation={() => excluirSubcategoria(sub)}
                        style="color: var(--error);"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                {/if}
              {/each}

              {#if getSubcats(cat.id).length === 0}
                <div class="pl-9 py-2 text-xs" style="color: var(--text-muted);">
                  Nenhuma subcategoria
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}

      {#if categorias.length === 0 && !loading}
        <div class="p-4 text-center text-sm" style="color: var(--text-muted);">
          Nenhuma categoria cadastrada.
        </div>
      {/if}
    </div>
  </aside>

  <!-- ══════════════════════════════════════════════════════════════════════════
       PAINEL DIREITO — Tabela de Produtos
       ══════════════════════════════════════════════════════════════════════ -->
  <div class="products-panel">

    <!-- Toolbar da tabela -->
    <div class="products-toolbar" style="background: var(--bg-panel); border-color: var(--border-subtle);">

      <!-- Indicador de filtro ativo -->
      <div class="flex items-center gap-2 min-w-0">
        {#if selectedItems.size > 0}
          <div class="flex items-center gap-2 flex-wrap">
            <button
              class="bulk-action-btn"
              on:click={excluirEmMassa}
              style="background: color-mix(in srgb, var(--error) 10%, transparent); color: var(--error); border-color: var(--error);"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Excluir ({selectedItems.size})
            </button>
          </div>
        {:else}
          <div class="flex items-center gap-1.5 min-w-0">
            <svg class="w-4 h-4 shrink-0" style="color: var(--text-muted);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7h18M3 12h18M3 17h18" />
            </svg>
            <span class="text-sm truncate" style="color: var(--text-label);">
              {indicadorFiltro}
            </span>
            <span class="badge-count shrink-0" style="background: var(--bg-card); color: var(--text-muted); border-color: var(--border-card);">
              {sortedProdutos.length}
            </span>
          </div>
        {/if}
      </div>

      <!-- Busca + Filtro -->
      <div class="toolbar-controls flex items-center gap-2">
        <div class="search-wrapper" style="border-color: var(--border-subtle); background: var(--bg-input);">
          <svg class="w-4 h-4 shrink-0" style="color: var(--text-muted);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
          </svg>
          <input
            type="text"
            placeholder="Buscar produto..."
            bind:value={buscaFilter}
            on:input={() => carregarProdutos()}
            class="search-input"
            style="background: transparent; color: var(--text-main);"
          />
        </div>

        <!-- Dropdown de filtros adicionais -->
        <div class="filter-dropdown-wrapper relative">
          <button
            class="filter-btn"
            class:filter-btn-active={filterOcultosOnly || filterEstoqueOnly}
            on:click|stopPropagation={() => { showFilterDropdown = !showFilterDropdown; showSortDropdown = false; }}
            style="border-color: var(--border-subtle); color: var(--text-muted);
              {filterOcultosOnly || filterEstoqueOnly ? 'color: var(--primary); border-color: var(--primary);' : ''}"
            title="Filtros adicionais"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707l-6.414 6.414A1 1 0 0013 14v5a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7a1 1 0 01-.293-.707L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            {#if filterOcultosOnly || filterEstoqueOnly}
              <span class="filter-active-dot" style="background: var(--primary);"></span>
            {/if}
          </button>

          {#if showFilterDropdown}
            <div
              class="filter-dropdown"
              transition:slide={{ duration: 150 }}
              style="background: var(--bg-card); border-color: var(--border-card);"
            >
              <label class="filter-option" style="color: var(--text-label);">
                <input type="checkbox" bind:checked={filterOcultosOnly} class="themed-checkbox" />
                <span>Somente ocultos no PDV</span>
              </label>
              <label class="filter-option" style="color: var(--text-label);">
                <input type="checkbox" bind:checked={filterEstoqueOnly} class="themed-checkbox" />
                <span>Somente com estoque controlado</span>
              </label>
              {#if filterOcultosOnly || filterEstoqueOnly}
                <button
                  class="text-xs mt-1 pt-2"
                  style="color: var(--primary); border-top: 1px solid var(--border-subtle); width: 100%; text-align: left;"
                  on:click={() => { filterOcultosOnly = false; filterEstoqueOnly = false; showFilterDropdown = false; }}
                >
                  Limpar filtros extras
                </button>
              {/if}
            </div>
          {/if}
        </div>

        <div class="sort-dropdown-wrapper relative">
          <button
            class="sort-btn"
            on:click|stopPropagation={() => { showSortDropdown = !showSortDropdown; showFilterDropdown = false; }}
            aria-expanded={showSortDropdown}
            title="Ordenar produtos"
          >
            <ArrowUpDown class="w-4 h-4" aria-hidden="true" />
            <span class="sort-btn-label">Ordenar</span>
          </button>

          {#if showSortDropdown}
            <div class="sort-dropdown" transition:slide={{ duration: 150 }}>
              <button class="sort-option" class:active={sortField === 'nome' && !sortDesc} on:click={() => { sortField = 'nome'; sortDesc = false; showSortDropdown = false; }}>
                Nome A–Z
              </button>
              <button class="sort-option" class:active={sortField === 'preco' && !sortDesc} on:click={() => { sortField = 'preco'; sortDesc = false; showSortDropdown = false; }}>
                Menor preço
              </button>
              <button class="sort-option" class:active={sortField === 'preco' && sortDesc} on:click={() => { sortField = 'preco'; sortDesc = true; showSortDropdown = false; }}>
                Maior preço
              </button>
              <button class="sort-option" class:active={sortField === 'estoque_atual' && !sortDesc} on:click={() => { sortField = 'estoque_atual'; sortDesc = false; showSortDropdown = false; }}>
                Menor estoque
              </button>
            </div>
          {/if}
        </div>

        <button class="view-toggle" type="button" disabled aria-label="Visualização em lista (atual)" title="Visualização em lista">
          <List class="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>

    <!-- Tabela -->
    <div class="products-table-shell" style="background: var(--bg-panel);">
      {#if loading}
        <div class="p-12 text-center" style="color: var(--text-muted);">
          <div class="loading-spinner mx-auto mb-3" style="border-color: var(--primary); border-top-color: transparent;"></div>
          Carregando produtos...
        </div>
      {:else if sortedProdutos.length === 0}
        <div class="p-12 text-center" style="color: var(--text-muted);">
          <svg class="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
          </svg>
          <p class="text-sm">
            {#if produtos.length > 0}
              Nenhum produto encontrado com os filtros atuais.
            {:else}
              Nenhum produto cadastrado. Comece criando um produto.
            {/if}
          </p>
          {#if selectedCategoriaId || selectedSubcategoriaId || buscaFilter || filterOcultosOnly || filterEstoqueOnly}
            <button
              class="text-xs mt-2"
              style="color: var(--primary);"
              on:click={() => { limparSelecao(); buscaFilter = ''; filterOcultosOnly = false; filterEstoqueOnly = false; }}
            >
              Limpar filtros
            </button>
          {/if}
        </div>
      {:else}
        <div class="mobile-products-list">
          {#each paginatedProdutos as prod (prod.id)}
            <article
              class="mobile-product-card"
              class:mobile-product-card-selected={selectedItems.has(prod.id)}
              style="border-color: var(--border-subtle);"
            >
              {#if editingProdId === prod.id}
                <form on:submit={salvarEdicaoProduto} class="mobile-edit-form">
                  <div class="mobile-edit-grid">
                    <input
                      class="edit-input"
                      bind:value={editProdForm.nome}
                      placeholder="Nome"
                      required
                      style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                    />
                    <div class="currency-field">
                      <span class="currency-prefix" aria-hidden="true">R$</span>
                      <input
                        class="edit-input currency-input"
                        type="number"
                      step="0.01"
                      min="0"
                      bind:value={editProdForm.preco}
                      placeholder={tabelasPrecoAtivo ? nomesTabelas[0] : 'Preço'}
                      required
                      style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                      />
                    </div>
                    {#if tabelasPrecoAtivo}
                      <div class="currency-field">
                        <span class="currency-prefix" aria-hidden="true">R$</span>
                        <input
                        class="edit-input currency-input"
                        type="number"
                        step="0.01"
                        min="0"
                        bind:value={editProdForm.preco_2}
                        placeholder={nomesTabelas[1]}
                        style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                        />
                      </div>
                      <div class="currency-field">
                        <span class="currency-prefix" aria-hidden="true">R$</span>
                        <input
                        class="edit-input currency-input"
                        type="number"
                        step="0.01"
                        min="0"
                        bind:value={editProdForm.preco_3}
                        placeholder={nomesTabelas[2]}
                        style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                        />
                      </div>
                    {/if}
                    <Select.Root bind:value={editProdForm.id_categoria}>
                      <Select.Trigger class="field-input">
                        <span class="select-value-label">{getCategoriaNome(editProdForm.id_categoria) || '— Categoria —'}</span>
                      </Select.Trigger>
                      <Select.Content>
                        {#each categorias as c}
                          <Select.Item value={String(c.id)} label={c.nome} />
                        {/each}
                      </Select.Content>
                    </Select.Root>
                    <Select.Root bind:value={editProdForm.id_subcategoria} disabled={!editProdForm.id_categoria}>
                      <Select.Trigger class="field-input">
                        <span class="select-value-label">{getSubcategoriaNome(editProdForm.id_subcategoria) || '— Subcategoria —'}</span>
                      </Select.Trigger>
                      <Select.Content>
                        {#each filteredSubcatsForEditForm as s}
                          <Select.Item value={String(s.id)} label={s.nome} />
                        {/each}
                      </Select.Content>
                    </Select.Root>
                  </div>

                  <div class="mobile-edit-options" style="color: var(--text-label);">
                    {#if editProdCategoriaCompartilhada}
                      <span class="mobile-meta-note">Estoque compartilhado pela categoria</span>
                    {:else}
                      <label>
                        <input type="checkbox" bind:checked={editProdForm.controlar_estoque} class="themed-checkbox" />
                        Controlar estoque
                      </label>
                    {/if}
                    {#if !editProdCategoriaCompartilhada && editProdForm.controlar_estoque}
                      <label>
                        Qtd.
                        <input
                          type="number"
                          class="edit-input mobile-stock-input"
                          bind:value={editProdForm.estoque_atual}
                          style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                        />
                      </label>
                    {/if}
                    <label>
                      <input type="checkbox" bind:checked={editProdForm.ocultar_no_pdv} class="themed-checkbox" />
                      Ocultar no PDV
                    </label>
                    <label>
                      <input type="checkbox" bind:checked={editProdForm.eh_item_por_unidade} class="themed-checkbox" />
                      Venda em atacado
                    </label>
                  </div>

                  <div class="mobile-card-actions">
                    <button
                      type="button"
                      class="btn-xs-ghost ask-zelinho-button inline-flex items-center gap-1.5"
                      on:click={() => perguntarSobreProduto(prod)}
                      style="color: var(--primary); border-color: var(--primary);"
                    >
                      <MessageCircle class="w-4 h-4" />
                      Perguntar ao Zelinho
                    </button>
                    <button type="button" class="btn-xs-ghost" on:click={cancelarEdicaoProduto} style="color: var(--text-muted); border-color: var(--border-subtle);">
                      Cancelar
                    </button>
                    <button type="submit" class="btn-xs-primary" style="background: var(--primary); color: var(--primary-text);">
                      Salvar
                    </button>
                  </div>
                </form>
              {:else}
                <div class="mobile-product-main">
                  <label class="mobile-select-box" aria-label={'Selecionar ' + prod.nome}>
                    <input
                      type="checkbox"
                      checked={selectedItems.has(prod.id)}
                      on:change={() => toggleSelect(prod.id)}
                      class="themed-checkbox"
                    />
                  </label>

                  <div class="prod-avatar" style="background: color-mix(in srgb, {getInicialColor(prod.nome)} 18%, transparent); color: {getInicialColor(prod.nome)};">
                    {(prod.nome || '?').charAt(0).toUpperCase()}
                  </div>

                  <div class="mobile-product-info">
                    <div class="mobile-product-title-row">
                      <h2>{prod.nome}</h2>
                      {#if prod.ocultar_no_pdv}
                        <span class="badge-oculto">Oculto</span>
                      {/if}
                      {#if modifierGroupCount(prod) > 0}
                        <span class="badge-montavel">Montável · {modifierGroupCount(prod)} {modifierGroupCount(prod) === 1 ? 'grupo' : 'grupos'}</span>
                      {/if}
                    </div>
                    <div class="mobile-product-meta">
                      <span class="mobile-price">{formatPreco(prod.preco)}</span>
                      {#if prod.controlar_estoque || estoqueProdutoCompartilhado(prod)}
                        <span
                          class="badge-estoque"
                          title={estoqueProdutoCompartilhado(prod) ? 'Estoque compartilhado pela categoria' : 'Estoque individual'}
                          style={estoqueExibido(prod) < 5
                            ? 'background: color-mix(in srgb, var(--error) 12%, transparent); color: var(--error);'
                            : 'background: color-mix(in srgb, var(--success) 12%, transparent); color: var(--success);'}
                        >
                          Estoque {estoqueExibido(prod)}
                        </span>
                      {:else}
                        <span style="color: var(--text-muted);">Sem estoque</span>
                      {/if}
                    </div>
                  </div>
                </div>

                <div class="mobile-product-footer">
                  <div class="mobile-status-row">
                    {#if prod.ocultar_no_pdv}
                      <span class="badge-status" style="background: color-mix(in srgb, var(--text-muted) 12%, transparent); color: var(--text-muted);">Inativo</span>
                    {:else}
                      <span class="badge-status" style="background: color-mix(in srgb, var(--success) 12%, transparent); color: var(--success);">Ativo</span>
                    {/if}

                  </div>

                  <div class="row-actions">
                    <button
                      class="row-action-btn"
                      title="Complementos e opções"
                      aria-label="Configurar complementos e opções de {prod.nome}"
                      on:click={() => abrirComplementos(prod)}
                      style="color: var(--primary);"
                    >
                      <SlidersHorizontal class="w-4 h-4" />
                    </button>
                    <button
                      class="row-action-btn"
                      title="Editar"
                      on:click={() => iniciarEdicaoProduto(prod)}
                      style="color: var(--text-muted);"
                    >
                      <Pencil class="w-4 h-4" />
                    </button>
                    <button
                      class="row-action-btn row-action-danger"
                      title="Excluir"
                      on:click={() => excluirProduto(prod)}
                      style="color: var(--error);"
                    >
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </div>
                </div>
              {/if}
            </article>
          {/each}
        </div>

        <table class="products-table">
          <thead style="background: var(--bg-card);">
            <tr>
              <th class="th-cell w-10">
                <input
                  type="checkbox"
                  on:change={toggleSelectAll}
                  checked={paginatedProdutos.length > 0 && paginatedProdutos.every(p => selectedItems.has(p.id))}
                  class="themed-checkbox"
                />
              </th>
              <th class="th-cell w-10"></th>
              <th class="th-cell cursor-pointer hover-th" on:click={() => toggleSort('nome')}>
                Nome
                {#if sortField === 'nome'}<span class="sort-arrow">{sortDesc ? '↓' : '↑'}</span>{/if}
              </th>
              <th class="th-cell cursor-pointer hover-th" on:click={() => toggleSort('preco')}>
                Preço
                {#if sortField === 'preco'}<span class="sort-arrow">{sortDesc ? '↓' : '↑'}</span>{/if}
              </th>
              <th class="th-cell text-center cursor-pointer hover-th" on:click={() => toggleSort('estoque_atual')}>
                Estoque
                {#if sortField === 'estoque_atual'}<span class="sort-arrow">{sortDesc ? '↓' : '↑'}</span>{/if}
              </th>
              <th class="th-cell text-center">Status</th>
              <th class="th-cell text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {#each paginatedProdutos as prod (prod.id)}
              {#if editingProdId === prod.id}
                <!-- Linha de edição inline -->
                <tr style="background: var(--accent-light);">
                  <td class="td-cell"></td>
                  <td colspan="6" class="td-cell">
                    <form on:submit={salvarEdicaoProduto} class="flex flex-col gap-3">
                      <div class="flex flex-wrap gap-3">
                        <input
                          class="edit-input flex-1 min-w-32"
                          bind:value={editProdForm.nome}
                          placeholder="Nome"
                          required
                          style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                        />
                        <div class="currency-field w-28">
                          <span class="currency-prefix" aria-hidden="true">R$</span>
                          <input
                            class="edit-input currency-input w-full"
                            type="number"
                          step="0.01"
                          min="0"
                          bind:value={editProdForm.preco}
                          placeholder={tabelasPrecoAtivo ? nomesTabelas[0] : 'Preço'}
                          required
                          style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                          />
                        </div>
                        {#if tabelasPrecoAtivo}
                          <div class="currency-field w-28">
                            <span class="currency-prefix" aria-hidden="true">R$</span>
                            <input
                              class="edit-input currency-input w-full"
                              type="number"
                              step="0.01"
                              min="0"
                              bind:value={editProdForm.preco_2}
                              placeholder={nomesTabelas[1]}
                              style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                            />
                          </div>
                          <div class="currency-field w-28">
                            <span class="currency-prefix" aria-hidden="true">R$</span>
                            <input
                              class="edit-input currency-input w-full"
                              type="number"
                              step="0.01"
                              min="0"
                              bind:value={editProdForm.preco_3}
                              placeholder={nomesTabelas[2]}
                              style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                            />
                          </div>
                        {/if}
                        <Select.Root bind:value={editProdForm.id_categoria}>
                          <Select.Trigger class="field-input">
                            <span class="select-value-label">{getCategoriaNome(editProdForm.id_categoria) || '— Categoria —'}</span>
                          </Select.Trigger>
                          <Select.Content>
                            {#each categorias as c}
                              <Select.Item value={String(c.id)} label={c.nome} />
                            {/each}
                          </Select.Content>
                        </Select.Root>
                        <Select.Root bind:value={editProdForm.id_subcategoria} disabled={!editProdForm.id_categoria}>
                          <Select.Trigger class="field-input">
                            <span class="select-value-label">{getSubcategoriaNome(editProdForm.id_subcategoria) || '— Subcategoria —'}</span>
                          </Select.Trigger>
                          <Select.Content>
                            {#each filteredSubcatsForEditForm as s}
                              <Select.Item value={String(s.id)} label={s.nome} />
                            {/each}
                          </Select.Content>
                        </Select.Root>
                      </div>
                      <div class="flex items-center justify-between flex-wrap gap-3">
                        <div class="flex items-center gap-4 text-sm flex-wrap" style="color: var(--text-label);">
                          {#if editProdCategoriaCompartilhada}
                            <span class="text-xs" style="color: var(--text-muted);">Estoque compartilhado pela categoria</span>
                          {:else}
                            <label class="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" bind:checked={editProdForm.controlar_estoque} class="themed-checkbox" />
                              Controlar estoque
                            </label>
                          {/if}
                          {#if !editProdCategoriaCompartilhada && editProdForm.controlar_estoque}
                            <div class="flex items-center gap-1.5" transition:slide|local={{ duration: 100 }}>
                              <span>Qtd:</span>
                              <input
                                type="number"
                                class="edit-input w-20"
                                bind:value={editProdForm.estoque_atual}
                                style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                              />
                            </div>
                          {/if}
                          <label class="flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" bind:checked={editProdForm.ocultar_no_pdv} class="themed-checkbox" />
                            Ocultar no PDV
                          </label>
                          <label class="flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" bind:checked={editProdForm.eh_item_por_unidade} class="themed-checkbox" />
                            Venda em atacado
                          </label>
                        </div>
                        <div class="flex gap-2">
                          <button
                            type="button"
                            class="btn-xs-ghost ask-zelinho-button inline-flex items-center gap-1.5"
                            on:click={() => perguntarSobreProduto(prod)}
                            style="color: var(--primary); border-color: var(--primary);"
                          >
                            <MessageCircle class="w-4 h-4" />
                            Perguntar ao Zelinho
                          </button>
                          <button type="button" class="btn-xs-ghost" on:click={cancelarEdicaoProduto} style="color: var(--text-muted); border-color: var(--border-subtle);">
                            Cancelar
                          </button>
                          <button type="submit" class="btn-xs-primary" style="background: var(--primary); color: var(--primary-text);">
                            Salvar
                          </button>
                        </div>
                      </div>
                    </form>
                  </td>
                </tr>
              {:else}
                <!-- Linha normal -->
                <tr class="product-row group" style="border-color: var(--border-subtle);">
                  <td class="td-cell">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(prod.id)}
                      on:change={() => toggleSelect(prod.id)}
                      class="themed-checkbox"
                    />
                  </td>

                  <!-- Miniatura/Avatar -->
                  <td class="td-cell">
                    <div class="prod-avatar" style="background: color-mix(in srgb, {getInicialColor(prod.nome)} 18%, transparent); color: {getInicialColor(prod.nome)};">
                      {(prod.nome || '?').charAt(0).toUpperCase()}
                    </div>
                  </td>

                  <!-- Nome + badge Oculto -->
                  <td class="td-cell">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-medium text-sm" style="color: var(--text-main);">{prod.nome}</span>
                      {#if prod.ocultar_no_pdv}
                        <span class="badge-oculto">Oculto</span>
                      {/if}
                      {#if modifierGroupCount(prod) > 0}
                        <span class="badge-montavel">Montável · {modifierGroupCount(prod)} {modifierGroupCount(prod) === 1 ? 'grupo' : 'grupos'}</span>
                      {/if}
                    </div>
                  </td>

                  <!-- Preço -->
                  <td class="td-cell text-sm font-mono" style="color: var(--text-label);">
                    {formatPreco(prod.preco)}
                  </td>

                  <!-- Estoque -->
                  <td class="td-cell text-center">
                    {#if prod.controlar_estoque || estoqueProdutoCompartilhado(prod)}
                      <span
                        class="badge-estoque"
                        title={estoqueProdutoCompartilhado(prod) ? 'Estoque compartilhado pela categoria' : 'Estoque individual'}
                        style={estoqueExibido(prod) < 5
                          ? 'background: color-mix(in srgb, var(--error) 12%, transparent); color: var(--error);'
                          : 'background: color-mix(in srgb, var(--success) 12%, transparent); color: var(--success);'}
                      >
                        {estoqueExibido(prod)}
                      </span>
                      {#if estoqueProdutoCompartilhado(prod)}
                        <div class="text-[10px] mt-1" style="color: var(--text-muted);">grupo</div>
                      {/if}
                    {:else}
                      <span class="text-xs" style="color: var(--text-muted);">—</span>
                    {/if}
                  </td>

                  <!-- Status -->
                  <td class="td-cell text-center">
                    {#if prod.ocultar_no_pdv}
                      <span class="badge-status" style="background: color-mix(in srgb, var(--text-muted) 12%, transparent); color: var(--text-muted);">Inativo</span>
                    {:else}
                      <span class="badge-status" style="background: color-mix(in srgb, var(--success) 12%, transparent); color: var(--success);">Ativo</span>
                    {/if}
                  </td>

                  <!-- Ações -->
                  <td class="td-cell text-right">
                    <div class="row-actions">
                      <button
                        class="row-action-btn"
                        title="Complementos e opções"
                        aria-label="Configurar complementos e opções de {prod.nome}"
                        on:click={() => abrirComplementos(prod)}
                        style="color: var(--primary);"
                      >
                        <SlidersHorizontal class="w-4 h-4" />
                      </button>
                      <button
                        class="row-action-btn"
                        title="Editar"
                        on:click={() => iniciarEdicaoProduto(prod)}
                        style="color: var(--text-muted);"
                      >
                        <Pencil class="w-4 h-4" />
                      </button>
                      <button
                        class="row-action-btn row-action-danger"
                        title="Excluir"
                        on:click={() => excluirProduto(prod)}
                        style="color: var(--error);"
                      >
                        <Trash2 class="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      {/if}
    </div>

    <!-- Paginação -->
    {#if totalPages > 1}
      <div class="pagination" style="background: var(--bg-panel); border-color: var(--border-subtle);">
        <span class="text-xs" style="color: var(--text-muted);">
          Página {currentPage} de {totalPages}
          · {sortedProdutos.length} produto(s)
        </span>
        <div class="flex gap-1.5">
          <button
            class="page-btn"
            disabled={currentPage === 1}
            on:click={() => currentPage--}
            style="background: var(--bg-card); color: var(--text-label); border-color: var(--border-subtle);"
          >
            ← Anterior
          </button>
          <button
            class="page-btn"
            disabled={currentPage === totalPages}
            on:click={() => currentPage++}
            style="background: var(--bg-card); color: var(--text-label); border-color: var(--border-subtle);"
          >
            Próxima →
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════════
     MODAL — Nova Categoria
     ═══════════════════════════════════════════════════════════════════════ -->
<div class="mobile-create-menu" class:open={showMobileCreateMenu}>
  {#if showMobileCreateMenu}
    <div class="mobile-create-options" aria-label="Criar novo item">
      <button class="mobile-create-option" type="button" on:click={abrirModalCategoria}>
        <span class="mobile-create-option-icon"><Plus class="w-4 h-4" aria-hidden="true" /></span>
        <span>Categoria</span>
      </button>
      <button class="mobile-create-option" type="button" on:click={abrirModalSubcategoria}>
        <span class="mobile-create-option-icon"><Plus class="w-4 h-4" aria-hidden="true" /></span>
        <span>Subcategoria</span>
      </button>
      <button class="mobile-create-option" type="button" on:click={abrirModalProduto}>
        <span class="mobile-create-option-icon"><Plus class="w-4 h-4" aria-hidden="true" /></span>
        <span>Produto</span>
      </button>
    </div>
  {/if}
  <button
    class="mobile-create-fab"
    class:open={showMobileCreateMenu}
    type="button"
    aria-expanded={showMobileCreateMenu}
    aria-label={showMobileCreateMenu ? 'Fechar opções de criação' : 'Criar novo item'}
    on:click|stopPropagation={toggleMobileCreateMenu}
  >
    <Plus class="mobile-create-fab-icon" aria-hidden="true" />
  </button>
</div>

{#if showCatModal}
  <div class="modal-backdrop" on:click|self={() => showCatModal = false} transition:slide={{ duration: 200 }}>
    <div class="modal-box" style="background: var(--bg-card); border-color: var(--border-card);">
      <div class="modal-header" style="border-color: var(--border-subtle);">
        <h2 class="modal-title" style="color: var(--text-main);">Nova Categoria</h2>
        <button class="modal-close" on:click={() => showCatModal = false} style="color: var(--text-muted);">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <form on:submit={criarCategoria} class="modal-body flex flex-col gap-4">
        <div>
          <label class="form-label" style="color: var(--text-label);">Nome da Categoria</label>
          <input
            class="form-input"
            bind:value={newCatForm.nome}
            placeholder="Ex: Bebidas"
            required
            autofocus
            style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
          />
        </div>
        <div>
          <label class="form-label" style="color: var(--text-label);">Ordem de Exibição</label>
          <input
            class="form-input"
            type="number"
            step="1"
            bind:value={newCatForm.ordem}
            required
            style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
          />
        </div>
        <label class="prod-option-label option-card" style="color: var(--text-label); background: var(--bg-input); border-color: var(--border-subtle);">
          <input class="themed-checkbox" type="checkbox" bind:checked={newCatForm.controlar_estoque_compartilhado} />
          <div>
            <span class="font-medium text-sm">Estoque compartilhado</span>
            <p class="text-xs mt-0.5" style="color: var(--text-muted);">Todos os produtos desta categoria usam a mesma quantidade</p>
          </div>
        </label>
        {#if newCatForm.controlar_estoque_compartilhado}
          <div>
            <label class="form-label" style="color: var(--text-label);">Qtd. Compartilhada</label>
            <input
              class="form-input"
              type="number"
              min="0"
              step="1"
              bind:value={newCatForm.estoque_compartilhado_atual}
              style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
            />
          </div>
        {/if}
        <div class="modal-footer" style="border-color: var(--border-subtle);">
          <button type="button" class="btn-ghost-modal" on:click={() => showCatModal = false} style="color: var(--text-muted); border-color: var(--border-subtle);">
            Cancelar
          </button>
          <button type="submit" class="btn-primary">
            Salvar Categoria
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════════
     MODAL — Nova Subcategoria
     ═══════════════════════════════════════════════════════════════════════ -->
{#if showSubModal}
  <div class="modal-backdrop" on:click|self={() => showSubModal = false} transition:slide={{ duration: 200 }}>
    <div class="modal-box" style="background: var(--bg-card); border-color: var(--border-card);">
      <div class="modal-header" style="border-color: var(--border-subtle);">
        <h2 class="modal-title" style="color: var(--text-main);">Nova Subcategoria</h2>
        <button class="modal-close" on:click={() => showSubModal = false} style="color: var(--text-muted);">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <form on:submit={criarSubcategoria} class="modal-body flex flex-col gap-4">
        <div>
          <label class="form-label" style="color: var(--text-label);">Categoria Pai</label>
          <Select.Root bind:value={newSubForm.id_categoria}>
            <Select.Trigger class="field-input">
              <span class="select-value-label">{getCategoriaNome(newSubForm.id_categoria) || 'Selecione uma categoria...'}</span>
            </Select.Trigger>
            <Select.Content>
              {#each categorias as c}
                <Select.Item value={String(c.id)} label={c.nome} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div>
          <label class="form-label" style="color: var(--text-label);">Nome da Subcategoria</label>
          <input
            class="form-input"
            bind:value={newSubForm.nome}
            placeholder="Ex: Latas"
            required
            autofocus
            style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
          />
        </div>
        <div>
          <label class="form-label" style="color: var(--text-label);">Ordem de Exibição</label>
          <input
            class="form-input"
            type="number"
            step="1"
            bind:value={newSubForm.ordem}
            required
            style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
          />
        </div>
        <div class="modal-footer" style="border-color: var(--border-subtle);">
          <button type="button" class="btn-ghost-modal" on:click={() => showSubModal = false} style="color: var(--text-muted); border-color: var(--border-subtle);">
            Cancelar
          </button>
          <button type="submit" class="btn-primary">
            Salvar Subcategoria
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════════
     MODAL — Novo Produto
     ═══════════════════════════════════════════════════════════════════════ -->
{#if showProdModal}
  <div class="modal-backdrop" on:click|self={() => showProdModal = false} transition:slide={{ duration: 200 }}>
    <div class="modal-box modal-box-lg" style="background: var(--bg-card); border-color: var(--border-card);">
      <div class="modal-header" style="border-color: var(--border-subtle);">
        <h2 class="modal-title" style="color: var(--text-main);">Novo Produto</h2>
        <button class="modal-close" on:click={() => showProdModal = false} style="color: var(--text-muted);">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <form on:submit={criarProduto} class="modal-body flex flex-col gap-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="form-label" style="color: var(--text-label);">Nome do Produto</label>
            <input
              class="form-input"
              bind:value={newProdForm.nome}
              placeholder="Ex: Coca-Cola Lata"
              required
              autofocus
              style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
            />
          </div>
          <div>
            <label class="form-label" style="color: var(--text-label);">{tabelasPrecoAtivo ? `Preço ${nomesTabelas[0]} (R$)` : 'Preço (R$)'}</label>
            <div class="currency-field">
              <span class="currency-prefix" aria-hidden="true">R$</span>
              <input
                class="form-input currency-input"
                type="number"
                step="0.01"
                min="0"
                bind:value={newProdForm.preco}
                required
                style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
              />
            </div>
          </div>
          {#if tabelasPrecoAtivo}
            <div>
              <label class="form-label" style="color: var(--text-label);">Preço {nomesTabelas[1]} (R$)</label>
              <div class="currency-field">
                <span class="currency-prefix" aria-hidden="true">R$</span>
                <input
                  class="form-input currency-input"
                  type="number"
                  step="0.01"
                  min="0"
                  bind:value={newProdForm.preco_2}
                  placeholder="Opcional"
                  style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                />
              </div>
            </div>
            <div>
              <label class="form-label" style="color: var(--text-label);">Preço {nomesTabelas[2]} (R$)</label>
              <div class="currency-field">
                <span class="currency-prefix" aria-hidden="true">R$</span>
                <input
                  class="form-input currency-input"
                  type="number"
                  step="0.01"
                  min="0"
                  bind:value={newProdForm.preco_3}
                  placeholder="Opcional"
                  style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                />
              </div>
            </div>
          {/if}
          <div>
            <label class="form-label" style="color: var(--text-label);">Categoria</label>
            <Select.Root bind:value={newProdForm.id_categoria}>
              <Select.Trigger class="field-input">
                <span class="select-value-label">{getCategoriaNome(newProdForm.id_categoria) || 'Selecione...'}</span>
              </Select.Trigger>
              <Select.Content>
                {#each categorias as c}
                  <Select.Item value={String(c.id)} label={c.nome} />
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
          <div>
            <label class="form-label" style="color: var(--text-label);">Subcategoria</label>
            <Select.Root bind:value={newProdForm.id_subcategoria} disabled={!newProdForm.id_categoria}>
              <Select.Trigger class="field-input">
                <span class="select-value-label">{getSubcategoriaNome(newProdForm.id_subcategoria) || '— Nenhuma —'}</span>
              </Select.Trigger>
              <Select.Content>
                {#each filteredSubcatsForProdForm as s}
                  <Select.Item value={String(s.id)} label={s.nome} />
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        </div>

        <!-- Opções booleanas -->
        <div class="prod-options-grid" style="background: var(--bg-panel); border-color: var(--border-subtle);">
          <label class="prod-option-label" style="color: var(--text-label);">
            <input type="checkbox" bind:checked={newProdForm.eh_item_por_unidade} class="themed-checkbox" />
            <div>
              <span class="font-medium text-sm">Venda em atacado</span>
              <p class="text-xs mt-0.5" style="color: var(--text-muted);">Define como este produto será vendido no PDV</p>
            </div>
          </label>
          <label class="prod-option-label" style="color: var(--text-label);">
            <input type="checkbox" bind:checked={newProdForm.ocultar_no_pdv} class="themed-checkbox" />
            <div>
              <span class="font-medium text-sm">Ocultar no PDV</span>
              <p class="text-xs mt-0.5" style="color: var(--text-muted);">Produto não aparecerá para seleção na venda</p>
            </div>
          </label>
          {#if newProdCategoriaCompartilhada}
            <div class="prod-option-label" style="color: var(--text-label);">
              <div>
                <span class="font-medium text-sm">Estoque compartilhado</span>
                <p class="text-xs mt-0.5" style="color: var(--text-muted);">A quantidade é controlada na categoria selecionada</p>
              </div>
            </div>
          {:else}
            <label class="prod-option-label" style="color: var(--text-label);">
              <input type="checkbox" bind:checked={newProdForm.controlar_estoque} class="themed-checkbox" />
              <div>
                <span class="font-medium text-sm">Controlar estoque</span>
                <p class="text-xs mt-0.5" style="color: var(--text-muted);">Acompanha a quantidade disponível</p>
              </div>
            </label>
          {/if}
          {#if !newProdCategoriaCompartilhada && newProdForm.controlar_estoque}
            <div class="flex items-center gap-2" transition:slide|local={{ duration: 100 }}>
              <label class="form-label mb-0" style="color: var(--text-label);">Qtd. Inicial:</label>
              <input
                class="form-input w-24"
                type="number"
                step="1"
                min="0"
                bind:value={newProdForm.estoque_atual}
                style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
              />
            </div>
          {/if}
        </div>

        <div class="modal-footer" style="border-color: var(--border-subtle);">
          <button type="button" class="btn-ghost-modal" on:click={() => showProdModal = false} style="color: var(--text-muted); border-color: var(--border-subtle);">
            Cancelar
          </button>
          <button type="submit" class="btn-primary">
            Salvar Produto
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<ModalModificadores
  open={modifierModalOpen}
  produto={modifierProduct}
  ownerUserId={ownerUserId}
  on:close={fecharComplementos}
/>

<style>
  /* ─── Layout ──────────────────────────────────────────────────────────────── */
  .page-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
  }

  .page-title-block {
    min-width: 0;
  }

  .desktop-page-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .page-new-product {
    min-height: 2.75rem;
  }

  .desktop-actions-menu,
  .sort-dropdown-wrapper {
    position: relative;
  }

  .desktop-actions-popover,
  .sort-dropdown {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    z-index: 70;
    min-width: 13rem;
    padding: 0.25rem;
    border: 1px solid var(--border-card);
    border-radius: 0.625rem;
    background: var(--bg-card);
  }

  .desktop-action-item,
  .sort-option {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    min-height: 2.75rem;
    padding: 0.625rem 0.75rem;
    border-radius: 0.375rem;
    color: var(--text-label);
    text-align: left;
    font-size: 0.875rem;
    text-decoration: none;
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .desktop-action-item:hover,
  .sort-option:hover,
  .sort-option.active {
    background: var(--sidebar-item-hover-bg);
    color: var(--text-main);
  }

  .tree-heading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .tree-add-btn,
  .view-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    flex-shrink: 0;
    border: 1px solid var(--border-card);
    border-radius: 0.5rem;
    color: var(--text-label);
    transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
  }

  .tree-add-btn:hover,
  .view-toggle:not(:disabled):hover {
    background: var(--sidebar-item-hover-bg);
    border-color: var(--primary);
    color: var(--text-main);
  }

  .view-toggle:disabled {
    cursor: default;
    opacity: 0.75;
  }

  .mobile-category-nav {
    display: none;
  }

  .page-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .split-view {
    display: flex;
    gap: 0;
    height: calc(100vh - 10rem);
    min-height: 400px;
    border-radius: 0.75rem;
    overflow: hidden;
    border: 1px solid var(--border-subtle);
  }

  /* ─── Painel Esquerdo ─────────────────────────────────────────────────────── */
  .tree-panel {
    width: 272px;
    flex-shrink: 0;
    border-right: 1px solid;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .tree-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.875rem 1rem;
    border-bottom: 1px solid;
    flex-shrink: 0;
  }

  .tree-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .tree-cat-group {
    margin-bottom: 2px;
  }

  .tree-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.6rem;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: background var(--transition-fast);
    width: 100%;
    text-align: left;
    position: relative;
  }

  .tree-item:not(.tree-item-active):hover {
    background: var(--sidebar-item-hover-bg);
  }

  .tree-item-root {
    margin-bottom: 0.25rem;
  }

  .tree-item-sub {
    padding-left: 2rem;
  }

  .chevron-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 0.25rem;
    flex-shrink: 0;
    transition: background var(--transition-fast);
  }

  .chevron-btn:hover {
    background: var(--sidebar-item-hover-bg);
  }

  .sub-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-left: 0.375rem;
  }

  .tree-item-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  @media (hover: none), (max-width: 768px) {
    .tree-item-actions {
      opacity: 1;
    }
  }

  .tree-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 2.25rem;
    min-height: 2.25rem;
    padding: 0.375rem;
    border-radius: 0.25rem;
    transition: background var(--transition-fast);
  }

  .tree-action-btn:hover {
    background: var(--sidebar-item-hover-bg);
  }

  .tree-action-danger:hover {
    background: color-mix(in srgb, var(--error) 15%, transparent);
  }

  .tree-edit-form {
    margin: 4px 0 4px 0.5rem;
    padding: 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid;
  }

  .tree-input {
    width: 100%;
    padding: 0.375rem 0.625rem;
    border-radius: 0.375rem;
    border: 1px solid;
    font-size: 0.8125rem;
    outline: none;
    transition: border-color var(--transition-fast);
  }

  .tree-input:focus {
    border-color: var(--primary);
  }

  .subcat-badge {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.1rem 0.45rem;
    border-radius: 9999px;
    flex-shrink: 0;
  }

  /* ─── Painel Direito ─────────────────────────────────────────────────────── */
  .products-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .products-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid;
    flex-shrink: 0;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .products-table-shell {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .search-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border: 1px solid;
    border-radius: 0.5rem;
    padding: 0.375rem 0.75rem;
  }

  .search-input {
    outline: none;
    font-size: 0.875rem;
    width: 200px;
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .toolbar-controls {
    min-width: 0;
  }

  .select-value-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-main);
  }

  .sort-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 2.75rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
    color: var(--text-muted);
    transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
  }

  .sort-btn:hover,
  .sort-btn[aria-expanded="true"] {
    background: var(--sidebar-item-hover-bg);
    border-color: var(--primary);
    color: var(--text-main);
  }

  .sort-option {
    border: 0;
    background: transparent;
    cursor: pointer;
  }

  .mobile-create-menu {
    display: none;
  }

  @keyframes create-option-in {
    from {
      opacity: 0;
      transform: translateY(0.75rem) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .filter-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 2.75rem;
    min-height: 2.75rem;
    border: 1px solid;
    border-radius: 0.5rem;
    position: relative;
    transition: all var(--transition-fast);
  }

  .filter-active-dot {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .filter-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 50;
    border-radius: 0.5rem;
    border: 1px solid;
    padding: 0.75rem;
    min-width: 220px;
    box-shadow: 0 8px 24px color-mix(in srgb, var(--bg-app) 30%, transparent);
  }

  .filter-option {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    font-size: 0.875rem;
    cursor: pointer;
    padding: 0.25rem 0;
  }

  /* ─── Tabela ─────────────────────────────────────────────────────────────── */
  .products-table {
    width: 100%;
    text-align: left;
    font-size: 0.875rem;
    border-collapse: collapse;
  }

  .mobile-products-list {
    display: none;
  }

  .th-cell {
    padding: 0.75rem 1rem;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    white-space: nowrap;
    border-bottom: 1px solid var(--border-subtle);
  }

  .hover-th:hover {
    color: var(--text-label);
  }

  .sort-arrow {
    margin-left: 0.25rem;
    color: var(--primary);
  }

  .td-cell {
    padding: 0.7rem 1rem;
    border-bottom: 1px solid var(--border-subtle);
    vertical-align: middle;
  }

  .product-row {
    transition: background var(--transition-fast);
  }

  .product-row:hover {
    background: var(--sidebar-item-hover-bg);
  }

  .prod-avatar {
    width: 2rem;
    height: 2rem;
    border-radius: 0.375rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.875rem;
  }

  .badge-oculto {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.1rem 0.5rem;
    border-radius: 9999px;
    background: color-mix(in srgb, var(--warning) 15%, transparent);
    color: var(--warning);
  }

  .badge-montavel {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    padding: 0.15rem 0.5rem;
    border-radius: 9999px;
    background: color-mix(in srgb, var(--primary) 14%, transparent);
    color: var(--primary);
    white-space: nowrap;
  }

  .badge-estoque {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.2rem 0.6rem;
    border-radius: 9999px;
  }

  .badge-status {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.2rem 0.6rem;
    border-radius: 9999px;
    border: 0;
  }

  .row-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.25rem;
  }

  .row-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 2.75rem;
    min-height: 2.75rem;
    padding: 0.5rem;
    border-radius: 0.375rem;
    transition: background var(--transition-fast);
  }

  .row-action-btn:hover {
    background: var(--sidebar-item-hover-bg);
  }

  @media (hover: none), (max-width: 768px) {
    .row-actions {
      opacity: 1;
    }
  }

  .row-action-danger:hover {
    background: color-mix(in srgb, var(--error) 15%, transparent);
  }

  /* ─── Paginação ──────────────────────────────────────────────────────────── */
  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-top: 1px solid;
    flex-shrink: 0;
  }

  .page-btn {
    padding: 0.375rem 0.75rem;
    border: 1px solid;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    transition: all var(--transition-fast);
  }

  .page-btn:hover:not(:disabled) {
    background: var(--sidebar-item-hover-bg);
    color: var(--text-main);
  }

  .page-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  /* ─── Badges e Badges comuns ─────────────────────────────────────────────── */
  .badge-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.25rem;
    padding: 0.1rem 0.4rem;
    border-radius: 9999px;
    font-size: 0.7rem;
    font-weight: 600;
    border: 1px solid;
  }

  .bulk-action-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all var(--transition-fast);
  }

  .bulk-action-btn:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  /* ─── Edit inline na tabela ──────────────────────────────────────────────── */
  .edit-input {
    padding: 0.375rem 0.625rem;
    border-radius: 0.375rem;
    border: 1px solid;
    font-size: 0.875rem;
    outline: none;
    transition: border-color var(--transition-fast);
  }

  .edit-input:focus {
    border-color: var(--primary);
  }

  /* ─── Botões ─────────────────────────────────────────────────────────────── */
  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 1rem;
    background: var(--primary);
    color: var(--primary-text);
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    transition: background var(--transition-fast);
    border: none;
    cursor: pointer;
  }

  .btn-primary:hover {
    background: var(--primary-hover);
  }

  .btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.875rem;
    background: var(--bg-card);
    color: var(--text-label);
    border: 1px solid var(--border-card);
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all var(--transition-fast);
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: var(--sidebar-item-hover-bg);
    color: var(--text-main);
  }

  .btn-xs-primary {
    padding: 0.25rem 0.625rem;
    border-radius: 0.375rem;
    font-size: 0.8rem;
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: opacity var(--transition-fast);
  }

  .btn-xs-primary:hover {
    opacity: 0.85;
  }

  .btn-xs-ghost {
    padding: 0.25rem 0.625rem;
    border-radius: 0.375rem;
    font-size: 0.8rem;
    font-weight: 500;
    background: transparent;
    border: 1px solid;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .btn-xs-ghost:hover {
    background: var(--sidebar-item-hover-bg);
  }

  /* ─── Modais ─────────────────────────────────────────────────────────────── */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--bg-app) 60%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    padding: 1rem;
  }

  .modal-box {
    width: 100%;
    max-width: 440px;
    border-radius: 0.75rem;
    border: 1px solid;
    overflow: hidden;
    box-shadow: 0 20px 60px color-mix(in srgb, var(--bg-app) 50%, transparent);
  }

  .modal-box-lg {
    max-width: 580px;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid;
  }

  .modal-title {
    font-size: 1rem;
    font-weight: 600;
  }

  .modal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.375rem;
    transition: background var(--transition-fast);
  }

  .modal-close:hover {
    background: var(--sidebar-item-hover-bg);
  }

  .modal-body {
    padding: 1.25rem;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding-top: 1rem;
    margin-top: 0.25rem;
    border-top: 1px solid;
  }

  @media (max-width: 640px) {
    .modal-backdrop {
      align-items: flex-start;
      overflow-y: auto;
    }

    .modal-box {
      max-height: calc(100dvh - 2rem);
      overflow-x: hidden;
      overflow-y: auto;
    }

    .modal-footer {
      flex-direction: column-reverse;
    }

    .modal-footer button {
      width: 100%;
    }
  }

  .btn-ghost-modal {
    padding: 0.5rem 0.875rem;
    border: 1px solid;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    background: transparent;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .btn-ghost-modal:hover {
    background: var(--sidebar-item-hover-bg);
  }

  /* ─── Formulários nos modais ─────────────────────────────────────────────── */
  .form-label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.375rem;
  }

  .form-input {
    display: block;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid;
    font-size: 0.875rem;
    outline: none;
    transition: border-color var(--transition-fast);
  }

  .currency-field {
    position: relative;
  }

  .currency-prefix {
    position: absolute;
    top: 50%;
    left: 0.75rem;
    z-index: 1;
    color: var(--text-muted);
    font-size: 0.875rem;
    font-weight: 600;
    pointer-events: none;
    transform: translateY(-50%);
  }

  .currency-input {
    padding-left: 2.25rem;
  }

  .form-input:focus {
    border-color: var(--primary);
  }

  .form-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .prod-options-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    padding: 1rem;
    border-radius: 0.5rem;
    border: 1px solid;
  }

  .prod-option-label {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    cursor: pointer;
    flex: 1;
    min-width: 180px;
  }

  .option-card {
    padding: 0.75rem;
    border: 1px solid;
    border-radius: 0.5rem;
    transition: border-color var(--transition-fast), background var(--transition-fast);
  }

  .option-card:hover {
    border-color: var(--primary);
  }

  /* ─── Loading ─────────────────────────────────────────────────────────────── */
  .loading-spinner {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    border: 2px solid;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ─── Rotate para chevron ─────────────────────────────────────────────────── */
  .rotate-90 {
    transform: rotate(90deg);
  }

  /* ─── Responsividade mobile ───────────────────────────────────────────────── */
  @media (max-width: 640px) {
    .desktop-page-actions,
    .page-actions {
      display: none;
    }

    .page-header {
      align-items: stretch;
      gap: 0.875rem;
      margin-bottom: 1rem;
      padding-bottom: 0.875rem;
    }

    .page-title-block h1 {
      font-size: 1.35rem;
      line-height: 1.15;
    }

    .split-view {
      flex-direction: column;
      height: auto;
      min-height: 0;
      gap: 0.75rem;
      overflow: visible;
      border: 0;
      border-radius: 0;
      background: transparent !important;
      padding-bottom: 1rem;
    }

    .tree-panel {
      width: 100%;
      max-height: none;
      border-right: none;
      border: 1px solid var(--border-subtle);
      border-radius: 0.75rem;
      overflow: hidden;
      flex-shrink: 1;
    }

    .tree-header {
      padding: 0.75rem 0.875rem;
    }

    .mobile-category-nav {
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
      padding: 0.75rem;
      border-bottom: 1px solid var(--border-subtle);
      overflow: hidden;
    }

    .mobile-category-row,
    .mobile-subcategory-row {
      display: flex;
      gap: 0.5rem;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .mobile-category-row::-webkit-scrollbar,
    .mobile-subcategory-row::-webkit-scrollbar {
      display: none;
    }

    .mobile-category-chip,
    .mobile-subcategory-chip {
      min-height: 2.75rem;
      flex: 0 0 auto;
      padding: 0.5rem 0.875rem;
      border: 1px solid var(--border-subtle);
      border-radius: 9999px;
      background: var(--bg-card);
      color: var(--text-label);
      font-size: 0.8125rem;
      font-weight: 600;
      white-space: nowrap;
      transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
    }

    .mobile-category-chip.active,
    .mobile-subcategory-chip.active {
      border-color: var(--primary);
      background: var(--primary);
      color: var(--primary-text);
    }

    .tree-list {
      display: none;
    }

    .tree-cat-group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex: 0 0 auto;
      margin-bottom: 0;
    }

    .subcat-list {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .tree-item {
      min-height: 2.75rem;
      width: auto;
      max-width: 15rem;
      flex: 0 0 auto;
      padding: 0.625rem 0.75rem;
      border: 1px solid var(--border-subtle);
      background: var(--bg-card);
      white-space: nowrap;
    }

    .tree-item-root {
      margin-bottom: 0;
    }

    .tree-item-sub {
      padding-left: 0.75rem;
    }

    .tree-item-actions {
      display: none;
    }

    .tree-edit-form {
      width: min(18rem, calc(100vw - 3rem));
      flex: 0 0 auto;
      margin: 0;
    }

    .chevron-btn {
      min-width: 2rem;
      min-height: 2rem;
      margin-left: -0.25rem;
    }

    .sub-dot {
      margin-left: 0;
    }

    .products-panel {
      overflow: visible;
      border: 1px solid var(--border-subtle);
      border-radius: 0.75rem;
      background: var(--bg-panel);
    }

    .products-toolbar {
      align-items: stretch;
      gap: 0.75rem;
      padding: 0.875rem;
    }

    .products-toolbar > div {
      width: 100%;
    }

    .products-toolbar > div:first-child {
      order: 2;
    }

    .products-toolbar > .toolbar-controls {
      order: 1;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 2.75rem 2.75rem;
      gap: 0.5rem;
    }

    .toolbar-controls .search-wrapper {
      min-width: 0;
    }

    .toolbar-controls .filter-dropdown-wrapper,
    .toolbar-controls .sort-dropdown-wrapper {
      min-width: 0;
    }

    .toolbar-controls .filter-btn,
    .toolbar-controls .sort-btn {
      width: 100%;
      height: 2.75rem;
    }

    .sort-btn-label {
      display: none;
    }

    .view-toggle {
      display: none;
    }

    .search-wrapper {
      width: 100%;
      min-height: 2.75rem;
      padding: 0.5rem 0.75rem;
    }

    .search-input {
      width: 100%;
      min-width: 0;
      font-size: 1rem;
    }

    .filter-dropdown-wrapper {
      position: static;
    }

    .filter-btn {
      width: 2.75rem;
      height: 2.75rem;
    }

    .filter-dropdown {
      position: fixed;
      top: auto;
      right: 0.75rem;
      left: 0.75rem;
      bottom: calc(0.75rem + var(--mobile-bottom-nav-offset));
      z-index: 20;
      min-width: 0;
      border-radius: 0.75rem;
      padding: 1rem;
    }

    .sort-dropdown {
      position: fixed;
      top: auto;
      right: 0.75rem;
      bottom: calc(0.75rem + var(--mobile-bottom-nav-offset));
      left: 0.75rem;
      z-index: 20;
      min-width: 0;
      padding: 0.5rem;
      border-radius: 0.75rem;
    }

    .sort-option {
      min-height: 2.75rem;
      font-size: 0.9375rem;
    }

    .filter-option {
      min-height: 2.75rem;
      font-size: 0.9375rem;
    }

    .products-table-shell {
      overflow: visible;
    }

    .products-table {
      display: none;
    }

    .mobile-products-list {
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
      padding: 0.75rem;
      background: var(--bg-panel);
    }

    .mobile-product-card {
      border: 1px solid;
      border-radius: 0.75rem;
      background: var(--bg-card);
      padding: 0.75rem;
      transition: border-color var(--transition-fast), background var(--transition-fast);
    }

    .mobile-product-card-selected {
      border-color: var(--primary) !important;
      background: color-mix(in srgb, var(--primary) 8%, var(--bg-card));
    }

    .mobile-product-main {
      display: grid;
      grid-template-columns: 2.75rem 2.5rem minmax(0, 1fr);
      align-items: center;
      gap: 0.625rem;
    }

    .mobile-select-box {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2.75rem;
      height: 2.75rem;
    }

    .mobile-product-info {
      min-width: 0;
    }

    .mobile-product-title-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
    }

    .mobile-product-title-row h2 {
      min-width: 0;
      overflow-wrap: anywhere;
      color: var(--text-main);
      font-size: 0.9375rem;
      font-weight: 700;
      line-height: 1.2;
    }

    .mobile-product-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-top: 0.375rem;
      font-size: 0.8125rem;
      color: var(--text-muted);
    }

    .mobile-price {
      color: var(--text-label);
      font-variant-numeric: tabular-nums;
      font-weight: 700;
    }

    .mobile-product-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--border-subtle);
    }

    .mobile-status-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      min-width: 0;
    }

    .row-action-btn {
      min-width: 2.75rem;
      min-height: 2.75rem;
    }

    .mobile-edit-form {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .mobile-edit-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 0.625rem;
    }

    .mobile-edit-grid .edit-input,
    .mobile-edit-grid :global(.field-input) {
      width: 100%;
      min-height: 2.75rem;
    }

    .mobile-edit-grid .currency-field {
      width: 100%;
    }

    .mobile-edit-options {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 0.625rem;
      font-size: 0.875rem;
    }

    .mobile-edit-options label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-height: 2.5rem;
    }

    .mobile-meta-note {
      color: var(--text-muted);
      font-size: 0.8125rem;
    }

    .mobile-stock-input {
      width: 5rem;
      min-height: 2.5rem;
    }

    .mobile-card-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 0.5rem;
    }

    .mobile-card-actions button {
      min-height: 2.75rem;
      justify-content: center;
    }

    .mobile-card-actions .ask-zelinho-button {
      grid-column: 1 / -1;
    }

    .pagination {
      align-items: stretch;
      gap: 0.75rem;
      flex-direction: column;
      padding: 0.875rem;
    }

    .pagination > div {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 0.5rem;
    }

    .page-btn {
      min-height: 2.75rem;
      padding: 0.625rem 0.75rem;
    }

    .prod-avatar {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 0.5rem;
    }

    .badge-estoque,
    .badge-status,
    .badge-oculto {
      white-space: nowrap;
    }

    .mobile-create-menu {
      position: fixed;
      right: 1rem;
      bottom: calc(1rem + var(--mobile-bottom-nav-offset));
      z-index: 20;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }

    .mobile-create-options {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .mobile-create-option {
      display: inline-flex;
      align-items: center;
      gap: 0.625rem;
      min-height: 2.75rem;
      padding: 0.5rem 0.75rem 0.5rem 0.625rem;
      border: 1px solid var(--border-card);
      border-radius: 9999px;
      background: var(--bg-card);
      color: var(--text-main);
      font-size: 0.875rem;
      font-weight: 600;
      animation: create-option-in 180ms ease-out both;
    }

    .mobile-create-option:nth-child(2) {
      animation-delay: 35ms;
    }

    .mobile-create-option:nth-child(3) {
      animation-delay: 70ms;
    }

    .mobile-create-option-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 50%;
      background: color-mix(in srgb, var(--primary) 16%, transparent);
      color: var(--primary);
    }

    .mobile-create-fab {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 3.5rem;
      height: 3.5rem;
      border: 1px solid var(--primary);
      border-radius: 50%;
      background: var(--primary);
      color: var(--primary-text);
      transition: background var(--transition-fast), transform var(--transition-fast), border-color var(--transition-fast);
    }

    .mobile-create-fab:hover {
      background: var(--primary-hover);
      border-color: var(--primary-hover);
    }

    .mobile-create-fab :global(svg) {
      width: 1.5rem;
      height: 1.5rem;
      transition: transform var(--transition-fast);
    }

    .mobile-create-fab.open :global(svg) {
      transform: rotate(45deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tree-item,
    .filter-btn,
    .product-row,
    .mobile-product-card,
    .row-action-btn,
    .btn-primary,
    .btn-secondary,
    .page-btn {
      transition: none;
    }

    .loading-spinner {
      animation: none;
    }

    .mobile-create-option {
      animation: none;
      transition: none;
    }

    .mobile-create-fab :global(svg) {
      transition: none;
    }
  }
</style>

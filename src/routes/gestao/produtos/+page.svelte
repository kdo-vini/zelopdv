<script>
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import { supabase } from '$lib/supabaseClient';
  import { pdvCache } from '$lib/stores/pdvCache';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import { waitAuthReady } from '$lib/authStore';
  import { getAccessContext } from '$lib/accessControl';
  import { hasZeloMenuAccess } from '$lib/guards';
  import { publishProductsToZeloMenu, unpublishProductsFromZeloMenu } from '$lib/zelomenuPublications';
  import * as Select from '$lib/components/ui/select/index.js';
  import { Upload, Pencil, Trash2, EyeOff, Plus, SlidersHorizontal } from 'lucide-svelte';
  import ModalModificadores from '$lib/components/modals/ModalModificadores.svelte';

  // ─── State: Data ─────────────────────────────────────────────────────────────
  let categorias = [];
  let subcategorias = [];
  let produtos = [];

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
  let filterPublicados = 'all'; // 'all' | 'published' | 'unpublished'
  let showFilterDropdown = false;

  // Paginação
  let currentPage = 1;
  const ITEMS_PER_PAGE = 10;
  let sortField = 'nome';
  let sortDesc = false;

  // Seleção em massa
  let selectedItems = new Set();
  let hasMenuAccess = false;
  let publishingToMenu = false;

  // ZeloMenu publication state
  let publicacoes = new Map(); // id_produto -> { visivel_online }
  let publishingSingle = null; // id_produto being toggled
  let ownerUserId = null; // cached from getAccessContext

  // Modificadores ZeloMenu
  let modificadoresAberto = false;
  let produtoParaModificadores = null;

  function abrirModificadores(prod) {
    produtoParaModificadores = { id: prod.id, nome: prod.nome };
    modificadoresAberto = true;
  }

  // Edição inline
  let editingProdId = null;
  let editProdForm = {};

  // ─── State: Modais de Criação ────────────────────────────────────────────────
  let showCatModal = false;
  let showSubModal = false;
  let showProdModal = false;

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
      const [{ data: userData }, ctx] = await Promise.all([
        supabase.auth.getUser(),
        getAccessContext()
      ]);
      const userId = userData?.user?.id;
      const ownerId = ctx?.ownerUserId;

      ownerUserId = ownerId || null;
      hasMenuAccess = userId ? await hasZeloMenuAccess(userId) : false;

      // Reload products now that hasMenuAccess is known (loads publications)
      if (hasMenuAccess && produtos.length > 0) {
        await carregarPublicacoes();
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
      hasMenuAccess = false;
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

      await carregarPublicacoes();

      currentPage = 1;
      selectedItems = new Set();
    } finally {
      loading = false;
    }
  }

  async function carregarPublicacoes() {
    if (!hasMenuAccess || produtos.length === 0 || !ownerUserId) {
      publicacoes = new Map();
      return;
    }
    const { data: pubs } = await supabase
      .from('zelomenu_product_publications')
      .select('id_produto, visivel_online')
      .in('id_produto', produtos.map(p => p.id))
      .eq('id_usuario', ownerUserId);
    publicacoes = new Map((pubs || []).map(p => [p.id_produto, p]));
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
    if (filterPublicados === 'published') {
      list = list.filter(p => publicacoes.get(p.id)?.visivel_online === true);
    } else if (filterPublicados === 'unpublished') {
      list = list.filter(p => publicacoes.get(p.id)?.visivel_online !== true);
    }
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
    ? subcategorias.filter(s => s.id_categoria === newProdForm.id_categoria)
    : [];

  $: filteredSubcatsForEditForm = editProdForm.id_categoria
    ? subcategorias.filter(s => s.id_categoria === editProdForm.id_categoria)
    : [];

  // Determina se todos os itens selecionados estão publicados no menu
  $: selectedAllPublished = (() => {
    if (selectedItems.size === 0) return false;
    return Array.from(selectedItems).every(id => publicacoes.get(id)?.visivel_online === true);
  })();
  $: selectedAnyPublished = (() => {
    if (selectedItems.size === 0) return false;
    return Array.from(selectedItems).some(id => publicacoes.get(id)?.visivel_online === true);
  })();

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
      id_categoria: newSubForm.id_categoria,
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
    const id_usuario = userData?.user?.id ?? null;

    const payload = {
      ...newProdForm,
      id_usuario,
      id_subcategoria: newProdForm.id_subcategoria || null,
      controlar_estoque: newProdCategoriaCompartilhada ? false : newProdForm.controlar_estoque,
      estoque_atual: !newProdCategoriaCompartilhada && newProdForm.controlar_estoque ? newProdForm.estoque_atual : 0
    };

    const { error } = await supabase.from('produtos').insert(payload);
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
  }

  function iniciarEdicaoProduto(prod) {
    editingProdId = prod.id;
    editProdForm = { ...prod };
  }

  function cancelarEdicaoProduto() {
    editingProdId = null;
    editProdForm = {};
  }

  async function salvarEdicaoProduto(e) {
    e.preventDefault();
    const { error } = await supabase.from('produtos').update({
      nome: editProdForm.nome,
      preco: editProdForm.preco,
      preco_2: editProdForm.preco_2 ?? null,
      preco_3: editProdForm.preco_3 ?? null,
      id_categoria: editProdForm.id_categoria,
      id_subcategoria: editProdForm.id_subcategoria || null,
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

  async function togglePublicacaoProduto(prod) {
    if (publishingSingle) return;
    if (!ownerUserId) {
      addToast('Sua sessão expirou. Entre novamente para continuar.', 'error');
      return;
    }

    const pub = publicacoes.get(prod.id);
    const estaPublicado = pub?.visivel_online === true;

    const ok = await confirmAction(
      estaPublicado ? 'Remover do menu' : 'Publicar no menu',
      estaPublicado
        ? `Remover "${prod.nome}" do menu online? Clientes não conseguirão ver este produto.`
        : `Publicar "${prod.nome}" no menu online? Ficará visível para os clientes.`
    );
    if (!ok) return;

    publishingSingle = prod.id;
    try {
      if (estaPublicado) {
        const { error } = await supabase
          .from('zelomenu_product_publications')
          .update({ visivel_online: false })
          .eq('id_produto', prod.id)
          .eq('id_usuario', ownerUserId);
        if (error) throw error;
        // Update otimista no Map
        publicacoes.set(prod.id, { id_produto: prod.id, visivel_online: false });
        publicacoes = new Map(publicacoes);
        addToast(`"${prod.nome}" removido do menu.`, 'success');
      } else {
        const { publishedIds, failedIds } = await publishProductsToZeloMenu(supabase, {
          ownerUserId,
          productIds: [prod.id]
        });
        if (failedIds.length > 0) throw new Error('Falha ao publicar');
        // Update otimista no Map
        publicacoes.set(prod.id, { id_produto: prod.id, visivel_online: true });
        publicacoes = new Map(publicacoes);
        addToast(`"${prod.nome}" publicado no menu.`, 'success');
      }
    } catch (e) {
      addToast('Erro ao alterar publicação: ' + (e?.message || e), 'error');
      await carregarPublicacoes();
    } finally {
      publishingSingle = null;
    }
  }

  async function alterarPublicacaoEmMassa(publicar) {
    if (selectedItems.size === 0 || publishingToMenu) return;
    if (!ownerUserId) {
      addToast('Sua sessão expirou. Entre novamente para continuar.', 'error');
      return;
    }
    if (!hasMenuAccess) {
      addToast('O módulo ZeloMenu não está ativo para esta empresa.', 'warning');
      return;
    }

    const productIds = Array.from(selectedItems);
    const actionLabel = publicar ? 'Publicar no menu' : 'Remover do menu';
    const actionDesc = publicar
      ? `Publicar ${productIds.length} produto(s) selecionado(s)? Eles ficarão disponíveis no menu da empresa.`
      : `Remover ${productIds.length} produto(s) selecionado(s) do menu online?`;

    const ok = await confirmAction(actionLabel, actionDesc);
    if (!ok) return;

    publishingToMenu = true;
    try {
      if (publicar) {
        const { publishedIds, failedIds } = await publishProductsToZeloMenu(supabase, {
          ownerUserId,
          productIds
        });

        selectedItems = new Set(failedIds);

        if (failedIds.length === 0) {
          addToast(`${publishedIds.length} produto(s) publicado(s) no menu.`, 'success');
        } else if (publishedIds.length > 0) {
          addToast(
            `${publishedIds.length} produto(s) publicado(s); ${failedIds.length} não foram publicados e continuam selecionados.`,
            'warning'
          );
        } else {
          addToast('Não foi possível publicar os produtos selecionados. Tente novamente.', 'error');
        }
      } else {
        const { unpublishedIds, failedIds } = await unpublishProductsFromZeloMenu(supabase, {
          ownerUserId,
          productIds
        });

        selectedItems = new Set(failedIds);

        if (failedIds.length === 0) {
          addToast(`${unpublishedIds.length} produto(s) removido(s) do menu.`, 'success');
        } else if (unpublishedIds.length > 0) {
          addToast(
            `${unpublishedIds.length} produto(s) removido(s); ${failedIds.length} não foram alterados e continuam selecionados.`,
            'warning'
          );
        } else {
          addToast('Não foi possível alterar os produtos selecionados. Tente novamente.', 'error');
        }
      }
    } catch (error) {
      console.warn('[ZeloMenu] bulk publication failed:', error?.message);
      addToast('Não foi possível alterar os produtos selecionados. Tente novamente.', 'error');
    } finally {
      await carregarProdutos();
      publishingToMenu = false;
    }
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
    newProdForm.id_categoria = selectedCategoriaId;
    newProdForm.id_subcategoria = selectedSubcategoriaId;
    showProdModal = true;
  }

  function abrirModalSubcategoria() {
    newSubForm.id_categoria = selectedCategoriaId;
    showSubModal = true;
  }

  // Fecha dropdowns ao clicar fora
  function handleClickOutside(e) {
    if (showFilterDropdown && !e.target.closest('.filter-dropdown-wrapper')) {
      showFilterDropdown = false;
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
  <div class="page-actions">
    <button class="btn-secondary" on:click={() => showSubModal = true}>
      <Plus class="w-4 h-4" />
      <span>Nova Subcategoria</span>
    </button>
    <button class="btn-secondary" on:click={() => showCatModal = true}>
      <Plus class="w-4 h-4" />
      <span>Nova Categoria</span>
    </button>
    <button class="btn-primary" on:click={abrirModalProduto}>
      <Plus class="w-4 h-4" />
      <span>Novo Produto</span>
    </button>
  </div>
</div>

<!-- ─── Kit Páscoa Banner ─────────────────────────────────────────────────────── -->
{#if showKitPascoa}
  <div style="background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, var(--bg-panel)), color-mix(in srgb, #9B6EBF 12%, var(--bg-panel))); border: 1.5px solid color-mix(in srgb, #9B6EBF 30%, var(--border-subtle));"
       class="rounded-xl p-4 mb-4 flex items-center justify-between gap-4">
    <div>
      <p class="text-xs font-bold uppercase tracking-wider mb-0.5" style="color: #C084FC;">Especial Páscoa 2026 🥚</p>
      <p class="font-bold text-sm" style="color: var(--text-main);">Kit de categorias pronto para usar</p>
      <p class="text-xs" style="color: var(--text-muted);">Ovos de Páscoa, Trufas, Cestas, Colomba Pascal, Avulso</p>
    </div>
    <div class="flex gap-2 shrink-0">
      <button on:click={aplicarKitPascoa}
        class="px-4 py-2 rounded-lg text-sm font-bold text-white"
        style="background: linear-gradient(135deg, #9B6EBF, #6B3FA0);">
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
      <span class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">
        Categorias
      </span>
      <span class="badge-count" style="background: var(--bg-card); color: var(--text-muted); border-color: var(--border-card);">
        {categorias.length}
      </span>
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
                    {selectedCategoriaId === cat.id && selectedSubcategoriaId === null ? 'background: rgba(0,0,0,0.15); color: inherit;' : ''}">
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
            {#if hasMenuAccess}
              {#if selectedAllPublished}
                <button
                  class="bulk-action-btn"
                  on:click={() => alterarPublicacaoEmMassa(false)}
                  disabled={publishingToMenu}
                  style="background: color-mix(in srgb, var(--warning) 10%, transparent); color: var(--warning); border-color: var(--warning);"
                >
                  <EyeOff class="w-4 h-4" />
                  {publishingToMenu ? 'Alterando...' : `Despublicar (${selectedItems.size})`}
                </button>
              {:else if selectedAnyPublished}
                <button
                  class="bulk-action-btn"
                  on:click={() => alterarPublicacaoEmMassa(true)}
                  disabled={publishingToMenu}
                  style="background: color-mix(in srgb, var(--primary) 10%, transparent); color: var(--primary); border-color: var(--primary);"
                >
                  <Upload class="w-4 h-4" />
                  {publishingToMenu ? 'Alterando...' : `Publicar (${selectedItems.size})`}
                </button>
                <button
                  class="bulk-action-btn"
                  on:click={() => alterarPublicacaoEmMassa(false)}
                  disabled={publishingToMenu}
                  style="background: color-mix(in srgb, var(--warning) 10%, transparent); color: var(--warning); border-color: var(--warning);"
                >
                  <EyeOff class="w-4 h-4" />
                  {publishingToMenu ? 'Alterando...' : `Despublicar (${selectedItems.size})`}
                </button>
              {:else}
                <button
                  class="bulk-action-btn"
                  on:click={() => alterarPublicacaoEmMassa(true)}
                  disabled={publishingToMenu}
                  style="background: color-mix(in srgb, var(--primary) 10%, transparent); color: var(--primary); border-color: var(--primary);"
                >
                  <Upload class="w-4 h-4" />
                  {publishingToMenu ? 'Publicando...' : `Publicar no menu (${selectedItems.size})`}
                </button>
              {/if}
            {/if}
            <button
              class="bulk-action-btn"
              on:click={excluirEmMassa}
              disabled={publishingToMenu}
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
      <div class="flex items-center gap-2">
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
            class:filter-btn-active={filterOcultosOnly || filterEstoqueOnly || filterPublicados !== 'all'}
            on:click|stopPropagation={() => showFilterDropdown = !showFilterDropdown}
            style="border-color: var(--border-subtle); color: var(--text-muted);
              {filterOcultosOnly || filterEstoqueOnly || filterPublicados !== 'all' ? 'color: var(--primary); border-color: var(--primary);' : ''}"
            title="Filtros adicionais"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707l-6.414 6.414A1 1 0 0013 14v5a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7a1 1 0 01-.293-.707L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            {#if filterOcultosOnly || filterEstoqueOnly || filterPublicados !== 'all'}
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
              {#if hasMenuAccess}
                <div class="filter-divider" style="border-top: 1px solid var(--border-subtle); margin: 0.25rem 0;"></div>
                <span class="filter-option-label" style="color: var(--text-muted); font-size: 10px; padding: 0.25rem 0.75rem; text-transform: uppercase; letter-spacing: 0.1em;">Visível no Menu</span>
                <label class="filter-option" style="color: var(--text-label);">
                  <input type="radio" name="filterPublicados" bind:group={filterPublicados} value="all" class="themed-radio" />
                  <span>Todos</span>
                </label>
                <label class="filter-option" style="color: var(--text-label);">
                  <input type="radio" name="filterPublicados" bind:group={filterPublicados} value="published" class="themed-radio" />
                  <span>Publicados</span>
                </label>
                <label class="filter-option" style="color: var(--text-label);">
                  <input type="radio" name="filterPublicados" bind:group={filterPublicados} value="unpublished" class="themed-radio" />
                  <span>Não publicados</span>
                </label>
              {/if}
              {#if filterOcultosOnly || filterEstoqueOnly || filterPublicados !== 'all'}
                <button
                  class="text-xs mt-1 pt-2"
                  style="color: var(--primary); border-top: 1px solid var(--border-subtle); width: 100%; text-align: left;"
                  on:click={() => { filterOcultosOnly = false; filterEstoqueOnly = false; filterPublicados = 'all'; showFilterDropdown = false; }}
                >
                  Limpar filtros extras
                </button>
              {/if}
            </div>
          {/if}
        </div>
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
            {#if filterPublicados === 'published'}
              Nenhum produto publicado no menu online.
            {:else if filterPublicados === 'unpublished'}
              {#if sortedProdutos.length === 0 && produtos.length > 0}
                Todos os produtos já estão publicados no menu online!
              {:else}
                Nenhum produto cadastrado. Comece criando um produto.
              {/if}
            {:else if produtos.length > 0}
              Nenhum produto encontrado com os filtros atuais.
            {:else}
              Nenhum produto cadastrado. Comece criando um produto.
            {/if}
          </p>
          {#if selectedCategoriaId || buscaFilter || filterPublicados !== 'all'}
            <button
              class="text-xs mt-2"
              style="color: var(--primary);"
              on:click={() => { limparSelecao(); buscaFilter = ''; filterPublicados = 'all'; }}
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
                    <input
                      class="edit-input"
                      type="number"
                      step="0.01"
                      min="0"
                      bind:value={editProdForm.preco}
                      placeholder={tabelasPrecoAtivo ? nomesTabelas[0] : 'Preço'}
                      required
                      style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                    />
                    {#if tabelasPrecoAtivo}
                      <input
                        class="edit-input"
                        type="number"
                        step="0.01"
                        min="0"
                        bind:value={editProdForm.preco_2}
                        placeholder={nomesTabelas[1]}
                        style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                      />
                      <input
                        class="edit-input"
                        type="number"
                        step="0.01"
                        min="0"
                        bind:value={editProdForm.preco_3}
                        placeholder={nomesTabelas[2]}
                        style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                      />
                    {/if}
                    <Select.Root bind:value={editProdForm.id_categoria}>
                      <Select.Trigger class="field-input">
                        <Select.Value placeholder="— Categoria —" />
                      </Select.Trigger>
                      <Select.Content>
                        {#each categorias as c}
                          <Select.Item value={c.id} label={c.nome} />
                        {/each}
                      </Select.Content>
                    </Select.Root>
                    <Select.Root bind:value={editProdForm.id_subcategoria} disabled={!editProdForm.id_categoria}>
                      <Select.Trigger class="field-input">
                        <Select.Value placeholder="— Subcategoria —" />
                      </Select.Trigger>
                      <Select.Content>
                        {#each filteredSubcatsForEditForm as s}
                          <Select.Item value={s.id} label={s.nome} />
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
                      Venda por unidade
                    </label>
                  </div>

                  <div class="mobile-card-actions">
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

                    {#if hasMenuAccess}
                      {#if publicacoes.get(prod.id)?.visivel_online}
                        <button
                          class="badge-status cursor-pointer"
                          style="background: color-mix(in srgb, var(--success) 12%, transparent); color: var(--success);"
                          on:click={() => togglePublicacaoProduto(prod)}
                          disabled={publishingSingle === prod.id}
                          aria-pressed="true"
                          aria-label={'Remover "' + prod.nome + '" do menu'}
                        >
                          No menu
                        </button>
                      {:else}
                        <button
                          class="badge-status cursor-pointer"
                          style="background: color-mix(in srgb, var(--text-muted) 12%, transparent); color: var(--text-muted);"
                          on:click={() => togglePublicacaoProduto(prod)}
                          disabled={publishingSingle === prod.id}
                          aria-pressed="false"
                          aria-label={'Publicar "' + prod.nome + '" no menu'}
                        >
                          Fora do menu
                        </button>
                      {/if}
                    {/if}
                  </div>

                  <div class="row-actions">
                    {#if hasMenuAccess}
                      <button
                        class="row-action-btn"
                        title="Grupos de modificadores"
                        on:click={() => abrirModificadores(prod)}
                        style="color: var(--text-muted);"
                      >
                        <SlidersHorizontal class="w-4 h-4" />
                      </button>
                    {/if}
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
              <th class="th-cell text-center">Visível no Menu</th>
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
                        <input
                          class="edit-input w-28"
                          type="number"
                          step="0.01"
                          min="0"
                          bind:value={editProdForm.preco}
                          placeholder={tabelasPrecoAtivo ? nomesTabelas[0] : 'Preço'}
                          required
                          style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                        />
                        {#if tabelasPrecoAtivo}
                          <input
                            class="edit-input w-28"
                            type="number"
                            step="0.01"
                            min="0"
                            bind:value={editProdForm.preco_2}
                            placeholder={nomesTabelas[1]}
                            style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                          />
                          <input
                            class="edit-input w-28"
                            type="number"
                            step="0.01"
                            min="0"
                            bind:value={editProdForm.preco_3}
                            placeholder={nomesTabelas[2]}
                            style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                          />
                        {/if}
                        <Select.Root bind:value={editProdForm.id_categoria}>
                          <Select.Trigger class="field-input">
                            <Select.Value placeholder="— Categoria —" />
                          </Select.Trigger>
                          <Select.Content>
                            {#each categorias as c}
                              <Select.Item value={c.id} label={c.nome} />
                            {/each}
                          </Select.Content>
                        </Select.Root>
                        <Select.Root bind:value={editProdForm.id_subcategoria} disabled={!editProdForm.id_categoria}>
                          <Select.Trigger class="field-input">
                            <Select.Value placeholder="— Subcategoria —" />
                          </Select.Trigger>
                          <Select.Content>
                            {#each filteredSubcatsForEditForm as s}
                              <Select.Item value={s.id} label={s.nome} />
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
                            Venda por unidade
                          </label>
                        </div>
                        <div class="flex gap-2">
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

                  <!-- Visível no Menu Online -->
                  <td class="td-cell text-center">
                    {#if hasMenuAccess}
                      {#if publicacoes.has(prod.id)}
                        {#if publicacoes.get(prod.id).visivel_online}
                          <button
                            class="badge-status cursor-pointer"
                            style="background: color-mix(in srgb, var(--success) 12%, transparent); color: var(--success);"
                            on:click={() => togglePublicacaoProduto(prod)}
                            disabled={publishingSingle === prod.id}
                            title="Clique para despublicar"
                            aria-pressed="true"
                            aria-label={'Remover "' + prod.nome + '" do menu'}
                          >
                            Sim
                          </button>
                        {:else}
                          <button
                            class="badge-status cursor-pointer"
                            style="background: color-mix(in srgb, var(--text-muted) 12%, transparent); color: var(--text-muted);"
                            on:click={() => togglePublicacaoProduto(prod)}
                            disabled={publishingSingle === prod.id}
                            title="Clique para publicar"
                            aria-pressed="false"
                            aria-label={'Publicar "' + prod.nome + '" no menu'}
                          >
                            Não
                          </button>
                        {/if}
                      {:else}
                        <button
                          class="badge-status cursor-pointer"
                          style="background: color-mix(in srgb, var(--text-muted) 12%, transparent); color: var(--text-muted);"
                          on:click={() => togglePublicacaoProduto(prod)}
                          disabled={publishingSingle === prod.id}
                          title="Clique para publicar"
                          aria-pressed="false"
                          aria-label={'Publicar "' + prod.nome + '" no menu'}
                        >
                          Não
                        </button>
                      {/if}
                    {:else}
                      <span class="text-xs" style="color: var(--text-muted);">—</span>
                    {/if}
                  </td>

                  <!-- Ações -->
                  <td class="td-cell text-right">
                    <div class="row-actions">
                      {#if hasMenuAccess}
                        <button
                          class="row-action-btn"
                          title="Grupos de modificadores"
                          on:click={() => abrirModificadores(prod)}
                          style="color: var(--text-muted);"
                        >
                          <SlidersHorizontal class="w-4 h-4" />
                        </button>
                      {/if}
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
              <Select.Value placeholder="Selecione uma categoria..." />
            </Select.Trigger>
            <Select.Content>
              {#each categorias as c}
                <Select.Item value={c.id} label={c.nome} />
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
            <input
              class="form-input"
              type="number"
              step="0.01"
              min="0"
              bind:value={newProdForm.preco}
              required
              style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
            />
          </div>
          {#if tabelasPrecoAtivo}
            <div>
              <label class="form-label" style="color: var(--text-label);">Preço {nomesTabelas[1]} (R$)</label>
              <input
                class="form-input"
                type="number"
                step="0.01"
                min="0"
                bind:value={newProdForm.preco_2}
                placeholder="Opcional"
                style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
              />
            </div>
            <div>
              <label class="form-label" style="color: var(--text-label);">Preço {nomesTabelas[2]} (R$)</label>
              <input
                class="form-input"
                type="number"
                step="0.01"
                min="0"
                bind:value={newProdForm.preco_3}
                placeholder="Opcional"
                style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
              />
            </div>
          {/if}
          <div>
            <label class="form-label" style="color: var(--text-label);">Categoria</label>
            <Select.Root bind:value={newProdForm.id_categoria}>
              <Select.Trigger class="field-input">
                <Select.Value placeholder="Selecione..." />
              </Select.Trigger>
              <Select.Content>
                {#each categorias as c}
                  <Select.Item value={c.id} label={c.nome} />
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
          <div>
            <label class="form-label" style="color: var(--text-label);">Subcategoria</label>
            <Select.Root bind:value={newProdForm.id_subcategoria} disabled={!newProdForm.id_categoria}>
              <Select.Trigger class="field-input">
                <Select.Value placeholder="— Nenhuma —" />
              </Select.Trigger>
              <Select.Content>
                {#each filteredSubcatsForProdForm as s}
                  <Select.Item value={s.id} label={s.nome} />
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
              <span class="font-medium text-sm">Venda por unidade</span>
              <p class="text-xs mt-0.5" style="color: var(--text-muted);">O produto é vendido em unidades inteiras</p>
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
  bind:open={modificadoresAberto}
  produto={produtoParaModificadores}
  {ownerUserId}
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
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
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
    background: rgba(0, 0, 0, 0.6);
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
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
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

    .page-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 0.5rem;
      width: 100%;
    }

    .page-actions .btn-primary {
      grid-column: 1 / -1;
    }

    .page-actions .btn-primary,
    .page-actions .btn-secondary {
      justify-content: center;
      min-height: 2.75rem;
      width: 100%;
      padding: 0.625rem 0.75rem;
      font-size: 0.8125rem;
      white-space: nowrap;
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

    .tree-list {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 0.75rem;
      scrollbar-width: none;
    }

    .tree-list::-webkit-scrollbar {
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

    .products-toolbar > div:last-child {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 2.75rem;
      gap: 0.5rem;
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
      bottom: 0.75rem;
      z-index: 80;
      min-width: 0;
      border-radius: 0.75rem;
      padding: 1rem;
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
  }
</style>

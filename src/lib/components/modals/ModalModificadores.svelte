<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { ArrowLeft, X, ChevronRight, ChevronDown, SlidersHorizontal, Eye, Pizza, Plus, GripVertical } from 'lucide-svelte';
  import { supabase } from '$lib/supabaseClient';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import * as Select from '$lib/components/ui/select/index.js';
  import ModelSelector from './ModelSelector.svelte';
  import GroupDetailView from './GroupDetailView.svelte';
  import InlineHelper from '$lib/components/ui/InlineHelper.svelte';
  import { calcMinSel } from '$lib/modifierModels.js';

  export let open = false;
  export let produto = null;
  export let ownerUserId = '';

  const dispatch = createEventDispatcher();

  let resolvedOwnerUserId = '';
  let grupos = [];
  let carregando = false;
  let produtosCatalogo = [];
  let showAddGrupo = false;
  let salvandoGrupo = false;
  let showAddOpcao = {};
  let novaOpcao = {};
  let salvandoOpcao = {};
  let editingGrupoId = null;
  let editGrupoForm = {};
  let editingOpcaoId = null;
  let editOpcaoForm = {};

  // Navigation state
  let selectedGroup = null;
  let selectedModel = null;
  let isDesktop = false;
  let mq = null;
  let resumoSheetOpen = false;

  // New group form (model-first flow)
  let novoGrupo = {
    nome: '', tipo: 'adicional', min_selecoes: 0, max_selecoes: '',
    modo_preco: 'somar', permite_quantidade: false, maximo_por_opcao: ''
  };

  $: if (open && produto?.id) {
    abrirParaProduto();
  }

  $: if (!open) {
    resetNavigation();
  }

  function resetNavigation() {
    selectedGroup = null;
    selectedModel = null;
    showAddGrupo = false;
    editingGrupoId = null;
    editingOpcaoId = null;
    resumoSheetOpen = false;
    novoGrupo = { nome: '', tipo: 'adicional', min_selecoes: 0, max_selecoes: '', modo_preco: 'somar', permite_quantidade: false, maximo_por_opcao: '', _required: false };
  }

  function initResponsive() {
    if (typeof window === 'undefined') return;
    mq = window.matchMedia('(min-width: 1024px)');
    isDesktop = mq.matches;
    mq.addEventListener('change', onMqChange);
  }

  function destroyResponsive() {
    if (mq) mq.removeEventListener('change', onMqChange);
  }

  function onMqChange(e) {
    isDesktop = e.matches;
  }

  onMount(initResponsive);
  onDestroy(destroyResponsive);

  $: showDetailPanel = isDesktop || selectedGroup !== null || showAddGrupo;

  // --- Data operations (preserved from original) ---

  async function ensureOwnerUserId() {
    if (ownerUserId) { resolvedOwnerUserId = ownerUserId; return; }
    if (resolvedOwnerUserId) return;
    const { data } = await supabase.auth.getUser();
    resolvedOwnerUserId = data?.user?.id || '';
    if (!resolvedOwnerUserId) {
      addToast('Não foi possível identificar sua conta. Recarregue a página e tente de novo.', 'error');
    }
  }

  async function abrirParaProduto() {
    await ensureOwnerUserId();
    if (!resolvedOwnerUserId) return;
    carregarGrupos();
    carregarProdutosCatalogo();
  }

  async function carregarGrupos() {
    carregando = true;
    try {
      const { data, error } = await supabase
        .from('zelomenu_modifier_groups')
        .select('id, nome, tipo, modo_preco, min_selecoes, max_selecoes, permite_quantidade, maximo_por_opcao, ativo, ordem, zelomenu_modifier_options(id, nome, price_delta, ativo, ordem)')
        .eq('id_usuario', resolvedOwnerUserId)
        .eq('id_produto', produto.id)
        .order('ordem', { ascending: true });
      if (error) throw error;
      const optionIds = (data || []).flatMap((group) => (group.zelomenu_modifier_options || []).map((option) => option.id));
      let links = [];
      if (optionIds.length) {
        const { data: linkData, error: linkError } = await supabase
          .from('zelomenu_modifier_option_products')
          .select('id_opcao, id_produto, price_override')
          .eq('id_usuario', resolvedOwnerUserId)
          .in('id_opcao', optionIds);
        if (linkError) throw linkError;
        links = linkData || [];
      }
      const linkByOption = new Map(links.map((link) => [String(link.id_opcao), link]));
      grupos = (data || []).map(g => ({
        ...g,
        zelomenu_modifier_options: (g.zelomenu_modifier_options || []).sort((a, b) => a.ordem - b.ordem).map((option) => ({
          ...option,
          link: linkByOption.get(String(option.id)) || null
        }))
      }));
      // Sync selectedGroup if it was loaded
      if (selectedGroup) {
        const refreshed = grupos.find((g) => g.id === selectedGroup.id);
        if (refreshed) selectedGroup = refreshed;
      }
    } catch (err) {
      addToast('Erro ao carregar variações: ' + err.message, 'error');
    } finally {
      carregando = false;
    }
  }

  async function carregarProdutosCatalogo() {
    if (produtosCatalogo.length > 0) return;
    const { data, error } = await supabase
      .from('produtos')
      .select('id, nome, preco, controlar_estoque, estoque_atual')
      .eq('id_usuario', resolvedOwnerUserId)
      .order('nome', { ascending: true });
    if (!error) produtosCatalogo = data || [];
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      if (resumoSheetOpen) {
        resumoSheetOpen = false;
      } else if (selectedGroup || showAddGrupo) {
        voltarParaLista();
      } else {
        fechar();
      }
    }
  }

  // --- Navigation ---

  function abrirGrupo(grupo) {
    selectedGroup = grupo;
    editingGrupoId = null;
    editingOpcaoId = null;
  }

  function voltarParaLista() {
    selectedGroup = null;
    selectedModel = null;
    showAddGrupo = false;
    editingGrupoId = null;
    editingOpcaoId = null;
    novoGrupo = { nome: '', tipo: 'adicional', min_selecoes: 0, max_selecoes: '', modo_preco: 'somar', permite_quantidade: false, maximo_por_opcao: '', _required: false };
  }

  function iniciarNovoGrupo() {
    showAddGrupo = true;
    selectedModel = null;
    selectedGroup = null;
    novoGrupo = { nome: '', tipo: 'adicional', min_selecoes: 0, max_selecoes: '', modo_preco: 'somar', permite_quantidade: false, maximo_por_opcao: '', _required: false };
  }

  function onModelSelect(event) {
    const model = event.detail;
    if (model.compositionKind === 'pizza') {
      dispatch('pizza', { produto });
      return;
    }
    if (produto?.tipo_produto === 'pizza' && model.modo_preco === 'substituir') {
      addToast('A pizza usa preços por tamanho e sabor. Para massa, borda e extras, escolha um modelo com acréscimo.', 'warning');
      return;
    }
    selectedModel = model;
    novoGrupo.tipo = model.tipo;
    novoGrupo.modo_preco = model.modo_preco;
    novoGrupo.permite_quantidade = model.permite_quantidade;
    // Set sensible defaults per model
    if (model.modo_preco === 'substituir') {
      novoGrupo.min_selecoes = 1;
      novoGrupo.max_selecoes = '';
    } else {
      novoGrupo.min_selecoes = 0;
      novoGrupo.max_selecoes = '';
    }
  }

  // --- CRUD: Groups ---

  async function salvarGrupo() {
    if (produto?.tipo_produto === 'pizza' && novoGrupo.modo_preco === 'substituir') {
      addToast('Complementos de pizza devem somar ao preço da montagem.', 'warning'); return;
    }
    const nome = novoGrupo.nome.trim();
    if (!nome) { addToast('Nome do grupo é obrigatório.', 'warning'); return; }
    await ensureOwnerUserId();
    if (!resolvedOwnerUserId) return;
    salvandoGrupo = true;
    try {
      const minSel = calcMinSel(novoGrupo._required);
      const maxSel = novoGrupo.modo_preco === 'substituir'
        ? 1
        : (novoGrupo.permite_quantidade && Number(novoGrupo.max_selecoes) === 1
          ? null
          : (novoGrupo.max_selecoes !== '' ? Math.max(1, Number(novoGrupo.max_selecoes)) : null));
      const { error } = await supabase.from('zelomenu_modifier_groups').insert({
        id_usuario: resolvedOwnerUserId,
        id_produto: produto.id,
        nome,
        tipo: novoGrupo.tipo,
        min_selecoes: Math.min(minSel, maxSel == null ? minSel : maxSel),
        max_selecoes: maxSel,
        modo_preco: novoGrupo.modo_preco,
        permite_quantidade: novoGrupo.modo_preco === 'substituir' ? false : !!novoGrupo.permite_quantidade,
        maximo_por_opcao: novoGrupo.permite_quantidade && novoGrupo.maximo_por_opcao !== ''
          ? Math.max(1, Number(novoGrupo.maximo_por_opcao))
          : null,
        ativo: true,
        ordem: grupos.length
      });
      if (error) throw error;
      voltarParaLista();
      await carregarGrupos();
      addToast('Grupo adicionado.', 'success');
    } catch (err) {
      addToast('Erro: ' + err.message, 'error');
    } finally {
      salvandoGrupo = false;
    }
  }

  async function excluirGrupo(grupo) {
    const ok = await confirmAction('Excluir grupo', `Excluir "${grupo.nome}" e todas suas opções? Esta ação não pode ser desfeita.`);
    if (!ok) return;
    const { error } = await supabase.from('zelomenu_modifier_groups').delete().eq('id', grupo.id).eq('id_usuario', resolvedOwnerUserId);
    if (error) { addToast('Erro: ' + error.message, 'error'); return; }
    if (selectedGroup?.id === grupo.id) selectedGroup = null;
    await carregarGrupos();
    addToast('Grupo excluído.', 'success');
  }

  function iniciarEdicaoGrupo(grupo) {
    editingGrupoId = grupo.id;
    editGrupoForm = {
      nome: grupo.nome,
      tipo: grupo.tipo,
      min_selecoes: grupo.min_selecoes,
      max_selecoes: grupo.max_selecoes ?? '',
      modo_preco: grupo.modo_preco || 'somar',
      permite_quantidade: grupo.permite_quantidade === true,
      maximo_por_opcao: grupo.maximo_por_opcao ?? ''
    };
    // Convert min_selecoes to boolean for the toggle
    editGrupoForm._required = grupo.min_selecoes > 0;
  }

  async function salvarEdicaoGrupo(grupo) {
    if (produto?.tipo_produto === 'pizza' && editGrupoForm.modo_preco === 'substituir') {
      addToast('Complementos de pizza devem somar ao preço da montagem.', 'warning'); return;
    }
    const nome = String(editGrupoForm.nome || '').trim();
    if (!nome) { addToast('Nome do grupo é obrigatório.', 'warning'); return; }
    const minSel = calcMinSel(editGrupoForm._required);
    const maxSel = editGrupoForm.modo_preco === 'substituir'
      ? 1
      : (editGrupoForm.permite_quantidade && Number(editGrupoForm.max_selecoes) === 1
        ? null
        : (editGrupoForm.max_selecoes === '' ? null : Math.max(1, Number(editGrupoForm.max_selecoes))));
    const { error } = await supabase.from('zelomenu_modifier_groups').update({
      nome,
      tipo: editGrupoForm.tipo,
      min_selecoes: Math.min(minSel, maxSel == null ? minSel : maxSel),
      max_selecoes: maxSel,
      modo_preco: editGrupoForm.modo_preco,
      permite_quantidade: editGrupoForm.modo_preco === 'substituir' ? false : !!editGrupoForm.permite_quantidade,
      maximo_por_opcao: editGrupoForm.permite_quantidade && editGrupoForm.maximo_por_opcao !== ''
        ? Math.max(1, Number(editGrupoForm.maximo_por_opcao))
        : null
    }).eq('id', grupo.id).eq('id_usuario', resolvedOwnerUserId);
    if (error) { addToast('Erro: ' + error.message, 'error'); return; }
    editingGrupoId = null;
    await carregarGrupos();
    addToast('Grupo atualizado.', 'success');
  }

  async function toggleGrupoAtivo(grupo) {
    const { error } = await supabase.from('zelomenu_modifier_groups').update({ ativo: !grupo.ativo }).eq('id', grupo.id).eq('id_usuario', resolvedOwnerUserId);
    if (error) { addToast('Erro: ' + error.message, 'error'); return; }
    grupo.ativo = !grupo.ativo;
    grupos = [...grupos];
    if (selectedGroup?.id === grupo.id) selectedGroup = grupo;
  }

  async function moverGrupo(index, direction) {
    const otherIndex = index + direction;
    if (otherIndex < 0 || otherIndex >= grupos.length) return;
    const current = grupos[index];
    const other = grupos[otherIndex];
    const results = await Promise.all([
      supabase.from('zelomenu_modifier_groups').update({ ordem: other.ordem }).eq('id', current.id).eq('id_usuario', resolvedOwnerUserId),
      supabase.from('zelomenu_modifier_groups').update({ ordem: current.ordem }).eq('id', other.id).eq('id_usuario', resolvedOwnerUserId)
    ]);
    const error = results.find((result) => result.error)?.error;
    if (error) { addToast('Erro ao reordenar grupo: ' + error.message, 'error'); return; }
    await carregarGrupos();
  }

  // --- CRUD: Options ---

  function iniciarAddOpcao(grupoId) {
    showAddOpcao = { ...showAddOpcao, [grupoId]: true };
    novaOpcao = { ...novaOpcao, [grupoId]: { nome: '', price_delta: '0', id_produto: '', price_override: '' } };
  }

  async function salvarOpcao(grupo) {
    const nome = (novaOpcao[grupo.id]?.nome || '').trim();
    if (!nome) { addToast('Nome da opção é obrigatório.', 'warning'); return; }
    salvandoOpcao = { ...salvandoOpcao, [grupo.id]: true };
    try {
      const { data: option, error } = await supabase.from('zelomenu_modifier_options').insert({
        id_usuario: resolvedOwnerUserId,
        id_grupo: grupo.id,
        nome,
        price_delta: Math.max(0, Number(novaOpcao[grupo.id]?.price_delta) || 0),
        ativo: true,
        ordem: (grupo.zelomenu_modifier_options || []).length
      }).select('id').single();
      if (error) throw error;
      const linkedProductId = novaOpcao[grupo.id]?.id_produto;
      if (linkedProductId) {
        const { error: linkError } = await supabase.from('zelomenu_modifier_option_products').insert({
          id_opcao: option.id,
          id_usuario: resolvedOwnerUserId,
          id_produto: Number(linkedProductId),
          price_override: novaOpcao[grupo.id]?.price_override === ''
            ? null
            : Math.max(0, Number(novaOpcao[grupo.id]?.price_override) || 0)
        });
        if (linkError) throw linkError;
      }
      showAddOpcao = { ...showAddOpcao, [grupo.id]: false };
      await carregarGrupos();
      addToast('Opção adicionada.', 'success');
    } catch (err) {
      addToast('Erro: ' + err.message, 'error');
    } finally {
      salvandoOpcao = { ...salvandoOpcao, [grupo.id]: false };
    }
  }

  async function excluirOpcao(opcao, grupo) {
    const ok = await confirmAction('Excluir opção', `Excluir a opção "${opcao.nome}"?`);
    if (!ok) return;
    const { error } = await supabase.from('zelomenu_modifier_options').delete().eq('id', opcao.id).eq('id_usuario', resolvedOwnerUserId);
    if (error) { addToast('Erro: ' + error.message, 'error'); return; }
    grupo.zelomenu_modifier_options = grupo.zelomenu_modifier_options.filter(o => o.id !== opcao.id);
    grupos = [...grupos];
    if (selectedGroup?.id === grupo.id) selectedGroup = grupo;
    addToast('Opção excluída.', 'success');
  }

  function iniciarEdicaoOpcao(opcao) {
    editingOpcaoId = opcao.id;
    editOpcaoForm = {
      nome: opcao.nome,
      price_delta: opcao.price_delta,
      id_produto: opcao.link?.id_produto ? String(opcao.link.id_produto) : '',
      price_override: opcao.link?.price_override ?? ''
    };
  }

  async function salvarEdicaoOpcao(opcao, grupo) {
    const nome = String(editOpcaoForm.nome || '').trim();
    if (!nome) { addToast('Nome da opção é obrigatório.', 'warning'); return; }
    const { error } = await supabase.from('zelomenu_modifier_options').update({
      nome,
      price_delta: Math.max(0, Number(editOpcaoForm.price_delta) || 0)
    }).eq('id', opcao.id).eq('id_usuario', resolvedOwnerUserId);
    if (error) { addToast('Erro: ' + error.message, 'error'); return; }

    const { error: deleteLinkError } = await supabase
      .from('zelomenu_modifier_option_products')
      .delete()
      .eq('id_opcao', opcao.id)
      .eq('id_usuario', resolvedOwnerUserId);
    if (deleteLinkError) { addToast('Erro ao atualizar vínculo: ' + deleteLinkError.message, 'error'); return; }
    if (editOpcaoForm.id_produto) {
      const { error: linkError } = await supabase.from('zelomenu_modifier_option_products').insert({
        id_opcao: opcao.id,
        id_usuario: resolvedOwnerUserId,
        id_produto: Number(editOpcaoForm.id_produto),
        price_override: editOpcaoForm.price_override === '' ? null : Math.max(0, Number(editOpcaoForm.price_override) || 0)
      });
      if (linkError) { addToast('Erro ao atualizar vínculo: ' + linkError.message, 'error'); return; }
    }
    editingOpcaoId = null;
    await carregarGrupos();
    addToast('Opção atualizada.', 'success');
  }

  async function moverOpcao(grupo, index, direction) {
    const options = grupo.zelomenu_modifier_options || [];
    const otherIndex = index + direction;
    if (otherIndex < 0 || otherIndex >= options.length) return;
    const current = options[index];
    const other = options[otherIndex];
    const results = await Promise.all([
      supabase.from('zelomenu_modifier_options').update({ ordem: other.ordem }).eq('id', current.id).eq('id_usuario', resolvedOwnerUserId),
      supabase.from('zelomenu_modifier_options').update({ ordem: current.ordem }).eq('id', other.id).eq('id_usuario', resolvedOwnerUserId)
    ]);
    const error = results.find((result) => result.error)?.error;
    if (error) { addToast('Erro ao reordenar opção: ' + error.message, 'error'); return; }
    await carregarGrupos();
  }

  async function toggleOpcaoAtiva(opcao, grupo) {
    const { error } = await supabase.from('zelomenu_modifier_options').update({ ativo: !opcao.ativo }).eq('id', opcao.id).eq('id_usuario', resolvedOwnerUserId);
    if (error) { addToast('Erro: ' + error.message, 'error'); return; }
    opcao.ativo = !opcao.ativo;
    grupos = [...grupos];
    if (selectedGroup?.id === grupo.id) selectedGroup = grupo;
  }

  function fechar() {
    dispatch('close');
    grupos = [];
    resetNavigation();
    showAddOpcao = {};
    novaOpcao = {};
    editGrupoForm = {};
    editOpcaoForm = {};
  }

  // --- Helpers ---

  function tipoLabel(tipo) {
    return tipo === 'variacao' ? 'Variação' : 'Adicional';
  }

  function formatDelta(val) {
    const n = Number(val || 0);
    if (n === 0) return 'Grátis';
    return '+R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  function grupoStatusLabel(grp) {
    return grp.min_selecoes > 0 ? 'Obrigatório' : 'Opcional';
  }

  function grupoPricingLabel(grp) {
    if (grp.modo_preco === 'substituir') return 'Troca o preço';
    return 'Soma ao preço';
  }

  function modeloLabel(tipo, modoPreco) {
    if (tipo === 'variacao' && modoPreco === 'substituir') return 'Troca o preço';
    if (tipo === 'adicional' && modoPreco === 'somar') return 'Soma ao preço';
    return 'Config. personalizada';
  }

  $: gruposAtivos = grupos.filter((g) => g.ativo !== false);
  $: totalOpcoes = gruposAtivos.reduce((sum, g) => sum + (g.zelomenu_modifier_options?.length || 0), 0);

  // Event forwarding from GroupDetailView
  function handleGDEvent(name, detail) {
    switch (name) {
      case 'editGrupo': iniciarEdicaoGrupo(detail); break;
      case 'iniciarAddOpcao': iniciarAddOpcao(detail); break;
      case 'salvarOpcao': salvarOpcao(detail); break;
      case 'cancelarAddOpcao': showAddOpcao = { ...showAddOpcao, [detail]: false }; break;
      case 'excluirOpcao': excluirOpcao(detail.opcao, detail.grupo); break;
      case 'iniciarEdicaoOpcao': iniciarEdicaoOpcao(detail); break;
      case 'salvarEdicaoOpcao': salvarEdicaoOpcao(detail.opcao, detail.grupo); break;
      case 'cancelarEdicaoOpcao': editingOpcaoId = null; break;
      case 'moverOpcao': moverOpcao(detail.grupo, detail.index, detail.direction); break;
      case 'toggleOpcaoAtiva': toggleOpcaoAtiva(detail.opcao, detail.grupo); break;
    }
  }
</script>

{#if open}
  <div
    class="overlay"
    role="button"
    tabindex="0"
    aria-label="Fechar complementos e opções"
    on:click|self={fechar}
    on:keydown={handleKeydown}
  >
    <div class="modal" class:desktop={isDesktop} class:creating={showAddGrupo} role="dialog" aria-modal="true" aria-label="Complementos e opções de {produto?.nome}">

      <!-- Header (shared) -->
      <div class="modal-head">
        <div class="head-left">
          {#if !isDesktop && showDetailPanel}
            <button type="button" class="back-btn" on:click={voltarParaLista} aria-label="Voltar para a lista">
              <ArrowLeft size={18} />
            </button>
          {/if}
          <div>
            <p class="eyebrow">Complementos e opções</p>
            <h2 class="modal-title">{showAddGrupo ? 'Adicionar grupo' : selectedGroup ? selectedGroup.nome : 'Complementos e opções'}</h2>
            {#if produto?.nome}
              <p class="modal-context">{produto.nome}</p>
            {/if}
          </div>
        </div>
        <button type="button" class="close-btn" on:click={fechar} aria-label="Fechar">
          <X size={18} />
        </button>
      </div>

      <div class="modal-content" class:split={isDesktop}>
        <!-- LIST PANEL -->
        <div class="list-panel" class:hidden={!isDesktop && showDetailPanel}>
          <div class="list-body">
            {#if produto?.tipo_produto === 'pizza'}
              <button type="button" class="composition-row" on:click={() => dispatch('pizza', { produto })}>
                <span class="composition-icon" aria-hidden="true"><Pizza size={20} /></span>
                <span class="composition-copy">
                  <strong>Montagem da pizza</strong>
                  <span>Edite tamanhos, sabores e preços.</span>
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            {/if}
            {#if !showAddGrupo}
              <p class="list-subtitle">Gerencie os grupos que o cliente verá para montar este produto.</p>
            {/if}
            {#if !showAddGrupo}
              <button type="button" class="btn-add-grupo" on:click={iniciarNovoGrupo}>
                <Plus size={17} strokeWidth={2.4} />
                <span>Adicionar grupo</span>
              </button>
            {/if}
            {#if carregando}
              <p class="empty-msg">Carregando...</p>

            {:else if grupos.length === 0 && !showAddGrupo}
              <div class="empty-state">
                <SlidersHorizontal size={32} class="empty-ico" />
                <p>Nenhum grupo de complementos cadastrado.</p>
                <p class="empty-sub">Exemplos: "Tamanho", "Calda", "Ponto da carne"</p>
              </div>

            {:else}
              <div class="grupos-list">
                {#each grupos as grupo, grupoIndex (grupo.id)}
                  <button
                    type="button"
                    class="grupo-row"
                    class:inativo={!grupo.ativo}
                    class:selected={selectedGroup?.id === grupo.id}
                    on:click={() => abrirGrupo(grupo)}
                  >
                    <span class="grupo-row-grip" aria-hidden="true"><GripVertical size={17} /></span>
                    <div class="grupo-row-info">
                      <span class="grupo-row-nome">{grupo.nome}</span>
                      <div class="grupo-row-tags">
                        <span class="tag-mini" class:required={grupo.min_selecoes > 0}>{grupoStatusLabel(grupo)}</span>
                        <span class="tag-mini pricing">{grupoPricingLabel(grupo)}</span>
                      </div>
                    </div>
                    <span class="grupo-row-end">
                      <span class="grupo-row-count">{(grupo.zelomenu_modifier_options || []).length} opções</span>
                      <ChevronRight class="grupo-row-chevron" size={17} />
                    </span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Summary bar (list panel only, never in detail) -->
          {#if grupos.length > 0 && !showAddGrupo}
            <button type="button" class="summary-bar" on:click={() => resumoSheetOpen = true}>
              <span class="summary-icon"><SlidersHorizontal size={18} /></span>
              <span class="summary-copy">
                <span class="summary-text">{grupos.length} {grupos.length === 1 ? 'grupo configurado' : 'grupos configurados'}</span>
                <span class="summary-cta"><Eye size={13} /> Ver como fica para o cliente</span>
              </span>
              <ChevronDown size={17} class="summary-chevron" />
            </button>
          {/if}

        </div>

        <!-- DETAIL PANEL (always rendered, visibility via CSS) -->
        <div class="detail-panel" class:show={showDetailPanel}>
          {#if showAddGrupo}
            <!-- New group creation -->
            <div class="detail-body">
              {#if !selectedModel}
                <!-- Step 1: Name + Model selection -->
                <div class="detail-section">
                  <p class="section-title">Grupo de complementos</p>
                  <p class="section-description">Defina um nome e escolha o modelo que melhor descreve como este grupo funciona.</p>
                  <label class="field-label" for="novo-grupo-nome">Nome do grupo</label>
                  <input
                    id="novo-grupo-nome"
                    class="fi"
                    placeholder="Ex.: Tamanho, Caldas, Ponto da carne"
                    bind:value={novoGrupo.nome}
                    aria-label="Nome do grupo"
                  />
                </div>
                <div class="detail-section">
                  <div>
                    <p class="section-subtitle">Como este grupo funciona?</p>
                    <p class="section-description">Escolha o modelo que melhor descreve o resultado para o cliente.</p>
                  </div>
                  <ModelSelector productName={produto?.nome || 'Produto'} showPizza={produto?.tipo_produto !== 'pizza'} on:select={onModelSelect} />
                </div>
              {:else}
                <!-- Step 2: Model selected, show settings -->
                <div class="detail-section">
                  <label class="field-label" for="novo-grupo-nome">Nome do grupo</label>
                  <input
                    id="novo-grupo-nome"
                    class="fi"
                    placeholder="Ex.: Tamanho, Caldas, Ponto da carne"
                    bind:value={novoGrupo.nome}
                    aria-label="Nome do grupo"
                  />
                </div>

                <div class="detail-section">
                  <div class="model-selected-card">
                    <span class="model-selected-icon" aria-hidden="true"><svelte:component this={selectedModel.icon} size={21} strokeWidth={1.8} /></span>
                    <span class="model-selected-copy">
                      <span class="model-selected-label">{selectedModel.label}</span>
                      <span class="model-selected-description">{selectedModel.description}</span>
                    </span>
                    <button type="button" class="link-btn" on:click={() => { selectedModel = null; novoGrupo.tipo = 'adicional'; novoGrupo.modo_preco = 'somar'; novoGrupo.permite_quantidade = false; }}>Trocar</button>
                  </div>
                </div>

                <div class="detail-section">
                  <p class="section-subtitle">Configurações</p>
                  <div class="settings-grid">
                    {#if novoGrupo.modo_preco === 'substituir'}
                      <label class="toggle-field">
                        <input type="checkbox" class="themed-checkbox" bind:checked={novoGrupo._required} />
                        Obrigatório (cliente deve escolher)
                      </label>
                    {:else}
                      <label class="toggle-field">
                        <input type="checkbox" class="themed-checkbox" bind:checked={novoGrupo._required} />
                        Obrigatório
                      </label>
                      <div class="field-group">
                        <label class="fl" for="novo-max-sel">Quantas opções o cliente pode escolher?</label>
                        <input id="novo-max-sel" class="fi fi-sm" type="number" min="1" placeholder="Sem limite" bind:value={novoGrupo.max_selecoes} />
                      </div>
                    {/if}

                    {#if novoGrupo.permite_quantidade}
                      <div class="field-group">
                        <label class="fl" for="novo-max-opcao">Máximo por opção</label>
                        <input id="novo-max-opcao" class="fi fi-sm" type="number" min="1" placeholder="Sem limite" bind:value={novoGrupo.maximo_por_opcao} />
                      </div>
                    {/if}
                  </div>
                </div>

                <!-- Advanced settings link -->
                <div class="detail-section">
                  <details class="advanced-details">
                    <summary class="advanced-toggle">Configurações avançadas</summary>
                    <div class="advanced-grid">
                      <Select.Root bind:value={novoGrupo.tipo}>
                        <Select.Trigger class="fi" aria-label="Tipo do grupo">
                          <span class="select-value-label">{novoGrupo.tipo === 'variacao' ? 'Variação' : 'Adicional'}</span>
                        </Select.Trigger>
                        <Select.Content>
                          <Select.Item value="adicional" label="Adicional" />
                          <Select.Item value="variacao" label="Variação" />
                        </Select.Content>
                      </Select.Root>
                      <Select.Root bind:value={novoGrupo.modo_preco}>
                        <Select.Trigger class="fi" aria-label="Modo de preço">
                          <span class="select-value-label">{novoGrupo.modo_preco === 'substituir' ? 'Preço da opção' : 'Acréscimo'}</span>
                        </Select.Trigger>
                        <Select.Content>
                          <Select.Item value="somar" label="Acréscimo" />
                          <Select.Item value="substituir" label="Preço da opção" />
                        </Select.Content>
                      </Select.Root>
                      <div class="field-group">
                        <label class="fl" for="adv-min">Mín. escolhas</label>
                        <input id="adv-min" class="fi fi-sm" type="number" min="0" bind:value={novoGrupo.min_selecoes} />
                      </div>
                      <div class="field-group">
                        <label class="fl" for="adv-max">Máx. escolhas</label>
                        <input id="adv-max" class="fi fi-sm" type="number" min="1" placeholder="ilimitado" bind:value={novoGrupo.max_selecoes} />
                      </div>
                      <label class="toggle-field">
                        <input type="checkbox" class="themed-checkbox" bind:checked={novoGrupo.permite_quantidade} disabled={novoGrupo.modo_preco === 'substituir'} aria-describedby={novoGrupo.modo_preco === 'substituir' ? 'repeat-blocked-hint' : undefined} />
                        Permitir repetir
                      </label>
                      {#if novoGrupo.modo_preco === 'substituir'}
                        <InlineHelper id="repeat-blocked-hint" compact message="Este modelo troca o preço e aceita uma opção; repetir não se aplica." />
                      {/if}
                    </div>
                  </details>
                </div>
              {/if}
            </div>

            <!-- Footer for new group -->
            <div class="detail-footer" class:has-validation={!novoGrupo.nome.trim()}>
              {#if !novoGrupo.nome.trim()}
                <InlineHelper id="novo-grupo-save-hint" message="Informe um nome para habilitar o salvamento deste grupo." />
              {/if}
              <div class="detail-footer-actions">
              <button type="button" class="btn-sm-p" on:click={salvarGrupo} disabled={salvandoGrupo || !novoGrupo.nome.trim()} aria-describedby={!novoGrupo.nome.trim() ? 'novo-grupo-save-hint' : undefined}>
                {salvandoGrupo ? 'Salvando…' : 'Salvar grupo'}
              </button>
              <button type="button" class="btn-sm-g" on:click={voltarParaLista}>Cancelar</button>
              </div>
            </div>

          {:else if selectedGroup}
            <!-- Existing group detail -->
            <div class="detail-body">
              <GroupDetailView
                grupo={selectedGroup}
                {produtosCatalogo}
                {editingGrupoId}
                {editGrupoForm}
                {showAddOpcao}
                {novaOpcao}
                {salvandoOpcao}
                {editingOpcaoId}
                {editOpcaoForm}
                on:editGrupo={(e) => iniciarEdicaoGrupo(e.detail)}
                on:iniciarAddOpcao={(e) => iniciarAddOpcao(e.detail)}
                on:salvarOpcao={(e) => salvarOpcao(e.detail)}
                on:cancelarAddOpcao={(e) => showAddOpcao = { ...showAddOpcao, [e.detail]: false }}
                on:excluirOpcao={(e) => excluirOpcao(e.detail.opcao, e.detail.grupo)}
                on:iniciarEdicaoOpcao={(e) => iniciarEdicaoOpcao(e.detail)}
                on:salvarEdicaoOpcao={(e) => salvarEdicaoOpcao(e.detail.opcao, e.detail.grupo)}
                on:cancelarEdicaoOpcao={() => editingOpcaoId = null}
                on:moverOpcao={(e) => moverOpcao(e.detail.grupo, e.detail.index, e.detail.direction)}
                on:toggleOpcaoAtiva={(e) => toggleOpcaoAtiva(e.detail.opcao, e.detail.grupo)}
              />
            </div>

            <!-- Footer for existing group -->
            <div class="detail-footer">
              {#if editingGrupoId === selectedGroup.id}
                <button type="button" class="btn-sm-p" on:click={() => salvarEdicaoGrupo(selectedGroup)}>Salvar</button>
                <button type="button" class="btn-sm-g" on:click={() => editingGrupoId = null}>Cancelar</button>
              {:else}
                <div class="detail-footer-actions">
                  <button type="button" class="toggle-btn" class:ativo={selectedGroup.ativo} on:click={() => toggleGrupoAtivo(selectedGroup)}>
                    {selectedGroup.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                  <button type="button" class="btn-sm-g danger" on:click={() => excluirGrupo(selectedGroup)}>Excluir</button>
                </div>
              {/if}
            </div>
          {:else}
            <!-- Empty detail (desktop only, no group selected) -->
            <div class="detail-empty">
              <p>Selecione um grupo na lista ao lado</p>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  {#if resumoSheetOpen}
    <div
      class="resumo-sheet-overlay"
      role="button"
      tabindex="0"
      aria-label="Fechar prévia"
      on:click|self={() => resumoSheetOpen = false}
      on:keydown={handleKeydown}
    >
      <div class="resumo-sheet" role="dialog" aria-modal="true" aria-label="Como fica para o cliente">
        <div class="resumo-sheet-handle"></div>
        <div class="resumo-sheet-head">
          <h3>Como fica para o cliente</h3>
          <span class="resumo-sheet-count">{grupos.length} {grupos.length === 1 ? 'grupo' : 'grupos'}</span>
        </div>
        <div class="resumo-sheet-list">
          {#each gruposAtivos as grupo (grupo.id)}
            <div class="resumo-sheet-item">
              <div class="resumo-sheet-item-head">
                <span class="resumo-sheet-item-nome">{grupo.nome}</span>
                <span class="tag-mini count">{(grupo.zelomenu_modifier_options || []).length} opções</span>
              </div>
              <div class="grupo-row-tags">
                <span class="tag-mini" class:required={grupo.min_selecoes > 0}>{grupoStatusLabel(grupo)}</span>
                <span class="tag-mini pricing">{grupoPricingLabel(grupo)}</span>
              </div>
            </div>
          {:else}
            <p class="resumo-sheet-empty">Nenhum grupo ativo ainda — o cliente vai ver este produto sem opções pra montar.</p>
          {/each}
        </div>
        <p class="resumo-sheet-hint"><Eye size={13} /> Essa é uma prévia de como o cliente verá e montará este produto.</p>
        <button type="button" class="sheet-cancel" on:click={() => resumoSheetOpen = false}>Fechar</button>
      </div>
    </div>
  {/if}
{/if}

<style>
  .overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(4px);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .modal {
    background: var(--bg-panel);
    border: 1px solid var(--border-card);
    border-radius: 14px;
    width: 100%;
    max-width: 600px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    box-shadow: var(--shadow-modal);
  }

  .modal.desktop {
    max-width: 960px;
  }

  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .head-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .back-btn {
    width: 44px; height: 44px;
    display: flex; align-items: center; justify-content: center;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    color: var(--text-muted);
    cursor: pointer;
    flex-shrink: 0;
    transition: background 120ms, color 120ms;
  }
  .back-btn:hover { background: var(--bg-panel); color: var(--text-main); }

  .eyebrow {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--accent);
    margin: 0 0 2px;
  }

  .modal-title {
    font-size: 1rem;
    font-weight: 800;
    color: var(--text-main);
    margin: 0;
  }

  .close-btn {
    width: 44px; height: 44px;
    display: flex; align-items: center; justify-content: center;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    color: var(--text-muted);
    cursor: pointer;
    flex-shrink: 0;
    transition: background 120ms, color 120ms;
  }
  .close-btn:hover { background: var(--bg-panel); color: var(--text-main); }

  .list-subtitle {
    margin: 0 0 12px;
    color: var(--text-muted);
    font-size: 0.78rem;
    line-height: 1.4;
  }

  .composition-row {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) 20px;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 68px;
    margin-bottom: 14px;
    padding: 12px;
    color: var(--text-main);
    text-align: left;
    background: var(--accent-light);
    border: 1px solid var(--primary);
    border-radius: 8px;
  }

  .composition-row:hover { background: color-mix(in srgb, var(--primary) 16%, var(--bg-card)); }
  .composition-row:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

  .composition-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    color: var(--primary);
    background: var(--bg-card);
    border-radius: 8px;
  }

  .composition-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .composition-copy strong { font-size: 0.875rem; }
  .composition-copy span { color: var(--text-muted); font-size: 0.875rem; line-height: 1.4; }

  /* --- Content layout --- */

  .modal-content {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
    max-width: none;
  }

  .modal-content.split {
    flex-direction: row;
  }

  /* --- List panel --- */

  .list-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .list-panel.hidden {
    display: none;
  }

  .detail-panel:not(.show) {
    display: none;
  }

  .split .list-panel {
    border-right: 1px solid var(--border-subtle);
    max-width: 400px;
    flex: 0 0 400px;
  }

  .list-body {
    flex: 1;
    overflow-y: auto;
    padding: 14px 16px;
  }

  .empty-msg { color: var(--text-muted); text-align: center; padding: 20px 0; margin: 0; }

  .empty-state {
    text-align: center;
    padding: 32px 16px;
    border: 1px dashed var(--border-subtle);
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  :global(.empty-ico) { color: var(--text-muted); opacity: 0.5; }
  .empty-state p { color: var(--text-muted); margin: 0; font-size: 0.9rem; }
  .empty-sub { font-size: 0.78rem !important; }

  .grupos-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .grupo-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 14px;
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 10px;
    cursor: pointer;
    text-align: left;
    width: 100%;
    color: var(--text-main);
    font-family: inherit;
    transition: border-color 120ms, background 120ms;
  }
  .grupo-row:hover { border-color: var(--primary); }
  .grupo-row.selected { border-color: var(--primary); background: var(--accent-light); }
  .grupo-row.inativo { opacity: 0.5; }

  .grupo-row-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    flex: 1;
  }

  .grupo-row-nome {
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-main);
  }

  .grupo-row-tags {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }

  .tag-mini {
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 1px 6px;
    border-radius: 3px;
    white-space: nowrap;
    background: var(--bg-input);
    color: var(--text-label);
    border: 1px solid var(--border-subtle);
  }
  .tag-mini.required {
    background: color-mix(in srgb, var(--primary) 16%, transparent);
    color: var(--primary);
    border-color: transparent;
  }
  .tag-mini.pricing {
    background: var(--status-success-bg);
    color: var(--status-success-text);
    border-color: transparent;
  }
  .tag-mini.count {
    color: var(--text-muted);
  }

  :global(.grupo-row-chevron) {
    color: var(--text-muted);
    opacity: 0.4;
    flex-shrink: 0;
  }

  .summary-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    padding: 10px 16px;
    min-height: 44px;
    border: none;
    border-top: 1px solid var(--border-subtle);
    background: var(--bg-panel);
    color: inherit;
    font-family: inherit;
    cursor: pointer;
    flex-shrink: 0;
    text-align: left;
    transition: background 120ms;
  }
  .summary-bar:hover { background: var(--bg-input); }

  .summary-text {
    font-size: 0.72rem;
    color: var(--text-muted);
  }

  .summary-cta {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    font-size: 0.74rem;
    font-weight: 700;
    color: var(--primary);
    white-space: nowrap;
  }

  .btn-add-grupo {
    font-size: 0.84rem;
    font-weight: 700;
    color: var(--primary);
    background: var(--accent-light);
    border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
    border-radius: 8px;
    padding: 8px 14px;
    cursor: pointer;
    transition: background 120ms;
    width: 100%;
    font-family: inherit;
  }
  .btn-add-grupo:hover { background: color-mix(in srgb, var(--primary) 15%, transparent); }

  /* --- Detail panel --- */

  .detail-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .detail-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .detail-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .detail-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
  }
  .detail-empty p {
    color: var(--text-muted);
    font-size: 0.85rem;
    margin: 0;
  }

  .detail-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--border-subtle);
    background: var(--bg-panel);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .detail-footer-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  .section-title {
    font-size: 0.92rem;
    font-weight: 800;
    color: var(--text-main);
    margin: 0;
  }

  .section-subtitle {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-label);
    margin: 0;
  }

  /* --- New group form --- */

  .model-selected-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 12px 14px;
    background: var(--accent-light);
    border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
    border-radius: 10px;
  }

  .model-selected-label {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--primary);
  }

  .link-btn {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--accent);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    font-family: inherit;
  }
  .link-btn:hover { text-decoration: underline; }

  .settings-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .toggle-field {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--text-label);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .fl {
    font-size: 0.62rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-muted);
  }

  .fi {
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 0.84rem;
    color: var(--text-main);
    outline: none;
    transition: border-color 120ms;
    width: 100%;
    font-family: inherit;
  }
  .fi:focus { border-color: var(--primary); }
  .fi.fi-sm { width: 7rem; }

  .toggle-btn {
    min-height: 44px;
    font-size: 0.68rem;
    font-weight: 700;
    padding: 3px 12px;
    border-radius: 6px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-input);
    color: var(--text-muted);
    cursor: pointer;
    transition: background 120ms, color 120ms, border-color 120ms;
    white-space: nowrap;
    font-family: inherit;
  }
  .toggle-btn.ativo {
    background: var(--status-success-bg);
    color: var(--status-success-text);
    border-color: var(--status-success-border);
  }

  .btn-sm-p {
    min-height: 44px;
    font-size: 0.78rem;
    font-weight: 700;
    background: var(--primary);
    color: var(--primary-text);
    border: none;
    border-radius: 6px;
    padding: 6px 14px;
    cursor: pointer;
    transition: background 120ms;
    white-space: nowrap;
    font-family: inherit;
  }
  .btn-sm-p:hover:not(:disabled) { background: var(--primary-hover); }
  .btn-sm-p:disabled { opacity: 0.6; cursor: not-allowed; }

  .btn-sm-g {
    min-height: 44px;
    font-size: 0.78rem;
    font-weight: 600;
    background: none;
    color: var(--text-muted);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 6px 12px;
    cursor: pointer;
    transition: background 120ms, color 120ms;
    white-space: nowrap;
    font-family: inherit;
  }
  .btn-sm-g:hover { background: var(--bg-input); color: var(--text-main); }
  .btn-sm-g.danger { color: var(--error); border-color: rgba(239,68,68,0.3); }
  .btn-sm-g.danger:hover { background: rgba(239,68,68,0.1); }

  .advanced-details {
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 10px 14px;
  }

  .advanced-toggle {
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0;
  }
  .advanced-toggle:hover { color: var(--text-label); }

  .advanced-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
  }

  /* --- Mobile full-screen transitions --- */

  @media (max-width: 1023px) {
    .modal {
      max-width: 100%;
      max-height: 100vh;
      height: 100vh;
      border-radius: 0;
    }

    .list-panel,
    .detail-panel {
      position: absolute;
      inset: 0;
      background: var(--bg-panel);
      transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
    }

    .list-panel {
      z-index: 1;
    }

    .list-panel.hidden {
      display: block;
      transform: translateX(-100%);
      pointer-events: none;
    }

    .detail-panel:not(.show) {
      display: block;
      transform: translateX(100%);
      pointer-events: none;
    }

    .detail-panel.show {
      z-index: 2;
    }
  }

  /* --- Responsive tweaks --- */

  @media (max-width: 640px) {
    .grupo-row { padding: 10px 12px; }
    .grupo-row-tags { gap: 3px; }
    .detail-body { padding: 14px 16px; }
    .detail-footer { padding: 10px 16px; }
  }

  /* --- Resumo bottom sheet ("Ver como fica") --- */

  .resumo-sheet-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 200;
    animation: resumo-fade 160ms ease-out;
  }

  @keyframes resumo-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .resumo-sheet {
    width: 100%;
    max-width: 420px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-panel);
    border-radius: 14px 14px 0 0;
    padding: 0.625rem 1rem 1.25rem;
    animation: resumo-slide-up 220ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  @keyframes resumo-slide-up {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .resumo-sheet-handle {
    width: 32px;
    height: 3px;
    background: var(--border-subtle);
    border-radius: 2px;
    margin: 0 auto 0.75rem;
    flex-shrink: 0;
  }

  .resumo-sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
    flex-shrink: 0;
  }
  .resumo-sheet-head h3 {
    margin: 0;
    font-size: 0.98rem;
    font-weight: 700;
    color: var(--text-main);
  }
  .resumo-sheet-count {
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--text-muted);
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: 999px;
    padding: 2px 9px;
    white-space: nowrap;
  }

  .resumo-sheet-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    min-height: 0;
  }

  .resumo-sheet-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 10px;
  }
  .resumo-sheet-item-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .resumo-sheet-item-nome {
    font-size: 0.86rem;
    font-weight: 700;
    color: var(--text-main);
  }

  .resumo-sheet-empty {
    color: var(--text-muted);
    text-align: center;
    padding: 20px 0;
    margin: 0;
    font-size: 0.86rem;
  }

  .resumo-sheet-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 12px 0 0;
    color: var(--text-muted);
    font-size: 0.72rem;
    line-height: 1.4;
    flex-shrink: 0;
  }
  .resumo-sheet-hint :global(svg) { flex-shrink: 0; }

  .sheet-cancel {
    margin-top: 12px;
    width: 100%;
    min-height: 44px;
    font-size: 0.86rem;
    font-weight: 700;
    background: var(--bg-input);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    cursor: pointer;
    transition: background 120ms;
    font-family: inherit;
    flex-shrink: 0;
  }
  .sheet-cancel:hover { background: var(--bg-card); }

  @media (prefers-reduced-motion: reduce) {
    .close-btn, .grupo-row, .back-btn, .toggle-btn, .btn-sm-p, .btn-sm-g,
    .btn-add-grupo, .fi, .detail-panel, .list-panel,
    .resumo-sheet-overlay, .resumo-sheet, .sheet-cancel {
      transition: none;
      animation: none;
    }
  }

  /* Tier S visual pass: compact hierarchy, quiet surfaces and clear actions. */
  .overlay {
    background: color-mix(in srgb, var(--bg-page) 74%, transparent);
    padding: 24px;
  }

  .modal {
    width: 100%;
    max-width: 680px;
    max-height: min(760px, calc(100vh - 48px));
    background: var(--bg-panel);
    border-color: var(--border-card);
    border-radius: 14px;
  }

  .modal.desktop {
    width: min(1180px, calc(100vw - 48px));
    max-width: none;
    height: min(760px, calc(100vh - 48px));
    max-height: calc(100vh - 48px);
  }

  .modal-head {
    min-height: 76px;
    padding: 16px 20px 14px;
    background: var(--bg-panel);
    border-bottom-color: var(--border-card);
  }

  .head-left { gap: 12px; }

  .modal-title {
    font-size: clamp(1.02rem, 1.7vw, 1.18rem);
    letter-spacing: -0.015em;
  }

  .modal-context {
    margin: 3px 0 0;
    color: var(--text-muted);
    font-size: 0.72rem;
    line-height: 1.3;
  }

  .eyebrow {
    margin-bottom: 3px;
    color: var(--text-label);
    font-size: 0.7rem;
    letter-spacing: 0.04em;
  }

  .back-btn,
  .close-btn {
    width: 44px;
    height: 44px;
    background: transparent;
    border-color: transparent;
    color: var(--text-label);
  }

  .back-btn:hover,
  .close-btn:hover {
    background: var(--bg-input);
    color: var(--text-main);
  }

  .modal-content.split { flex-direction: row; }

  .split .list-panel {
    max-width: none;
    flex: 0 0 45%;
    border-right-color: var(--border-card);
  }

  .list-body {
    padding: 18px 18px 16px;
  }

  .list-subtitle {
    max-width: 36rem;
    margin-bottom: 14px;
    font-size: 0.78rem;
    line-height: 1.45;
  }

  .btn-add-grupo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    margin-bottom: 18px;
    padding: 9px 14px;
    color: var(--primary-text);
    background: var(--primary);
    border: 1px solid var(--primary);
    border-radius: 6px;
    font-size: 0.82rem;
  }

  .btn-add-grupo:hover {
    color: var(--primary-text);
    background: var(--primary-hover);
  }

  .grupos-list { gap: 8px; }

  .grupo-row {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    min-height: 64px;
    padding: 10px 12px;
    border-radius: 7px;
    background: color-mix(in srgb, var(--bg-card) 86%, var(--bg-panel));
  }

  .grupo-row:hover,
  .grupo-row.selected {
    background: var(--accent-light);
    border-color: var(--primary);
  }

  .grupo-row:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }

  .grupo-row-grip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    opacity: 0.8;
  }

  .grupo-row-info { gap: 6px; }

  .grupo-row-nome {
    font-size: 0.86rem;
    font-weight: 750;
  }

  .grupo-row-tags { gap: 5px; }

  .tag-mini {
    padding: 3px 7px;
    border-radius: 4px;
    font-size: 0.62rem;
    font-weight: 650;
    letter-spacing: 0;
    text-transform: none;
  }

  .grupo-row-end {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .grupo-row-count {
    color: var(--text-muted);
    font-size: 0.68rem;
    white-space: nowrap;
  }

  :global(.grupo-row-chevron) {
    color: var(--text-label);
    opacity: 0.9;
  }

  .summary-bar {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) 18px;
    align-items: center;
    gap: 10px;
    width: auto;
    min-height: 62px;
    margin: 0 18px 16px;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--primary) 70%, var(--border-card));
    border-radius: 7px;
    background: var(--bg-card);
  }

  .summary-bar:hover { background: var(--accent-light); }

  .summary-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    color: var(--primary);
    border: 1px solid color-mix(in srgb, var(--primary) 60%, var(--border-card));
    border-radius: 5px;
  }

  .summary-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .summary-text {
    color: var(--text-label);
    font-size: 0.73rem;
    font-weight: 650;
  }

  .summary-cta {
    justify-content: flex-start;
    font-size: 0.7rem;
    font-weight: 600;
  }

  :global(.summary-chevron) {
    color: var(--text-label);
    opacity: 0.8;
  }

  .detail-panel {
    background: var(--bg-panel);
  }

  .detail-body {
    gap: 20px;
    padding: 20px 22px;
  }

  .detail-section { gap: 10px; }

  .section-title {
    font-size: 1rem;
    letter-spacing: -0.01em;
  }

  .section-subtitle {
    margin-bottom: 4px;
    font-size: 0.88rem;
  }

  .section-description {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.76rem;
    line-height: 1.45;
  }

  .field-label {
    margin-top: 4px;
    color: var(--text-label);
    font-size: 0.74rem;
    font-weight: 650;
  }

  .fi {
    min-height: 44px;
    padding: 9px 12px;
    border-radius: 6px;
    background: var(--bg-input);
    border-color: var(--border-subtle);
  }

  .detail-footer {
    justify-content: flex-end;
    min-height: 68px;
    padding: 12px 22px;
    background: var(--bg-panel);
    border-top-color: var(--border-card);
  }

  .detail-footer-actions { justify-content: space-between; }

  .btn-sm-p,
  .btn-sm-g,
  .toggle-btn {
    min-height: 44px;
    border-radius: 6px;
    padding-inline: 16px;
  }

  .btn-sm-p { min-width: 128px; }

  .model-selected-card {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    min-height: 50px;
    background: var(--accent-light);
    border-color: color-mix(in srgb, var(--primary) 48%, var(--border-card));
  }

  .model-selected-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    color: var(--primary);
    border: 1px solid color-mix(in srgb, var(--primary) 55%, var(--border-card));
    border-radius: 50%;
  }

  .model-selected-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .model-selected-description {
    color: var(--text-muted);
    font-size: 0.7rem;
    line-height: 1.35;
  }

  .advanced-details {
    background: var(--bg-card);
    border-color: var(--border-card);
  }

  .resumo-sheet {
    max-width: 520px;
    padding: 10px 18px 18px;
    border: 1px solid var(--border-card);
    border-bottom: 0;
    background: var(--bg-panel);
  }

  .resumo-sheet-item {
    padding: 11px 12px;
    border-radius: 7px;
  }

  @media (min-width: 1024px) {
    .overlay { padding: 24px; }

    .detail-panel:not(.show) {
      display: flex;
    }

    .detail-empty {
      align-items: flex-start;
      justify-content: flex-start;
      padding: 28px 24px;
    }
  }

  @media (max-width: 1023px) {
    .overlay {
      align-items: flex-end;
      padding: 0;
    }

    .modal,
    .modal.desktop {
      width: 100%;
      max-width: none;
      height: min(760px, 94vh);
      max-height: 94vh;
      border-radius: 16px 16px 0 0;
    }

    .modal-head { min-height: 72px; }

    .list-body { padding: 18px 16px 16px; }

    .summary-bar { margin-inline: 16px; }

    .detail-body { padding-inline: 16px; }
    .detail-footer { padding-inline: 16px; }
  }

  @media (max-width: 520px) {
    .grupo-row { grid-template-columns: 18px minmax(0, 1fr) auto; }
    .grupo-row-count { font-size: 0.64rem; }
    .detail-footer .btn-sm-p,
    .detail-footer .btn-sm-g { flex: 1; }
  }

  @media (min-width: 1024px) {
    .modal.desktop.creating .list-panel { display: none; }
    .modal.desktop.creating .detail-panel {
      display: flex;
      flex: 1;
    }
    .modal.desktop.creating .detail-body {
      max-width: 1000px;
      width: 100%;
      margin-inline: auto;
      padding-inline: 28px;
    }
    .modal.desktop.creating .detail-footer {
      padding-inline: 28px;
    }
  }

  .detail-footer.has-validation {
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 10px 16px;
  }

  .detail-footer.has-validation .detail-footer-actions {
    width: auto;
    margin-left: auto;
  }

  @media (max-width: 640px) {
    .detail-footer.has-validation {
      flex-direction: column;
      align-items: stretch;
    }

    .detail-footer.has-validation .detail-footer-actions {
      width: 100%;
      margin-left: 0;
    }

  }
</style>

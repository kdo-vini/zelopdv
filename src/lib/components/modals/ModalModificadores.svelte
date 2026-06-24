<script>
  import { supabase } from '$lib/supabaseClient';
  import { addToast, confirmAction } from '$lib/stores/ui';

  export let open = false;
  export let produto = null; // { id, nome }
  export let ownerUserId = '';

  let grupos = [];
  let carregando = false;
  let showAddGrupo = false;
  let novoGrupo = { nome: '', tipo: 'adicional', min_selecoes: 0, max_selecoes: '' };
  let salvandoGrupo = false;
  let showAddOpcao = {};
  let novaOpcao = {};
  let salvandoOpcao = {};

  $: if (open && produto?.id && ownerUserId) carregarGrupos();

  async function carregarGrupos() {
    carregando = true;
    try {
      const { data, error } = await supabase
        .from('zelomenu_modifier_groups')
        .select('id, nome, tipo, min_selecoes, max_selecoes, ativo, ordem, zelomenu_modifier_options(id, nome, price_delta, ativo, ordem)')
        .eq('id_usuario', ownerUserId)
        .eq('id_produto', produto.id)
        .order('ordem', { ascending: true });
      if (error) throw error;
      grupos = (data || []).map(g => ({
        ...g,
        zelomenu_modifier_options: (g.zelomenu_modifier_options || []).sort((a, b) => a.ordem - b.ordem)
      }));
    } catch (err) {
      addToast('Erro ao carregar variações: ' + err.message, 'error');
    } finally {
      carregando = false;
    }
  }

  async function salvarGrupo() {
    const nome = novoGrupo.nome.trim();
    if (!nome) { addToast('Nome do grupo é obrigatório.', 'warning'); return; }
    salvandoGrupo = true;
    try {
      const maxSel = novoGrupo.max_selecoes !== '' ? Math.max(1, Number(novoGrupo.max_selecoes)) : null;
      const { error } = await supabase.from('zelomenu_modifier_groups').insert({
        id_usuario: ownerUserId,
        id_produto: produto.id,
        nome,
        tipo: novoGrupo.tipo,
        min_selecoes: Math.max(0, Number(novoGrupo.min_selecoes) || 0),
        max_selecoes: maxSel,
        ativo: true,
        ordem: grupos.length
      });
      if (error) throw error;
      novoGrupo = { nome: '', tipo: 'adicional', min_selecoes: 0, max_selecoes: '' };
      showAddGrupo = false;
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
    const { error } = await supabase.from('zelomenu_modifier_groups').delete().eq('id', grupo.id).eq('id_usuario', ownerUserId);
    if (error) { addToast('Erro: ' + error.message, 'error'); return; }
    await carregarGrupos();
    addToast('Grupo excluído.', 'success');
  }

  async function toggleGrupoAtivo(grupo) {
    const { error } = await supabase.from('zelomenu_modifier_groups').update({ ativo: !grupo.ativo }).eq('id', grupo.id).eq('id_usuario', ownerUserId);
    if (error) { addToast('Erro: ' + error.message, 'error'); return; }
    grupo.ativo = !grupo.ativo;
    grupos = [...grupos];
  }

  function iniciarAddOpcao(grupoId) {
    showAddOpcao = { ...showAddOpcao, [grupoId]: true };
    novaOpcao = { ...novaOpcao, [grupoId]: { nome: '', price_delta: '0' } };
  }

  async function salvarOpcao(grupo) {
    const nome = (novaOpcao[grupo.id]?.nome || '').trim();
    if (!nome) { addToast('Nome da opção é obrigatório.', 'warning'); return; }
    salvandoOpcao = { ...salvandoOpcao, [grupo.id]: true };
    try {
      const { error } = await supabase.from('zelomenu_modifier_options').insert({
        id_usuario: ownerUserId,
        id_grupo: grupo.id,
        nome,
        price_delta: Math.max(0, Number(novaOpcao[grupo.id]?.price_delta) || 0),
        ativo: true,
        ordem: (grupo.zelomenu_modifier_options || []).length
      });
      if (error) throw error;
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
    const { error } = await supabase.from('zelomenu_modifier_options').delete().eq('id', opcao.id).eq('id_usuario', ownerUserId);
    if (error) { addToast('Erro: ' + error.message, 'error'); return; }
    grupo.zelomenu_modifier_options = grupo.zelomenu_modifier_options.filter(o => o.id !== opcao.id);
    grupos = [...grupos];
    addToast('Opção excluída.', 'success');
  }

  async function toggleOpcaoAtiva(opcao, grupo) {
    const { error } = await supabase.from('zelomenu_modifier_options').update({ ativo: !opcao.ativo }).eq('id', opcao.id).eq('id_usuario', ownerUserId);
    if (error) { addToast('Erro: ' + error.message, 'error'); return; }
    opcao.ativo = !opcao.ativo;
    grupos = [...grupos];
  }

  function fechar() {
    open = false;
    grupos = [];
    showAddGrupo = false;
    showAddOpcao = {};
    novaOpcao = {};
    novoGrupo = { nome: '', tipo: 'adicional', min_selecoes: 0, max_selecoes: '' };
  }

  function tipoLabel(tipo) {
    return tipo === 'variacao' ? 'Variação' : 'Adicional';
  }

  function formatDelta(val) {
    const n = Number(val || 0);
    if (n === 0) return 'Grátis';
    return '+R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }
</script>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="overlay" on:click|self={fechar} role="dialog" aria-modal="true" aria-label="Variações de {produto?.nome}">
    <div class="modal">

      <div class="modal-head">
        <div>
          <p class="eyebrow">Variações e opcionais</p>
          <h2 class="modal-title">{produto?.nome || ''}</h2>
        </div>
        <button type="button" class="close-btn" on:click={fechar} aria-label="Fechar">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="ico"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="modal-body">
        {#if carregando}
          <p class="empty-msg">Carregando...</p>

        {:else if grupos.length === 0 && !showAddGrupo}
          <div class="empty-state">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="empty-ico"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"/></svg>
            <p>Nenhum grupo de variação cadastrado.</p>
            <p class="empty-sub">Exemplos: "Tamanho", "Adicionais", "Ponto da carne"</p>
          </div>

        {:else}
          <div class="grupos-list">
            {#each grupos as grupo (grupo.id)}
              <div class="grupo-card" class:inativo={!grupo.ativo}>
                <div class="grupo-head">
                  <div class="grupo-info">
                    <span class="grupo-nome">{grupo.nome}</span>
                    <span class="tipo-badge" data-tipo={grupo.tipo}>{tipoLabel(grupo.tipo)}</span>
                    <span class="selecoes-hint">
                      {grupo.min_selecoes > 0 ? 'obrigatório' : 'opcional'}{grupo.max_selecoes ? ` · máx ${grupo.max_selecoes}` : ''}
                    </span>
                  </div>
                  <div class="grupo-acts">
                    <button type="button" class="toggle-btn" class:ativo={grupo.ativo} on:click={() => toggleGrupoAtivo(grupo)}>
                      {grupo.ativo ? 'Ativo' : 'Inativo'}
                    </button>
                    <button type="button" class="del-btn" on:click={() => excluirGrupo(grupo)} aria-label="Excluir grupo">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="ico-sm"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
                    </button>
                  </div>
                </div>

                <div class="opcoes-list">
                  {#each (grupo.zelomenu_modifier_options || []) as opcao (opcao.id)}
                    <div class="opcao-row" class:inativa={!opcao.ativo}>
                      <div class="opcao-info">
                        <span class="opcao-nome">{opcao.nome}</span>
                        <span class="opcao-delta">{formatDelta(opcao.price_delta)}</span>
                      </div>
                      <div class="opcao-acts">
                        <button type="button" class="toggle-btn sm" class:ativo={opcao.ativo} on:click={() => toggleOpcaoAtiva(opcao, grupo)}>
                          {opcao.ativo ? 'Ativa' : 'Inativa'}
                        </button>
                        <button type="button" class="del-btn" on:click={() => excluirOpcao(opcao, grupo)} aria-label="Excluir opção">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="ico-sm"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>
                    </div>
                  {/each}

                  {#if showAddOpcao[grupo.id]}
                    <div class="add-opcao-form">
                      <input
                        type="text"
                        class="fi flex-1"
                        placeholder="Nome da opção"
                        bind:value={novaOpcao[grupo.id].nome}
                        on:keydown={(e) => e.key === 'Enter' && salvarOpcao(grupo)}
                      />
                      <input
                        type="number"
                        class="fi w-24"
                        placeholder="R$ acréscimo"
                        step="0.01"
                        min="0"
                        bind:value={novaOpcao[grupo.id].price_delta}
                      />
                      <button type="button" class="btn-sm-p" on:click={() => salvarOpcao(grupo)} disabled={salvandoOpcao[grupo.id]}>
                        {salvandoOpcao[grupo.id] ? '…' : 'Adicionar'}
                      </button>
                      <button type="button" class="btn-sm-g" on:click={() => showAddOpcao = { ...showAddOpcao, [grupo.id]: false }}>
                        Cancelar
                      </button>
                    </div>
                  {:else}
                    <button type="button" class="add-opcao-btn" on:click={() => iniciarAddOpcao(grupo.id)}>
                      + Adicionar opção
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}

        {#if showAddGrupo}
          <div class="add-grupo-form">
            <p class="form-title">Novo grupo</p>
            <div class="form-row">
              <div class="form-field" style="flex:1; min-width:140px;">
                <label class="fl">Nome do grupo</label>
                <input type="text" class="fi" placeholder="Ex: Tamanho, Adicionais…" bind:value={novoGrupo.nome} />
              </div>
              <div class="form-field" style="width:140px;">
                <label class="fl">Tipo</label>
                <select class="fi" bind:value={novoGrupo.tipo}>
                  <option value="adicional">Adicional</option>
                  <option value="variacao">Variação</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-field" style="width:110px;">
                <label class="fl">Mín. escolhas</label>
                <input type="number" class="fi" min="0" bind:value={novoGrupo.min_selecoes} />
              </div>
              <div class="form-field" style="width:110px;">
                <label class="fl">Máx. escolhas</label>
                <input type="number" class="fi" min="1" placeholder="ilimitado" bind:value={novoGrupo.max_selecoes} />
              </div>
              <p class="form-hint">Mín = 0 → opcional. Mín ≥ 1 → obrigatório.</p>
            </div>
            <div class="form-acts">
              <button type="button" class="btn-sm-p" on:click={salvarGrupo} disabled={salvandoGrupo}>
                {salvandoGrupo ? 'Salvando…' : 'Salvar grupo'}
              </button>
              <button type="button" class="btn-sm-g" on:click={() => { showAddGrupo = false; novoGrupo = { nome: '', tipo: 'adicional', min_selecoes: 0, max_selecoes: '' }; }}>
                Cancelar
              </button>
            </div>
          </div>
        {/if}
      </div>

      <div class="modal-foot">
        {#if !showAddGrupo}
          <button type="button" class="btn-add-grupo" on:click={() => showAddGrupo = true}>
            + Adicionar grupo
          </button>
        {:else}
          <span></span>
        {/if}
        <button type="button" class="btn-fechar" on:click={fechar}>Fechar</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.65);
    backdrop-filter: blur(4px);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .modal {
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 14px;
    width: 100%;
    max-width: 600px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 20px 22px 16px;
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .eyebrow {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--accent);
    margin: 0 0 3px;
  }

  .modal-title {
    font-size: 1rem;
    font-weight: 800;
    color: var(--text-main);
    margin: 0;
  }

  .close-btn {
    width: 32px; height: 32px;
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

  .ico { width: 16px; height: 16px; }
  .ico-sm { width: 14px; height: 14px; }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 18px 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
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
  .empty-ico { width: 36px; height: 36px; color: var(--text-muted); opacity: 0.5; }
  .empty-state p { color: var(--text-muted); margin: 0; font-size: 0.9rem; }
  .empty-sub { font-size: 0.78rem !important; }

  .grupos-list { display: flex; flex-direction: column; gap: 12px; }

  .grupo-card {
    background: var(--bg-panel);
    border: 1px solid var(--border-card);
    border-radius: 10px;
    overflow: hidden;
    transition: opacity 120ms;
  }
  .grupo-card.inativo { opacity: 0.6; }

  .grupo-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 11px 14px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .grupo-info { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
  .grupo-nome { font-size: 0.88rem; font-weight: 700; color: var(--text-main); }

  .tipo-badge {
    font-size: 0.62rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    padding: 2px 6px;
    border-radius: 4px;
    white-space: nowrap;
  }
  .tipo-badge[data-tipo='variacao'] {
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary);
  }
  .tipo-badge[data-tipo='adicional'] {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent);
  }

  .selecoes-hint { font-size: 0.72rem; color: var(--text-muted); }

  .grupo-acts { display: flex; gap: 6px; flex-shrink: 0; align-items: center; }

  .toggle-btn {
    font-size: 0.68rem;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-input);
    color: var(--text-muted);
    cursor: pointer;
    transition: background 120ms, color 120ms, border-color 120ms;
    white-space: nowrap;
  }
  .toggle-btn.ativo {
    background: var(--status-success-bg);
    color: var(--status-success-text);
    border-color: var(--status-success-border);
  }
  .toggle-btn.sm { font-size: 0.62rem; padding: 2px 6px; }

  .del-btn {
    width: 28px; height: 28px;
    display: flex; align-items: center; justify-content: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--text-muted);
    cursor: pointer;
    transition: background 120ms, color 120ms, border-color 120ms;
    padding: 0;
    flex-shrink: 0;
  }
  .del-btn:hover { background: rgba(239,68,68,0.1); color: var(--error); border-color: rgba(239,68,68,0.3); }

  .opcoes-list {
    padding: 8px 14px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .opcao-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid var(--border-subtle);
    transition: opacity 120ms;
  }
  .opcao-row:last-of-type { border-bottom: none; }
  .opcao-row.inativa { opacity: 0.5; }

  .opcao-info { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .opcao-nome { font-size: 0.84rem; color: var(--text-main); font-weight: 500; }
  .opcao-delta { font-size: 0.76rem; color: var(--text-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .opcao-acts { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }

  .add-opcao-form {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 8px;
    flex-wrap: wrap;
  }

  .add-opcao-btn {
    font-size: 0.8rem;
    color: var(--accent);
    background: none;
    border: none;
    cursor: pointer;
    padding: 6px 0;
    font-weight: 600;
  }
  .add-opcao-btn:hover { text-decoration: underline; }

  .add-grupo-form {
    background: var(--bg-panel);
    border: 1px solid var(--border-card);
    border-radius: 10px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .form-title { font-size: 0.85rem; font-weight: 700; color: var(--text-main); margin: 0; }
  .form-row { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
  .form-field { display: flex; flex-direction: column; gap: 4px; }
  .form-hint { font-size: 0.7rem; color: var(--text-muted); align-self: flex-end; margin: 0 0 3px; }
  .form-acts { display: flex; gap: 8px; }

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
  }
  .fi:focus { border-color: var(--primary); }
  .fi.flex-1 { flex: 1; min-width: 120px; }
  .fi.w-24 { width: 6rem; }

  .modal-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 13px 22px;
    border-top: 1px solid var(--border-subtle);
    background: var(--bg-panel);
    flex-shrink: 0;
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
  }
  .btn-add-grupo:hover { background: color-mix(in srgb, var(--primary) 15%, transparent); }

  .btn-fechar {
    font-size: 0.84rem;
    font-weight: 700;
    color: var(--text-muted);
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 8px 14px;
    cursor: pointer;
    transition: background 120ms, color 120ms;
  }
  .btn-fechar:hover { color: var(--text-main); border-color: var(--border-strong); }

  .btn-sm-p {
    font-size: 0.78rem;
    font-weight: 700;
    background: var(--primary);
    color: var(--primary-text);
    border: none;
    border-radius: 6px;
    padding: 5px 11px;
    cursor: pointer;
    transition: background 120ms;
    white-space: nowrap;
  }
  .btn-sm-p:hover:not(:disabled) { background: var(--primary-hover); }
  .btn-sm-p:disabled { opacity: 0.6; cursor: not-allowed; }

  .btn-sm-g {
    font-size: 0.78rem;
    font-weight: 600;
    background: none;
    color: var(--text-muted);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 5px 10px;
    cursor: pointer;
    transition: background 120ms, color 120ms;
    white-space: nowrap;
  }
  .btn-sm-g:hover { background: var(--bg-input); color: var(--text-main); }
</style>

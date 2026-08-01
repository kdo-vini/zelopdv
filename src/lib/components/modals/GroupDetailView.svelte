<script>
  import { createEventDispatcher } from 'svelte';
  import { Trash2 } from 'lucide-svelte';
  import * as Select from '$lib/components/ui/select/index.js';
  import { models } from '$lib/modifierModels.js';
  import InlineHelper from '$lib/components/ui/InlineHelper.svelte';

  export let grupo = null;
  export let produtosCatalogo = [];
  export let editingGrupoId = null;
  export let editGrupoForm = {};
  export let showAddOpcao = {};
  export let novaOpcao = {};
  export let salvandoOpcao = {};
  export let editingOpcaoId = null;
  export let editOpcaoForm = {};

  const dispatch = createEventDispatcher();

  function productLabel(id) {
    if (!id) return 'Sem produto vinculado';
    return produtosCatalogo.find((p) => String(p.id) === String(id))?.nome || 'Sem produto vinculado';
  }

  function tipoLabel(tipo) {
    return tipo === 'variacao' ? 'Variação' : 'Adicional';
  }

  function formatDelta(val) {
    const n = Number(val || 0);
    if (n === 0) return 'Grátis';
    return '+R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  function modeloLabel(tipo, modoPreco) {
    if (tipo === 'variacao' && modoPreco === 'substituir') return 'Troca o preço';
    if (tipo === 'adicional' && modoPreco === 'somar') return 'Soma ao preço';
    return 'Configuração personalizada';
  }

  function settingsHint(grp) {
    if (grp.modo_preco === 'substituir') return 'Seleciona 1 opção que define o preço';
    const parts = [];
    if (grp.min_selecoes > 0) parts.push(`mín. ${grp.min_selecoes}`);
    if (grp.max_selecoes != null) parts.push(`máx. ${grp.max_selecoes}`);
    else parts.push('sem limite');
    if (grp.permite_quantidade) parts.push('repetível');
    return parts.join(' · ');
  }

  function grupoStatusLabel(grp) {
    return grp.min_selecoes > 0 ? 'Obrigatório' : 'Opcional';
  }

  function grupoPricingLabel(grp) {
    if (grp.modo_preco === 'substituir') return 'Troca o preço';
    return 'Soma ao preço';
  }

  $: modelSettings = (() => {
    if (!grupo) return null;
    if (grupo.modo_preco === 'substituir') {
      return { fields: ['required'], hint: 'Seleciona 1 opção que define o preço' };
    }
    const fields = ['required', 'max_selections'];
    if (grupo.permite_quantidade) fields.push('max_per_option');
    const parts = [];
    if (grupo.max_selecoes != null) parts.push(`máx. ${grupo.max_selecoes} opções`);
    else parts.push('opções ilimitadas');
    if (grupo.permite_quantidade && grupo.maximo_por_opcao != null) parts.push(`${grupo.maximo_por_opcao} por opção`);
    else if (grupo.permite_quantidade) parts.push('ilimitadas por opção');
    return { fields, hint: parts.join(' · ') };
  })();

  $: selectedModel = models.find((model) => model.tipo === grupo?.tipo && model.modo_preco === grupo?.modo_preco && (model.permite_quantidade ? grupo?.permite_quantidade : true))
    || models.find((model) => model.tipo === grupo?.tipo && model.modo_preco === grupo?.modo_preco);
</script>

{#if grupo}
  <!-- Existing group detail -->
  <div class="detail-section">
    <div class="group-header">
      {#if editingGrupoId === grupo.id}
        <input class="fi" bind:value={editGrupoForm.nome} aria-label="Nome do grupo" />
      {:else}
        <span class="group-name">Modelo</span>
      {/if}
      {#if editingGrupoId === grupo.id}
        <div class="group-tags">
          <span class="tag tag-status" class:required={grupo.min_selecoes > 0}>{grupoStatusLabel(grupo)}</span>
          <span class="tag tag-pricing">{grupoPricingLabel(grupo)}</span>
        </div>
      {/if}
    </div>

    <!-- Model / Settings display -->
    {#if editingGrupoId === grupo.id}
      <!-- Edit mode: show raw fields -->
      <div class="settings-card">
        <p class="settings-title">Configurações</p>
        <div class="settings-grid">
          <label class="toggle-field">
            <input type="checkbox" class="themed-checkbox" bind:checked={editGrupoForm._required} />
            Obrigatório
          </label>
          {#if editGrupoForm.modo_preco !== 'substituir'}
            <div class="field-group">
              <label class="fl" for="edit-max-sel">Máx. opções</label>
              <input id="edit-max-sel" class="fi fi-sm" type="number" min="1" placeholder="Sem limite" bind:value={editGrupoForm.max_selecoes} />
            </div>
          {/if}
          {#if editGrupoForm.permite_quantidade}
            <div class="field-group">
              <label class="fl" for="edit-max-opcao">Máx. por opção</label>
              <input id="edit-max-opcao" class="fi fi-sm" type="number" min="1" placeholder="Sem limite" bind:value={editGrupoForm.maximo_por_opcao} />
            </div>
          {/if}
          <label class="toggle-field">
            <input type="checkbox" class="themed-checkbox" bind:checked={editGrupoForm.permite_quantidade} disabled={editGrupoForm.modo_preco === 'substituir'} aria-describedby={editGrupoForm.modo_preco === 'substituir' ? 'edit-repeat-blocked-hint' : undefined} />
            Permitir repetir
          </label>
          {#if editGrupoForm.modo_preco === 'substituir'}
            <InlineHelper id="edit-repeat-blocked-hint" compact message="Este modelo troca o preço e aceita uma opção; repetir não se aplica." />
          {/if}
        </div>
      </div>
    {:else if modelSettings}
      <!-- Read-only mode: show model summary -->
      <div class="settings-card">
        <div class="settings-header">
          <button type="button" class="link-btn" on:click={() => dispatch('editGrupo', grupo)}>Editar</button>
        </div>
        <div class="model-preview">
          <span class="model-preview-icon" aria-hidden="true">
            {#if selectedModel}
              <svelte:component this={selectedModel.icon} size={24} strokeWidth={1.8} />
            {/if}
          </span>
          <span class="model-preview-copy">
            <span class="settings-title">{modeloLabel(grupo.tipo, grupo.modo_preco)}</span>
            <span class="model-preview-description">{selectedModel?.description || 'Defina como as opções deste grupo afetam o preço.'}</span>
          </span>
        </div>
        <div class="rules-block">
          <span class="rules-label">Regras deste grupo</span>
          <div class="rules-tags">
            <span class="tag tag-status" class:required={grupo.min_selecoes > 0}>{grupoStatusLabel(grupo)}</span>
            <span class="tag tag-pricing">{grupoPricingLabel(grupo)}</span>
            <span class="tag tag-status">{grupo.max_selecoes === 1 ? '1 escolha' : grupo.max_selecoes ? `${grupo.max_selecoes} escolhas` : 'Várias escolhas'}</span>
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}

<!-- Options list (for existing groups) -->
{#if grupo}
  <div class="detail-section">
    <div class="section-header">
      <p class="section-title">Opções ({(grupo.zelomenu_modifier_options || []).length})</p>
      {#if !showAddOpcao[grupo.id]}
        <button type="button" class="link-btn" on:click={() => dispatch('iniciarAddOpcao', grupo.id)}>+ Adicionar</button>
      {/if}
    </div>

    <div class="opcoes-list">
      {#each (grupo.zelomenu_modifier_options || []) as opcao, opcaoIndex (opcao.id)}
        <div class="opcao-row" class:inativa={!opcao.ativo}>
          {#if editingOpcaoId === opcao.id}
            <div class="opcao-edit-form">
              <input class="fi" bind:value={editOpcaoForm.nome} aria-label="Nome da opção" />
              <input class="fi fi-sm" type="number" min="0" step="0.01" bind:value={editOpcaoForm.price_delta} aria-label="Acréscimo" />
              <Select.Root bind:value={editOpcaoForm.id_produto}>
                <Select.Trigger class="fi option-link-select" aria-label="Produto vinculado">
                  <span class="select-value-label">{productLabel(editOpcaoForm.id_produto)}</span>
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="" label="Sem produto vinculado" />
                  {#each produtosCatalogo as product (product.id)}
                    <Select.Item value={String(product.id)} label={product.nome} />
                  {/each}
                </Select.Content>
              </Select.Root>
              <div class="opcao-edit-acts">
                <button type="button" class="btn-sm-p" on:click={() => dispatch('salvarEdicaoOpcao', { opcao, grupo })}>Salvar</button>
                <button type="button" class="btn-sm-g" on:click={() => dispatch('cancelarEdicaoOpcao')}>Cancelar</button>
              </div>
            </div>
          {:else}
            <div class="opcao-info">
              <span class="opcao-badge" aria-hidden="true">{opcao.nome?.trim()?.charAt(0)?.toUpperCase() || '?'}</span>
              <span class="opcao-copy">
                <span class="opcao-nome">{opcao.nome}</span>
              <span class="opcao-delta">{formatDelta(opcao.price_delta)}</span>
              {#if opcao.link}
                <span class="opcao-vinculo">↳ {produtosCatalogo.find((p) => String(p.id) === String(opcao.link.id_produto))?.nome || 'produto vinculado'}</span>
              {/if}
              </span>
            </div>
            <div class="opcao-acts">
              <button type="button" class="move-btn" on:click={() => dispatch('moverOpcao', { grupo, index: opcaoIndex, direction: -1 })} disabled={opcaoIndex === 0} aria-label="Mover para cima">↑</button>
              <button type="button" class="move-btn" on:click={() => dispatch('moverOpcao', { grupo, index: opcaoIndex, direction: 1 })} disabled={opcaoIndex === (grupo.zelomenu_modifier_options || []).length - 1} aria-label="Mover para baixo">↓</button>
              {#if opcaoIndex === 0}
                <span class="move-limit-note">Já está no início</span>
              {:else if opcaoIndex === (grupo.zelomenu_modifier_options || []).length - 1}
                <span class="move-limit-note">Já está no fim</span>
              {/if}
              <button type="button" class="toggle-btn sm" class:ativo={opcao.ativo} on:click={() => dispatch('toggleOpcaoAtiva', { opcao, grupo })}>
                {opcao.ativo ? 'Ativa' : 'Inativa'}
              </button>
              <button type="button" class="btn-edit" on:click={() => dispatch('iniciarEdicaoOpcao', opcao)}>Editar</button>
              <button type="button" class="del-btn" on:click={() => dispatch('excluirOpcao', { opcao, grupo })} aria-label="Excluir opção">
                <Trash2 size={14} />
              </button>
            </div>
          {/if}
        </div>
      {/each}

      {#if showAddOpcao[grupo.id]}
        <div class="add-opcao-form">
          <input
            type="text"
            class="fi flex-1"
            placeholder="Nome da opção"
            bind:value={novaOpcao[grupo.id].nome}
            on:keydown={(e) => e.key === 'Enter' && dispatch('salvarOpcao', grupo)}
          />
          <input
            type="number"
            class="fi fi-sm"
            placeholder="R$ acréscimo"
            step="0.01"
            min="0"
            bind:value={novaOpcao[grupo.id].price_delta}
          />
          <Select.Root bind:value={novaOpcao[grupo.id].id_produto}>
            <Select.Trigger class="fi option-link-select" aria-label="Produto vinculado">
              <span class="select-value-label">{productLabel(novaOpcao[grupo.id]?.id_produto)}</span>
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="" label="Sem produto vinculado" />
              {#each produtosCatalogo as product (product.id)}
                <Select.Item value={String(product.id)} label={product.nome} />
              {/each}
            </Select.Content>
          </Select.Root>
          {#if novaOpcao[grupo.id].id_produto}
            <input
              type="number"
              class="fi fi-sm"
              placeholder="Preço próprio"
              step="0.01"
              min="0"
              bind:value={novaOpcao[grupo.id].price_override}
            />
          {/if}
          <div class="opcao-edit-acts">
            <button type="button" class="btn-sm-p" on:click={() => dispatch('salvarOpcao', grupo)} disabled={salvandoOpcao[grupo.id]}>
              {salvandoOpcao[grupo.id] ? '…' : 'Adicionar'}
            </button>
            <button type="button" class="btn-sm-g" on:click={() => dispatch('cancelarAddOpcao', grupo.id)}>
              Cancelar
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .detail-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .group-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .group-name {
    font-size: 1rem;
    font-weight: 800;
    color: var(--text-main);
    margin: 0;
  }

  .group-tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .tag {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 2px 8px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .tag-status {
    background: var(--bg-input);
    color: var(--text-label);
    border: 1px solid var(--border-subtle);
  }
  .tag-status.required {
    background: color-mix(in srgb, var(--primary) 16%, transparent);
    color: var(--primary);
    border-color: transparent;
  }

  .tag-pricing {
    background: var(--status-success-bg);
    color: var(--status-success-text);
    border: 1px solid var(--status-success-border);
  }

  .settings-card {
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .settings-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-main);
    margin: 0;
  }

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

  .link-btn {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--accent);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }
  .link-btn:hover { text-decoration: underline; }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-main);
    margin: 0;
  }

  .opcoes-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .opcao-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border-subtle);
    transition: opacity 120ms;
  }
  .opcao-row:last-of-type { border-bottom: none; }
  .opcao-row.inativa { opacity: 0.5; }

  .opcao-info { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
  .opcao-nome { font-size: 0.84rem; color: var(--text-main); font-weight: 500; }
  .opcao-delta { font-size: 0.76rem; color: var(--text-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .opcao-vinculo {
    color: var(--primary);
    font-size: 0.68rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .opcao-acts { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }

  .opcao-edit-form {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    width: 100%;
    padding: 4px 0;
  }

  .opcao-edit-acts {
    display: flex;
    gap: 6px;
  }

  :global(.option-link-select) { min-width: 160px; flex: 1; }

  .add-opcao-form {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 8px;
    flex-wrap: wrap;
  }

  .move-btn,
  .btn-edit {
    min-height: 34px;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--bg-input);
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.7rem;
    font-weight: 700;
    padding: 4px 7px;
    transition: background 120ms, border-color 120ms, color 120ms, opacity 120ms;
    white-space: nowrap;
  }
  .move-btn:hover:not(:disabled),
  .btn-edit:hover {
    background: var(--accent-light);
    border-color: var(--primary);
    color: var(--primary);
  }
  .move-btn:disabled { cursor: not-allowed; opacity: 0.35; }
  .btn-edit { color: var(--text-label); }

  .toggle-btn {
    min-height: 34px;
    font-size: 0.65rem;
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
    width: 34px; height: 34px;
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
    font-family: inherit;
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
    font-family: inherit;
  }
  .btn-sm-g:hover { background: var(--bg-input); color: var(--text-main); }

  .flex-1 { flex: 1; min-width: 120px; }

  @media (max-width: 640px) {
    .opcao-row { align-items: flex-start; }
    .opcao-acts { flex-wrap: wrap; justify-content: flex-end; }
    .opcao-info { align-items: flex-start; flex-direction: column; gap: 2px; }
    .move-btn { min-width: 28px; padding-inline: 5px; }
    .opcao-edit-form .fi { min-width: 0; flex: 1 1 120px; }
    :global(.option-link-select) { flex-basis: 100%; }
  }

  @media (prefers-reduced-motion: reduce) {
    .opcao-row, .move-btn, .btn-edit, .toggle-btn, .del-btn, .fi, .btn-sm-p, .btn-sm-g {
      transition: none;
    }
  }

  /* Detail surface aligned with the approved split-view hierarchy. */
  .group-header {
    gap: 8px;
    padding-bottom: 2px;
  }

  .group-name {
    color: var(--text-muted);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .group-tags { gap: 5px; }

  .tag {
    border-radius: 4px;
    font-size: 0.65rem;
    letter-spacing: 0;
    text-transform: none;
  }

  .settings-card {
    gap: 14px;
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: 0;
  }

  .settings-header { justify-content: flex-end; }

  .model-preview {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .model-preview-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    color: var(--primary);
    border: 1px solid color-mix(in srgb, var(--primary) 60%, var(--border-card));
    border-radius: 50%;
  }

  .model-preview-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .model-preview-description {
    color: var(--text-muted);
    font-size: 0.74rem;
    line-height: 1.4;
  }

  .rules-block {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding-top: 4px;
    border-top: 1px solid var(--border-subtle);
  }

  .rules-label {
    color: var(--text-muted);
    font-size: 0.72rem;
  }

  .rules-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .opcoes-list { gap: 7px; }

  .opcao-row {
    min-height: 58px;
    padding: 9px 10px;
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 7px;
  }

  .opcao-row:last-of-type { border-bottom: 1px solid var(--border-card); }

  .opcao-info {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
  }

  .opcao-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    color: var(--text-label);
    font-size: 0.78rem;
    font-weight: 750;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: 5px;
  }

  .opcao-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .opcao-nome {
    overflow: hidden;
    color: var(--text-main);
    font-size: 0.82rem;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .opcao-vinculo {
    overflow: hidden;
    color: var(--text-muted);
    font-size: 0.68rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .opcao-delta {
    color: var(--text-label);
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
  }

  .opcao-acts { gap: 4px; }

  .move-limit-note {
    display: inline-flex;
    align-items: flex-start;
    gap: 5px;
    margin: 0;
    color: var(--text-muted);
    font-size: 0.68rem;
    line-height: 1.35;
  }

  .move-limit-note {
    align-items: center;
    color: var(--text-muted);
    white-space: nowrap;
  }

  @media (max-width: 640px) {
    .opcao-info { grid-template-columns: 30px minmax(0, 1fr) auto; }
    .opcao-row { flex-wrap: wrap; }
    .opcao-acts { width: 100%; justify-content: flex-end; }
    .move-limit-note { width: 100%; justify-content: flex-end; }
  }
</style>

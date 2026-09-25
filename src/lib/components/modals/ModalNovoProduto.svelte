<script>
  import { createEventDispatcher, tick } from 'svelte';
  import { slide } from 'svelte/transition';
  import { supabase } from '$lib/supabaseClient';
  import { pdvCache } from '$lib/stores/pdvCache';
  import { addToast } from '$lib/stores/ui';
  import * as Select from '$lib/components/ui/select/index.js';
  import { parsePrecoInput } from '$lib/parsePrecoInput';
  import { zeloSurface } from '$lib/theme/surface';
  import Sheet from '$lib/components/zelo/Sheet.svelte';
  import { Button } from '$lib/components/ui/button';

  // ─── Props ──────────────────────────────────────────────────────────────────
  export let open = false;
  export let ownerUserId = '';
  export let categorias = [];
  export let subcategorias = [];
  // { ativo: boolean, nomes: [string, string, string] } — vem de empresa_perfil
  // (tabelas_preco_ativo, tabela_preco_1/2/3_nome). Ver gestao/produtos e app/+page.
  export let tabelasPreco = { ativo: false, nomes: ['Tabela 1', 'Tabela 2', 'Tabela 3'] };
  export let defaultCategoriaId = null;
  export let defaultSubcategoriaId = null;
  // Modo compacto (cadastro rápido no PDV): esconde preço 2/3, subcategoria,
  // estoque, "venda em atacado" e "ocultar no PDV". Os campos escondidos são
  // enviados com os mesmos defaults do formulário completo (null/false/0) —
  // não herdam defaultSubcategoriaId nem nenhum outro valor implícito.
  export let compact = false;

  const dispatch = createEventDispatcher();

  function createDefaultForm() {
    return {
      nome: '',
      // Preço começa vazio (não 0): o campo é type="text" + inputmode="decimal",
      // convertido para número só no submit por parsePrecoInput. Ver criarProduto/validarPrecos.
      preco: '',
      preco_2: '',
      preco_3: '',
      id_categoria: null,
      id_subcategoria: null,
      eh_item_por_unidade: false,
      ocultar_no_pdv: false,
      controlar_estoque: false,
      estoque_atual: 0
    };
  }

  let form = createDefaultForm();

  // Erros inline de preço (setados só no submit, por validarPrecos()).
  let precoErro = '';
  let preco2Erro = '';
  let preco3Erro = '';

  // Fluxo "+ Nova categoria": esconde o Select (quando existe) e mostra um
  // input de nome. `categoriaCriadaPendente` sobrevive a um retry (produto
  // falhou depois da categoria criada) para que o evento `created` ainda
  // informe a categoria à página-mãe quando o produto enfim for salvo, sem
  // criar a categoria de novo (ver criarProduto).
  let showNovaCategoria = false;
  let novaCategoriaNome = '';
  let categoriaCriadaPendente = null;

  $: tabelasPrecoAtivo = !!tabelasPreco?.ativo;
  $: nomesTabelas = tabelasPreco?.nomes ?? ['Tabela 1', 'Tabela 2', 'Tabela 3'];

  $: filteredSubcatsForProdForm = form.id_categoria
    ? subcategorias.filter((s) => String(s.id_categoria) === String(form.id_categoria))
    : [];

  // Enquanto o input de "nova categoria" está aberto, a categoria final ainda
  // não existe — nunca é compartilhada (mesmo default de criarCategoria em
  // gestao/produtos). Evita usar por engano o estoque compartilhado da
  // categoria que estava selecionada antes de trocar para "nova categoria".
  $: categoriaCompartilhada = showNovaCategoria ? false : categoriaTemEstoqueCompartilhado(form.id_categoria);

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

  function close() {
    dispatch('close');
  }

  function abrirNovaCategoria() {
    showNovaCategoria = true;
  }

  function cancelarNovaCategoria() {
    showNovaCategoria = false;
    novaCategoriaNome = '';
  }

  /** Ação Svelte simples: foca o node assim que ele entra no DOM. */
  function autofocus(node) {
    node.focus();
  }

  /**
   * Valida e converte os campos de preço (texto digitado -> número) no
   * submit. Preço 1 é obrigatório (vazio ou inválido = erro inline); preço 2
   * e 3 são opcionais (vazio = null, mas inválido ainda é erro).
   */
  function validarPrecos() {
    precoErro = '';
    preco2Erro = '';
    preco3Erro = '';

    const parsed1 = parsePrecoInput(form.preco);
    if (!parsed1.ok) precoErro = 'Coloque o preço.';

    let preco2 = null;
    let preco3 = null;
    if (!compact && tabelasPrecoAtivo) {
      const parsed2 = parsePrecoInput(form.preco_2);
      if (!parsed2.ok && !parsed2.empty) preco2Erro = 'Coloque o preço.';
      else preco2 = parsed2.value;

      const parsed3 = parsePrecoInput(form.preco_3);
      if (!parsed3.ok && !parsed3.empty) preco3Erro = 'Coloque o preço.';
      else preco3 = parsed3.value;
    }

    return {
      valid: !precoErro && !preco2Erro && !preco3Erro,
      preco: parsed1.ok ? parsed1.value : null,
      preco_2: preco2,
      preco_3: preco3
    };
  }

  async function criarProduto(e) {
    e.preventDefault();
    const precos = validarPrecos();
    if (!precos.valid) return;

    const { data: userData } = await supabase.auth.getUser();
    const id_usuario = ownerUserId || userData?.user?.id || null;

    let idCategoriaFinal = toDatabaseId(form.id_categoria);

    // Categoria nova: só cria uma vez. Se um submit anterior já criou a
    // categoria e falhou depois no produto, showNovaCategoria já foi
    // desligado e form.id_categoria já aponta para ela — este bloco não roda
    // de novo, evitando duplicar a categoria num reenvio.
    if (showNovaCategoria && novaCategoriaNome.trim()) {
      const { data: novaCategoria, error: categoriaError } = await supabase
        .from('categorias')
        .insert({
          nome: novaCategoriaNome.trim(),
          ordem: 0,
          controlar_estoque_compartilhado: false,
          estoque_compartilhado_atual: 0,
          id_usuario
        })
        .select('id')
        .single();

      if (categoriaError) {
        addToast('Não foi possível criar a categoria. Tente novamente.', 'error');
        return;
      }

      pdvCache.invalidateCategorias();
      idCategoriaFinal = Number(novaCategoria.id);
      categoriaCriadaPendente = { id: idCategoriaFinal, nome: novaCategoriaNome.trim() };
    }

    const payload = {
      nome: form.nome,
      preco: precos.preco,
      preco_2: precos.preco_2,
      preco_3: precos.preco_3,
      id_categoria: idCategoriaFinal,
      id_subcategoria: toDatabaseId(form.id_subcategoria),
      eh_item_por_unidade: form.eh_item_por_unidade,
      ocultar_no_pdv: form.ocultar_no_pdv,
      id_usuario,
      controlar_estoque: categoriaCompartilhada ? false : form.controlar_estoque,
      estoque_atual: !categoriaCompartilhada && form.controlar_estoque ? form.estoque_atual : 0
    };

    const { data: createdProduct, error } = await supabase
      .from('produtos')
      .insert(payload)
      .select('*')
      .single();
    if (error) {
      addToast('Não foi possível criar o produto. Tente novamente.', 'error');
      if (categoriaCriadaPendente) {
        // A categoria já foi criada e fica — troca o form para selecioná-la
        // (Select volta a aparecer com ela dentro), para o reenvio não
        // tentar criar outra categoria com o mesmo nome.
        showNovaCategoria = false;
        novaCategoriaNome = '';
        form.id_categoria = toSelectId(categoriaCriadaPendente.id);
        if (!categorias.some((cat) => Number(cat.id) === categoriaCriadaPendente.id)) {
          categorias = [
            ...categorias,
            {
              id: categoriaCriadaPendente.id,
              nome: categoriaCriadaPendente.nome,
              controlar_estoque_compartilhado: false,
              estoque_compartilhado_atual: 0
            }
          ];
        }
      }
      return;
    }

    addToast('Produto criado com sucesso!', 'success');
    const categoriaCriada = categoriaCriadaPendente;
    form = createDefaultForm();
    precoErro = '';
    preco2Erro = '';
    preco3Erro = '';
    showNovaCategoria = false;
    novaCategoriaNome = '';
    categoriaCriadaPendente = null;
    // Efeito colateral obrigatório para qualquer consumidor: o cache de
    // produtos do PDV (pdvCache) não pode ficar desatualizado depois de um
    // insert, seja o chamador a tela de gestão ou o cadastro rápido do /app.
    pdvCache.invalidateProdutos();
    // event.detail continua sendo o produto criado (compatibilidade com quem
    // já lê event.detail como produto) + a propriedade categoriaCriada
    // (objeto {id, nome} ou null) quando uma categoria nova foi criada junto.
    dispatch('created', { ...createdProduct, categoriaCriada });
    close();
  }

  function manageFocus(node) {
    const previous = document.activeElement;
    // Pré-preenche categoria/subcategoria com a seleção atual da página só
    // aqui, na abertura do modal (o node só existe enquanto open=true) —
    // mesmo comportamento do antigo abrirModalProduto() na página de
    // produtos. Não reseta o restante do form se o usuário reabrir sem ter
    // salvado. No modo compact, subcategoria não é pré-preenchida — fica no
    // default do form (null), já que o campo fica escondido.
    form.id_categoria = toSelectId(defaultCategoriaId);
    if (!compact) {
      form.id_subcategoria = toSelectId(defaultSubcategoriaId);
    }
    void tick().then(() => {
      if (node.isConnected) node.querySelector('#modal-novo-produto-nome')?.focus();
    });
    function keydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = [...node.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(
        (el) => el.getClientRects().length
      );
      if (!elements.length) return;
      if (event.shiftKey && document.activeElement === elements[0]) {
        event.preventDefault();
        elements.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === elements.at(-1)) {
        event.preventDefault();
        elements[0]?.focus();
      }
    }
    node.addEventListener('keydown', keydown);
    return {
      destroy() {
        node.removeEventListener('keydown', keydown);
        if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
      }
    };
  }
</script>

{#if open && $zeloSurface}
  <Sheet
    labelledby="modal-novo-produto-title"
    title="Novo produto"
    size="lg"
    z={200}
    closable
    closeLabel="Fechar novo produto"
    backdropAction={manageFocus}
    on:backdrop={close}
    on:close={close}
  >
    <form on:submit={criarProduto} class="zsheet-form">
      <div class="zsheet-body">
        <div class="znp-grid">
          <div class="z-field">
            <label for="modal-novo-produto-nome" class="z-label">Nome do produto</label>
            <input
              id="modal-novo-produto-nome"
              class="z-input"
              bind:value={form.nome}
              placeholder="Ex.: Coca-Cola lata"
              required
            />
          </div>
          <div class="z-field">
            <label for="modal-novo-produto-preco-1" class="z-label">{tabelasPrecoAtivo ? `Preço ${nomesTabelas[0]}` : 'Preço'}</label>
            <div class="z-money z-money-sm">
              <span aria-hidden="true">R$</span>
              <input
                id="modal-novo-produto-preco-1"
                type="text"
                inputmode="decimal"
                placeholder="0,00"
                bind:value={form.preco}
                aria-invalid={precoErro ? 'true' : undefined}
                aria-describedby={precoErro ? 'modal-novo-produto-preco-1-erro' : undefined}
              />
            </div>
            {#if precoErro}
              <p id="modal-novo-produto-preco-1-erro" class="z-error">{precoErro}</p>
            {/if}
          </div>
          {#if !compact && tabelasPrecoAtivo}
            <div class="z-field">
              <label for="modal-novo-produto-preco-2" class="z-label">Preço {nomesTabelas[1]}</label>
              <div class="z-money z-money-sm">
                <span aria-hidden="true">R$</span>
                <input
                  id="modal-novo-produto-preco-2"
                  type="text"
                  inputmode="decimal"
                  bind:value={form.preco_2}
                  placeholder="0,00"
                  aria-invalid={preco2Erro ? 'true' : undefined}
                  aria-describedby={preco2Erro ? 'modal-novo-produto-preco-2-erro' : undefined}
                />
              </div>
              {#if preco2Erro}
                <p id="modal-novo-produto-preco-2-erro" class="z-error">{preco2Erro}</p>
              {/if}
            </div>
            <div class="z-field">
              <label for="modal-novo-produto-preco-3" class="z-label">Preço {nomesTabelas[2]}</label>
              <div class="z-money z-money-sm">
                <span aria-hidden="true">R$</span>
                <input
                  id="modal-novo-produto-preco-3"
                  type="text"
                  inputmode="decimal"
                  bind:value={form.preco_3}
                  placeholder="0,00"
                  aria-invalid={preco3Erro ? 'true' : undefined}
                  aria-describedby={preco3Erro ? 'modal-novo-produto-preco-3-erro' : undefined}
                />
              </div>
              {#if preco3Erro}
                <p id="modal-novo-produto-preco-3-erro" class="z-error">{preco3Erro}</p>
              {/if}
            </div>
          {/if}
          <div class="z-field">
            <span class="z-label">Categoria <span class="z-optional">(opcional)</span></span>
            {#if showNovaCategoria}
              <input
                class="z-input"
                bind:value={novaCategoriaNome}
                placeholder="Ex.: Bebidas"
                aria-label="Nome da categoria"
                use:autofocus
              />
              <button type="button" class="link-btn znp-link" on:click={cancelarNovaCategoria}>{categorias.length > 0 ? 'Escolher existente' : 'Sem categoria'}</button>
            {:else}
              {#if categorias.length > 0}
                <Select.Root bind:value={form.id_categoria}>
                  <Select.Trigger class="z-select">
                    <span class="select-value-label">{getCategoriaNome(form.id_categoria) || 'Selecione...'}</span>
                  </Select.Trigger>
                  <Select.Content>
                    {#each categorias as c}
                      <Select.Item value={String(c.id)} label={c.nome} />
                    {/each}
                  </Select.Content>
                </Select.Root>
              {/if}
              <button type="button" class="link-btn znp-link" on:click={abrirNovaCategoria}>+ Nova categoria</button>
            {/if}
          </div>
          {#if !compact}
            <div class="z-field">
              <span class="z-label">Subcategoria</span>
              <Select.Root bind:value={form.id_subcategoria} disabled={!form.id_categoria}>
                <Select.Trigger class="z-select">
                  <span class="select-value-label">{getSubcategoriaNome(form.id_subcategoria) || '— Nenhuma —'}</span>
                </Select.Trigger>
                <Select.Content>
                  {#each filteredSubcatsForProdForm as s}
                    <Select.Item value={String(s.id)} label={s.nome} />
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
          {/if}
        </div>

        {#if !compact}
          <!-- Opções booleanas -->
          <div class="znp-options">
            <label class="z-check">
              <input type="checkbox" bind:checked={form.eh_item_por_unidade} class="themed-checkbox" />
              <span>Venda em atacado<small>Define como este produto será vendido no PDV</small></span>
            </label>
            <label class="z-check">
              <input type="checkbox" bind:checked={form.ocultar_no_pdv} class="themed-checkbox" />
              <span>Ocultar no PDV<small>Produto não aparecerá para seleção na venda</small></span>
            </label>
            {#if categoriaCompartilhada}
              <div class="z-check">
                <span>Estoque compartilhado<small>A quantidade é controlada na categoria selecionada</small></span>
              </div>
            {:else}
              <label class="z-check">
                <input type="checkbox" bind:checked={form.controlar_estoque} class="themed-checkbox" />
                <span>Controlar estoque<small>Acompanha a quantidade disponível</small></span>
              </label>
            {/if}
            {#if !categoriaCompartilhada && form.controlar_estoque}
              <div class="znp-stock">
                <label for="modal-novo-produto-estoque" class="z-label">Quantidade inicial</label>
                <input
                  id="modal-novo-produto-estoque"
                  class="z-input z-num znp-stock-input"
                  type="number"
                  step="1"
                  min="0"
                  bind:value={form.estoque_atual}
                />
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="zsheet-footer">
        <Button variant="outlined" size="touch" onclick={close}>Cancelar</Button>
        <Button variant="primary" size="touch" type="submit" class="z-primary">Salvar produto</Button>
      </div>
    </form>
  </Sheet>
{:else if open}
  <dialog
    open
    class="modal-backdrop"
    aria-modal="true"
    aria-labelledby="modal-novo-produto-title"
    tabindex="-1"
    use:manageFocus
    on:click|self={close}
    transition:slide={{ duration: 200 }}
  >
    <div class="modal-box modal-box-lg" style="background: var(--bg-card); border-color: var(--border-card);">
      <div class="modal-header" style="border-color: var(--border-subtle);">
        <h2 id="modal-novo-produto-title" class="modal-title" style="color: var(--text-main);">Novo produto</h2>
        <button type="button" class="modal-close" aria-label="Fechar novo produto" on:click={close} style="color: var(--text-muted);">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <form on:submit={criarProduto} class="modal-body flex flex-col gap-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label for="modal-novo-produto-nome" class="form-label" style="color: var(--text-label);">Nome do produto</label>
            <input
              id="modal-novo-produto-nome"
              class="form-input"
              bind:value={form.nome}
              placeholder="Ex.: Coca-Cola lata"
              required
              style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
            />
          </div>
          <div>
              <label for="modal-novo-produto-preco-1" class="form-label" style="color: var(--text-label);">{tabelasPrecoAtivo ? `Preço ${nomesTabelas[0]} (R$)` : 'Preço (R$)'}</label>
              <div class="currency-field">
                <span class="currency-prefix" aria-hidden="true">R$</span>
                <input
                  class="form-input currency-input tabular-nums"
                  id="modal-novo-produto-preco-1"
                  type="text"
                  inputmode="decimal"
                  placeholder="0,00"
                  bind:value={form.preco}
                  aria-invalid={precoErro ? 'true' : undefined}
                  aria-describedby={precoErro ? 'modal-novo-produto-preco-1-erro' : undefined}
                  style="background: var(--bg-input); color: var(--text-main); border-color: {precoErro ? 'var(--status-error-text)' : 'var(--border-subtle)'};"
                />
              </div>
              {#if precoErro}
                <p id="modal-novo-produto-preco-1-erro" class="field-error">{precoErro}</p>
              {/if}
          </div>
          {#if !compact && tabelasPrecoAtivo}
            <div>
              <label for="modal-novo-produto-preco-2" class="form-label" style="color: var(--text-label);">Preço {nomesTabelas[1]} (R$)</label>
              <div class="currency-field">
                <span class="currency-prefix" aria-hidden="true">R$</span>
                <input
                  class="form-input currency-input tabular-nums"
                  id="modal-novo-produto-preco-2"
                  type="text"
                  inputmode="decimal"
                  bind:value={form.preco_2}
                  placeholder="0,00"
                  aria-invalid={preco2Erro ? 'true' : undefined}
                  aria-describedby={preco2Erro ? 'modal-novo-produto-preco-2-erro' : undefined}
                  style="background: var(--bg-input); color: var(--text-main); border-color: {preco2Erro ? 'var(--status-error-text)' : 'var(--border-subtle)'};"
                />
              </div>
              {#if preco2Erro}
                <p id="modal-novo-produto-preco-2-erro" class="field-error">{preco2Erro}</p>
              {/if}
            </div>
            <div>
              <label for="modal-novo-produto-preco-3" class="form-label" style="color: var(--text-label);">Preço {nomesTabelas[2]} (R$)</label>
              <div class="currency-field">
                <span class="currency-prefix" aria-hidden="true">R$</span>
                <input
                  class="form-input currency-input tabular-nums"
                  id="modal-novo-produto-preco-3"
                  type="text"
                  inputmode="decimal"
                  bind:value={form.preco_3}
                  placeholder="0,00"
                  aria-invalid={preco3Erro ? 'true' : undefined}
                  aria-describedby={preco3Erro ? 'modal-novo-produto-preco-3-erro' : undefined}
                  style="background: var(--bg-input); color: var(--text-main); border-color: {preco3Erro ? 'var(--status-error-text)' : 'var(--border-subtle)'};"
                />
              </div>
              {#if preco3Erro}
                <p id="modal-novo-produto-preco-3-erro" class="field-error">{preco3Erro}</p>
              {/if}
            </div>
          {/if}
          <div>
            <span class="form-label" style="color: var(--text-label);">Categoria <span class="field-label-suffix">(opcional)</span></span>
            {#if showNovaCategoria}
              <input
                class="form-input"
                bind:value={novaCategoriaNome}
                placeholder="Ex.: Bebidas"
                aria-label="Nome da categoria"
                use:autofocus
                style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
              />
              <button type="button" class="link-btn" on:click={cancelarNovaCategoria}>{categorias.length > 0 ? 'Escolher existente' : 'Sem categoria'}</button>
            {:else}
              {#if categorias.length > 0}
                <Select.Root bind:value={form.id_categoria}>
                  <Select.Trigger class="field-input">
                    <span class="select-value-label">{getCategoriaNome(form.id_categoria) || 'Selecione...'}</span>
                  </Select.Trigger>
                  <Select.Content>
                    {#each categorias as c}
                      <Select.Item value={String(c.id)} label={c.nome} />
                    {/each}
                  </Select.Content>
                </Select.Root>
              {/if}
              <button type="button" class="link-btn" on:click={abrirNovaCategoria}>+ Nova categoria</button>
            {/if}
          </div>
          {#if !compact}
            <div>
              <span class="form-label" style="color: var(--text-label);">Subcategoria</span>
              <Select.Root bind:value={form.id_subcategoria} disabled={!form.id_categoria}>
                <Select.Trigger class="field-input">
                  <span class="select-value-label">{getSubcategoriaNome(form.id_subcategoria) || '— Nenhuma —'}</span>
                </Select.Trigger>
                <Select.Content>
                  {#each filteredSubcatsForProdForm as s}
                    <Select.Item value={String(s.id)} label={s.nome} />
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
          {/if}
        </div>

        {#if !compact}
          <!-- Opções booleanas -->
          <div class="prod-options-grid" style="background: var(--bg-panel); border-color: var(--border-subtle);">
            <label class="prod-option-label" style="color: var(--text-label);">
              <input type="checkbox" bind:checked={form.eh_item_por_unidade} class="themed-checkbox" />
              <div>
                <span class="font-medium text-sm">Venda em atacado</span>
                <p class="text-xs mt-0.5" style="color: var(--text-muted);">Define como este produto será vendido no PDV</p>
              </div>
            </label>
            <label class="prod-option-label" style="color: var(--text-label);">
              <input type="checkbox" bind:checked={form.ocultar_no_pdv} class="themed-checkbox" />
              <div>
                <span class="font-medium text-sm">Ocultar no PDV</span>
                <p class="text-xs mt-0.5" style="color: var(--text-muted);">Produto não aparecerá para seleção na venda</p>
              </div>
            </label>
            {#if categoriaCompartilhada}
              <div class="prod-option-label" style="color: var(--text-label);">
                <div>
                  <span class="font-medium text-sm">Estoque compartilhado</span>
                  <p class="text-xs mt-0.5" style="color: var(--text-muted);">A quantidade é controlada na categoria selecionada</p>
                </div>
              </div>
            {:else}
              <label class="prod-option-label" style="color: var(--text-label);">
                <input type="checkbox" bind:checked={form.controlar_estoque} class="themed-checkbox" />
                <div>
                  <span class="font-medium text-sm">Controlar estoque</span>
                  <p class="text-xs mt-0.5" style="color: var(--text-muted);">Acompanha a quantidade disponível</p>
                </div>
              </label>
            {/if}
            {#if !categoriaCompartilhada && form.controlar_estoque}
              <div class="flex items-center gap-2" transition:slide|local={{ duration: 100 }}>
                <label for="modal-novo-produto-estoque" class="form-label mb-0" style="color: var(--text-label);">Qtd. Inicial:</label>
                <input
                  id="modal-novo-produto-estoque"
                  class="form-input w-24"
                  type="number"
                  step="1"
                  min="0"
                  bind:value={form.estoque_atual}
                  style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                />
              </div>
            {/if}
          </div>
        {/if}

        <div class="modal-footer" style="border-color: var(--border-subtle);">
          <button type="button" class="btn-ghost-modal" on:click={close} style="color: var(--text-muted); border-color: var(--border-subtle);">
            Cancelar
          </button>
          <button type="submit" class="btn-primary">
            Salvar produto
          </button>
        </div>
      </form>
    </div>
  </dialog>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    width: auto;
    max-width: none;
    height: auto;
    margin: 0;
    border: 0;
    background: color-mix(in srgb, var(--bg-app) 60%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    padding: 1rem;
  }

  .modal-backdrop::backdrop {
    background: transparent;
  }

  .modal-box {
    width: 100%;
    max-width: 440px;
    border-radius: 0.75rem;
    border: 1px solid;
    overflow: hidden;
    box-shadow: var(--shadow-modal);
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
    color: var(--text-main);
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

  .form-label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.375rem;
    color: var(--text-label);
  }

  /* Sufixo "(opcional)" do rótulo Categoria: mesmo rótulo, mas sem herdar o
     uppercase/tracking do .form-label — senão "(opcional)" também vira
     caixa alta e some no meio do resto, difícil de ler. */
  .field-label-suffix {
    text-transform: none;
    letter-spacing: normal;
    font-weight: 500;
    color: var(--text-muted);
  }

  .field-error {
    margin: 0.375rem 0 0;
    font-size: 0.875rem;
    color: var(--status-error-text);
  }

  .link-btn {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    margin-top: 0.25rem;
    padding: 0.25rem 0;
    background: transparent;
    border: 0;
    color: var(--primary);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .link-btn:hover {
    color: var(--primary-hover);
    text-decoration: underline;
  }

  .form-input {
    display: block;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid;
    font-size: 0.875rem;
    outline: none;
    background: var(--bg-input);
    color: var(--text-main);
    border-color: var(--border-subtle);
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

  /* ── Zelo surface (only inside the Sheet branch) ─────────────── */
  .znp-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .znp-grid > * { min-width: 0; }
  @media (min-width: 640px) { .znp-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  button.link-btn.znp-link { align-self: flex-start; margin-top: 0; color: var(--text-main); font-weight: 500; text-decoration: underline; text-underline-offset: 3px; }
  button.link-btn.znp-link:hover { color: var(--primary-hover); }
  button.link-btn.znp-link:focus-visible { outline: none; border-radius: 6px; box-shadow: 0 0 0 4px var(--focus); }
  .znp-options { display: flex; flex-direction: column; padding: 4px 16px; border-radius: var(--zelo-radius-card); background: var(--bg-sunken); }
  .znp-options > :global(.z-check + .z-check) { border-top: 1px solid var(--border-subtle); }
  .znp-stock { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 0 12px; }
  input.z-input.znp-stock-input { width: 120px; text-align: right; }
</style>

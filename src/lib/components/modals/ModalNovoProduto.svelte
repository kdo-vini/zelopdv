<script>
  import { createEventDispatcher, tick } from 'svelte';
  import { slide } from 'svelte/transition';
  import { supabase } from '$lib/supabaseClient';
  import { pdvCache } from '$lib/stores/pdvCache';
  import { addToast } from '$lib/stores/ui';
  import * as Select from '$lib/components/ui/select/index.js';

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
  }

  let form = createDefaultForm();

  $: tabelasPrecoAtivo = !!tabelasPreco?.ativo;
  $: nomesTabelas = tabelasPreco?.nomes ?? ['Tabela 1', 'Tabela 2', 'Tabela 3'];

  $: filteredSubcatsForProdForm = form.id_categoria
    ? subcategorias.filter((s) => String(s.id_categoria) === String(form.id_categoria))
    : [];

  $: categoriaCompartilhada = categoriaTemEstoqueCompartilhado(form.id_categoria);

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

  async function criarProduto(e) {
    e.preventDefault();
    const { data: userData } = await supabase.auth.getUser();
    const id_usuario = ownerUserId || userData?.user?.id || null;
    const payload = {
      ...form,
      id_usuario,
      id_categoria: toDatabaseId(form.id_categoria),
      id_subcategoria: toDatabaseId(form.id_subcategoria),
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
      return;
    }

    addToast('Produto criado com sucesso!', 'success');
    form = createDefaultForm();
    // Efeito colateral obrigatório para qualquer consumidor: o cache de
    // produtos do PDV (pdvCache) não pode ficar desatualizado depois de um
    // insert, seja o chamador a tela de gestão ou o cadastro rápido do /app.
    pdvCache.invalidateProdutos();
    dispatch('created', createdProduct);
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

{#if open}
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
                  class="form-input currency-input"
                  id="modal-novo-produto-preco-1"
                  type="number"
                  step="0.01"
                  min="0"
                  bind:value={form.preco}
                  required
                  style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                />
              </div>
          </div>
          {#if !compact && tabelasPrecoAtivo}
            <div>
              <label for="modal-novo-produto-preco-2" class="form-label" style="color: var(--text-label);">Preço {nomesTabelas[1]} (R$)</label>
              <div class="currency-field">
                <span class="currency-prefix" aria-hidden="true">R$</span>
                <input
                  class="form-input currency-input"
                  id="modal-novo-produto-preco-2"
                  type="number"
                  step="0.01"
                  min="0"
                  bind:value={form.preco_2}
                  placeholder="Opcional"
                  style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                />
              </div>
            </div>
            <div>
              <label for="modal-novo-produto-preco-3" class="form-label" style="color: var(--text-label);">Preço {nomesTabelas[2]} (R$)</label>
              <div class="currency-field">
                <span class="currency-prefix" aria-hidden="true">R$</span>
                <input
                  class="form-input currency-input"
                  id="modal-novo-produto-preco-3"
                  type="number"
                  step="0.01"
                  min="0"
                  bind:value={form.preco_3}
                  placeholder="Opcional"
                  style="background: var(--bg-input); color: var(--text-main); border-color: var(--border-subtle);"
                />
              </div>
            </div>
          {/if}
          <div>
            <span class="form-label" style="color: var(--text-label);">Categoria</span>
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
</style>

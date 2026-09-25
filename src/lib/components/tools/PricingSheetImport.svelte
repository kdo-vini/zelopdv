<script>
  import { tick } from 'svelte';
  import { X, Search, Loader2 } from 'lucide-svelte';
  import { supabase } from '$lib/supabaseClient';
  import { formatMoney } from '$lib/formatMoney';
  import { Button } from '$lib/components/ui/button/index.js';

  /**
   * Modal de importação: lista produtos do cadastro (na_precificacao = false,
   * exceto pizza — preço vem do pizza_config) para trazer para a planilha de
   * preços. Confirmar faz um único update em lote.
   * @type {{
   *   open?: boolean,
   *   ownerUserId?: string | null,
   *   onclose?: () => void,
   *   onimported?: (count: number, total: number) => void,
   * }}
   */
  let { open = false, ownerUserId = null, onclose, onimported } = $props();

  let loading = $state(false);
  let saving = $state(false);
  let errorMsg = $state('');
  let search = $state('');
  let products = $state(/** @type {any[]} */ ([]));
  /** @type {Record<string, boolean>} */
  let selected = $state({});

  let filtered = $derived.by(() => {
    const q = search.trim().toLocaleLowerCase('pt-BR');
    if (!q) return products;
    return products.filter((p) => String(p.nome || '').toLocaleLowerCase('pt-BR').includes(q));
  });

  let selectedCount = $derived(Object.values(selected).filter(Boolean).length);
  let allFilteredSelected = $derived(filtered.length > 0 && filtered.every((p) => selected[p.id]));

  $effect(() => {
    if (open && ownerUserId) void load();
  });

  async function load() {
    loading = true;
    errorMsg = '';
    selected = {};
    search = '';
    try {
      const { data, error } = await supabase
        .from('produtos')
        .select('id, nome, preco, custo_unitario')
        .eq('id_usuario', ownerUserId)
        .eq('na_precificacao', false)
        .neq('tipo_produto', 'pizza')
        .order('nome');
      if (error) throw error;
      products = data || [];
    } catch (err) {
      console.error('[PricingSheetImport] load', err);
      errorMsg = 'Não foi possível carregar o cadastro. Tente novamente.';
    } finally {
      loading = false;
    }
  }

  function toggle(id) {
    selected = { ...selected, [id]: !selected[id] };
  }

  function toggleAll() {
    if (allFilteredSelected) {
      const next = { ...selected };
      for (const p of filtered) delete next[p.id];
      selected = next;
    } else {
      const next = { ...selected };
      for (const p of filtered) next[p.id] = true;
      selected = next;
    }
  }

  function close() {
    if (saving) return;
    onclose?.();
  }

  async function confirmImport() {
    const ids = Object.keys(selected).filter((id) => selected[id]);
    if (!ids.length || saving) return;
    saving = true;
    errorMsg = '';
    try {
      const { data, error } = await supabase
        .from('produtos')
        .update({ na_precificacao: true })
        .in('id', ids)
        .eq('id_usuario', ownerUserId)
        .select('id');
      if (error) throw error;
      // RLS nega em silêncio: um update sem permissão retorna 0 linhas e sem erro.
      const importedCount = data?.length || 0;
      if (importedCount === 0) {
        errorMsg = 'Não foi possível importar os produtos selecionados. Tente novamente.';
        return;
      }
      onimported?.(importedCount, ids.length);
    } catch (err) {
      console.error('[PricingSheetImport] confirmImport', err);
      errorMsg = 'Não foi possível importar os produtos selecionados. Tente novamente.';
    } finally {
      saving = false;
    }
  }

  function manageFocus(node) {
    const previous = document.activeElement;
    void tick().then(() => {
      if (node.isConnected) node.querySelector('#pricing-import-search')?.focus();
    });
    function keydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = [...node.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(
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
      },
    };
  }
</script>

{#if open}
  <dialog
    open
    class="modal-backdrop"
    aria-modal="true"
    aria-labelledby="pricing-import-title"
    tabindex="-1"
    use:manageFocus
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
  >
    <div class="modal-box" role="document">
      <div class="modal-header">
        <div>
          <h2 id="pricing-import-title" class="modal-title">Importar do meu cadastro</h2>
          <p class="modal-subtitle">Produtos já cadastrados no PDV, sem preço na planilha ainda.</p>
        </div>
        <button type="button" class="modal-close" aria-label="Fechar importação" onclick={close} disabled={saving}>
          <X class="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      <div class="modal-body">
        {#if errorMsg}
          <div class="error-banner" role="alert">{errorMsg}</div>
        {/if}

        <label class="search-field">
          <Search class="w-4 h-4" aria-hidden="true" />
          <input
            id="pricing-import-search"
            type="text"
            placeholder="Buscar produto..."
            bind:value={search}
            autocomplete="off"
          />
        </label>

        {#if loading}
          <div class="state-row">
            <Loader2 class="w-5 h-5 animate-spin" aria-hidden="true" />
            <span>Carregando cadastro...</span>
          </div>
        {:else if products.length === 0}
          <div class="state-row">
            <span>Nenhum produto disponível para importar. Tudo já está na planilha ou o restante é pizza.</span>
          </div>
        {:else}
          <label class="select-all-row">
            <input type="checkbox" class="themed-checkbox compact" checked={allFilteredSelected} onchange={toggleAll} />
            <span>Selecionar todos ({filtered.length})</span>
          </label>

          <ul class="product-list">
            {#each filtered as p (p.id)}
              <li class="product-row">
                <label class="product-label">
                  <input
                    type="checkbox"
                    class="themed-checkbox compact"
                    checked={!!selected[p.id]}
                    onchange={() => toggle(p.id)}
                  />
                  <span class="product-name">{p.nome}</span>
                </label>
                <span class="product-preco tabular-nums">{formatMoney(p.preco)}</span>
                <span class="product-custo tabular-nums" class:custo-missing={!p.custo_unitario}>
                  {p.custo_unitario ? formatMoney(p.custo_unitario) : 'Sem custo'}
                </span>
              </li>
            {:else}
              <li class="state-row">Nenhum produto encontrado para "{search}".</li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="modal-footer">
        <span class="selected-count">{selectedCount} selecionado(s)</span>
        <div class="footer-actions">
          <Button type="button" variant="outline" onclick={close} disabled={saving}>Cancelar</Button>
          <Button type="button" onclick={confirmImport} disabled={saving || !selectedCount}>
            {#if saving}<Loader2 class="w-4 h-4 animate-spin" aria-hidden="true" />{/if}
            Importar {selectedCount > 0 ? `(${selectedCount})` : ''}
          </Button>
        </div>
      </div>
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
    padding: 1rem;
    background: color-mix(in srgb, var(--bg-app) 60%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .modal-backdrop::backdrop {
    background: transparent;
  }

  .modal-box {
    width: 100%;
    max-width: 34rem;
    max-height: calc(100dvh - 2rem);
    display: flex;
    flex-direction: column;
    border-radius: 0.875rem;
    border: 1px solid var(--border-card);
    background: var(--bg-card);
    overflow: hidden;
    box-shadow: var(--shadow-modal);
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .modal-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-main);
  }

  .modal-subtitle {
    margin: 0.25rem 0 0;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .modal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    flex-shrink: 0;
    border: 0;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .modal-close:hover {
    background: var(--sidebar-item-hover-bg);
    color: var(--text-main);
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.1rem 1.25rem;
    overflow-y: auto;
    min-height: 0;
  }

  .error-banner {
    padding: 0.625rem 0.875rem;
    border-radius: 0.5rem;
    border: 1px solid color-mix(in srgb, var(--error) 25%, transparent);
    background: color-mix(in srgb, var(--error) 10%, transparent);
    color: var(--status-error-text);
    font-size: 0.875rem;
  }

  .search-field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
    background: var(--bg-input);
    color: var(--text-muted);
  }

  .search-field input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--text-main);
    font-size: 1rem;
  }

  .state-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1.25rem 0.5rem;
    color: var(--text-muted);
    font-size: 0.875rem;
    text-align: center;
    justify-content: center;
  }

  .select-all-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.25rem;
    color: var(--text-label);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    border-bottom: 1px solid var(--border-subtle);
  }

  .product-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  .product-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.25rem;
    border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 70%, transparent);
  }

  .product-row:last-child {
    border-bottom: 0;
  }

  .product-label {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex: 1;
    min-width: 0;
    cursor: pointer;
  }

  .product-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-main);
    font-size: 0.875rem;
  }

  .product-preco {
    flex-shrink: 0;
    color: var(--text-label);
    font-size: 0.875rem;
    width: 5.5rem;
    text-align: right;
  }

  .product-custo {
    flex-shrink: 0;
    font-size: 0.875rem;
    width: 6rem;
    text-align: right;
    color: var(--text-muted);
  }

  .custo-missing {
    color: var(--status-warning-text);
    font-weight: 600;
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.875rem 1.25rem;
    border-top: 1px solid var(--border-subtle);
    background: var(--bg-panel);
    flex-shrink: 0;
  }

  .selected-count {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .footer-actions {
    display: flex;
    gap: 0.5rem;
  }

  @media (max-width: 640px) {
    .modal-backdrop {
      align-items: flex-end;
      padding: 0;
    }

    .modal-box {
      max-width: none;
      max-height: calc(100dvh - 1.5rem);
      border-radius: 0.875rem 0.875rem 0 0;
    }

    .modal-footer {
      flex-direction: column-reverse;
      align-items: stretch;
    }

    .footer-actions {
      flex-direction: column;
    }

    .footer-actions :global(button) {
      width: 100%;
    }
  }
</style>

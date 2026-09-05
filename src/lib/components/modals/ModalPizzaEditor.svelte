<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { Check, ChevronRight, Plus, Trash2, X } from 'lucide-svelte';
  import * as Select from '$lib/components/ui/select/index.js';
  import { supabase } from '$lib/supabaseClient';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import { importPizzaFlavor, preservePizzaDraftAfterModeChange, setPizzaPrice } from '$lib/pizzaEditor';
  import { resolvePizza, validatePizzaConfig } from '$lib/pizza';

  export let produto;
  export let ownerUserId;
  export let replacement = null;

  const dispatch = createEventDispatcher();
  let config = structuredClone(produto.pizza_config || { version: 1, revision: crypto.randomUUID(), pricingMode: 'highest', sizes: [], flavors: [] });
  let expectedRevision = produto.pizza_config?.revision || null;
  let savedArchived = Boolean(produto.pizza_config?.archived);
  let storeMode = config.pricingMode;
  let catalog = [];
  let busy = false;
  let loading = true;
  let loadFailed = false;
  let publication = null;
  let publicForm = { nome_publico: '', descricao_publica: '', foto_url: '', visivel_online: false };
  let error = '';
  let importProduct = '';
  let importSize = '';
  let previewSize = '';
  let previewFlavors = [];

  $: activeSizes = config.sizes.filter((size) => size.active !== false);
  $: activeFlavors = config.flavors.filter((flavor) => flavor.active !== false);
  $: preview = previewPrice(config, previewSize, previewFlavors);

  function manageFocus(node) {
    const previous = document.activeElement;
    node.querySelector('button')?.focus();
    function keydown(event) {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); dispatch('close'); }
      if (event.key !== 'Tab') return;
      const elements = [...node.querySelectorAll('button:not(:disabled),input:not(:disabled),summary,[tabindex="0"]')].filter((element) => element.getClientRects().length);
      if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === elements.at(-1)) { event.preventDefault(); elements[0]?.focus(); }
    }
    node.addEventListener('keydown', keydown);
    return { destroy() { node.removeEventListener('keydown', keydown); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); } };
  }

  function previewPrice(value, sizeId, flavorIds) {
    try {
      const result = resolvePizza(value, { revision: value.revision, sizeId, flavorIds });
      return result.ok ? result : null;
    } catch {
      return null;
    }
  }

  const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  function pizzaSaveMessage(exception) {
    const code = String(exception?.message || '');
    if (code.includes('PIZZA_REVISION_CONFLICT')) return 'Esta montagem foi alterada em outra tela. Feche, abra novamente e confira os dados antes de salvar.';
    if (code.includes('PIZZA_PERMISSION_DENIED')) return 'Seu acesso não permite alterar este produto.';
    if (code.includes('PIZZA_REPLACEMENT_GROUP_UNSUPPORTED')) return 'Este produto usa um grupo que substitui o preço. Remova esse grupo ou altere-o para somar antes de transformar em pizza.';
    if (code.includes('PIZZA_CANNOT_BE_MODIFIER')) return 'Este produto é usado como complemento de outro item. Remova esse vínculo antes de transformá-lo em pizza.';
    if (code.includes('PIZZA_CREATE_NEW_PRODUCT_REQUIRED')) return 'Este produto recebeu uma venda enquanto estava aberto. Feche e abra a montagem novamente para preservar o histórico.';
    return exception?.message || 'Não foi possível salvar a montagem.';
  }

  onMount(async () => {
    try {
      const { data: profile, error: profileError } = await supabase.from('empresa_perfil').select('pizza_pricing_mode').eq('user_id', ownerUserId).maybeSingle();
      if (profileError) throw profileError;
      storeMode = profile?.pizza_pricing_mode || 'highest';
      config = { ...config, pricingMode: storeMode };

      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error: readError } = await supabase.from('produtos').select('id,nome,preco,tipo_produto').eq('id_usuario', ownerUserId).order('id').range(offset, offset + 499);
        if (readError) throw readError;
        rows.push(...data);
        if (data.length < 500) break;
      }
      catalog = rows.filter((product) => product.id !== produto.id && product.tipo_produto !== 'pizza');

      const { data: pub, error: pubError } = await supabase.from('zelomenu_product_publications').select('id,nome_publico,descricao_publica,foto_url,visivel_online,pausado_manualmente,updated_at').eq('id_usuario', ownerUserId).eq('id_produto', produto.id).maybeSingle();
      if (pubError) throw pubError;
      publication = pub;
      if (pub) publicForm = {
        nome_publico: pub.nome_publico || '',
        descricao_publica: pub.descricao_publica || '',
        foto_url: pub.foto_url || '',
        visivel_online: Boolean(pub.visivel_online && !pub.pausado_manualmente)
      };
    } catch (exception) {
      error = exception.message;
      loadFailed = true;
    } finally {
      loading = false;
    }
  });

  function addSize() {
    config = { ...config, sizes: [...config.sizes, { id: crypto.randomUUID(), name: '', description: '', maxFlavors: 2, active: true, stockProductId: null }] };
  }

  function removeSize(sizeId) {
    config = {
      ...config,
      sizes: config.sizes.filter((size) => size.id !== sizeId),
      flavors: config.flavors.map((flavor) => ({ ...flavor, prices: setPizzaPrice(flavor.prices, sizeId, '') }))
    };
    if (previewSize === sizeId) { previewSize = ''; previewFlavors = []; }
  }

  function addFlavor() {
    config = { ...config, flavors: [...config.flavors, { id: crypto.randomUUID(), name: '', description: '', active: true, prices: {} }] };
  }

  function importFlavor() {
    try {
      const product = catalog.find((candidate) => String(candidate.id) === importProduct);
      if (!product) throw new Error('Escolha o produto a importar.');
      config = { ...config, flavors: [...config.flavors, importPizzaFlavor(product, importSize)] };
      importProduct = '';
      error = '';
    } catch (exception) {
      error = exception.message;
    }
  }

  function updatePrice(flavor, sizeId, value) {
    try {
      flavor.prices = setPizzaPrice(flavor.prices, sizeId, value);
      config = { ...config };
      error = '';
    } catch (exception) {
      error = exception.message;
    }
  }

  async function changeStoreMode() {
    if (config.pricingMode === storeMode) return;
    const confirmed = await confirmAction('Cobrança das pizzas', 'Esta regra será aplicada a todas as pizzas da loja. Pedidos realizados mantêm o preço original. Alterar agora?');
    if (!confirmed) { config = { ...config, pricingMode: storeMode }; return; }

    busy = true;
    const { error: saveError } = await supabase.rpc('save_pizza_pricing_mode', { p_pricing_mode: config.pricingMode });
    if (saveError) {
      error = saveError.message;
      config = { ...config, pricingMode: storeMode };
    } else {
      storeMode = config.pricingMode;
      const { data, error: readError } = await supabase.from('produtos').select('pizza_config').eq('id', produto.id).single();
      if (readError) {
        error = 'A regra mudou, mas não foi possível confirmar a revisão atual. Feche e abra a montagem antes de salvar.';
        loading = true;
      } else {
        expectedRevision = data.pizza_config?.revision || null;
        config = preservePizzaDraftAfterModeChange(config, data.pizza_config, storeMode);
      }
      dispatch('changed');
    }
    busy = false;
  }

  async function save() {
    error = '';
    if (publicForm.foto_url && !/^https:\/\//i.test(publicForm.foto_url.trim())) { error = 'Informe uma URL HTTPS para a foto.'; return; }
    if (config.pricingMode !== storeMode) { error = 'Aplique a regra de cobrança antes de salvar.'; return; }

    try {
      const result = validatePizzaConfig(config);
      if (!result.ok) throw new Error(result.message);
      if (savedArchived && !config.archived && !await confirmAction('Reativar montagem', 'Reativar esta montagem de pizza? Depois confira a publicação e a visibilidade no PDV.')) return;
      busy = true;

      if (replacement) {
        const { error: replacementError } = await supabase.rpc('replace_product_with_pizza', {
          p_source_product_id: replacement.sourceProductId,
          p_config: config,
          p_visible_in_pdv: replacement.visibleInPdv,
          p_visible_online: publicForm.visivel_online,
          p_nome_publico: publicForm.nome_publico.trim() || null,
          p_descricao_publica: publicForm.descricao_publica.trim() || null,
          p_foto_url: publicForm.foto_url.trim() || null,
        });
        if (replacementError) throw replacementError;
        addToast('Produto transformado em pizza. As vendas anteriores foram preservadas.', 'success');
        dispatch('saved');
        return;
      }

      const { data, error: saveError } = await supabase.rpc('save_pizza_config', { p_product_id: produto.id, p_expected_revision: expectedRevision, p_config: config });
      if (saveError) throw saveError;
      config = data;
      expectedRevision = data.revision;
      savedArchived = Boolean(config.archived);

      if (savedArchived) {
        addToast('Montagem arquivada e retirada do PDV e do cardápio. Histórico preservado.', 'success');
        dispatch('saved');
        return;
      }

      const publicationPayload = {
        ...publicForm,
        foto_url: publicForm.foto_url.trim() || null,
        nome_publico: publicForm.nome_publico.trim() || null,
        descricao_publica: publicForm.descricao_publica.trim() || null,
        updated_at: new Date().toISOString()
      };
      const table = supabase.from('zelomenu_product_publications');
      const mutation = publication
        ? table.update(publicationPayload).eq('id', publication.id).eq('id_usuario', ownerUserId).eq('updated_at', publication.updated_at)
        : table.insert({ ...publicationPayload, id_usuario: ownerUserId, id_produto: produto.id, pausado_manualmente: false, ordem: 0 });
      const { data: savedPublication, error: publicationError } = await mutation.select('id,updated_at').maybeSingle();
      if (publicationError || !savedPublication) throw new Error('A montagem foi salva, mas a publicação não. ' + (publicationError?.message || 'O cardápio mudou em outra sessão. Abra novamente.'));
      publication = savedPublication;
      addToast('Montagem salva. Ela já está pronta para o PDV e o ZeloMenu.', 'success');
      dispatch('saved');
    } catch (exception) {
      error = pizzaSaveMessage(exception);
    } finally {
      busy = false;
    }
  }
</script>

<dialog open aria-modal="true" aria-labelledby="pizza-editor-title" class="pizza-editor" use:manageFocus on:cancel|preventDefault={() => !busy && dispatch('close')}>
  <header class="editor-header">
    <div class="header-copy">
      <p class="context-label">Complementos e opções · {produto.nome}</p>
      <h2 id="pizza-editor-title">Montagem de pizza</h2>
      <p>{replacement ? 'Ao salvar, esta montagem substituirá o produto atual sem alterar as vendas anteriores.' : 'Defina o que o cliente escolhe. O mesmo cadastro aparece no PDV e no ZeloMenu.'}</p>
    </div>
    <button class="icon-button" type="button" aria-label="Fechar montagem" disabled={busy} on:click={() => dispatch('close')}><X size={20} /></button>
  </header>

  <div class="status-strip" aria-label="Resumo da montagem">
    <span><strong>{activeSizes.length}</strong> {activeSizes.length === 1 ? 'tamanho' : 'tamanhos'}</span>
    <ChevronRight size={15} aria-hidden="true" />
    <span><strong>{activeFlavors.length}</strong> {activeFlavors.length === 1 ? 'sabor' : 'sabores'}</span>
    <ChevronRight size={15} aria-hidden="true" />
    <span>{config.pricingMode === 'average' ? 'Preço médio' : 'Maior sabor'}</span>
  </div>

  <div class="content">
    {#if error}<div role="alert" class="error-banner">{error}</div>{/if}
    {#if loading}
      <p class="loading-copy">Carregando montagem…</p>
    {:else}
      <fieldset disabled={busy || loadFailed}>
        <section class="editor-section">
          <div class="section-heading"><span class="step">1</span><div><h3>Como cobrar</h3><p>A regra vale para todas as pizzas da loja.</p></div></div>
          <div class="choice-grid">
            <label class:chosen={config.pricingMode === 'highest'} class="choice-card"><input type="radio" name="pricing-mode" value="highest" bind:group={config.pricingMode} /><span><strong>Maior sabor</strong><small>Cobra o sabor mais caro da montagem.</small></span></label>
            <label class:chosen={config.pricingMode === 'average'} class="choice-card"><input type="radio" name="pricing-mode" value="average" bind:group={config.pricingMode} /><span><strong>Média dos sabores</strong><small>Soma os preços e divide pela quantidade de sabores.</small></span></label>
          </div>
          {#if config.pricingMode !== storeMode}<button class="secondary-button" type="button" on:click={changeStoreMode}>Aplicar regra à loja</button>{/if}
        </section>

        <section class="editor-section">
          <div class="section-heading"><span class="step">2</span><div><h3>Tamanhos</h3><p>Informe quantos sabores cabem em cada tamanho.</p></div></div>
          <div class="stack">
            {#each config.sizes as size (size.id)}
              <article class="item-card size-card">
                <div class="field grow"><label for={`size-name-${size.id}`}>Nome</label><input id={`size-name-${size.id}`} bind:value={size.name} placeholder="Ex.: Grande" /></div>
                <div class="field grow"><label for={`size-description-${size.id}`}>Descrição</label><input id={`size-description-${size.id}`} bind:value={size.description} placeholder="Ex.: 35 cm · 8 fatias" /></div>
                <div class="field compact"><label for={`size-flavors-${size.id}`}>Até quantos sabores?</label><input id={`size-flavors-${size.id}`} type="number" min="1" max="4" step="1" bind:value={size.maxFlavors} /></div>
                <label class="availability"><input class="themed-checkbox" type="checkbox" bind:checked={size.active} /> Disponível</label>
                <button class="icon-button" type="button" aria-label={`Excluir tamanho ${size.name || ''}`} on:click={() => removeSize(size.id)}><Trash2 size={17} /></button>
              </article>
            {:else}<p class="empty-copy">Adicione o primeiro tamanho para começar.</p>{/each}
          </div>
          <button class="secondary-button" type="button" on:click={addSize}><Plus size={17} /> Adicionar tamanho</button>
        </section>

        <section class="editor-section">
          <div class="section-heading"><span class="step">3</span><div><h3>Sabores e preços</h3><p>Use o preço da pizza inteira. Campo vazio deixa o sabor indisponível naquele tamanho.</p></div></div>
          <div class="stack">
            {#each config.flavors as flavor (flavor.id)}
              <article class="item-card flavor-card">
                <div class="flavor-head">
                  <div class="field grow"><label for={`flavor-name-${flavor.id}`}>Nome do sabor</label><input id={`flavor-name-${flavor.id}`} bind:value={flavor.name} placeholder="Ex.: Calabresa" /></div>
                  <label class="availability"><input class="themed-checkbox" type="checkbox" bind:checked={flavor.active} /> Disponível</label>
                  <button class="icon-button" type="button" aria-label={`Excluir sabor ${flavor.name || ''}`} on:click={() => config = { ...config, flavors: config.flavors.filter((candidate) => candidate.id !== flavor.id) }}><Trash2 size={17} /></button>
                </div>
                <div class="field"><label for={`flavor-description-${flavor.id}`}>Descrição</label><input id={`flavor-description-${flavor.id}`} bind:value={flavor.description} placeholder="Ingredientes do sabor" /></div>
                <div class="price-grid">{#each config.sizes as size (size.id)}<div class="field"><label for={`price-${flavor.id}-${size.id}`}>{size.name || 'Tamanho'} (R$)</label><input id={`price-${flavor.id}-${size.id}`} aria-label={`Preço de ${flavor.name} em ${size.name}`} type="number" min="0" step="0.01" value={flavor.prices[size.id] ?? ''} placeholder="—" on:input={(event) => updatePrice(flavor, size.id, event.currentTarget.value)} /></div>{/each}</div>
              </article>
            {:else}<p class="empty-copy">Adicione os sabores que o cliente poderá combinar.</p>{/each}
          </div>
          <button class="secondary-button" type="button" on:click={addFlavor}><Plus size={17} /> Adicionar sabor</button>

          <details class="import-box">
            <summary>Importar um produto existente como sabor</summary>
            <p>O produto original continua igual. O preço atual será copiado para o tamanho escolhido.</p>
            <div class="import-row">
              <Select.Root bind:value={importProduct}><Select.Trigger aria-label="Produto para importar">{catalog.find((product) => String(product.id) === importProduct)?.nome || 'Escolha o produto'}</Select.Trigger><Select.Content>{#each catalog as product}<Select.Item value={String(product.id)} label={`${product.nome} — ${money(product.preco)}`} />{/each}</Select.Content></Select.Root>
              <Select.Root bind:value={importSize}><Select.Trigger aria-label="Tamanho do preço importado">{config.sizes.find((size) => size.id === importSize)?.name || 'Escolha o tamanho'}</Select.Trigger><Select.Content>{#each config.sizes as size}<Select.Item value={size.id} label={size.name || 'Sem nome'} />{/each}</Select.Content></Select.Root>
              <button class="secondary-button import-action" type="button" disabled={!importSize || !importProduct} on:click={importFlavor}>Importar</button>
            </div>
          </details>
        </section>

        <section class="editor-section">
          <div class="section-heading"><span class="step">4</span><div><h3>Como aparece no ZeloMenu</h3><p>Você pode usar um nome e uma descrição diferentes no cardápio digital.</p></div></div>
          <div class="public-grid">
            <div class="field"><label for="public-name">Nome no cardápio</label><input id="public-name" bind:value={publicForm.nome_publico} placeholder={produto.nome} /></div>
            <div class="field"><label for="public-description">Descrição</label><input id="public-description" bind:value={publicForm.descricao_publica} placeholder="Monte com seus sabores favoritos" /></div>
            <div class="field public-photo"><label for="public-photo">Foto da pizza (URL HTTPS)</label><input id="public-photo" type="url" bind:value={publicForm.foto_url} placeholder="https://…" /></div>
          </div>
          <div class="toggle-row"><label><input class="themed-checkbox" type="checkbox" bind:checked={publicForm.visivel_online} /> Mostrar no cardápio digital</label><label><input class="themed-checkbox" type="checkbox" bind:checked={config.archived} /> Arquivar esta montagem</label></div>
        </section>

        <section class="editor-section preview-section">
          <div class="section-heading"><span class="step"><Check size={17} /></span><div><h3>Confira antes de salvar</h3><p>Monte um exemplo para verificar disponibilidade e preço.</p></div></div>
          <div class="preview-controls">
            <Select.Root bind:value={previewSize} onValueChange={() => previewFlavors = []}><Select.Trigger aria-label="Tamanho para prévia">{config.sizes.find((size) => size.id === previewSize)?.name || 'Escolha o tamanho'}</Select.Trigger><Select.Content>{#each activeSizes as size}<Select.Item value={size.id} label={size.name || 'Sem nome'} />{/each}</Select.Content></Select.Root>
            <div class="preview-flavors">{#each activeFlavors.filter((flavor) => flavor.prices[previewSize] != null) as flavor}<label><input class="themed-checkbox" type="checkbox" value={flavor.id} bind:group={previewFlavors} /> {flavor.name}</label>{/each}</div>
          </div>
          <div class="preview-result" aria-live="polite">{#if preview}<span>Preço da pizza</span><strong>{money(preview.baseUnitPrice)}</strong>{:else}<span>Escolha um tamanho e os sabores dentro do limite.</span>{/if}</div>
          <p class="extras-note">Borda, massa e adicionais são configurados como outros grupos em Complementos e opções.</p>
        </section>
      </fieldset>
    {/if}
  </div>

  <footer class="editor-footer"><button class="ghost-button" type="button" disabled={busy} on:click={() => dispatch('close')}>Cancelar</button><button class="primary-button" type="button" disabled={busy || loading || loadFailed} on:click={save}>{busy ? 'Salvando…' : 'Salvar montagem'}</button></footer>
</dialog>

<style>
  .pizza-editor { position: fixed; inset: 0; z-index: 100; display: flex; flex-direction: column; width: min(980px, calc(100vw - 32px)); max-height: min(920px, calc(100dvh - 32px)); margin: auto; padding: 0; overflow: hidden; color: var(--text-main); background: var(--bg-card); border: 1px solid var(--border-card); border-radius: 12px; box-shadow: 0 0 0 100vmax color-mix(in srgb, var(--bg-app) 82%, transparent); }
  .editor-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding: 20px 24px 16px; border-bottom: 1px solid var(--border-subtle); }
  .header-copy { min-width: 0; }
  .context-label { margin: 0 0 4px; color: var(--text-label); font-size: 0.875rem; font-weight: 700; }
  .editor-header h2 { margin: 0; font-size: 1.25rem; line-height: 1.25; }
  .editor-header p:not(.context-label) { margin: 5px 0 0; color: var(--text-muted); font-size: 0.875rem; line-height: 1.5; }
  .status-strip { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 8px 24px; overflow-x: auto; color: var(--text-label); background: var(--bg-panel); border-bottom: 1px solid var(--border-card); font-size: 0.875rem; white-space: nowrap; }
  .status-strip strong { color: var(--text-main); font-variant-numeric: tabular-nums; }
  .content { flex: 1; min-height: 0; padding: 0 24px 24px; overflow-y: auto; }
  fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
  .editor-section { padding: 24px 0; border-bottom: 1px solid var(--border-subtle); }
  .editor-section:last-child { border-bottom: 0; }
  .section-heading { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
  .section-heading h3 { margin: 0; font-size: 1rem; line-height: 1.35; }
  .section-heading p { margin: 3px 0 0; color: var(--text-muted); font-size: 0.875rem; line-height: 1.5; }
  .step { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 32px; width: 32px; height: 32px; color: var(--primary); font-size: 0.875rem; font-weight: 800; background: var(--accent-light); border: 1px solid color-mix(in srgb, var(--primary) 55%, var(--border-subtle)); border-radius: 8px; }
  .choice-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .choice-card { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 10px; min-height: 76px; padding: 14px; background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: 8px; cursor: pointer; }
  .choice-card.chosen { background: var(--accent-light); border-color: var(--primary); }
  .choice-card input { margin-top: 3px; accent-color: var(--primary); }
  .choice-card span { display: flex; flex-direction: column; gap: 4px; }
  .choice-card strong { font-size: 0.875rem; }
  .choice-card small { color: var(--text-muted); font-size: 0.875rem; line-height: 1.45; }
  .stack { display: flex; flex-direction: column; gap: 10px; }
  .item-card { background: var(--bg-input); border: 1px solid var(--border-card); border-radius: 8px; }
  .size-card { display: grid; grid-template-columns: 1fr 1.3fr 150px auto 44px; align-items: end; gap: 12px; padding: 14px; }
  .flavor-card { display: flex; flex-direction: column; gap: 12px; padding: 14px; }
  .flavor-head { display: grid; grid-template-columns: minmax(0, 1fr) auto 44px; align-items: end; gap: 12px; }
  .field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .field label { color: var(--text-label); font-size: 0.875rem; font-weight: 650; }
  .field input { width: 100%; min-height: 44px; padding: 9px 11px; color: var(--text-main); font: inherit; font-size: 0.875rem; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 8px; outline: none; }
  .field input:focus { border-color: var(--primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 24%, transparent); }
  .field input::placeholder { color: var(--text-muted); }
  .field.compact { max-width: 150px; }
  .availability { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; color: var(--text-label); font-size: 0.875rem; white-space: nowrap; }
  .price-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
  .public-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .public-photo { grid-column: 1 / -1; }
  .toggle-row { display: flex; flex-wrap: wrap; gap: 12px 24px; margin-top: 16px; }
  .toggle-row label, .preview-flavors label { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; color: var(--text-label); font-size: 0.875rem; }
  .import-box { margin-top: 16px; padding: 14px; background: var(--bg-panel); border: 1px solid var(--border-card); border-radius: 8px; }
  .import-box summary { min-height: 32px; color: var(--text-label); font-size: 0.875rem; font-weight: 700; cursor: pointer; }
  .import-box p { color: var(--text-muted); font-size: 0.875rem; }
  .import-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; align-items: end; gap: 10px; }
  .import-action { margin-top: 0 !important; }
  .preview-section { padding-bottom: 8px; }
  .preview-controls { display: grid; grid-template-columns: minmax(200px, 0.7fr) 1.3fr; align-items: start; gap: 16px; }
  .preview-flavors { display: flex; flex-wrap: wrap; gap: 4px 16px; }
  .preview-result { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 56px; margin-top: 14px; padding: 12px 14px; color: var(--text-label); background: var(--accent-light); border: 1px solid color-mix(in srgb, var(--primary) 55%, var(--border-subtle)); border-radius: 8px; }
  .preview-result strong { color: var(--text-main); font-size: 1.25rem; font-variant-numeric: tabular-nums; }
  .extras-note { margin: 12px 0 0; color: var(--text-muted); font-size: 0.875rem; line-height: 1.5; }
  .empty-copy, .loading-copy { margin: 0; padding: 18px; color: var(--text-muted); text-align: center; background: var(--bg-panel); border: 1px dashed var(--border-subtle); border-radius: 8px; font-size: 0.875rem; }
  .error-banner { margin-top: 18px; padding: 12px 14px; color: var(--error); background: var(--error-bg); border: 1px solid var(--error); border-radius: 8px; font-size: 0.875rem; line-height: 1.45; }
  .editor-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 24px; background: var(--bg-card); border-top: 1px solid var(--border-subtle); }
  button { font-family: inherit; }
  .icon-button, .secondary-button, .ghost-button, .primary-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 44px; border-radius: 8px; cursor: pointer; }
  .icon-button { flex: 0 0 44px; width: 44px; padding: 0; color: var(--text-label); background: transparent; border: 1px solid var(--border-subtle); }
  .secondary-button, .ghost-button, .primary-button { padding: 9px 14px; font-size: 0.875rem; font-weight: 700; }
  .secondary-button { margin-top: 14px; color: var(--text-main); background: var(--bg-panel); border: 1px solid var(--border-subtle); }
  .ghost-button { color: var(--text-label); background: transparent; border: 1px solid var(--border-subtle); }
  .primary-button { color: var(--primary-text); background: var(--primary); border: 1px solid var(--primary); }
  button:hover:not(:disabled) { border-color: var(--primary); }
  .primary-button:hover:not(:disabled) { background: var(--primary-hover); }
  button:focus-visible, summary:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  button:disabled, fieldset:disabled { cursor: not-allowed; opacity: 0.55; }

  @media (max-width: 760px) {
    .pizza-editor { width: 100vw; max-width: none; height: 100dvh; max-height: none; border: 0; border-radius: 0; }
    .editor-header { padding: 16px; }
    .status-strip { padding: 8px 16px; }
    .content { padding: 0 16px 20px; }
    .editor-section { padding: 20px 0; }
    .choice-grid, .public-grid, .preview-controls { grid-template-columns: 1fr; }
    .public-photo { grid-column: auto; }
    .size-card, .flavor-head { grid-template-columns: minmax(0, 1fr) 44px; }
    .size-card .grow, .size-card .compact { grid-column: 1 / -1; max-width: none; }
    .size-card .availability { grid-column: 1; }
    .flavor-head .grow { grid-column: 1 / -1; }
    .import-row { grid-template-columns: 1fr; }
    .editor-footer { padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); }
    .editor-footer button { flex: 1; }
  }

  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; } }
</style>

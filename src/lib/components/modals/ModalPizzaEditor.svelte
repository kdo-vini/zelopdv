<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { Plus, X, Trash2 } from 'lucide-svelte';
  import * as Select from '$lib/components/ui/select/index.js';
  import { supabase } from '$lib/supabaseClient';
  import { addToast, confirmAction } from '$lib/stores/ui';
  import { importPizzaFlavor, setPizzaPrice } from '$lib/pizzaEditor';
  import { resolvePizza, validatePizzaConfig } from '$lib/pizza';

  export let produto;
  export let ownerUserId;
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
  let stockMode = config.sizes.some(s => s.stockProductId) ? 'size' : 'parent';
  function manageFocus(node) {
    const previous = document.activeElement;
    node.querySelector('button')?.focus();
    function keydown(event) {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); dispatch('close'); }
      if (event.key !== 'Tab') return;
      const elements = [...node.querySelectorAll('button:not(:disabled),input:not(:disabled),summary,[tabindex="0"]')].filter(el => el.getClientRects().length);
      if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === elements.at(-1)) { event.preventDefault(); elements[0]?.focus(); }
    }
    node.addEventListener('keydown', keydown);
    return { destroy() { node.removeEventListener('keydown', keydown); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); } };
  }
  $: preview = previewPrice(config, previewSize, previewFlavors);
  function previewPrice(value, sizeId, flavorIds) {
    try { const result = resolvePizza(value, { revision: value.revision, sizeId, flavorIds }); return result.ok ? result : null; }
    catch { return null; }
  }
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
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
      catalog = rows.filter(p => p.id !== produto.id && p.tipo_produto !== 'pizza');
      const { data: pub, error: pubError } = await supabase.from('zelomenu_product_publications').select('id,nome_publico,descricao_publica,foto_url,visivel_online,updated_at').eq('id_usuario', ownerUserId).eq('id_produto', produto.id).maybeSingle();
      if (pubError) throw pubError;
      publication = pub;
      if (pub) publicForm = { nome_publico: pub.nome_publico || '', descricao_publica: pub.descricao_publica || '', foto_url: pub.foto_url || '', visivel_online: pub.visivel_online };
    } catch (e) { error = e.message; loadFailed = true; }
    finally { loading = false; }
  });
  function addSize() {
    config = { ...config, sizes: [...config.sizes, { id: crypto.randomUUID(), name: '', maxFlavors: 2, active: true, stockProductId: null }] };
  }
  function addFlavor() {
    config = { ...config, flavors: [...config.flavors, { id: crypto.randomUUID(), name: '', description: '', active: true, prices: {} }] };
  }
  function importFlavor() {
    try {
      const product = catalog.find(p => String(p.id) === importProduct);
      if (!product) throw new Error('Escolha o produto a importar.');
      config = { ...config, flavors: [...config.flavors, importPizzaFlavor(product, importSize)] };
      importProduct = '';
    } catch (e) { error = e.message; }
  }
  function updatePrice(flavor, sizeId, value) {
    try { flavor.prices = setPizzaPrice(flavor.prices, sizeId, value); config = { ...config }; error = ''; }
    catch (e) { error = e.message; }
  }
  async function changeStoreMode() {
    if (config.pricingMode === storeMode) return;
    if (!await confirmAction('Cobrança das pizzas', 'Esta regra será aplicada a todas as pizzas da loja. Alterações ainda não salvas neste editor serão descartadas ao recarregar a configuração. Pedidos realizados mantêm o preço original. Alterar agora?')) {
      config = { ...config, pricingMode: storeMode }; return;
    }
    busy = true;
    const { error: saveError } = await supabase.rpc('save_pizza_pricing_mode', { p_pricing_mode: config.pricingMode });
    if (saveError) { error = saveError.message; config = { ...config, pricingMode: storeMode }; }
    else {
      storeMode = config.pricingMode;
      // The store-wide change creates a new revision for every existing pizza.
      const { data, error: readError } = await supabase.from('produtos').select('pizza_config').eq('id', produto.id).single();
      if (readError) { error = 'Regra alterada. Reabra o editor para carregar a revisão atual.'; loading = true; }
      else {
        expectedRevision = data.pizza_config?.revision || null;
        config = structuredClone(data.pizza_config || { version: 1, revision: crypto.randomUUID(), pricingMode: storeMode, sizes: [], flavors: [] });
        savedArchived = Boolean(config.archived);
        stockMode = config.sizes.some(s => s.stockProductId) ? 'size' : 'parent';
        previewSize = ''; previewFlavors = [];
      }
      dispatch('changed');
    }
    busy = false;
  }
  async function save() {
    error = '';
    if (publicForm.foto_url && !/^https:\/\//i.test(publicForm.foto_url.trim())) { error = 'Informe uma URL HTTPS para a foto.'; return; }
    if (config.pricingMode !== storeMode) { error = 'Aplique a regra de cobrança antes de salvar.'; return; }
    const next = { ...config, sizes: config.sizes.map(s => ({ ...s, stockProductId: stockMode === 'parent' ? null : Number(s.stockProductId) || null })) };
    if (stockMode === 'size' && next.sizes.some(s => !s.stockProductId)) { error = 'Vincule um produto de estoque para cada tamanho.'; return; }
    if (stockMode === 'size' && (produto.controlar_estoque || produto.categorias?.controlar_estoque_compartilhado)) {
      error = 'Desative o estoque do produto e use uma categoria sem estoque compartilhado antes de vincular estoque por tamanho.'; return;
    }
    try {
      const result = validatePizzaConfig(next);
      if (!result.ok) throw new Error(result.message);
      if (savedArchived && !next.archived && !await confirmAction('Reativar pizza', 'Reativar a montagem desta pizza? Depois confira a publicação no cardápio e a visibilidade no PDV.')) return;
      if (produto.tipo_produto !== 'pizza' && !expectedRevision && !await confirmAction('Converter em pizza montável', 'Este produto passará a exigir tamanho e sabores no PDV e no ZeloMenu. O preço será calculado pela montagem. Confirmar?')) return;
      busy = true;
      const { data, error: saveError } = await supabase.rpc('save_pizza_config', { p_product_id: produto.id, p_expected_revision: expectedRevision, p_config: next });
      if (saveError) throw saveError;
      config = data; expectedRevision = data.revision;
      savedArchived = Boolean(config.archived);
      if (savedArchived) {
        addToast('Pizza arquivada e retirada do PDV e do cardápio. Histórico preservado.', 'success');
        dispatch('saved');
        return;
      }
      const publicationPayload = { ...publicForm, foto_url: publicForm.foto_url.trim() || null, nome_publico: publicForm.nome_publico.trim() || null, descricao_publica: publicForm.descricao_publica.trim() || null, updated_at: new Date().toISOString() };
      const table = supabase.from('zelomenu_product_publications');
      const mutation = publication
        ? table.update(publicationPayload).eq('id', publication.id).eq('id_usuario', ownerUserId).eq('updated_at', publication.updated_at)
        : table.insert({ ...publicationPayload, id_usuario: ownerUserId, id_produto: produto.id, pausado_manualmente: false, ordem: 0 });
      const { data: savedPublication, error: publicationError } = await mutation.select('id,updated_at').maybeSingle();
      if (publicationError || !savedPublication) throw new Error('Montagem salva; publicação não foi salva. ' + (publicationError?.message || 'O cardápio mudou em outra sessão. Reabra o editor.'));
      publication = savedPublication;
      addToast('Pizza salva. Confira a publicação no cardápio e a visibilidade no PDV.', 'success');
      dispatch('saved');
    } catch (e) { error = e.message; }
    finally { busy = false; }
  }
</script>

<dialog open aria-modal="true" aria-labelledby="pizza-editor-title" class="pizza-editor" use:manageFocus on:cancel|preventDefault={() => !busy && dispatch('close')}>
  <header><div><h2 id="pizza-editor-title">{produto.nome} · Pizza montável</h2><p>Tamanhos, sabores e preços compartilhados com o PDV e o ZeloMenu.</p></div><button type="button" aria-label="Fechar editor" disabled={busy} on:click={() => dispatch('close')}><X size={20}/></button></header>
  <div class="content">
    {#if error}<p role="alert" class="error">{error}</p>{/if}
    {#if loading}<p>Carregando configuração…</p>{:else}
      <fieldset disabled={busy || loadFailed}>
      <section><h3>Disponibilidade da linha</h3><label class="check"><input class="themed-checkbox" type="checkbox" bind:checked={config.archived}/>Arquivada</label><p>Ao salvar arquivada, esta pizza sai do PDV e do cardápio. Desmarque para reativar a montagem; pedidos realizados mantêm seu histórico.</p></section>
      <section><h3>Apresentação no ZeloMenu</h3><label>Nome no cardápio<input bind:value={publicForm.nome_publico} placeholder={produto.nome}/></label><label>Descrição<input bind:value={publicForm.descricao_publica} placeholder="Monte sua pizza com seus sabores favoritos"/></label><label>Foto (URL HTTPS)<input type="url" bind:value={publicForm.foto_url} placeholder="https://…"/></label><label class="check"><input class="themed-checkbox" type="checkbox" bind:checked={publicForm.visivel_online}/>Publicar no cardápio digital</label><p>A visibilidade no PDV é alterada no cadastro do produto.</p></section>
      <section><h3>Cobrança da loja</h3><div class="row"><Select.Root bind:value={config.pricingMode}><Select.Trigger aria-label="Regra de cobrança">{config.pricingMode === 'average' ? 'Média proporcional' : 'Maior sabor'}</Select.Trigger><Select.Content><Select.Item value="highest" label="Maior sabor"/><Select.Item value="average" label="Média proporcional"/></Select.Content></Select.Root><button type="button" disabled={busy || config.pricingMode === storeMode} on:click={changeStoreMode}>Aplicar à loja</button></div></section>
      <section><h3>Tamanhos</h3><p>De um a quatro sabores distintos, divididos em partes iguais.</p>
        {#each config.sizes as size, i (size.id)}<div class="size-row"><label>Nome<input bind:value={size.name} placeholder="Grande"/></label><label>Descrição<input bind:value={size.description} placeholder="35 cm · 8 fatias"/></label><label>Máximo de sabores<input type="number" min="1" max="4" step="1" bind:value={size.maxFlavors}/></label><label class="check"><input class="themed-checkbox" type="checkbox" bind:checked={size.active}/>Disponível</label><button type="button" aria-label="Excluir tamanho" on:click={() => config = { ...config, sizes: config.sizes.filter((_, index) => index !== i), flavors: config.flavors.map(f => ({ ...f, prices: setPizzaPrice(f.prices, size.id, '') })) }}><Trash2 size={16}/></button></div>{/each}
        <button type="button" on:click={addSize}><Plus size={16}/> Adicionar tamanho</button>
      </section>
      <section><h3>Sabores e preços</h3><p>Informe o preço da pizza inteira em cada tamanho. Campo vazio deixa a combinação indisponível.</p>
        {#each config.flavors as flavor, i (flavor.id)}<div class="flavor"><div class="row"><label>Nome<input bind:value={flavor.name} placeholder="Calabresa"/></label><label class="check"><input class="themed-checkbox" type="checkbox" bind:checked={flavor.active}/>Disponível</label><button type="button" aria-label="Excluir sabor" on:click={() => config = { ...config, flavors: config.flavors.filter((_, index) => index !== i) }}><Trash2 size={16}/></button></div><label>Descrição<input bind:value={flavor.description} placeholder="Ingredientes do sabor"/></label><label>Foto do sabor (URL HTTPS, opcional)<input type="url" bind:value={flavor.photoUrl} placeholder="https://…"/></label><div class="row">{#each config.sizes as size (size.id)}<label>{size.name || 'Tamanho'} (R$)<input aria-label={`Preço de ${flavor.name} em ${size.name}`} type="number" min="0" step="0.01" value={flavor.prices[size.id] ?? ''} on:input={event => updatePrice(flavor, size.id, event.currentTarget.value)}/></label>{/each}</div></div>{/each}
        <button type="button" on:click={addFlavor}><Plus size={16}/> Adicionar sabor</button>
        <details><summary>Importar produto existente como sabor</summary><p>Escolha o tamanho correspondente ao preço atual. O produto original permanecerá intacto.</p><div class="row"><Select.Root bind:value={importProduct}><Select.Trigger aria-label="Produto para importar">{catalog.find(p => String(p.id) === importProduct)?.nome || 'Produto'}</Select.Trigger><Select.Content>{#each catalog as p}<Select.Item value={String(p.id)} label={`${p.nome} — ${money(p.preco)}`}/>{/each}</Select.Content></Select.Root><Select.Root bind:value={importSize}><Select.Trigger aria-label="Tamanho do preço importado">{config.sizes.find(s => s.id === importSize)?.name || 'Tamanho correspondente'}</Select.Trigger><Select.Content>{#each config.sizes as s}<Select.Item value={s.id} label={s.name || 'Sem nome'}/>{/each}</Select.Content></Select.Root><button type="button" disabled={!importSize || !importProduct} on:click={importFlavor}>Importar sabor</button></div></details>
      </section>
      <section><h3>Estoque da pizza pronta</h3><Select.Root bind:value={stockMode}><Select.Trigger aria-label="Origem do estoque">{stockMode === 'parent' ? 'Produto principal / categoria' : 'Produto vinculado por tamanho'}</Select.Trigger><Select.Content><Select.Item value="parent" label="Produto principal / categoria"/><Select.Item value="size" label="Produto vinculado por tamanho"/></Select.Content></Select.Root><p>Uma unidade por pizza. Sabores não consomem estoque separadamente.</p>{#if stockMode === 'size'}{#each config.sizes as size}<div class="row"><span>{size.name}</span><Select.Root value={String(size.stockProductId || '')} onValueChange={value => { size.stockProductId = Number(value); config = { ...config }; }}><Select.Trigger aria-label={`Estoque de ${size.name}`}>{catalog.find(p => p.id === size.stockProductId)?.nome || 'Escolha o produto'}</Select.Trigger><Select.Content>{#each catalog as p}<Select.Item value={String(p.id)} label={p.nome}/>{/each}</Select.Content></Select.Root></div>{/each}{/if}</section>
      <section><h3>Prévia da montagem</h3><Select.Root bind:value={previewSize} onValueChange={() => previewFlavors = []}><Select.Trigger aria-label="Tamanho para prévia">{config.sizes.find(s => s.id === previewSize)?.name || 'Escolha o tamanho'}</Select.Trigger><Select.Content>{#each config.sizes.filter(s => s.active) as s}<Select.Item value={s.id} label={s.name || 'Sem nome'}/>{/each}</Select.Content></Select.Root><div class="row">{#each config.flavors.filter(f => f.active && f.prices[previewSize] != null) as f}<label class="check"><input class="themed-checkbox" type="checkbox" value={f.id} bind:group={previewFlavors}/>{f.name}</label>{/each}</div><p aria-live="polite">{preview ? `Base: ${money(preview.baseUnitPrice)}` : 'Selecione os sabores respeitando o limite do tamanho.'}</p><p>Massa e borda opcionais: configure grupos de seleção única em “Complementos e opções”. Use cobrança por soma; extras são aplicados à pizza inteira.</p></section>
      </fieldset>
    {/if}
  </div>
  <footer><button type="button" disabled={busy} on:click={() => dispatch('close')}>Cancelar</button><button class="primary" type="button" disabled={busy || loading || loadFailed} on:click={save}>{busy ? 'Salvando…' : 'Salvar pizza'}</button></footer>
</dialog>

<style>
  .pizza-editor { position:fixed; inset:0; z-index:100; width:min(960px,100vw); max-height:94dvh; margin:auto; padding:0; display:flex; flex-direction:column; background:var(--bg-card); color:var(--text-main); border:1px solid var(--border-card); border-radius:12px; box-shadow:0 0 0 100vmax color-mix(in srgb,var(--bg-app) 80%,transparent); }
  header,footer { padding:20px; display:flex; justify-content:space-between; gap:16px; border-bottom:1px solid var(--border-subtle); } header h2 { font-size:20px; font-weight:700; } footer { border-top:1px solid var(--border-subtle); border-bottom:0; justify-content:flex-end; } .content { overflow:auto; padding:0 20px; } section { padding:20px 0; border-bottom:1px solid var(--border-subtle); } h3 { font-size:16px; font-weight:600; margin-bottom:10px; } p { font-size:14px; color:var(--text-muted); margin:8px 0; } .row,.size-row { display:flex; flex-wrap:wrap; gap:12px; align-items:end; margin:12px 0; } .row>label,.size-row>label { flex:1; min-width:120px; } label { display:flex; flex-direction:column; gap:5px; font-size:14px; color:var(--text-label); } label.check { flex-direction:row; align-items:center; min-height:38px; } input:not([type=checkbox]) { width:100%; background:var(--bg-input); border:1px solid var(--border-subtle); border-radius:6px; padding:8px; color:var(--text-main); } button { display:inline-flex; align-items:center; gap:6px; padding:8px 12px; border:1px solid var(--border-subtle); border-radius:6px; font-size:14px; } button:disabled { opacity:.5; } button:hover:not(:disabled) { border-color:var(--primary); } button:focus-visible,input:focus-visible { outline:2px solid var(--primary); outline-offset:2px; } fieldset { border:0; margin:0; padding:0; min-width:0; } .primary { background:var(--primary); color:var(--primary-text); } .error { color:var(--error); } .flavor { border-bottom:1px solid var(--border-subtle); padding-bottom:12px; margin-bottom:12px; } details { margin-top:20px; } summary { cursor:pointer; } @media(max-width:640px) { .pizza-editor { max-height:100dvh; height:100dvh; border-radius:0; } }
</style>

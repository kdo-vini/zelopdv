<script>
  import { createEventDispatcher } from 'svelte';
  import { Plus, Minus, Trash2, X, Search, LoaderCircle } from 'lucide-svelte';
  import ModalProdutoMontavel from './ModalProdutoMontavel.svelte';
  import { pdvCache } from '$lib/stores/pdvCache';
  import { buscarProdutosLocal } from '$lib/offlineDb';
  import { readDraft, saveDraft } from '$lib/offline/operations';
  import { createManualOrder } from '$lib/offline/orders';
  import { SELECTABLE_PAYMENT_METHODS } from '$lib/finance/paymentMethods';
  import { hasActiveModifierGroups, formatSelectedModifierGroups } from '$lib/zelomenuModifiers';

  export let open = false;
  export let ownerUserId = null;
  export let operatorId = null;

  const dispatch = createEventDispatcher();
  const paymentMethods = SELECTABLE_PAYMENT_METHODS.filter(method => !method.requiresCustomer);
  const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  let products = [];
  let items = [];
  let search = '';
  let name = '', phone = '', address = '', date = '', time = '', declaredMethod = '', observations = '';
  let fulfillmentType = 'pickup';
  let deliveryFee = 0;
  let operationId = '';
  let selectedProduct = null;
  let loading = false, saving = false, ready = false;
  let error = '', draftError = '';
  let activeScope = '';
  let loadGeneration = 0;
  let persisted = '';
  let writes = Promise.resolve();

  $: scope = open && ownerUserId && operatorId ? `${ownerUserId}:${operatorId}` : '';
  $: if (scope !== activeScope) {
    activeScope = scope;
    ready = false;
    selectedProduct = null;
    loadGeneration++;
    if (scope) initialize(ownerUserId, operatorId, loadGeneration);
  }
  $: filtered = products.filter(product => String(product.nome || '').toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')));
  $: subtotal = items.reduce((sum, item) => sum + Math.round(item.unitPrice * 100) * item.quantity, 0) / 100;
  $: total = subtotal + (fulfillmentType === 'delivery' ? Number(deliveryFee || 0) : 0);
  $: draft = { items, name, phone, address, date, time, declaredMethod, observations, fulfillmentType, deliveryFee, operationId };
  $: if (ready && open && !saving) persist(draft, ownerUserId, operatorId);

  async function initialize(owner, operator, generation) {
    loading = true;
    error = '';
    draftError = '';
    products = [];
    search = '';
    try {
      await writes.catch(() => {});
      const saved = await readDraft(owner, operator, 'manual-order');
      if (generation !== loadGeneration) return;
      const now = new Date();
      items = saved?.items || [];
      name = saved?.name || ''; phone = saved?.phone || ''; address = saved?.address || '';
      date = saved?.date ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      time = saved?.time ?? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      declaredMethod = saved?.declaredMethod || ''; observations = saved?.observations || '';
      fulfillmentType = saved?.fulfillmentType || 'pickup'; deliveryFee = saved?.deliveryFee ?? 0;
      operationId = saved?.operationId || crypto.randomUUID();
      persisted = '';
      ready = true;
      const local = await buscarProdutosLocal('', owner);
      if (generation !== loadGeneration) return;
      if (local.length) products = local;
      else if (navigator.onLine !== false) {
        pdvCache.setUserId(owner);
        const remote = await pdvCache.getProdutos();
        if (generation !== loadGeneration) return;
        products = remote;
      }
      if (!products.length) error = 'Nenhum produto disponível neste aparelho. Conecte-se e prepare o catálogo para uso offline.';
    } catch (err) {
      if (generation === loadGeneration) error = err?.message || 'Não foi possível carregar o pedido. Tente novamente.';
    } finally {
      if (generation === loadGeneration) loading = false;
    }
  }

  function persist(value, owner, operator) {
    const serialized = JSON.stringify(value);
    if (serialized === persisted) return;
    persisted = serialized;
    const generation = loadGeneration;
    writes = writes.catch(() => {}).then(() => saveDraft(owner, operator, 'manual-order', JSON.parse(serialized)));
    writes.then(() => { if (generation === loadGeneration) draftError = ''; }).catch(() => {
      if (generation === loadGeneration) { persisted = ''; draftError = 'Não foi possível salvar o rascunho neste aparelho. Mantenha esta tela aberta e tente salvar novamente.'; }
    });
  }

  function choose(product) {
    if (saving) return;
    if (product.tipo_produto === 'pizza' || hasActiveModifierGroups(product.modifierGroups)) selectedProduct = product;
    else add(product, Number(product.preco || 0));
  }

  function add(product, price, modifiers = [], pizza = null) {
    const match = items.find(item => item.productId === product.id && item.unitPrice === price && JSON.stringify(item.modifiers) === JSON.stringify(modifiers) && JSON.stringify(item.pizza) === JSON.stringify(pizza));
    if (match) changeQuantity(match.key, 1);
    else if (items.length >= 50) error = 'Cada pedido pode ter até 50 itens diferentes.';
    else items = [...items, { key: crypto.randomUUID(), productId: product.id, name: product.nome, unitPrice: price, quantity: 1, modifiers, pizza }];
  }

  function changeQuantity(key, delta) {
    if (items.some(item => item.key === key && item.quantity + delta > 999)) { error = 'A quantidade máxima por item é 999.'; return; }
    items = items.map(item => item.key === key ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item);
  }

  function close() {
    if (!saving) dispatch('close');
  }

  function focusDialog(node) {
    const previous = document.activeElement;
    node.focus();
    function keydown(event) {
      if (selectedProduct) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const controls = [...node.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')].filter(control => control.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    node.addEventListener('keydown', keydown);
    return { destroy() { node.removeEventListener('keydown', keydown); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); } };
  }

  async function save() {
    if (saving || !ready || !items.length) return;
    error = '';
    const fee = fulfillmentType === 'delivery' ? Number(deliveryFee || 0) : 0;
    if (!Number.isFinite(fee) || fee < 0 || fee > 1000000) { error = 'Informe um frete entre R$ 0 e R$ 1.000.000.'; return; }
    if (items.length > 50 || items.some(item => item.quantity > 999)) { error = 'Use até 50 itens diferentes e até 999 unidades por item.'; return; }
    const scheduled = date && time ? new Date(`${date}T${time}`) : null;
    if (scheduled && !Number.isFinite(scheduled.getTime())) { error = 'Confira a data e o horário do pedido.'; return; }
    saving = true;
    const generation = loadGeneration;
    const owner = ownerUserId, operator = operatorId, intentId = operationId;
    const input = {
      items: items.map(({ key, ...item }) => item),
      customer: { name: name.trim(), phone: phone.trim() },
      fulfillment: { type: fulfillmentType, address: fulfillmentType === 'delivery' ? address.trim() : '', scheduledAt: scheduled?.toISOString() || null, pickupDate: date || null, pickupTime: time || null },
      payment: { declaredMethod: declaredMethod || null }, deliveryFee: fee, observations: observations.trim()
    };
    try {
      await writes;
      if (generation !== loadGeneration) return;
      const result = await createManualOrder(input, { operationId: intentId, ownerUserId: owner, operatorId: operator });
      if (generation !== loadGeneration) return;
      ready = false;
      dispatch('created', result);
      dispatch('close');
    } catch (err) {
      if (generation === loadGeneration) error = err?.message || 'Não foi possível salvar o pedido. O rascunho foi mantido; tente novamente.';
    } finally { saving = false; }
  }
</script>

{#if open}
  <div class="backdrop">
    <div class="manual-order mobile-bottom-nav-dialog" role="dialog" aria-modal="true" aria-labelledby="manual-order-title" tabindex="-1" use:focusDialog inert={!!selectedProduct}>
      <header>
        <div><p class="eyebrow">Pedidos</p><h2 id="manual-order-title">Criar pedido</h2><p>Adicione os produtos. Os demais dados são opcionais.</p></div>
        <button type="button" class="icon-button" aria-label="Fechar criação de pedido" disabled={saving} on:click={close}><X size={20} /></button>
      </header>
      <form on:submit|preventDefault={save}>
        <div class="content-scroll">
        <fieldset class="content" disabled={saving || !ready}>
          <section class="catalog" aria-label="Catálogo de produtos">
            <label class="search"><Search size={18} /><input aria-label="Buscar produto" placeholder="Buscar produto" bind:value={search} /></label>
            {#if loading}<p class="hint" role="status">Carregando catálogo…</p>{/if}
            <div class="products">
              {#each filtered as product (product.id)}
                <button type="button" class="product" on:click={() => choose(product)}><span>{product.nome}<small>{product.tipo_produto === 'pizza' ? 'Montar pizza' : hasActiveModifierGroups(product.modifierGroups) ? 'Montar produto' : money(product.preco)}</small></span><Plus size={18} /></button>
              {:else}{#if !loading}<p class="hint">Nenhum produto encontrado.</p>{/if}{/each}
            </div>
          </section>
          <section class="details" aria-label="Dados do pedido">
            <h3>Itens do pedido</h3>
            {#each items as item (item.key)}
              <div class="item"><div><strong>{item.name}</strong>{#if item.modifiers?.length}<small>{formatSelectedModifierGroups(item.modifiers)}</small>{/if}<small>{money(item.unitPrice)} por unidade</small></div><div class="item-actions"><button class="icon-button" type="button" aria-label={`Diminuir quantidade de ${item.name}`} disabled={item.quantity <= 1} on:click={() => changeQuantity(item.key, -1)}><Minus size={16} /></button><span aria-label="Quantidade">{item.quantity}</span><button class="icon-button" type="button" aria-label={`Aumentar quantidade de ${item.name}`} on:click={() => changeQuantity(item.key, 1)}><Plus size={16} /></button><strong>{money(item.unitPrice * item.quantity)}</strong><button class="icon-button" type="button" aria-label={`Remover ${item.name}`} on:click={() => items = items.filter(row => row.key !== item.key)}><Trash2 size={16} /></button></div></div>
            {:else}<p class="hint empty">Escolha um produto para começar.</p>{/each}
            <div class="fields">
              <label>Nome<input autocomplete="name" bind:value={name} /></label>
              <label>Telefone<input type="tel" autocomplete="tel" bind:value={phone} /></label>
              <label class="wide">Tipo de pedido<select bind:value={fulfillmentType}><option value="pickup">Retirada</option><option value="delivery">Entrega</option></select></label>
              {#if fulfillmentType === 'delivery'}<label class="wide">Endereço<textarea rows="2" autocomplete="street-address" bind:value={address}></textarea></label><label class="wide">Frete (R$)<input type="number" min="0" max="1000000" step="0.01" inputmode="decimal" bind:value={deliveryFee} /></label>{/if}
              <label>Data prevista<input type="date" bind:value={date} /></label><label>Horário previsto<input type="time" bind:value={time} /></label>
              <label class="wide">Forma de pagamento<select bind:value={declaredMethod}><option value="">Não informada</option>{#each paymentMethods as method}<option value={method.id}>{method.label}</option>{/each}</select></label>
              <label class="wide">Observações<textarea rows="2" bind:value={observations}></textarea></label>
            </div>
          </section>
        </fieldset>
        </div>
        <footer>
          {#if error}<p class="error" role="alert">{error}</p>{/if}
          {#if draftError}<p class="error" role="alert">{draftError}</p>{/if}
          <div class="footer-row"><div><small>Produtos {money(subtotal)}{#if fulfillmentType === 'delivery'} · Frete {money(deliveryFee)}{/if}</small><strong>Total {money(total)}</strong></div><button class="save" type="submit" disabled={saving || !ready || !items.length}>{#if saving}<LoaderCircle size={18} />Salvando…{:else}Criar pedido{/if}</button></div>
        </footer>
      </form>
    </div>
  </div>
  <ModalProdutoMontavel open={!!selectedProduct} produto={selectedProduct} precoBase={Number(selectedProduct?.preco || 0)} on:close={() => selectedProduct = null} on:confirm={(event) => { const { produto, preco, modifiers, pizza } = event.detail; add(produto, preco, modifiers, pizza || null); selectedProduct = null; }} />
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 75; display: grid; place-items: center; padding: 1rem; background: color-mix(in srgb, var(--bg-app) 78%, transparent); backdrop-filter: blur(5px); }
  .manual-order { width: min(100%, 1060px); max-height: 92dvh; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border-strong); border-radius: 14px; background: var(--bg-card); color: var(--text-main); }
  header { display: flex; align-items: start; justify-content: space-between; gap: 1rem; padding: 1.1rem 1.3rem; border-bottom: 1px solid var(--border-subtle); }
  h2 { margin: .2rem 0; font-size: 1.25rem; font-weight: 750; } h3 { margin: 0 0 .8rem; font-size: 1rem; }
  p { margin: 0; font-size: .875rem; color: var(--text-muted); } .eyebrow { text-transform: uppercase; letter-spacing: .15em; font-size: .625rem; font-weight: 700; }
  header, footer { flex-shrink: 0; }
  form { display: flex; flex: 1; flex-direction: column; min-height: 0; overflow: hidden; }
  .content-scroll { flex: 1; min-height: 0; overflow-y: auto; }
  .content { display: grid; grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); min-width: 0; margin: 0; border: 0; padding: 0; }
  .catalog, .details { padding: 1.2rem; min-width: 0; } .catalog { border-right: 1px solid var(--border-subtle); } .search { display: flex; align-items: center; gap: .5rem; }
  .products { display: grid; gap: .5rem; margin-top: .8rem; max-height: 54vh; overflow-y: auto; } .product { display: flex; justify-content: space-between; align-items: center; gap: .75rem; padding: .85rem; text-align: left; background: var(--bg-panel); border: 1px solid var(--border-subtle); border-radius: .5rem; color: var(--text-main); }
  small { display: block; color: var(--text-muted); font-size: .875rem; line-height: 1.5; } .product small { margin-top: .3rem; }
  button { cursor: pointer; } button:disabled { opacity: .5; cursor: not-allowed; } button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .icon-button { display: inline-flex; align-items: center; justify-content: center; min-width: 36px; min-height: 36px; border: 1px solid var(--border-subtle); border-radius: .5rem; background: var(--bg-panel); color: var(--text-label); }
  .item { padding: .75rem 0; border-bottom: 1px solid var(--border-subtle); font-size: .875rem; } .item-actions { display: flex; align-items: center; gap: .5rem; margin-top: .5rem; } .item-actions strong { margin-left: auto; }
  .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .85rem; margin-top: 1.25rem; } label { display: flex; flex-direction: column; gap: .35rem; font-size: .875rem; color: var(--text-label); } .wide { grid-column: 1 / -1; }
  input, select, textarea { width: 100%; min-width: 0; min-height: 42px; box-sizing: border-box; border: 1px solid var(--border-strong); border-radius: .5rem; padding: .55rem .65rem; background: var(--bg-input); color: var(--text-main); font: inherit; color-scheme: dark; } textarea { resize: vertical; } .search { flex-direction: row; }
  .hint { padding: .7rem 0; } .empty { padding: 1rem; border: 1px dashed var(--border-strong); border-radius: .5rem; }
  footer { padding: 1rem 1.3rem; border-top: 1px solid var(--border-subtle); background: var(--bg-panel); } .footer-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; } .footer-row strong { display: block; font-size: 1.125rem; } .save { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; min-height: 46px; padding: .7rem 1.25rem; border: 0; border-radius: .5rem; background: var(--primary); color: var(--primary-text); font-weight: 750; } .error { color: var(--error); margin-bottom: .7rem; }
  @media (max-width: 700px) { .backdrop { padding: 0; align-items: end; bottom: var(--mobile-bottom-nav-offset, 0px); } .manual-order { max-height: calc(100dvh - var(--mobile-bottom-nav-offset, 0px)); border-radius: 14px 14px 0 0; } .content { grid-template-columns: minmax(0, 1fr); } .catalog { border-right: 0; border-bottom: 1px solid var(--border-subtle); } .products { max-height: 180px; } .catalog, .details { padding: 1rem; } .icon-button { min-width: 42px; min-height: 42px; } footer { padding: 1rem; padding-bottom: max(1rem, env(safe-area-inset-bottom)); } .footer-row { flex-wrap: wrap; } }
</style>

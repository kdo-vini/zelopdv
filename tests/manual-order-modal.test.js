import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'svelte/compiler';

// Run the component's actual event handlers with storage/network controlled by the test.
// Browser coverage separately exercises DOM bindings, keyboard focus and the pizza modal.
function harness(saved = null) {
  const source = readFileSync(new URL('../src/lib/components/modals/ModalPedidoManual.svelte', import.meta.url), 'utf8');
  const ast = parse(source);
  const body = ast.instance.content.body.filter(node => !['ImportDeclaration', 'LabeledStatement'].includes(node.type))
    .map(node => source.slice(node.type === 'ExportNamedDeclaration' ? node.declaration.start : node.start, node.end)).join('\n');
  const deps = {
    createEventDispatcher: () => vi.fn(), SELECTABLE_PAYMENT_METHODS: [],
    readDraft: vi.fn().mockResolvedValue(saved), saveDraft: vi.fn().mockResolvedValue(undefined),
    buscarProdutosLocal: vi.fn().mockResolvedValue([{ id: 1, nome: 'Produto', preco: 10 }]),
    pdvCache: {}, hasActiveModifierGroups: groups => !!groups?.length,
    createManualOrder: vi.fn().mockResolvedValue({ id: 'local' })
  };
  const component = new Function(...Object.keys(deps), `${body}; return {
    initialize, persist, add, changeQuantity, save,
    state: () => ({ items, name, phone, date, time, operationId, ready, saving, error }),
    setup: () => { ownerUserId = 'owner'; operatorId = 'operator'; ready = true; },
    waitWrites: () => writes
  };`)(...Object.values(deps));
  component.setup();
  return { component, deps };
}

describe('manual order modal handlers', () => {
  it('restores optional empty schedule and stable intent from owner/operator draft', async () => {
    const { component, deps } = harness({ items: [], date: '', time: '', operationId: 'same-intent', name: 'Ana' });
    await component.initialize('owner', 'operator', 0);
    expect(deps.readDraft).toHaveBeenCalledWith('owner', 'operator', 'manual-order');
    expect(component.state()).toMatchObject({ date: '', time: '', name: 'Ana', operationId: 'same-intent', ready: true });
  });

  it('persists independent draft scopes in write order', async () => {
    const { component, deps } = harness();
    component.persist({ operationId: 'a' }, 'owner-a', 'operator-a');
    component.persist({ operationId: 'b' }, 'owner-b', 'operator-b');
    await component.waitWrites();
    expect(deps.saveDraft.mock.calls).toEqual([
      ['owner-a', 'operator-a', 'manual-order', { operationId: 'a' }],
      ['owner-b', 'operator-b', 'manual-order', { operationId: 'b' }]
    ]);
  });

  it('keeps distinct pizza snapshots and modifiers while merging identical items', () => {
    const { component } = harness();
    const product = { id: 1, nome: 'Pizza' };
    const modifiers = [{ groupId: 'extra', selectedOptions: [{ optionId: 'cheese' }] }];
    component.add(product, 35, modifiers, { sizeId: 'large', flavors: [{ id: 'one' }] });
    component.add(product, 35, modifiers, { sizeId: 'large', flavors: [{ id: 'one' }] });
    component.add(product, 40, modifiers, { sizeId: 'large', flavors: [{ id: 'two' }] });
    expect(component.state().items.map(item => [item.quantity, item.unitPrice, item.pizza.flavors[0].id])).toEqual([[2, 35, 'one'], [1, 40, 'two']]);
  });

  it('preserves items and intent after a failed commit and reuses them on retry', async () => {
    const { component, deps } = harness({ date: '', time: '', operationId: 'retry-intent' });
    await component.initialize('owner', 'operator', 0);
    component.add({ id: 1, nome: 'Produto' }, 10);
    deps.createManualOrder.mockRejectedValueOnce(new Error('Disk full'));
    await component.save();
    expect(component.state()).toMatchObject({ operationId: 'retry-intent', saving: false, ready: true, error: 'Disk full' });
    expect(component.state().items).toHaveLength(1);
    await component.save();
    expect(deps.createManualOrder).toHaveBeenCalledTimes(2);
    expect(deps.createManualOrder.mock.calls[0]).toEqual(deps.createManualOrder.mock.calls[1]);
  });
});

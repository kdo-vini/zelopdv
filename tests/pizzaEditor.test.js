import { describe, it, expect, vi } from 'vitest';
import { archivePizzaProduct, importPizzaFlavor, preservePizzaDraftAfterModeChange, setPizzaPrice } from '../src/lib/pizzaEditor.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('pizza authoring', () => {
  it('offers pizza as a montagem model inside the existing product configurator', () => {
    const source = readFileSync(resolve('src/lib/modifierModels.js'), 'utf8');
    expect(source).toContain("id: 'pizza_composition'");
    expect(source).toContain("label: 'Montagem de pizza'");
    expect(source).toContain("compositionKind: 'pizza'");
  });
  it('requires explicit size mapping and preserves the source product', () => {
    const product = { id: 1, nome: 'Calabresa', preco: 42 };
    expect(() => importPizzaFlavor(product, '')).toThrow();
    const flavor = importPizzaFlavor(product, 'large', 'flavor-id');
    expect(flavor.prices).toEqual({ large: 42 });
    expect(product).toEqual({ id: 1, nome: 'Calabresa', preco: 42 });
  });
  it('does not turn blank matrix cells into free pizzas', () => {
    expect(setPizzaPrice({ small: 40 }, 'small', '')).toEqual({});
    expect(() => setPizzaPrice({}, 'small', '0')).toThrow();
    expect(() => setPizzaPrice({}, 'small', '-1')).toThrow();
  });
  it('keeps unsaved sizes and flavors when the store pricing rule changes', () => {
    const draft = {
      revision: 'draft-revision',
      pricingMode: 'highest',
      sizes: [{ id: 'g', name: 'Grande' }],
      flavors: [{ id: 'cal', name: 'Calabresa', prices: { g: 40 } }],
    };
    const next = preservePizzaDraftAfterModeChange(draft, { revision: 'server-revision', sizes: [], flavors: [] }, 'average');
    expect(next).toMatchObject({ revision: 'server-revision', pricingMode: 'average', sizes: draft.sizes, flavors: draft.flavors });
  });
  it('archives through the revision-aware RPC without deleting the product', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { revision: 'new', archived: true }, error: null });
    const eq = vi.fn().mockReturnThis();
    const update = vi.fn(() => ({ eq }));
    const client = { rpc, from: vi.fn(() => ({ update })) };
    const product = { id: 3, tipo_produto: 'pizza', pizza_config: { revision: 'old', sizes: [] } };
    await archivePizzaProduct(client, product, 'owner');
    expect(rpc).toHaveBeenCalledWith('save_pizza_config', { p_product_id: 3, p_expected_revision: 'old', p_config: { revision: 'old', sizes: [], archived: true } });
    expect(product.pizza_config.archived).toBeUndefined();
    expect(client.from).not.toHaveBeenCalled();
  });
  it('replaces a sold product through one protected database transaction', () => {
    const migration = readFileSync(resolve('supabase/migrations/20260905170613_finalize_pizza_replacement.sql'), 'utf8');
    const editor = readFileSync(resolve('src/lib/components/modals/ModalPizzaEditor.svelte'), 'utf8');
    expect(migration).toContain('create or replace function public.replace_product_with_pizza');
    expect(migration).toContain('security definer');
    expect(migration).toContain("fiado_actor_can('produtos.gerenciar'");
    expect(migration).toContain('public.pizza_publish_config(replacement_product_id, p_config)');
    expect(migration).toContain('zelomenu_modifier_option_products');
    expect(migration).toContain('revoke all on function public.replace_product_with_pizza');
    expect(editor).toContain("supabase.rpc('replace_product_with_pizza'");
  });
});

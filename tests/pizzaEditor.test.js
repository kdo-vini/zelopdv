import { describe, it, expect, vi } from 'vitest';
import { archivePizzaProduct, buildPizzaDraftProduct, importPizzaFlavor, setPizzaPrice } from '../src/lib/pizzaEditor.js';

describe('pizza authoring', () => {
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
  it('creates a hidden new identity instead of converting a product used by old orders', () => {
    const source = { id: 8, nome: 'Calabresa', preco: 45, id_categoria: 2, id_subcategoria: 3, controlar_estoque: true, estoque_atual: 10 };
    const draft = buildPizzaDraftProduct(source, 'owner');
    expect(draft).not.toHaveProperty('id');
    expect(draft).toMatchObject({ nome: 'Calabresa · Pizza', id_usuario: 'owner', id_categoria: 2, ocultar_no_pdv: true, controlar_estoque: false, estoque_atual: 0 });
    expect(source.estoque_atual).toBe(10);
  });
});

import { expect, it } from 'vitest';
import { validateLocalCartStock, selectCheckoutSubmission } from '../src/lib/finance/offlineCheckout.js';
it('checks shared stock combined across cart products and linked modifiers', () => {
  const category = { id: 3, controlar_estoque_compartilhado: true, estoque_compartilhado_atual: 2 };
  const products = [{ id: 1, categorias: category }, { id: 2, categorias: category }];
  expect(validateLocalCartStock([{ id_produto: 1, quantidade: 2 }, { id_produto: 2, quantidade: 1 }], products)).toContain('Estoque insuficiente');
  const product = { id: 1, modifierGroups: [{ options: [{ linkedProduct: { id: 3, controlar_estoque: true, estoque_atual: 1 } }] }] };
  expect(validateLocalCartStock([{ id_produto: 1, quantidade: 1, modifiers: [{ selectedOptions: [{ linkedProductId: 3, quantity: 2 }] }] }], [product])).toContain('Estoque insuficiente');
});
it('never changes the payload of an uncertain checkout intention', () => {
  const saved = { payload: { client_sale_id: 'one', valor_total: 10 }, settlement: {} };
  expect(selectCheckoutSubmission(structuredClone(saved), saved)).toBe(saved);
  expect(() => selectCheckoutSubmission({ payload: { client_sale_id: 'one', valor_total: 20 } }, saved)).toThrow('confirmação pendente');
});

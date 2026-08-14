import { describe, expect, it } from 'vitest';
import {
  buildCartItemKey,
  buildModifierGroups,
  buildModifierSignature,
  formatSelectedModifierGroups,
  mergeModifierLinkedProducts,
  resolveModifierSelections,
  shouldResetModifierSelections
} from '../src/lib/zelomenuModifiers.js';

const groups = [
  { id: 'size', id_produto: 10, nome: 'Tamanho', tipo: 'variacao', modo_preco: 'substituir', min_selecoes: 1, max_selecoes: 1, ativo: true, ordem: 1 },
  { id: 'topping', id_produto: 10, nome: 'Cobertura', tipo: 'adicional', modo_preco: 'somar', min_selecoes: 0, max_selecoes: 2, permite_quantidade: true, maximo_por_opcao: 2, ativo: true, ordem: 2 }
];
const options = [
  { id: 'small', id_grupo: 'size', nome: '300 ml', price_delta: 10, ativo: true, ordem: 1 },
  { id: 'large', id_grupo: 'size', nome: '500 ml', price_delta: 16, ativo: true, ordem: 2 },
  { id: 'condensed', id_grupo: 'topping', nome: 'Leite condensado', price_delta: 2, ativo: true, ordem: 1 }
];

describe('zelomenuModifiers', () => {
  it('normalizes the current ZeloMenu rows and preserves ordering', () => {
    const normalized = buildModifierGroups({ groups, options });
    expect(normalized.map((group) => group.name)).toEqual(['Tamanho', 'Cobertura']);
    expect(normalized[0].options[1]).toMatchObject({ id: 'large', priceDelta: 16 });
  });

  it('requires a choice, replaces base price, adds quantity and creates a snapshot', () => {
    const normalized = buildModifierGroups({ groups, options });
    const result = resolveModifierSelections(normalized, [
      { groupId: 'size', optionSelections: [{ optionId: 'large', quantity: 1 }] },
      { groupId: 'topping', optionSelections: [{ optionId: 'condensed', quantity: 2 }] }
    ], 12);

    expect(result).toMatchObject({ ok: true, finalUnitPrice: 20 });
    expect(result.selectedGroups[0].selectedOptions[0]).toMatchObject({ optionName: '500 ml', priceDelta: 16 });
    expect(formatSelectedModifierGroups(result.selectedGroups)).toBe('Tamanho: 500 ml • Cobertura: 2x Leite condensado');
  });

  it('rejects incomplete required groups and quantities above the group limit', () => {
    const normalized = buildModifierGroups({ groups, options });
    expect(resolveModifierSelections(normalized, [], 12).code).toBe('group_required');
    expect(resolveModifierSelections(normalized, [
      { groupId: 'size', optionSelections: [{ optionId: 'small', quantity: 1 }] },
      { groupId: 'topping', optionSelections: [{ optionId: 'condensed', quantity: 3 }] }
    ], 12).code).toBe('option_quantity_exceeded');
  });

  it('uses a deterministic signature so different combinations remain separate lines', () => {
    const first = [{ groupId: 'topping', optionSelections: [{ optionId: 'condensed', quantity: 1 }] }];
    const same = [{ groupId: 'topping', optionSelections: [{ optionId: 'condensed', quantity: 1 }] }];
    const different = [{ groupId: 'topping', optionSelections: [{ optionId: 'condensed', quantity: 2 }] }];
    expect(buildModifierSignature(first)).toBe(buildModifierSignature(same));
    expect(buildModifierSignature(first)).not.toBe(buildModifierSignature(different));
    expect(buildCartItemKey(10, first)).not.toBe(buildCartItemKey(10, different));
  });

  it('keeps same-price Guaraná montages with different toppings in separate cart lines', () => {
    const first = [
      { groupId: 'size', optionSelections: [{ optionId: 'size-500', quantity: 1 }] },
      { groupId: 'toppings', optionSelections: [
        { optionId: 'peanut', quantity: 1 },
        { optionId: 'chocolate', quantity: 1 }
      ] }
    ];
    const second = [
      { groupId: 'size', optionSelections: [{ optionId: 'size-500', quantity: 1 }] },
      { groupId: 'toppings', optionSelections: [
        { optionId: 'peanut', quantity: 1 },
        { optionId: 'strawberry', quantity: 1 }
      ] }
    ];

    const lines = [first, second].map((selection) => ({
      id: `${buildCartItemKey(1043, selection)}::price:15.00`,
      quantidade: 1
    }));

    expect(lines[0].id).not.toBe(lines[1].id);
    expect(new Set(lines.map((line) => line.id)).size).toBe(2);
    expect(lines.map((line) => line.quantidade)).toEqual([1, 1]);
  });

  it('resets selections when reopening the same montable product', () => {
    expect(shouldResetModifierSelections({
      open: true,
      wasOpen: false,
      productKey: '1043:8',
      lastProductKey: '1043:8'
    })).toBe(true);

    expect(shouldResetModifierSelections({
      open: true,
      wasOpen: true,
      productKey: '1043:8',
      lastProductKey: '1043:8'
    })).toBe(false);
  });

  it('orders selectedOptions deterministically regardless of click order, so the same combination always merges into one comanda line', () => {
    const multiGroups = [
      { id: 'topping', id_produto: 10, nome: 'Cobertura', tipo: 'adicional', modo_preco: 'somar', min_selecoes: 0, max_selecoes: 2, ativo: true, ordem: 1 }
    ];
    const multiOptions = [
      { id: 'condensed', id_grupo: 'topping', nome: 'Leite condensado', price_delta: 2, ativo: true, ordem: 1 },
      { id: 'sprinkles', id_grupo: 'topping', nome: 'Granulado', price_delta: 1, ativo: true, ordem: 2 }
    ];
    const normalized = buildModifierGroups({ groups: multiGroups, options: multiOptions });

    const clickedFirst = resolveModifierSelections(normalized, [
      { groupId: 'topping', optionSelections: [{ optionId: 'sprinkles', quantity: 1 }, { optionId: 'condensed', quantity: 1 }] }
    ], 12);
    const clickedSecond = resolveModifierSelections(normalized, [
      { groupId: 'topping', optionSelections: [{ optionId: 'condensed', quantity: 1 }, { optionId: 'sprinkles', quantity: 1 }] }
    ], 12);

    expect(clickedFirst.selectedGroups).toEqual(clickedSecond.selectedGroups);
  });

  it('carries the linked catalog product id in the snapshot so stock can be decremented downstream', () => {
    const linkedGroups = [
      { id: 'size', id_produto: 10, nome: 'Tamanho', tipo: 'variacao', modo_preco: 'substituir', min_selecoes: 1, max_selecoes: 1, ativo: true, ordem: 1 }
    ];
    const linkedOptions = [
      { id: 'large', id_grupo: 'size', nome: '500 ml', ativo: true, ordem: 1 }
    ];
    const links = [{ id_opcao: 'large', id_produto: 99, price_override: 16 }];
    const products = [{ id: 99, nome: 'Guaraná 500ml', preco: 16 }];
    const normalized = buildModifierGroups({ groups: linkedGroups, options: linkedOptions, links, products });

    const result = resolveModifierSelections(normalized, [
      { groupId: 'size', optionSelections: [{ optionId: 'large', quantity: 1 }] }
    ], 0);

    expect(result.selectedGroups[0].selectedOptions[0]).toMatchObject({ linkedProductId: 99 });
  });

  it('resolves a linked product even when the component is hidden from the PDV catalog', () => {
    const catalog = mergeModifierLinkedProducts(
      [{ id: 10, nome: 'Guaraná da Amazônia', preco: 8 }],
      [{ id: 99, nome: 'Guaraná 500ml', preco: 15, ocultar_no_pdv: true }],
    );
    const normalized = buildModifierGroups({
      groups: [{ id: 'size', id_produto: 10, nome: 'Tamanho', tipo: 'variacao', modo_preco: 'substituir', min_selecoes: 1, max_selecoes: 1, ativo: true, ordem: 1 }],
      options: [{ id: 'large', id_grupo: 'size', nome: '500 ml', price_delta: 15, ativo: true, ordem: 1 }],
      links: [{ id_opcao: 'large', id_produto: 99, price_override: 15 }],
      products: catalog,
    });

    expect(normalized[0].options[0].linkedProduct).toMatchObject({ productId: 99, available: true });
    expect(resolveModifierSelections(normalized, [
      { groupId: 'size', optionSelections: [{ optionId: 'large', quantity: 1 }] }
    ], 8).finalUnitPrice).toBe(15);
  });

  it('respects shared category stock for hidden linked products', () => {
    const catalog = mergeModifierLinkedProducts(
      [{ id: 10, nome: 'Guaraná da Amazônia', preco: 8 }],
      [{
        id: 99,
        nome: 'Guaraná 500ml',
        preco: 15,
        ocultar_no_pdv: true,
        categorias: {
          id: 7,
          controlar_estoque_compartilhado: true,
          estoque_compartilhado_atual: 0
        }
      }],
    );
    const normalized = buildModifierGroups({
      groups: [{ id: 'size', id_produto: 10, nome: 'Tamanho', tipo: 'variacao', modo_preco: 'substituir', min_selecoes: 1, max_selecoes: 1, ativo: true, ordem: 1 }],
      options: [{ id: 'large', id_grupo: 'size', nome: '500 ml', price_delta: 15, ativo: true, ordem: 1 }],
      links: [{ id_opcao: 'large', id_produto: 99, price_override: 15 }],
      products: catalog,
    });

    expect(normalized[0].options[0].linkedProduct.available).toBe(false);
    expect(resolveModifierSelections(normalized, [
      { groupId: 'size', optionSelections: [{ optionId: 'large', quantity: 1 }] }
    ], 8).code).toBe('option_missing');
  });
});

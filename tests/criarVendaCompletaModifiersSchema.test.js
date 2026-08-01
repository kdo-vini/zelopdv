import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve('.ai/migrations/criar_venda_completa_persistir_modifiers_2026_07_31.sql'),
  'utf8',
)
  .replace(/\r\n/g, '\n')
  .toLowerCase();

describe('criar_venda_completa modifiers persistence migration', () => {
  it('inserts the modifiers snapshot alongside every other vendas_itens column', () => {
    expect(migration).toContain('create or replace function public.criar_venda_completa(p_payload jsonb)');
    expect(migration).toContain('id_usuario, id_venda, id_produto, quantidade,\n      nome_produto_na_venda, preco_unitario_na_venda, modifiers');
    expect(migration).toContain("coalesce(v_item->'modifiers', '[]'::jsonb)");
  });

  it('keeps the idempotent client_sale_id replay and stock decrement behavior untouched', () => {
    expect(migration).toContain('client_sale_id');
    expect(migration).toContain('zelo_estoque_venda_tmp');
    expect(migration).toContain('estoque insuficiente');
  });
});

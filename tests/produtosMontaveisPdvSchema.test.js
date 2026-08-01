import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve('.ai/migrations/produtos_montaveis_pdv_2026_07_31.sql'),
  'utf8',
)
  .replace(/\r\n/g, '\n')
  .toLowerCase();

describe('Produtos montáveis no PDV migration', () => {
  it('persists the montage snapshot in comandas and sales', () => {
    expect(migration).toContain('add column if not exists modifiers jsonb not null default \'[]\'::jsonb');
    expect(migration).toContain('add column if not exists nome_produto_na_venda text');
    expect(migration).toContain('alter table public.vendas_itens');
    expect(migration).toContain('comment on column public.comanda_itens.modifiers');
  });

  it('keeps simple clients compatible while exposing the montage-aware RPC', () => {
    expect(migration).toContain('p_preco_unitario numeric default null');
    expect(migration).toContain('p_modifiers jsonb default \'[]\'::jsonb');
    expect(migration).toContain('comanda_aplicar_delta_item(uuid, integer, integer, numeric, jsonb)');
    expect(migration).not.toContain('create or replace function public.comanda_aplicar_delta_item(\n  p_id_comanda uuid,\n  p_id_produto integer,\n  p_delta integer\n');
  });

  it('expands linked option products for reserve, return and close flows', () => {
    expect(migration).toContain('create or replace function public.comanda_modifier_stock_requirements');
    expect(migration).toContain('zelomenu_modifier_option_products links');
    expect(migration).toContain('create or replace function public.comanda_garantir_estoque_baixado');
    expect(migration).toContain('create or replace function public.comanda_cancelar_com_estoque');
    expect(migration).toContain('estoque_baixado = true');
    expect(migration).toContain('estoque_baixado = false');
  });

  it('grants the RPCs only to authenticated users', () => {
    expect(migration).toContain('revoke all on function public.comanda_garantir_estoque_baixado(uuid) from public, anon, authenticated');
    expect(migration).toContain('grant execute on function public.comanda_garantir_estoque_baixado(uuid) to authenticated, service_role');
  });
});

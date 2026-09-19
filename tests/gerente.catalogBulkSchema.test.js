import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20260919160001_gerente_catalog_bulk_ops.sql', import.meta.url);

describe('operação de limpeza do catálogo', () => {
  it('é uma RPC owner-scoped, transacional e preserva produtos vendidos', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toContain('create or replace function public.gerente_excluir_catalogo');
    expect(sql).toContain('security definer');
    expect(sql).toContain('gerente_resolve_owner(p_owner)');
    expect(sql).toContain('vendas_itens');
    expect(sql).toContain('comanda_itens');
    expect(sql).toContain('comandas');
    expect(sql).toContain('zelo_order_items');
    expect(sql).toContain('subcategorias');
    expect(sql).toContain("tipo_produto = 'pizza'");
    expect(sql).toContain('ocultar_no_pdv = true');
    expect(sql).toContain('grant execute on function public.gerente_excluir_catalogo');
  });
});

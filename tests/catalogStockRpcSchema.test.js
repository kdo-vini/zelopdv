import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20260812200550_catalog_stock_adjustment_rpc.sql', import.meta.url);

describe('catalog stock adjustment RPC migration', () => {
  it('keeps stock adjustment separate from general product management', async () => {
    const migration = await readFile(migrationPath, 'utf8');
    expect(migration).toContain('ajustar_estoque_produto');
    expect(migration).toContain('ajustar_estoque_categoria');
    expect(migration).toContain('estoque.ajustar');
    expect(migration).toContain('security definer');
    expect(migration).toContain('set search_path = public, pg_temp');
    expect(migration).toContain('grant execute on function public.ajustar_estoque_produto');
    expect(migration).toContain('grant execute on function public.ajustar_estoque_categoria');
    expect(migration.toLowerCase()).not.toContain("grant execute on function public.ajustar_estoque_produto(bigint, integer) to anon");
    expect(migration.toLowerCase()).not.toContain("grant execute on function public.ajustar_estoque_categoria(bigint, integer) to anon");
  });

  it('does not mutate product or category definitions outside stock columns', async () => {
    const migration = await readFile(migrationPath, 'utf8');
    expect(migration).toContain('set estoque_atual = p_estoque');
    expect(migration).toContain('set estoque_compartilhado_atual = p_estoque');
    expect(migration.toLowerCase()).not.toMatch(/drop\s+table/);
    expect(migration.toLowerCase()).not.toMatch(/delete\s+from/);
  });

  it('routes the stock-management page through the narrow RPCs', async () => {
    const page = await readFile(new URL('../src/routes/gestao/estoque/+page.svelte', import.meta.url), 'utf8');
    expect(page).toContain("supabase.rpc('ajustar_estoque_produto'");
    expect(page).toContain("supabase.rpc('ajustar_estoque_categoria'");
    expect(page).not.toMatch(/from\('(produtos|categorias)'\)[\s\S]{0,180}\.update\(/);
  });
});

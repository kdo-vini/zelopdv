import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../supabase/migrations/20260924120000_produtos_precificacao.sql',
  import.meta.url,
);

describe('planilha de precificação dos produtos', () => {
  it('cria margem desejada opcional, limitada a [0,100), e flag na_precificacao', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toContain('add column if not exists margem_desejada numeric(5,2)');
    expect(sql).toContain('add column if not exists na_precificacao boolean not null default false');
    expect(sql).toContain(
      'margem_desejada is null or (margem_desejada >= 0 and margem_desejada < 100)',
    );
    expect(sql).toContain('produtos_margem_desejada_range');
    expect(sql.toLowerCase()).not.toMatch(/vendas_itens|update\s+public\.vendas|create policy|drop policy/);
  });

  it('cria índice parcial por dono só para produtos na planilha', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toContain('create index if not exists produtos_na_precificacao_idx');
    expect(sql).toContain('on public.produtos (id_usuario)');
    expect(sql.toLowerCase()).toMatch(/where\s+na_precificacao/);
  });
});

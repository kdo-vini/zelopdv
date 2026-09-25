import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../supabase/migrations/20260925100000_produtos_taxa_plataforma.sql',
  import.meta.url,
);

describe('taxa de plataforma dos produtos', () => {
  it('cria taxa_plataforma opcional, limitada a [0,35]', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toContain('add column if not exists taxa_plataforma numeric(5,2)');
    expect(sql).toContain(
      'taxa_plataforma is null or (taxa_plataforma >= 0 and taxa_plataforma <= 35)',
    );
    expect(sql).toContain('produtos_taxa_plataforma_range');
    expect(sql.toLowerCase()).not.toMatch(/vendas_itens|update\s+public\.vendas|create policy|drop policy/);
  });

  it('nao cria/altera tabelas ou policies de vendas, caixas ou PDV', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql.toLowerCase()).not.toMatch(
      /alter table public\.(vendas|vendas_itens|caixas)|create policy|drop policy/,
    );
  });
});

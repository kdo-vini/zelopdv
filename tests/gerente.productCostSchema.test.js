import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20260919160000_gerente_product_cost.sql', import.meta.url);

describe('custo unitário dos produtos', () => {
  it('cria custo opcional, não negativo e sem reescrever histórico', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toContain('add column if not exists custo_unitario numeric(12,2)');
    expect(sql).toContain('custo_unitario is null or custo_unitario >= 0');
    expect(sql.toLowerCase()).not.toMatch(/vendas_itens|update\s+public\.vendas/);
  });
});

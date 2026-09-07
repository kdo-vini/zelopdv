import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const migrationPath = path.resolve('supabase/migrations/20260828120000_caixa_payment_totals.sql');
const hotfixPath = path.resolve('supabase/migrations/20260907132812_hotfix_caixa_payment_totals_dependency.sql');
const baselinePath = path.resolve('supabase/baselines/20260813091000/schema.sql');
const offlineProtocolPath = path.resolve('supabase/migrations/20260905152642_offline_operation_protocol.sql');

function caixaFechamentosColumns(sql) {
  const table = sql.match(/create table if not exists "public"\."caixa_fechamentos"\s*\(([\s\S]*?)\n\);/i)?.[1] || '';
  return [...table.matchAll(/^\s*"([a-z_]+)"\s+/gim)].map((match) => match[1]);
}

function closingInsertColumns(sql) {
  const columns = sql.match(/insert into public\.caixa_fechamentos\s*\(([^)]+)\)/i)?.[1] || '';
  return columns.split(',').map((column) => column.trim()).filter(Boolean);
}

describe('caixa payment totals migration contract', () => {
  test('adds an additive object snapshot and backfills legacy totals without changing RLS', () => {
    const migration = fs.readFileSync(migrationPath, 'utf8').toLowerCase();

    expect(migration).toContain('add column if not exists totais_pagamento jsonb not null default \'{}\'::jsonb');
    expect(migration).toContain("jsonb_typeof(totais_pagamento) = 'object'");
    expect(migration).toContain("'dinheiro', coalesce(total_dinheiro, 0)");
    expect(migration).toContain("'pix', coalesce(total_pix, 0)");
    expect(migration).toContain("'cartao', coalesce(total_cartao, 0)");
    expect(migration).not.toMatch(/create policy|alter policy|revoke |grant /);
  });

  test('repairs the production schema drift before the online close insert is exercised', () => {
    const baseline = fs.readFileSync(baselinePath, 'utf8');
    const offlineProtocol = fs.readFileSync(offlineProtocolPath, 'utf8').toLowerCase();
    const hotfix = fs.readFileSync(hotfixPath, 'utf8').toLowerCase();
    const baselineColumns = caixaFechamentosColumns(baseline);
    const insertColumns = closingInsertColumns(offlineProtocol);

    // Reproduces the production state observed on 2026-09-07: the baseline was
    // present and close_caixa was deployed, but the August column migration was
    // absent from the remote ledger.
    expect(insertColumns.filter((column) => !baselineColumns.includes(column)))
      .toEqual(['totais_pagamento']);

    expect(hotfix).toContain("add column if not exists totais_pagamento jsonb not null default '{}'::jsonb");
    expect(hotfix).toContain('validate constraint caixa_fechamentos_totais_pagamento_object_check');
    expect(hotfix).toContain("'dinheiro', coalesce(total_dinheiro, 0)");
    expect(hotfix).toContain("'pix', coalesce(total_pix, 0)");
    expect(hotfix).toContain("'cartao', coalesce(total_cartao, 0)");
    expect(hotfix).not.toMatch(/create policy|alter policy|revoke |grant /);

    const repairedColumns = new Set([...baselineColumns, 'totais_pagamento']);
    expect(insertColumns.filter((column) => !repairedColumns.has(column))).toEqual([]);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const migrationPath = path.resolve('supabase/migrations/20260828120000_caixa_payment_totals.sql');

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
});

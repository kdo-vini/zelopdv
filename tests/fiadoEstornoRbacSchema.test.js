import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve('supabase/migrations/20260813093000_fiado_estorno_rbac.sql'),
  'utf8',
).replace(/\r\n/g, '\n').toLowerCase();
const compactMigration = migration.replace(/\s+/g, ' ');

describe('fiado sale reversal RBAC migration', () => {
  it('requires pdv.cancelar before any financial mutation', () => {
    expect(migration).toContain(
      "public.fiado_actor_can('pdv.cancelar', v_owner)",
    );

    const guard = migration.indexOf(
      "public.fiado_actor_can('pdv.cancelar', v_owner)",
    );
    const balanceMutation = migration.indexOf('update public.pessoas');
    const ledgerMutation = migration.indexOf('insert into public.fiado_lancamentos');

    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(balanceMutation);
    expect(guard).toBeLessThan(ledgerMutation);
  });

  it('preserves the authenticated and service-role contract without anon execute', () => {
    expect(migration).toContain(
      'grant execute on function public.fiado_estornar_venda(bigint) to authenticated, service_role',
    );
    expect(migration).toContain(
      'revoke execute on function public.fiado_estornar_venda(bigint) from anon',
    );
    expect(migration).not.toMatch(/grant execute[^;]*to anon/i);
  });

  it('keeps the existing tenant scope, idempotency, and payment calculation', () => {
    expect(compactMigration).toContain('id_usuario = v_owner for update');
    expect(migration).toContain("natureza = 'estorno_venda'");
    expect(migration).toContain("v_venda.forma_pagamento = 'fiado'");
    expect(migration).toContain("v_venda.forma_pagamento = 'multiplo'");
    expect(migration).toContain("'estorno-venda:' || p_id_venda");
  });
});

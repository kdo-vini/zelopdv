import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260813030000_discount_rbac.sql'),
  'utf8',
);
const hardeningMigration = readFileSync(
  resolve('supabase/migrations/20260813031000_discount_rbac_update_hardening.sql'),
  'utf8',
);

describe('discount RBAC migration', () => {
  it('adds a narrow positive-discount trigger', () => {
    expect(migration).toContain('vendas_discount_rbac_guard');
    expect(migration).toContain('before insert or update of valor_desconto');
    expect(migration).toContain('coalesce(new.valor_desconto, 0) <= 0');
    expect(migration).toContain("fiado_actor_can('pdv.desconto'");
  });

  it('preserves the Mesa and service-role exceptions', () => {
    expect(migration).toContain("v_claim_role = 'service_role'");
    expect(migration).toContain("current_user = 'postgres'");
    expect(migration).toContain("coalesce(new.tipo_pedido, 'retirada') <> 'mesa'");
  });

  it('keeps the Mesa exception limited to direct INSERTs', () => {
    expect(hardeningMigration).toContain("tg_op = 'UPDATE'");
    expect(hardeningMigration).toContain("current_user = 'postgres'");
    expect(hardeningMigration).toContain("coalesce(new.tipo_pedido, 'retirada') <> 'mesa'");
  });

  it('does not alter billing, RPC signatures, or table grants', () => {
    expect(migration).not.toMatch(/create\s+or\s+replace\s+function\s+public\.criar_venda_completa/i);
    expect(migration).not.toContain('grant insert');
    expect(migration).not.toContain('billing');
  });
});

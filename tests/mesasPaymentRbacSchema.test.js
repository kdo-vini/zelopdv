import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(
  path.resolve('supabase/migrations/20260812230000_mesas_payment_rbac.sql'),
  'utf8',
);

describe('partial Mesa payment RBAC migration', () => {
  it('requires Mesa access and an existing receive capability', () => {
    expect(migration).toContain("fiado_actor_can('mesas.acessar'");
    expect(migration).toContain("fiado_actor_can('pdv.receber'");
    expect(migration).toContain("fiado_actor_can('pedidos.receber'");
    expect(migration).toContain('to authenticated');
  });

  it('replaces every payment mutation policy', () => {
    for (const policy of [
      'comanda_pagamentos_actor_insert',
      'comanda_pagamentos_actor_update',
      'comanda_pagamentos_actor_delete',
      'comanda_pagamento_itens_insert',
      'comanda_pagamento_itens_update',
      'comanda_pagamento_itens_delete',
    ]) {
      expect(migration).toContain(`drop policy if exists ${policy}`);
      expect(migration).toContain(`create policy ${policy}`);
    }
  });

  it('keeps owner tenant scoping on every write', () => {
    expect(migration.match(/get_owner_user_id\(auth\.uid\(\)\) = id_usuario/g)?.length).toBeGreaterThanOrEqual(6);
  });
});

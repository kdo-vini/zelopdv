import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260813050000_mesas_select_rbac.sql'),
  'utf8',
);

describe('Mesas SELECT RBAC migration', () => {
  it('gates every private Mesa read with the existing capability matrix', () => {
    for (const policy of [
      'mesas_actor_select',
      'comandas_actor_select',
      'comanda_itens_actor_select',
      'comanda_pagamentos_actor_select',
      'comanda_pagamento_itens_select',
    ]) {
      expect(migration).toContain(`alter policy ${policy}`);
    }
    expect(migration).toContain("fiado_actor_can('mesas.acessar'");
    expect(migration).toContain("fiado_actor_can('relatorios.ver'");
    expect(migration).toContain('to authenticated');
  });

  it('removes anonymous table access without changing the service-role path', () => {
    expect(migration).toContain('revoke all on table');
    expect(migration).toContain('public.comanda_pagamento_itens');
    expect(migration).toContain('from anon');
    expect(migration).not.toMatch(/drop\s+(table|policy)/i);
    expect(migration).not.toMatch(/grant\s+/i);
  });
});

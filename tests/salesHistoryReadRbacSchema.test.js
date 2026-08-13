import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260813090000_sales_history_read_rbac.sql'),
  'utf8',
);
const performanceMigration = readFileSync(
  resolve('supabase/migrations/20260813091000_sales_history_read_rbac_performance.sql'),
  'utf8',
);

describe('sales history SELECT RBAC migration', () => {
  it('removes anonymous reads and gates sales and their items', () => {
    expect(migration).toContain('public.vendas');
    expect(migration).toContain('public.vendas_itens');
    expect(migration).toContain('from anon');
    expect(migration).toContain('alter policy vendas_actor_select');
    expect(migration).toContain('alter policy vendas_itens_actor_select');
    expect(migration.match(/to authenticated/giu)).toHaveLength(2);
  });

  it.each([
    'pdv.acessar',
    'pdv.vender',
    'pdv.receber',
    'pdv.cancelar',
    'mesas.acessar',
    'mesas.fechar',
    'caixa.ver',
    'caixa.fechar',
    'relatorios.ver',
    'fiado.visualizar',
  ])('preserves the legitimate %s consumer', (permission) => {
    expect(migration).toContain(`fiado_actor_can('${permission}'`);
  });

  it('keeps the parent sale as the item authorization source', () => {
    expect(migration).toContain('from public.vendas v');
    expect(migration).toContain('v.id = vendas_itens.id_venda');
    expect(migration).toContain('v.id_usuario = get_owner_user_id(auth.uid())');
  });

  it('does not rewrite data or write policies', () => {
    expect(migration).not.toMatch(/drop\s+(table|policy)/iu);
    expect(migration).not.toMatch(/\b(insert|update|delete)\s+(?:into|from)?\s*public\./iu);
    expect(migration).not.toMatch(/grant\s+/iu);
  });

  it('moves the permission union to one statement-level lookup', () => {
    expect(performanceMigration).toContain('(select get_owner_user_id(auth.uid())) = id_usuario');
    expect(performanceMigration).toContain('select exists');
    expect(performanceMigration).toContain('from public.access_users au');
    expect(performanceMigration).toContain('join public.access_roles ar');
    expect(performanceMigration).not.toContain('create or replace function');
    expect(performanceMigration).not.toContain('security definer');
  });

  it('keeps every containment capability in the optimized policy', () => {
    for (const permission of [
      'pdv.acessar', 'pdv.vender', 'pdv.receber', 'pdv.cancelar',
      'mesas.acessar', 'mesas.fechar',
      'caixa.abrir', 'caixa.fechar', 'caixa.movimentar', 'caixa.ver',
      'relatorios.ver', 'relatorios.exportar', 'fiado.visualizar',
    ]) {
      expect(performanceMigration).toContain(`ar.permissions ->> '${permission}'`);
    }
  });

  it('delegates item authorization to the already-gated parent sale', () => {
    const itemPolicy = performanceMigration.split('alter policy vendas_itens_actor_select')[1];
    expect(itemPolicy).toContain('from public.vendas v');
    expect(itemPolicy).toContain('v.id = vendas_itens.id_venda');
    expect(itemPolicy).not.toContain('ar.permissions');
    expect(itemPolicy).not.toContain('fiado_actor_can');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260812233000_mesas_operational_rbac.sql'),
  'utf8',
);

describe('Mesas operational RBAC migration', () => {
  it('splits operational writes by existing Mesa capabilities', () => {
    expect(migration).toContain('create policy comandas_actor_insert');
    expect(migration).toContain("fiado_actor_can('mesas.abrir_comanda', id_usuario)");
    expect(migration).toContain('create policy comanda_itens_actor_insert');
    expect(migration).toContain("fiado_actor_can('mesas.editar_itens', c.id_usuario)");
    expect(migration).toContain('create policy comandas_actor_delete');
    expect(migration).toContain("fiado_actor_can('mesas.cancelar', id_usuario)");
  });

  it('guards state transitions and financial close fields in the database', () => {
    expect(migration).toContain('create trigger mesas_status_rbac_guard');
    expect(migration).toContain('create trigger comandas_mutation_rbac_guard');
    expect(migration).toContain("fiado_actor_can('mesas.fechar', old.id_usuario)");
    expect(migration).toContain('new.id_venda is distinct from old.id_venda');
    expect(migration).toContain('new.total_calculado is distinct from old.total_calculado');
  });

  it('keeps owner/service-role bypass and does not change table grants', () => {
    expect(migration).toContain('v_actor is null or v_service_role = \'service_role\'');
    expect(migration).toContain('v_actor = old.id_usuario');
    expect(migration).toContain('Keep table grants unchanged');
    expect(migration).not.toContain('revoke all on public.mesas');
    expect(migration).not.toContain('revoke all on public.comandas');
  });
});

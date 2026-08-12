import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve('supabase/migrations/20260812234500_mesas_operational_rpc_rbac.sql'),
  'utf8',
);

describe('Mesas operational RPC RBAC migration', () => {
  it('keeps the existing RPC signatures and adds owner/capability checks', () => {
    expect(migration).toContain('comanda_aplicar_delta_item(');
    expect(migration).toContain('comanda_cancelar_com_estoque(p_id_comanda uuid)');
    expect(migration).toContain('comanda_garantir_estoque_baixado(p_id_comanda uuid)');
    expect(migration).toContain('get_owner_user_id(v_actor)');
    expect(migration).toContain("fiado_actor_can('mesas.editar_itens', v_owner)");
    expect(migration).toContain("fiado_actor_can('mesas.cancelar', v_owner)");
    expect(migration).toContain("fiado_actor_can('mesas.fechar', v_owner)");
  });

  it('uses a fixed search path and preserves service-role bypass', () => {
    expect(migration).toContain('security definer');
    expect(migration).toContain('set search_path = public, pg_temp');
    expect(migration).toContain("current_setting('request.jwt.claim.role', true) = 'service_role'");
    expect(migration).toContain('v_service or id_usuario = v_owner');
  });

  it('does not expose the RPCs to anonymous callers', () => {
    expect(migration).toContain('revoke all on function public.comanda_aplicar_delta_item');
    expect(migration).toContain('revoke all on function public.comanda_cancelar_com_estoque');
    expect(migration).toContain('revoke all on function public.comanda_garantir_estoque_baixado');
    expect(migration).toContain('to authenticated, service_role');
  });
});

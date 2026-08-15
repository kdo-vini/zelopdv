import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve('supabase/migrations/20260814200000_mesas_comanda_rpc_service_flag_fix.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

// The header comment quotes the broken statement it replaces, so every
// assertion below runs against executable SQL only.
const migration = source
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

const declarations = [
  ...migration.matchAll(/v_service boolean :=([\s\S]*?);\n/g),
].map((match) => match[1].replace(/\s+/g, ' ').trim());

describe('Mesa comanda RPC service-flag hotfix', () => {
  it('redeclares the service flag in all three broken RPCs', () => {
    expect(migration).toContain('create or replace function public.comanda_aplicar_delta_item(');
    expect(migration).toContain('create or replace function public.comanda_cancelar_com_estoque(p_id_comanda uuid)');
    expect(migration).toContain('create or replace function public.comanda_garantir_estoque_baixado(p_id_comanda uuid)');
    expect(declarations).toHaveLength(3);
  });

  it('never lets the service flag be null', () => {
    // current_setting(..., true) returns NULL when the GUC is unset, and
    // `NULL = 'service_role'` is NULL, not false. A three-valued v_service made
    // `not v_service` skip owner resolution and turned the comanda predicate
    // into NULL, which is the 'Comanda aberta nao encontrada' outage.
    for (const declaration of declarations) {
      expect(declaration).not.toMatch(/^current_setting\([^)]*\) = 'service_role'$/);
      expect(declaration).toContain("coalesce(current_setting('role', true) = 'service_role', false)");
      expect(declaration).toContain(
        "coalesce(current_setting('request.jwt.claim.role', true) = 'service_role', false)",
      );
    }
  });

  it('resolves a non-null owner before any predicate can use it', () => {
    const resolutions = [
      ...migration.matchAll(
        /if not v_service then\n\s*v_owner := public\.get_owner_user_id\(v_actor\);\n\s*if v_owner is null then\n\s*raise exception 'Usuario nao autenticado';\n\s*end if;\n\s*end if;/g,
      ),
    ];
    expect(resolutions).toHaveLength(3);

    for (const ownerUse of migration.matchAll(/\(v_service or id_usuario = v_owner\)/g)) {
      expect(migration.lastIndexOf('v_owner := public.get_owner_user_id(v_actor);', ownerUse.index))
        .toBeGreaterThan(-1);
    }
  });

  it('preserves the authorization contract of the migration it repairs', () => {
    expect(migration).toContain('security definer');
    expect(migration).toContain('set search_path = public, pg_temp');
    expect(migration).toContain("fiado_actor_can('mesas.editar_itens', v_owner)");
    expect(migration).toContain("fiado_actor_can('mesas.cancelar', v_owner)");
    expect(migration).toContain("fiado_actor_can('mesas.fechar', v_owner)");
    expect(migration).toContain('revoke all on function public.comanda_aplicar_delta_item');
    expect(migration).toContain('revoke all on function public.comanda_cancelar_com_estoque');
    expect(migration).toContain('revoke all on function public.comanda_garantir_estoque_baixado');
    expect(migration).toContain('to authenticated, service_role');
    expect(migration).not.toMatch(/grant execute[^;]*to anon/i);
  });
});

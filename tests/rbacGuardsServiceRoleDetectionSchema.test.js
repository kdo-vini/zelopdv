import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file) =>
  readFileSync(resolve('supabase/migrations', file), 'utf8').replace(/\r\n/g, '\n');

// The header comment quotes the broken statements it replaces, so every
// assertion runs against executable SQL only.
const stripComments = (sql) =>
  sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

const source = read('20260814210000_rbac_guards_service_role_detection_fix.sql');
const migration = stripComments(source);

const GUARDS = [
  'mesas_status_rbac_guard',
  'comandas_mutation_rbac_guard',
  'vendas_insert_rbac_guard',
  'vendas_discount_rbac_guard',
];

const bodyOf = (name) => {
  const start = migration.indexOf(`create or replace function public.${name}()`);
  expect(start).toBeGreaterThan(-1);
  const end = migration.indexOf('\n$$;', start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
};

describe('RBAC guard service-role detection hotfix', () => {
  it('recreates every guard that still read the dead legacy GUC', () => {
    for (const guard of GUARDS) {
      expect(migration).toContain(`create or replace function public.${guard}()`);
    }
  });

  it('makes the service flag two-valued in every guard', () => {
    for (const guard of GUARDS) {
      const body = bodyOf(guard);
      expect(body).toContain(
        "v_service boolean := coalesce(current_setting('role', true) = 'service_role', false)",
      );
      expect(body).toContain(
        "coalesce(current_setting('request.jwt.claim.role', true) = 'service_role', false)",
      );
      // The bare comparison is what left the bypass permanently dead.
      expect(body).not.toMatch(/:= current_setting\([^)]*\);/);
      expect(body).not.toContain("v_claim_role = 'service_role'");
      expect(body).not.toContain("v_service_role = 'service_role'");
    }
  });

  it('keeps the SECURITY DEFINER sale path behind the POS capabilities', () => {
    // criar_venda_completa runs as postgres but preserves the caller's role,
    // so an authenticated browser call must not be mistaken for service_role.
    const body = bodyOf('vendas_insert_rbac_guard');
    const bypass = body.indexOf('if v_service then');
    const definerBranch = body.indexOf("if current_user = 'postgres' then");
    expect(bypass).toBeGreaterThan(-1);
    expect(definerBranch).toBeGreaterThan(bypass);
    expect(body).toContain("public.fiado_actor_can('pdv.vender', v_owner)");
    expect(body).toContain("public.fiado_actor_can('pdv.receber', v_owner)");
  });

  it('preserves each guard capability contract unchanged', () => {
    const mesas = bodyOf('mesas_status_rbac_guard');
    expect(mesas).toContain("fiado_actor_can('mesas.abrir_comanda', old.id_usuario)");
    expect(mesas).toContain("fiado_actor_can('mesas.fechar', old.id_usuario)");
    expect(mesas).toContain("fiado_actor_can('mesas.cancelar', old.id_usuario)");

    const comandas = bodyOf('comandas_mutation_rbac_guard');
    expect(comandas).toContain("fiado_actor_can('mesas.editar_itens', old.id_usuario)");
    expect(comandas).toContain('A comanda deve permanecer no tenant original.');

    const desconto = bodyOf('vendas_discount_rbac_guard');
    expect(desconto).toContain("fiado_actor_can('pdv.desconto', v_owner)");
    expect(desconto).toContain("or tg_op = 'UPDATE'");
    expect(desconto).toContain('coalesce(new.valor_desconto, 0) <= 0');

    for (const guard of GUARDS) {
      expect(bodyOf(guard)).toContain('set search_path = public, pg_temp');
    }
  });

  it('repairs the double-encoded operator messages instead of carrying them forward', () => {
    const applied = read('20260812233000_mesas_operational_rbac.sql');
    // Guard the premise: the applied bodies really do carry doubly-encoded
    // UTF-8, so this hotfix is repairing a live defect rather than churning
    // strings. 0xC3 0x83 0xC2 0xAA is 'e-circumflex' encoded twice.
    expect(Buffer.from(applied, 'utf8').includes(Buffer.from([0xc3, 0x83, 0xc2, 0xaa]))).toBe(true);
    expect(migration).toContain('Voce nao tem permissao para abrir a mesa.');
    expect(migration).toContain('Voce nao tem permissao para fechar a mesa.');
    // The whole file, comments included, stays ASCII-only.
    expect(source).toMatch(/^[\x00-\x7F]*$/);
  });

  it('does not widen grants', () => {
    expect(migration).toContain('revoke all on function public.vendas_discount_rbac_guard() from public, anon');
    expect(migration).not.toMatch(/grant execute[^;]*to anon/i);
    expect(migration).not.toMatch(/create trigger/i);
    expect(migration).not.toMatch(/create policy/i);
  });
});

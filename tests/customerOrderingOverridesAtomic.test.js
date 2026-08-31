import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(resolve(
  'supabase/migrations/20260830211500_patch_customer_ordering_overrides_atomic.sql',
), 'utf8').replace(/\r\n/g, '\n').toLowerCase();

describe('patch atômico dos padrões de pedido do cliente', () => {
  it('expõe somente a RPC service-role com o contrato compartilhado', () => {
    expect(migration).toContain('create or replace function public.patch_zelochat_customer_ordering_overrides(');
    expect(migration).toContain('p_empresa_id uuid');
    expect(migration).toContain('p_owner_user_id uuid');
    expect(migration).toContain('p_pessoa_id uuid');
    expect(migration).toContain('p_patch jsonb');
    expect(migration).toContain('returns jsonb');
    expect(migration).toContain('security definer');
    expect(migration).toContain('set search_path = public, pg_temp');
    expect(migration).toContain("current_setting('role', true) = 'service_role'");
    expect(migration).toContain('revoke all on function public.patch_zelochat_customer_ordering_overrides');
    expect(migration).toContain('to service_role');
  });

  it('valida tenant, owner e pessoa cliente antes de qualquer merge', () => {
    expect(migration).toContain('from public.empresa_perfil ep');
    expect(migration).toContain('ep.id = p_empresa_id');
    expect(migration).toContain('ep.user_id = p_owner_user_id');
    expect(migration).toContain('from public.pessoas person');
    expect(migration).toContain('person.id = p_pessoa_id');
    expect(migration).toContain('person.id_usuario = p_owner_user_id');
    expect(migration).toContain("person.tipo = 'cliente'");
  });

  it('faz lock/merge sem lost update, inclusive quando a relação ainda não existe', () => {
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('from public.zelochat_customer_relationships relationship');
    expect(migration).toContain('for update');
    expect(migration).toContain('on conflict (empresa_id, pessoa_id) do nothing');
    expect(migration).toContain("v_next := coalesce(v_relationship.ordering_overrides, '{}'::jsonb)");
    expect(migration).toContain("v_next := v_next - v_key");
    expect(migration).toContain('jsonb_set(v_next, array[v_key], v_value, true)');
    expect(migration).toContain('ordering_overrides = v_next');
  });

  it('aceita só a allowlist e valida cada valor normalizado', () => {
    for (const key of ['fulfillmenttype', 'deliveryaddress', 'paymentmethod', 'habitualtime']) {
      expect(migration).toContain(`'${key}'`);
    }
    expect(migration).toContain('jsonb_object_keys(p_patch)');
    expect(migration).toContain('ordering_overrides_patch_key_invalid');
    expect(migration).toContain("v_value #>> '{}' not in ('delivery', 'pickup')");
    expect(migration).toContain("jsonb_typeof(v_value) <> 'object'");
    expect(migration).toContain("v_value->>'address'");
    expect(migration).toContain("char_length(v_value #>> '{}') > 80");
    expect(migration).toContain("v_value #>> '{}' !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'");
  });
});

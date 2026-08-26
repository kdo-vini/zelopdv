import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  'supabase/migrations/20260825120000_customer_identity_foundation.sql',
);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase()
  : '';
const compactMigration = migration.replace(/\s+/g, ' ');

describe('customer identity foundation migration', () => {
  it('adds the complete birthday and update audit fields to pessoas', () => {
    expect(migration).toContain('add column if not exists aniversario_dia');
    expect(migration).toContain('add column if not exists aniversario_mes');
    expect(migration).toContain('add column if not exists aniversario_ano');
    expect(migration).toContain('add column if not exists updated_at');
    expect(migration).toContain('pessoas_aniversario_dia_mes_check');
    expect(migration).toContain(
      'aniversario_ano is null or aniversario_ano between 1900 and 2100',
    );
    expect(compactMigration).toContain(
      'aniversario_dia is not null and aniversario_mes is not null and',
    );
    expect(migration).toContain('aniversario_ano is null or (aniversario_dia is not null and aniversario_mes is not null)');
  });

  it('creates tenant identities with one normalized value per kind', () => {
    expect(migration).toContain('create table if not exists public.pessoa_identities');
    expect(compactMigration).toContain(
      'unique (id_usuario, kind, value_normalized)',
    );
    expect(migration).toContain(
      'pessoa_identities_primary_phone_unique',
    );
  });

  it('normalizes Brazilian phones without removing the ninth digit', () => {
    expect(migration).toContain(
      'create or replace function public.normalize_brazilian_phone(p_phone text)',
    );
    expect(migration).toContain("regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')");
    expect(migration).toContain("return '55' || v_digits");
    expect(migration).toContain('length(v_digits) in (10, 11)');
    expect(migration).toContain("length(v_digits) in (12, 13) and left(v_digits, 2) = '55'");
    expect(migration).not.toContain("if left(v_digits, 2) = '00'");
    expect(migration).not.toMatch(/substring\s*\(\s*v_digits\s*,\s*1\s*,\s*10\s*\)/);
  });

  it('keeps table writes owner-scoped and capability-protected', () => {
    expect(migration).toContain('enable row level security');
    expect(migration).toContain("fiado_actor_can('pessoas.gerenciar'");
    expect(migration).toContain('get_owner_user_id(auth.uid())');
    expect(migration).toContain('pessoa_identities_owner_select');
    expect(migration).toContain('pessoa_identities_actor_insert');
    expect(migration).toContain('pessoa_identities_actor_update');
    expect(migration).toContain('pessoa_identities_actor_delete');
  });

  it('exposes a service-only WhatsApp identity ensure RPC with serialized ownership', () => {
    expect(migration).toContain(
      'create or replace function public.ensure_customer_from_whatsapp',
    );
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('p_owner_user_id::text');
    expect(migration).toContain("status', 'linked'");
    expect(migration).toContain("status', 'created'");
    expect(migration).toContain("status', 'conflict'");
    expect(migration).toContain("status', 'invalid'");
    expect(migration).toContain(
      'revoke all on function public.ensure_customer_from_whatsapp(uuid, text, text)',
    );
    expect(migration).toContain(
      'grant execute on function public.ensure_customer_from_whatsapp',
    );
    expect(migration).toContain('to service_role');
    expect(migration).not.toMatch(/grant execute[^;]*to authenticated/i);
  });

  it('never chooses an arbitrary person when legacy contacts are ambiguous', () => {
    expect(migration).not.toContain('select distinct on (p.id_usuario, public.normalize_brazilian_phone(p.contato))');
    expect(migration).not.toMatch(/from public\.pessoas p[\s\S]{0,500}order by[\s\S]{0,100}limit 1[\s\S]{0,100}for update/);
    expect(migration).toContain('having count(*) = 1');
    expect(migration).toContain('v_contact_count > 1');
    expect(migration).toContain('v_identity_count > 1');
    expect(migration).toContain('phone_contact_ambiguous');
  });

  it('hardens security-definer function search paths and runtime verification hooks', () => {
    expect(migration).toContain('set search_path = public, pg_temp');
    expect(migration).toContain('revalidate');
    const verification = existsSync(resolve('supabase/verification/customer_identity_authz.sql'))
      ? readFileSync(resolve('supabase/verification/customer_identity_authz.sql'), 'utf8').replace(/\r\n/g, '\n').toLowerCase()
      : '';
    expect(verification).toContain('birthday_dia_without_mes');
    expect(verification).toContain('birthday_mes_without_dia');
    expect(verification).toContain('pessoas.gerenciar');
    expect(verification).toContain('independent');
    expect(verification).toContain('concurrent');
    expect(verification).toContain('has_table_privilege');
  });
});

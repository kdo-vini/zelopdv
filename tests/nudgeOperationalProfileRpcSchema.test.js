import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260915090000_nudge_operational_profile_rpc.sql'
);

function migrationSql() {
  return readFileSync(migrationPath, 'utf8').toLowerCase().replace(/\s+/g, ' ').trim();
}

describe('admin_get_users_without_profile operational-profile migration contract', () => {
  it('keeps the same signature and function shape as the baseline RPC', () => {
    const sql = migrationSql();

    expect(sql).toContain(
      'create or replace function public.admin_get_users_without_profile(min_age_hours integer default 2)'
    );
    expect(sql).toContain(
      'returns table(user_id uuid, email text, created_at timestamptz)'
    );
    expect(sql).toContain('language sql stable security definer');
    expect(sql).toContain("set search_path to 'public', 'pg_temp'");
  });

  it('no longer treats absence of the empresa_perfil row as the only criterion', () => {
    const sql = migrationSql();

    // The old, single-criterion predicate must not be the whole WHERE clause
    // anymore — it must be OR'd with emptiness checks below, inside a group.
    expect(sql).not.toMatch(/where p\.user_id is null\s+and u\.created_at/);
  });

  it('treats an empty nome_exibicao or contato as "no operational profile", mirroring operationalProfileOk', () => {
    const sql = migrationSql();

    // The three predicates must be OR'd together inside one group, not
    // scattered as independent top-level AND conditions.
    expect(sql).toContain(
      "where ( p.user_id is null or coalesce(trim(p.nome_exibicao), '') = '' or coalesce(trim(p.contato), '') = '' )"
    );
  });

  it('does not hide an operationally incomplete profile just because a subscription row exists', () => {
    const sql = migrationSql();

    expect(sql).not.toContain('public.subscriptions');
  });

  it('keeps the existing age, email and access_users (sub-user) filters', () => {
    const sql = migrationSql();

    expect(sql).toContain("u.created_at < now() - (min_age_hours || ' hours')::interval");
    expect(sql).toContain('u.email is not null');
    expect(sql).toContain(
      'not exists ( select 1 from public.access_users au where au.auth_user_id = u.id or lower(au.email) = lower(u.email) )'
    );
  });

  it('grants execute only to service_role and revokes public/anon/authenticated', () => {
    const sql = migrationSql();

    expect(sql).toContain(
      'revoke execute on function public.admin_get_users_without_profile(integer) from public, anon, authenticated;'
    );
    expect(sql).toContain(
      'grant execute on function public.admin_get_users_without_profile(integer) to service_role;'
    );
  });
});

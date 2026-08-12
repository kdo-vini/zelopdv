import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260812150000_p0_security_containment.sql'
);
const snapshotPath = resolve(
  process.cwd(),
  'docs/operations/P0-SECURITY-CONTAINMENT-SNAPSHOT-2026-08-12.md'
);

function migrationSql() {
  return readFileSync(migrationPath, 'utf8').toLowerCase().replace(/\s+/g, ' ').trim();
}

describe('P0 security containment migration contract', () => {
  it('keeps a pre-change snapshot of the affected grants and definitions', () => {
    const snapshot = readFileSync(snapshotPath, 'utf8');

    expect(snapshot).toContain('PRE-CHANGE PRODUCTION SNAPSHOT');
    expect(snapshot).toContain('admin_extend_subscription(uuid,integer,text,uuid)');
    expect(snapshot).toContain('public.user_entitlements');
    expect(snapshot).toContain('select_super_admins');
  });

  it('uses invoker security and removes client access from sensitive views', () => {
    const sql = migrationSql();

    expect(sql).toContain(
      'alter view public.user_entitlements set (security_invoker = true);'
    );

    for (const view of [
      'public.user_entitlements',
      'public.v_daily_metrics',
      'public.v_leads_pending_followup',
      'public.v_top_leads_pending'
    ]) {
      expect(sql).toContain(`revoke all on ${view} from public, anon, authenticated;`);
    }
  });

  it('removes anon execution and contains admin-only RPCs', () => {
    const sql = migrationSql();

    for (const signature of [
      'public.admin_extend_subscription(uuid, integer, text, uuid)',
      'public.admin_get_users_without_profile(integer)',
      'public.deactivate_expired_subscriptions()',
      'public.run_subscription_expiration_check()'
    ]) {
      expect(sql).toContain(`revoke execute on function ${signature} from public, anon, authenticated;`);
    }

    expect(sql).toContain(
      'revoke execute on function public.admin_delete_user(uuid, text, jsonb) from public, anon;'
    );
  });

  it('keeps browser admin reads callable only with an in-function super-admin guard', () => {
    const sql = migrationSql();

    for (const functionName of [
      'admin_get_all_auth_users',
      'admin_get_sales_counts',
      'admin_get_total_sales_value',
      'admin_get_users_last_seen'
    ]) {
      expect(sql).toContain(`coalesce(auth.role(), '') = 'service_role'`);
      expect(sql).toContain(
        `from public.super_admins sa where sa.user_id = auth.uid() and sa.is_active = true`
      );
      expect(sql).toContain(`create or replace function public.${functionName}`);
    }
  });

  it('limits super_admins exposure while preserving authenticated admin updates', () => {
    const sql = migrationSql();

    expect(sql).toContain('drop policy if exists select_super_admins on public.super_admins;');
    expect(sql).toContain('auth.uid() = user_id');
    expect(sql).toContain(
      'revoke all on public.super_admins from public, anon;'
    );
    expect(sql).toContain(
      'revoke insert, delete, truncate, references, trigger on public.super_admins from authenticated;'
    );
    expect(sql).toContain(
      'grant select, update on public.super_admins to authenticated;'
    );
  });
});

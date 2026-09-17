import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationDir = resolve('supabase/migrations');
const migrationName = readdirSync(migrationDir)
  .filter((name) => /^\d+_ifood_canonical_command_enqueue\.sql$/.test(name))
  .sort()
  .at(-1);
const migrationPath = migrationName ? resolve(migrationDir, migrationName) : null;
const rawSql = migrationPath ? readFileSync(migrationPath, 'utf8') : '';
const sql = rawSql.replace(/\r\n/g, '\n').toLowerCase();
const verificationSql = readFileSync(
  resolve('supabase/verification/ifood_canonical_command_enqueue.sql'),
  'utf8'
).replace(/\r\n/g, '\n').toLowerCase();

const helperSignature = 'enqueue_ifood_command_for_canonical_action_v1(uuid, integer, text, jsonb)';

describe('iFood canonical accept/reject/cancel enqueue migration', () => {
  it('is a forward migration wrapped in begin/commit with no CR', () => {
    expect(migrationName).toBeTruthy();
    expect(rawSql.includes('\r')).toBe(false);
    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');
  });

  it('wraps accept and reject so enqueue runs before transition_zelo_order', () => {
    expect(sql).toContain('create or replace function public.accept_zelo_order');
    expect(sql).toContain('create or replace function public.reject_zelo_order');
    const acceptIdx = sql.indexOf('create or replace function public.accept_zelo_order');
    const acceptSlice = sql.slice(acceptIdx, sql.indexOf('create or replace function public.reject_zelo_order'));
    expect(acceptSlice.indexOf('enqueue_ifood_command_for_canonical_action_v1'))
      .toBeLessThan(acceptSlice.indexOf('transition_zelo_order('));
    expect(sql).toContain("when 'accept' then 'confirm'");
    expect(sql).toContain("else 'cancel'");
    expect(sql).toContain("v_code := '501'");
    expect(sql).toContain("'cancellationcode'");
  });

  it('elevates to service_role inside the security definer helper before enqueue', () => {
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("set_config('role', 'service_role', true)");
    expect(sql).toContain('set local role service_role');
    expect(sql).toContain('enqueue_ifood_order_command_v1');
  });

  it('keeps the helper browser-inaccessible and patches transition without replacing pizza stock', () => {
    expect(sql).toContain(`revoke all on function public.${helperSignature}`);
    expect(sql).toContain('from public, anon, authenticated');
    expect(sql).toContain(`grant execute on function public.${helperSignature}`);
    expect(sql).toContain('pg_get_functiondef');
    expect(sql).not.toContain('comanda_modifier_stock_requirements');
    expect(sql).toContain("p_action in ('accept', 'reject', 'cancel')");
  });

  it('verifies enqueue-before-flip, default 501, fail-closed rollback and duplicate success', () => {
    for (const marker of [
      'browser role can execute',
      'pending_review',
      'enqueue must run before transition',
      'default cancellationcode 501',
      'orphan ifood command',
      'duplicate confirm',
      'rollback;',
    ]) {
      expect(verificationSql).toContain(marker);
    }
    expect(verificationSql).toContain('accept_zelo_order');
    expect(verificationSql).toContain('reject_zelo_order');
    expect(verificationSql).toContain('transition_zelo_order');
    expect(verificationSql).toContain("intent = 'confirm'");
    expect(verificationSql).toContain("intent = 'cancel'");
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve('supabase/migrations/20260813095000_account_deletion_purge_claims.sql'),
  'utf8',
).replace(/\r\n/g, '\n').toLowerCase();

function functionSql(name) {
  const start = migration.indexOf(`create function public.${name}`);
  expect(start, `${name} must be created by the migration`).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf('\n$$;', start);
  expect(end, `${name} must have a terminated dollar-quoted body`).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
}

describe('account deletion purge claims migration', () => {
  it('adds a fenced claim without exposing it to browser roles', () => {
    expect(migration).toContain('deletion_purge_token uuid');
    expect(migration).toContain('deletion_purge_claimed_at timestamptz');
    expect(migration).toContain('deletion_reactivation_token uuid');
    expect(migration).toContain('deletion_reactivation_started_at timestamptz');
    expect(migration).toContain('for update of ep skip locked');
    expect(migration).toContain("interval '30 minutes'");
    expect(migration).toContain('gen_random_uuid()');
    expect(migration).toContain(
      'order by (ep.deletion_purge_token is not null), ep.deletion_scheduled_at, ep.id',
    );
    expect(migration).toContain('guard_account_deletion_purge_state');
    expect(migration).toContain('before insert or update or delete');
    expect(migration).toContain("if tg_op = 'delete'");
    expect(migration).toContain(
      "current_user in ('postgres', 'service_role')",
    );
    expect(migration).toContain("current_user <> 'service_role'");
    expect(migration).not.toMatch(
      /grant\s+(select|update)\s*\([^;]*(deletion_purge_token|deletion_purge_claimed_at)/i,
    );
  });

  it('fences Stripe reactivation before purge can claim the account', () => {
    const claim = functionSql('claim_due_account_deletions');
    const begin = functionSql('begin_account_deletion_reactivation');
    const complete = functionSql('complete_account_deletion_reactivation');
    const abort = functionSql('abort_account_deletion_reactivation');

    expect(claim.match(/ep\.deletion_reactivation_token is null/g)?.length).toBeGreaterThanOrEqual(2);
    expect(claim).not.toContain('deletion_reactivation_started_at');

    expect(begin).toContain('for update of ep');
    expect(begin).toContain('v_row.deletion_purge_token is not null');
    expect(begin).toContain('v_row.deletion_scheduled_at is null');
    expect(begin).toContain(
      "v_row.deletion_reactivation_started_at > clock_timestamp() - interval '30 minutes'",
    );
    expect(begin).toContain('set deletion_reactivation_token = v_reactivation_token');
    expect(begin).not.toContain('set deletion_scheduled_at = null');

    expect(complete).toContain('ep.deletion_reactivation_token = p_reactivation_token');
    expect(complete).toContain('ep.deletion_purge_token is null');
    expect(complete).toContain('set deletion_scheduled_at = null');
    expect(complete).toContain('deletion_reactivation_token = null');

    expect(abort).toContain('ep.deletion_reactivation_token = p_reactivation_token');
    expect(abort).toContain('ep.deletion_purge_token is null');
    expect(abort).toContain('set deletion_reactivation_token = null');
    expect(abort).not.toContain('set deletion_scheduled_at = null');
  });

  it('renews only the current unexpired claim before each external effect', () => {
    const renew = functionSql('renew_account_deletion_claim');
    expect(renew).toContain('deletion_purge_claimed_at >= clock_timestamp() - interval \'30 minutes\'');
    expect(renew).toContain('ep.deletion_reactivation_token is null');
    expect(renew).toContain('set deletion_purge_claimed_at = clock_timestamp()');
  });

  it('finalizes only the current due claim after the dedicated instance is gone', () => {
    const finalize = functionSql('finalize_claimed_account_deletion');
    expect(finalize).toContain('for update');
    expect(finalize).toContain(
      'v_row.deletion_purge_token is distinct from p_purge_token',
    );
    expect(finalize).toContain('v_row.deletion_reactivation_token is not null');
    expect(finalize).toContain('v_row.deletion_scheduled_at > clock_timestamp()');
    expect(finalize).toContain('v_row.whatsmiau_instance is not null');
    expect(finalize).toContain("perform public.delete_account(p_user_id, 'grace-purge')");
    expect(finalize).toContain('security definer');
    expect(finalize).toContain(
      "if current_setting('role', true) is distinct from 'service_role'",
    );
    expect(migration).not.toContain('create or replace function public.delete_account');
  });

  it('fences direct claim/reactivation-state tampering for every actor', () => {
    const guard = functionSql('guard_account_deletion_purge_state');
    for (const error of [
      'account_deletion_claim_forbidden',
      'account_deletion_claim_active',
      'account_deletion_purge_in_progress',
      'account_deletion_reactivation_in_progress',
      'account_deletion_identity_fenced',
      'account_deletion_instance_fenced',
    ]) {
      expect(guard).toContain(error);
    }
    expect(guard).toContain('new.deletion_reactivation_token is distinct from old.deletion_reactivation_token');
    expect(guard).toContain('old.deletion_reactivation_started_at <= clock_timestamp() - interval \'30 minutes\'');
  });

  it('keeps all privileged RPCs service-role only', () => {
    for (const signature of [
      'public.claim_due_account_deletions(integer)',
      'public.renew_account_deletion_claim(uuid,uuid,uuid)',
      'public.finalize_claimed_account_deletion(uuid,uuid,uuid)',
      'public.begin_account_deletion_reactivation(uuid,uuid)',
      'public.complete_account_deletion_reactivation(uuid,uuid,uuid)',
      'public.abort_account_deletion_reactivation(uuid,uuid,uuid)',
    ]) {
      expect(migration).toContain(`revoke all on function ${signature} from public`);
      expect(migration).toContain(`revoke execute on function ${signature} from anon, authenticated`);
      expect(migration).toContain(`grant execute on function ${signature} to service_role`);
    }
    expect(migration).not.toMatch(/grant execute[^;]*(anon|authenticated)/i);
  });
});

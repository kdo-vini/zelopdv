import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260812165936_webhook_reliability_pix_atomicity.sql'),
  'utf8',
);

describe('webhook reliability migration contract', () => {
  it('settles Pix under a payment row lock and renews subscriptions in the same function', () => {
    expect(migration).toContain('create or replace function public.settle_pix_payment');
    expect(migration).toContain('from public.billing_payments');
    expect(migration).toContain('for update;');
    expect(migration).toContain('update public.subscriptions');
    expect(migration).toContain('update public.billing_payments');
  });

  it('keeps the settlement RPC service-role-only', () => {
    expect(migration).toContain('revoke all on function public.settle_pix_payment');
    expect(migration).toContain('from public, anon, authenticated;');
    expect(migration).toContain('grant execute on function public.settle_pix_payment');
    expect(migration).toContain('to service_role;');
  });

  it('enforces one live subscription row per owner while preserving terminal history', () => {
    const invariantMigration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260812191700_subscriptions_live_row_invariant.sql'),
      'utf8',
    );
    expect(invariantMigration).toContain('create unique index if not exists subscriptions_one_live_row_per_user');
    expect(invariantMigration).toContain("where status in ('active', 'trialing', 'past_due', 'incomplete')");
    expect(invariantMigration).not.toContain('delete from public.subscriptions');
  });
});

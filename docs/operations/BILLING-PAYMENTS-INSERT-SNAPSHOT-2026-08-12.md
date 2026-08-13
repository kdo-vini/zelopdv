# Billing payments client-insert snapshot — 2026-08-12

## Finding independently verified

Before the forward-only migration, `public.billing_payments` exposed an
authenticated self-insert path:

- RLS was enabled (`relrowsecurity=true`), `relforcerowsecurity=false`.
- `authenticated` had table `INSERT` privilege.
- Policy `billing_payments_self_insert` allowed any authenticated user to
  insert any valid payment-shaped row with `auth.uid() = user_id`.
- A production-schema transaction as the permanent E2E owner inserted an
  arbitrary `expired` AbacatePay Pix row with `plan_tier='bundle'` and a
  one-cent amount, then rolled back. No row was persisted.
- An equivalent `anon` transaction was denied by RLS.

The application has no browser-side `billing_payments` insert consumer. The
subscription Pix create route, admin renewal route, AbacatePay webhook, Pix
status route, and `settle_pix_payment` RPC all use `supabaseAdmin`/service-role
access. Subusers are rejected by the billing routes before any write. The
service-role path is therefore the only legitimate writer.

## Exact pre-change snapshot

Production relation ACL:

```text
{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
```

RLS:

```text
relrowsecurity=true
relforcerowsecurity=false
```

Policies:

```text
billing_payments_self_insert | INSERT | {authenticated} | USING null | WITH CHECK (auth.uid() = user_id)
 billing_payments_self_select | SELECT | {authenticated} | USING (auth.uid() = user_id) | WITH CHECK null
```

The production table also had the existing unique/open-Pix indexes and payment
constraints; none were changed by this containment migration.

## Minimal forward change

Migration `20260813032000_billing_payments_server_insert_only.sql` revokes
only `INSERT` on `public.billing_payments` from `anon` and `authenticated`.
It does not change SELECT, UPDATE/DELETE policy definitions, service-role
access, payment columns, indexes, or application code.

The stale insert policy is intentionally retained for this isolated change;
without the table privilege it is unreachable. Removing/reconciling stale
policy definitions belongs to the separate migration-reconciliation work.

## Post-migration verification

Migration `20260813032000` was applied to the linked production project.

- `anon` and `authenticated` no longer have table `INSERT` in the relation ACL.
- `service_role` retains `INSERT` and successfully inserted a transactional
  probe which was rolled back.
- Owner, subuser, and active super-admin authenticated probes all failed with
  `42501 permission denied for table billing_payments` on `INSERT`.
- Owner SELECT remained available (6 owner-visible rows in the probe), while
  the subuser and super-admin saw zero rows under the existing self-select
  policy. Anonymous SELECT returned zero rows.
- No probe row was persisted. The linked migration list reports
  `20260813032000` on both local and remote.

## Blast radius

| Principal/flow | Before | After | Expected impact |
| --- | --- | --- | --- |
| anon | table grant, no matching policy | no INSERT grant | denied (unchanged effective behavior) |
| authenticated owner | arbitrary self-row INSERT | no INSERT privilege | denied; no legitimate browser consumer found |
| authenticated subuser | could insert self-row if direct Data API used | denied | billing routes already reject subusers |
| authenticated super-admin | same table privilege, subject to self user_id | denied | admin renewal uses server route/service role |
| service role | INSERT | INSERT | unchanged; all legitimate billing writes preserved |
| owner SELECT/status | SELECT via existing policy/server route | unchanged | preserved |

## Rollback

The migration is reversible without data changes:

```sql
grant insert on table public.billing_payments to anon, authenticated;
```

Because the original policy was not dropped, this restores the exact
pre-migration effective client insert path. Revoke again with the forward
migration if rollback is no longer required.

# Subscriptions live-row snapshot — 2026-08-12

Before the invariant migration, production was checked through the linked
Supabase CLI.

- Rows by status: `active=7`, `trialing=3`, `trial_expired=11`, `canceled=1`.
- Duplicate owners among `active`, `trialing`, `past_due`, and `incomplete`:
  `0`.
- Existing uniqueness: primary key on `id` and unique Stripe provider
  subscription id; no uniqueness on `user_id`.
- Existing contract: terminal rows are historical, while the newest effective
  row is used by application reads.

The forward-only migration adds the partial unique index
`subscriptions_one_live_row_per_user` for effective statuses only. No rows are
rewritten or deleted. Rollback is a new forward migration that drops only this
index after the application has stopped depending on it.

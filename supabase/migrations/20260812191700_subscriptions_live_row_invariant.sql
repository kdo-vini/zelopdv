-- Preserve historical terminal rows while enforcing one effective subscription
-- row per owner. Current production was checked before this migration: there
-- are no duplicate live users (active/trialing/past_due/incomplete).
--
-- The application keeps canceled/trial_expired rows as history and resolves
-- the current row by updated_at. This partial unique index turns the critical
-- live-row invariant into database enforcement without rewriting history.

create unique index if not exists subscriptions_one_live_row_per_user
  on public.subscriptions (user_id)
  where status in ('active', 'trialing', 'past_due', 'incomplete');

comment on index public.subscriptions_one_live_row_per_user is
  'At most one effective subscription row per owner; terminal history remains append-only.';

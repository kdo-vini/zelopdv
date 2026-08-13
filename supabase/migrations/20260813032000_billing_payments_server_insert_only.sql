-- Billing payment rows are created by trusted server-side billing flows only.
-- Keep authenticated SELECT for the owner's status/read path, but prevent
-- arbitrary client inserts. The existing billing_payments_self_insert policy
-- is intentionally left in place as a no-op until a later reconciliation can
-- remove stale policy definitions without mixing concerns.
revoke insert on table public.billing_payments from anon, authenticated;

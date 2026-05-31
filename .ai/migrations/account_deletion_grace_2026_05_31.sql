-- 14-day grace period for self-service account deletion.
-- Instead of purging immediately, the delete endpoints now SCHEDULE deletion:
-- set deletion_scheduled_at = now() + 14d and cancel the Stripe sub at period end.
-- The user can reactivate any time before then (clears the schedule, resumes Stripe).
-- A sweeper (ZeloChat backend) runs delete_account() once the schedule elapses.

alter table public.empresa_perfil
  add column if not exists deletion_scheduled_at timestamptz,
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_source        text;   -- 'pdv' | 'zelochat'

-- Partial index so the sweeper can cheaply find due accounts.
create index if not exists idx_empresa_perfil_deletion_scheduled
  on public.empresa_perfil (deletion_scheduled_at)
  where deletion_scheduled_at is not null;

comment on column public.empresa_perfil.deletion_scheduled_at is
  'When set & in the future: account is pending self-service deletion and is purged after this time. Cleared on reactivation.';

-- Persist local free-trial expiration separately from payment delinquency.
-- `past_due` remains reserved for provider/manual payment failures.

begin;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'subscriptions'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
      and pg_get_constraintdef(c.oid) ilike '%trialing%'
  loop
    execute format('alter table public.subscriptions drop constraint %I', constraint_record.conname);
  end loop;
end $$;

alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status in ('active', 'trialing', 'trial_expired', 'past_due', 'canceled', 'incomplete'));

update public.subscriptions
set
  status = 'trial_expired',
  updated_at = now()
where status = 'trialing'
  and current_period_end < now()
  and provider_subscription_id is null
  and coalesce(manually_extended_until, '-infinity'::timestamptz) <= now();

commit;

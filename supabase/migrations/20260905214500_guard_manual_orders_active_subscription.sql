-- Revalidate the active subscription when a queued manual order reaches the
-- server. Device registration alone must not outlive the commercial access.
begin;

do $$
declare
  source text;
  needle text := $old$if not exists(select 1 from public.subscriptions where user_id=p_owner
    and (plan_tier in ('chat','bundle') or (plan_tier='pdv' and has_zelo_menu))) then$old$;
  replacement text := $new$if not exists(select 1 from public.subscriptions where user_id=p_owner
    and (manually_extended_until>now() or (status in ('active','trialing') and (current_period_end is null or current_period_end>now())))
    and (plan_tier in ('chat','bundle') or (plan_tier='pdv' and has_zelo_menu))) then$new$;
begin
  select pg_get_functiondef('offline_internal.create_manual_order(uuid,jsonb)'::regprocedure) into source;
  if (length(source)-length(replace(source,needle,'')))/length(needle)<>1 then
    raise exception 'Manual order subscription guard source drift';
  end if;
  execute replace(source,needle,replacement);
end $$;

commit;

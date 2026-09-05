-- Coordinate status polling across replicas; sending remains at least once.
begin;
alter table public.zelomenu_push_subscriptions
  add column if not exists dispatch_lease_id uuid,
  add column if not exists dispatch_lease_until timestamptz;

create or replace function public.claim_zelomenu_order_push(
  p_subscription_id uuid, p_order_id uuid, p_revision integer, p_status text
) returns uuid language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_lease uuid := gen_random_uuid(); v_id uuid;
begin
  if coalesce(current_setting('role',true)='service_role',false) is not true then
    raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED';
  end if;
  update public.zelomenu_push_subscriptions s set dispatch_lease_id=v_lease,
    dispatch_lease_until=clock_timestamp()+interval '2 minutes'
    where s.id=p_subscription_id and s.order_id=p_order_id::text and s.order_updates
      and (s.dispatch_lease_until is null or s.dispatch_lease_until<clock_timestamp())
      and (s.last_order_revision is distinct from p_revision or s.last_order_status is distinct from p_status)
      and exists(select 1 from public.zelo_orders o where o.id=p_order_id and o.revision=p_revision and o.status=p_status)
    returning s.id into v_id;
  return case when v_id is not null then v_lease else null end;
end
$function$;
revoke all on function public.claim_zelomenu_order_push(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.claim_zelomenu_order_push(uuid,uuid,integer,text) to service_role;
comment on function public.claim_zelomenu_order_push(uuid,uuid,integer,text) is
  'Service-only two-minute delivery lease; checkpoint must match returned lease ID. Timeout/crash may cause retry, never exactly-once transport.';
commit;

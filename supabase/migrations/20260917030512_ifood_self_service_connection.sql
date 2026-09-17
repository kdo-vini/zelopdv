-- iFood self-service connection RPCs (Task 17).
--
-- `ifood_internal.connections` already exists (foundation migration,
-- 2026-09-16) but no RPC could read or write it: every other consumer of
-- this private schema (events, commands, product mappings) got its own
-- RPC when it needed one, because `ifood_internal` has no PostgREST
-- exposure and no other lookup path. This migration adds the three
-- mechanical RPCs the self-service connection API needs; every policy
-- decision (entitlement, capability, CSRF/state, "no active orders before
-- pause/disconnect") lives in `src/lib/server/ifood/connectionService.js`,
-- not here — these RPCs only enforce identity/shape and the service-role
-- ACL, exactly like `enqueue_ifood_event_v1` does for the inbox.
--
-- This migration is local-only: it has never been applied to any shared
-- database, so rewriting it in place (instead of layering a forward
-- migration on top) is acceptable, same as the webhook-enqueue migration.
begin;

create or replace function public.get_ifood_connection_v1(
  p_empresa_id uuid
) returns table (
  connection_id uuid,
  merchant_id text,
  status text,
  print_owner text,
  last_webhook_at timestamptz,
  last_poll_at timestamptz,
  last_token_at timestamptz,
  worker_heartbeat_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;
  if p_empresa_id is null then
    raise exception 'INVALID_EMPRESA_ID';
  end if;

  return query
  select c.id, c.merchant_id, c.status, c.print_owner,
         c.last_webhook_at, c.last_poll_at, c.last_token_at,
         c.worker_heartbeat_at, c.created_at, c.updated_at
    from ifood_internal.connections as c
   where c.empresa_id = p_empresa_id
   order by c.created_at desc
   limit 1;
end;
$$;

-- Mechanical upsert only: the caller (connectionService.js) decides the
-- target status (pending on first connect, keep active on an idempotent
-- retry, paused/active/revoked on an explicit action) and whether an
-- "active orders" gate must run first. This RPC never invents a status
-- transition on its own; it either updates the caller's own empresa's row
-- or fails with a distinguishable outcome, never raising a raw unique
-- violation to the caller.
create or replace function public.upsert_ifood_connection_v1(
  p_empresa_id uuid,
  p_merchant_id text,
  p_status text
) returns table (
  connection_id uuid,
  merchant_id text,
  status text,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing ifood_internal.connections;
  v_id uuid;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;
  if p_empresa_id is null or nullif(btrim(coalesce(p_merchant_id, '')), '') is null then
    raise exception 'INVALID_CONNECTION_IDENTITY';
  end if;
  if length(btrim(p_merchant_id)) > 200 then
    raise exception 'INVALID_MERCHANT_ID';
  end if;
  if p_status not in ('pending', 'active', 'degraded', 'paused', 'revoked') then
    raise exception 'INVALID_STATUS';
  end if;

  select *
    into v_existing
    from ifood_internal.connections
   where empresa_id = p_empresa_id
   order by created_at desc
   limit 1;

  if v_existing.id is not null and v_existing.merchant_id <> btrim(p_merchant_id)
     and v_existing.status <> 'revoked' then
    connection_id := v_existing.id;
    merchant_id := v_existing.merchant_id;
    status := v_existing.status;
    outcome := 'conflict_other_merchant';
    return next;
    return;
  end if;

  if v_existing.id is not null and v_existing.merchant_id = btrim(p_merchant_id) then
    update ifood_internal.connections
       set status = p_status,
           updated_at = now()
     where id = v_existing.id
     returning id into v_id;

    connection_id := v_id;
    merchant_id := btrim(p_merchant_id);
    status := p_status;
    outcome := 'updated';
    return next;
    return;
  end if;

  begin
    insert into ifood_internal.connections (empresa_id, merchant_id, status)
    values (p_empresa_id, btrim(p_merchant_id), p_status)
    returning id into v_id;
  exception when unique_violation then
    connection_id := null;
    merchant_id := btrim(p_merchant_id);
    status := null;
    outcome := 'merchant_taken';
    return next;
    return;
  end;

  connection_id := v_id;
  merchant_id := btrim(p_merchant_id);
  status := p_status;
  outcome := 'created';
  return next;
end;
$$;

-- Used by connectionService.js before pausing or disconnecting: a merchant
-- with orders that have not reached a terminal internal status must not be
-- paused/revoked from under an operator who is still fulfilling them.
create or replace function public.count_ifood_active_orders_v1(
  p_connection_id uuid
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;
  if p_connection_id is null then
    raise exception 'INVALID_CONNECTION_ID';
  end if;

  select count(*)
    into v_count
    from ifood_internal.order_refs as r
    join public.zelo_orders as o on o.id = r.zelo_order_id
   where r.connection_id = p_connection_id
     and o.status not in ('delivered', 'cancelled', 'rejected');

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.get_ifood_connection_v1(uuid) from public, anon, authenticated;
revoke all on function public.upsert_ifood_connection_v1(uuid, text, text) from public, anon, authenticated;
revoke all on function public.count_ifood_active_orders_v1(uuid) from public, anon, authenticated;
grant execute on function public.get_ifood_connection_v1(uuid) to service_role;
grant execute on function public.upsert_ifood_connection_v1(uuid, text, text) to service_role;
grant execute on function public.count_ifood_active_orders_v1(uuid) to service_role;

commit;

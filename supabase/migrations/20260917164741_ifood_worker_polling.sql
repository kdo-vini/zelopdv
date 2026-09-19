-- iFood worker polling seam (poll -> event_inbox).
--
-- `createIfoodReconciler` (src/lib/server/ifood/reconciliation.js) needs three
-- repository operations. Only one of them already had an RPC:
--
--   * enqueuePolledEvent  -> public.enqueue_ifood_webhook_event_v1 (Task 6);
--     it already resolves the connection by merchant_id and already returns
--     the exact inserted/duplicate/unknown_merchant outcome the reconciler
--     branches on, so polling reuses it instead of adding a second insert
--     path into ifood_internal.event_inbox.
--   * listConnectionsForPolling -> added here.
--   * recordPollSuccess         -> added here.
--
-- The worker cannot read or write `ifood_internal.connections` directly: the
-- schema has no PostgREST exposure (foundation migration, 2026-09-16), and
-- `admin_ifood_connections_overview_v1` is an operator console read with
-- per-connection queue counts, not a hot-path worker query. Both RPCs below
-- are service_role-only, exactly like every other RPC in this schema.
--
-- `recordPollSuccess` is the token-liveness signal: a successful poll is an
-- authenticated provider call, so it is the evidence `connectionHealth.js`
-- uses to stop reporting a stale token. Without it a merchant could never
-- recover from `worker_heartbeat_missing`.
--
-- This migration is local-only: it has never been applied to any shared
-- database.
begin;

-- Which connections the worker may poll. `revoked` is excluded because the
-- enqueue RPC would refuse the resulting events anyway, and `pending` is
-- excluded because nothing has confirmed the merchant grant yet. `degraded`
-- and `paused` are deliberately still polled: those statuses gate presence
-- and commands, never ingestion, so the durable inbox keeps filling.
create or replace function public.list_ifood_connections_for_polling_v1(
  p_now timestamptz default null,
  p_min_interval_ms bigint default null,
  p_limit integer default 1000
) returns table (
  connection_id uuid,
  empresa_id uuid,
  merchant_id text,
  status text,
  last_poll_at timestamptz,
  polling_cursor text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_limit integer := least(greatest(coalesce(p_limit, 1000), 1), 1000);
  v_interval interval := make_interval(
    secs => greatest(coalesce(p_min_interval_ms, 0), 0)::double precision / 1000.0
  );
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    c.id,
    c.empresa_id,
    c.merchant_id,
    c.status,
    c.last_poll_at,
    c.polling_cursor
  from ifood_internal.connections as c
  where c.status in ('active', 'degraded', 'paused')
    and (c.last_poll_at is null or c.last_poll_at <= v_now - v_interval)
  order by c.last_poll_at asc nulls first, c.created_at asc
  limit v_limit;
end;
$$;

-- Record a successful authenticated poll. Timestamps only move forward, so a
-- late or clock-skewed worker can never make a connection look staler than a
-- newer poll already proved it is.
create or replace function public.record_ifood_poll_success_v1(
  p_connection_id uuid,
  p_merchant_id text,
  p_polled_at timestamptz default null,
  p_token_confirmed_at timestamptz default null
) returns table (
  connection_id uuid,
  merchant_id text,
  last_poll_at timestamptz,
  last_token_at timestamptz,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_polled_at timestamptz := coalesce(p_polled_at, now());
  v_token_at timestamptz := coalesce(p_token_confirmed_at, p_polled_at, now());
  v_connection_id uuid;
  v_merchant_id text;
  v_last_poll_at timestamptz;
  v_last_token_at timestamptz;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;
  if nullif(btrim(p_merchant_id), '') is null then
    raise exception 'INVALID_MERCHANT_ID';
  end if;

  update ifood_internal.connections as c
     set last_poll_at = greatest(c.last_poll_at, v_polled_at),
         last_token_at = greatest(c.last_token_at, v_token_at),
         worker_heartbeat_at = greatest(c.worker_heartbeat_at, v_polled_at),
         updated_at = now()
   where c.merchant_id = p_merchant_id
     and c.status <> 'revoked'
     and (p_connection_id is null or c.id = p_connection_id)
  returning c.id, c.merchant_id, c.last_poll_at, c.last_token_at
    into v_connection_id, v_merchant_id, v_last_poll_at, v_last_token_at;

  if v_connection_id is null then
    connection_id := p_connection_id;
    merchant_id := p_merchant_id;
    last_poll_at := null;
    last_token_at := null;
    outcome := 'unknown_merchant';
    return next;
    return;
  end if;

  connection_id := v_connection_id;
  merchant_id := v_merchant_id;
  last_poll_at := v_last_poll_at;
  last_token_at := v_last_token_at;
  outcome := 'updated';
  return next;
end;
$$;

revoke all on function public.list_ifood_connections_for_polling_v1(timestamptz, bigint, integer) from public, anon, authenticated;
revoke all on function public.record_ifood_poll_success_v1(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.list_ifood_connections_for_polling_v1(timestamptz, bigint, integer) to service_role;
grant execute on function public.record_ifood_poll_success_v1(uuid, text, timestamptz, timestamptz) to service_role;

commit;

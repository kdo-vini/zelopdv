-- iFood webhook enqueue RPC.
--
-- The webhook route only ever learns a provider `merchantId`; it has no
-- `connection_id` to hand to `public.enqueue_ifood_event_v1`, and
-- `ifood_internal` is private (no PostgREST exposure, no lookup RPC). This
-- migration adds a service-role-only RPC that resolves the non-revoked
-- connection by `merchant_id` and delegates the actual insert/duplicate
-- work to `public.enqueue_ifood_event_v1` so the two RPCs share a single
-- insert path, but never raises for an unknown or revoked merchant: the
-- webhook must still ack fast, and an event that could not be attributed
-- to a connection is simply not persisted. Historical events of a
-- merchant that never connected to Zelo are out of MVP scope (no
-- historical backfill); events of a merchant already connected
-- (`pending`/`active`/`degraded`/`paused`) are persisted and Task 9's
-- polling reconciliation only ever fills gaps for those same connected
-- merchants. This migration is local-only: it has never been applied to
-- any shared database, so rewriting it in place (instead of layering a
-- forward migration on top) is acceptable.
begin;

create or replace function public.enqueue_ifood_webhook_event_v1(
  p_event_id text,
  p_merchant_id text,
  p_external_order_id text,
  p_event_type text,
  p_external_revision bigint,
  p_occurred_at timestamptz,
  p_payload jsonb
) returns table (inbox_id uuid, event_id text, inserted boolean, status text, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection_id uuid;
  v_result record;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;
  if nullif(btrim(p_event_id), '') is null
     or nullif(btrim(p_merchant_id), '') is null
     or nullif(btrim(p_event_type), '') is null then
    raise exception 'INVALID_EVENT_IDENTITY';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 262144 then
    raise exception 'PAYLOAD_TOO_LARGE_OR_INVALID';
  end if;

  select c.id
    into v_connection_id
    from ifood_internal.connections as c
   where c.merchant_id = p_merchant_id
     and c.status <> 'revoked'
   limit 1;

  if v_connection_id is null then
    inbox_id := null;
    event_id := p_event_id;
    inserted := false;
    status := null;
    outcome := 'unknown_merchant';
    return next;
    return;
  end if;

  select *
    into v_result
    from public.enqueue_ifood_event_v1(
      v_connection_id, p_event_id, p_merchant_id, p_external_order_id,
      p_event_type, p_external_revision, p_occurred_at, p_payload
    );

  inbox_id := v_result.inbox_id;
  event_id := v_result.event_id;
  inserted := v_result.inserted;
  status := v_result.status;
  outcome := case when v_result.inserted then 'inserted' else 'duplicate' end;
  return next;
end;
$$;

revoke all on function public.enqueue_ifood_webhook_event_v1(text, text, text, text, bigint, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_ifood_webhook_event_v1(text, text, text, text, bigint, timestamptz, jsonb) to service_role;

commit;

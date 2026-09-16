-- iFood webhook enqueue RPC.
--
-- The webhook route only ever learns a provider `merchantId`; it has no
-- `connection_id` to hand to `public.enqueue_ifood_event_v1`, and
-- `ifood_internal` is private (no PostgREST exposure, no lookup RPC). This
-- migration adds a service-role-only RPC that resolves the non-revoked
-- connection by `merchant_id` and performs the same insert/duplicate
-- semantics as the foundation enqueue, but never raises for an unknown or
-- revoked merchant: the webhook must still ack fast, and an event that
-- could not be attributed to a connection is simply not persisted. That
-- gap is acceptable because Task 9's polling reconciliation independently
-- retrieves events the webhook could not enqueue.
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
  v_empresa_id uuid;
  v_id uuid;
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

  select c.id, c.empresa_id
    into v_connection_id, v_empresa_id
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

  insert into ifood_internal.event_inbox (
    connection_id, empresa_id, merchant_id, event_id, external_order_id,
    event_type, external_revision, occurred_at, payload, payload_hash
  ) values (
    v_connection_id, v_empresa_id, p_merchant_id, p_event_id,
    nullif(btrim(p_external_order_id), ''), p_event_type,
    greatest(coalesce(p_external_revision, 0), 0), p_occurred_at, p_payload,
    md5(p_payload::text)
  )
  on conflict on constraint ifood_event_inbox_event_unique do nothing
  returning id, event_inbox.event_id, true, event_inbox.status
    into v_id, event_id, inserted, status;

  if v_id is not null then
    inbox_id := v_id;
    outcome := 'inserted';
    return next;
    return;
  end if;

  select e.id, e.event_id, false, e.status
    into inbox_id, event_id, inserted, status
    from ifood_internal.event_inbox as e
   where e.event_id = p_event_id;
  if inbox_id is null then
    raise exception 'EVENT_INSERT_RACE';
  end if;
  outcome := 'duplicate';
  return next;
end;
$$;

revoke all on function public.enqueue_ifood_webhook_event_v1(text, text, text, text, bigint, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_ifood_webhook_event_v1(text, text, text, text, bigint, timestamptz, jsonb) to service_role;

commit;

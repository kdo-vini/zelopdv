-- Asynchronous iFood order commands.
--
-- Browser requests only enqueue a server-owned intent. The provider action is
-- performed later by the command worker, and a provider event is the only
-- path that changes the commercial order state. This migration is forward
-- only: the foundation tables and leases are deliberately not altered here.
--
-- Transition matrix (canonical zelo_orders state):
--   confirm          pending_review -> provider confirm
--   start_preparation accepted -> provider startPreparation
--   ready_to_pickup  accepted/preparing, deliveredBy <> IFOOD -> readyToPickup
--   dispatch         preparing/ready, delivery + deliveredBy = MERCHANT -> dispatch
--   cancel           every non-terminal state -> requestCancellation
-- The ready_to_pickup exception mirrors the observed provider behavior: iFood
-- delivery is not a Zelo pickup flow. The SQL checks this before enqueueing;
-- it never performs an optimistic update to public.zelo_orders.
-- The foundation status vocabulary remains: 'queued', 'sending',
-- 'accepted_http', 'confirmed_event', 'failed_retryable', 'failed_terminal',
-- 'expired'. Intents remain: 'confirm', 'start_preparation',
-- 'ready_to_pickup', 'dispatch', 'cancel'.

begin;

create or replace function public.enqueue_ifood_order_command_v1(
  p_empresa_id uuid,
  p_zelo_order_id uuid,
  p_intent text,
  p_expected_revision integer,
  p_payload jsonb,
  p_idempotency_key text
) returns table (
  outcome text,
  command_id uuid,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref ifood_internal.order_refs;
  v_order public.zelo_orders;
  v_connection_status text;
  v_merchant_id text;
  v_intent text;
  v_payload jsonb;
  v_idempotency_key text;
  v_command_id uuid;
  v_command_status text;
  v_transition_allowed boolean := false;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;

  if p_empresa_id is null or p_zelo_order_id is null
     or nullif(btrim(p_intent), '') is null
     or p_expected_revision is null
     or nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'INVALID_COMMAND_ARGUMENTS';
  end if;

  v_intent := lower(btrim(p_intent));
  v_idempotency_key := btrim(p_idempotency_key);
  v_payload := coalesce(p_payload, '{}'::jsonb);

  if v_intent not in ('confirm', 'start_preparation', 'ready_to_pickup', 'dispatch', 'cancel') then
    raise exception 'INVALID_COMMAND_INTENT';
  end if;
  if jsonb_typeof(v_payload) <> 'object' then
    outcome := 'invalid_payload';
    command_id := null;
    status := null;
    return next;
    return;
  end if;

  -- The tenant predicate is part of the identity lookup. A valid order id in
  -- another company therefore returns not_found without writing anything.
  select r.*
    into v_ref
    from ifood_internal.order_refs as r
   where r.zelo_order_id = p_zelo_order_id
     and r.empresa_id = p_empresa_id
   for update;

  if not found then
    outcome := 'not_found';
    command_id := null;
    status := null;
    return next;
    return;
  end if;

  -- Lock the commercial row before reading its revision or status. The
  -- command enqueue is intentionally the only write in this function.
  select zo.*
    into v_order
    from public.zelo_orders as zo
   where zo.id = v_ref.zelo_order_id
     and zo.empresa_id = p_empresa_id
   for update;

  if not found then
    outcome := 'not_found';
    command_id := null;
    status := null;
    return next;
    return;
  end if;

  if v_order.revision <> p_expected_revision then
    outcome := 'revision_conflict';
    command_id := null;
    status := null;
    return next;
    return;
  end if;

  -- Lock the connection while checking availability so a pause/revocation
  -- cannot be interleaved with the decision to enqueue this command.
  select c.status, c.merchant_id
    into v_connection_status, v_merchant_id
    from ifood_internal.connections as c
   where c.id = v_ref.connection_id
     and c.empresa_id = p_empresa_id
   for update;

  if not found or v_connection_status <> 'active' then
    outcome := 'connection_unavailable';
    command_id := null;
    status := null;
    return next;
    return;
  end if;

  v_transition_allowed := case v_intent
    when 'confirm' then v_order.status = 'pending_review'
    when 'start_preparation' then v_order.status = 'accepted'
    when 'ready_to_pickup' then
      v_order.status in ('accepted', 'preparing')
      and upper(btrim(coalesce(v_order.fulfillment->>'deliveredBy', ''))) <> 'IFOOD'
    when 'dispatch' then
      v_order.status in ('preparing', 'ready')
      and lower(btrim(coalesce(v_order.fulfillment->>'type', ''))) = 'delivery'
      and upper(btrim(coalesce(v_order.fulfillment->>'deliveredBy', ''))) = 'MERCHANT'
    when 'cancel' then v_order.status not in ('delivered', 'rejected', 'cancelled')
    else false
  end;

  if not v_transition_allowed then
    outcome := 'invalid_transition';
    command_id := null;
    status := null;
    return next;
    return;
  end if;

  if v_intent = 'cancel' then
    if not (v_payload ? 'cancellationCode')
       or jsonb_typeof(v_payload->'cancellationCode') <> 'string'
       or nullif(btrim(v_payload->>'cancellationCode'), '') is null then
      outcome := 'invalid_payload';
      command_id := null;
      status := null;
      return next;
      return;
    end if;
    if v_payload ? 'reason' and jsonb_typeof(v_payload->'reason') <> 'string' then
      outcome := 'invalid_payload';
      command_id := null;
      status := null;
      return next;
      return;
    end if;
    if length(coalesce(v_payload->>'reason', '')) > 250 then
      outcome := 'invalid_payload';
      command_id := null;
      status := null;
      return next;
      return;
    end if;

    -- Only the provider fields belong in the durable command payload. This
    -- also prevents accidental persistence of unrelated browser fields.
    -- Read both fields from the original payload before rebuilding it; the
    -- rebuilt object must not be used as the source of `reason`.
    v_payload := jsonb_build_object('cancellationCode', btrim(p_payload->>'cancellationCode'))
      || case
           when nullif(btrim(coalesce(p_payload->>'reason', '')), '') is not null
             then jsonb_build_object('reason', btrim(p_payload->>'reason'))
           else '{}'::jsonb
         end;
  else
    v_payload := '{}'::jsonb;
  end if;

  begin
    insert into ifood_internal.order_commands (
      connection_id,
      order_ref_id,
      empresa_id,
      merchant_id,
      external_order_id,
      intent,
      expected_external_revision,
      idempotency_key,
      payload,
      status
    ) values (
      v_ref.connection_id,
      v_ref.id,
      p_empresa_id,
      v_merchant_id,
      v_ref.external_order_id,
      v_intent,
      p_expected_revision,
      v_idempotency_key,
      v_payload,
      'queued'
    ) returning id, order_commands.status into v_command_id, v_command_status;
  exception
    when unique_violation then
      -- Both the command key and the idempotency key are unique. Resolve the
      -- existing row explicitly rather than returning a driver constraint
      -- error or inserting a second command.
      select c.id, c.status
        into v_command_id, v_command_status
        from ifood_internal.order_commands as c
       where c.empresa_id = p_empresa_id
         and (
           (c.connection_id = v_ref.connection_id
            and c.external_order_id = v_ref.external_order_id
            and c.intent = v_intent
            and c.expected_external_revision = p_expected_revision)
           or c.idempotency_key = v_idempotency_key
         )
       order by c.created_at, c.id
       limit 1;

      if not found then
        raise;
      end if;

      -- The commercial revision does not move until a provider event arrives,
      -- so a command that failed terminally or expired would otherwise block
      -- the operator from ever retrying the same intent. Only those final
      -- failure states are re-queued in place; any live or confirmed command
      -- is reported as a duplicate.
      if v_command_status in ('failed_terminal', 'expired') then
        update ifood_internal.order_commands as c
           set status = 'queued',
               payload = v_payload,
               attempts = 0,
               next_attempt_at = now(),
               terminal_at = null,
               last_error_code = null,
               last_error = null,
               response = null,
               lease_id = null,
               lease_owner = null,
               lease_until = null,
               updated_at = now()
         where c.id = v_command_id
        returning c.status into v_command_status;

        outcome := 'requeued';
        command_id := v_command_id;
        status := v_command_status;
        return next;
        return;
      end if;

      outcome := 'duplicate';
      command_id := v_command_id;
      status := v_command_status;
      return next;
      return;
  end;

  outcome := 'queued';
  command_id := v_command_id;
  status := v_command_status;
  return next;
end;
$$;

create or replace function public.confirm_ifood_order_commands_v1(
  p_merchant_id text,
  p_external_order_id text,
  p_external_status text
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent text;
  v_updated integer;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;

  v_intent := case upper(btrim(coalesce(p_external_status, '')))
    when 'CONFIRMED' then 'confirm'
    when 'PREPARATION_STARTED' then 'start_preparation'
    when 'READY_TO_PICKUP' then 'ready_to_pickup'
    when 'DISPATCHED' then 'dispatch'
    when 'CANCELLED' then 'cancel'
    else null
  end;

  if v_intent is null or nullif(btrim(coalesce(p_merchant_id, '')), '') is null
     or nullif(btrim(coalesce(p_external_order_id, '')), '') is null then
    return 0;
  end if;

  update ifood_internal.order_commands as c
     set status = 'confirmed_event',
         terminal_at = now(),
         last_error_code = null,
         last_error = null,
         lease_id = null,
         lease_owner = null,
         lease_until = null,
         updated_at = now()
   where c.merchant_id = btrim(p_merchant_id)
     and c.external_order_id = btrim(p_external_order_id)
     and c.intent = v_intent
     and c.status in ('accepted_http', 'sending', 'queued', 'failed_retryable');

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

create or replace function public.expire_ifood_accepted_commands_v1(
  p_older_than_seconds integer
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;
  if p_older_than_seconds is null or p_older_than_seconds not between 60 and 86400 then
    raise exception 'INVALID_EXPIRY_THRESHOLD';
  end if;

  update ifood_internal.order_commands as c
     set status = 'expired',
         terminal_at = coalesce(c.terminal_at, now()),
         lease_id = null,
         lease_owner = null,
         lease_until = null,
         updated_at = now()
   where c.status = 'accepted_http'
     and c.updated_at < now() - make_interval(secs => p_older_than_seconds);

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

create or replace function public.get_ifood_order_ref_v1(
  p_empresa_id uuid,
  p_zelo_order_id uuid
) returns table (
  merchant_id text,
  external_order_id text,
  connection_status text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select c.merchant_id, r.external_order_id, c.status
    from ifood_internal.order_refs as r
    join ifood_internal.connections as c
      on c.id = r.connection_id
     and c.empresa_id = r.empresa_id
   where r.empresa_id = p_empresa_id
     and r.zelo_order_id = p_zelo_order_id;
end;
$$;

comment on function public.enqueue_ifood_order_command_v1(uuid, uuid, text, integer, jsonb, text) is
  'Enfileira uma intencao iFood tenant-scoped sem alterar o status comercial do pedido.';
comment on function public.confirm_ifood_order_commands_v1(text, text, text) is
  'Correlaciona evento externo iFood com comandos pendentes, sem alterar zelo_orders.';
comment on function public.expire_ifood_accepted_commands_v1(integer) is
  'Expira aceites HTTP administrativos sem alterar zelo_orders.';
comment on function public.get_ifood_order_ref_v1(uuid, uuid) is
  'Resolve a referencia externa iFood dentro da empresa informada.';

revoke all on function public.enqueue_ifood_order_command_v1(uuid, uuid, text, integer, jsonb, text) from public, anon, authenticated;
revoke all on function public.confirm_ifood_order_commands_v1(text, text, text) from public, anon, authenticated;
revoke all on function public.expire_ifood_accepted_commands_v1(integer) from public, anon, authenticated;
revoke all on function public.get_ifood_order_ref_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.enqueue_ifood_order_command_v1(uuid, uuid, text, integer, jsonb, text) to service_role;
grant execute on function public.confirm_ifood_order_commands_v1(text, text, text) to service_role;
grant execute on function public.expire_ifood_accepted_commands_v1(integer) to service_role;
grant execute on function public.get_ifood_order_ref_v1(uuid, uuid) to service_role;

commit;

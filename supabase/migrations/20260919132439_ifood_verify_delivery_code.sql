-- Allow merchant-delivery operators to conclude an iFood order in route by
-- verifying the customer drop / localizer code. The commercial status still
-- only moves on the CONCLUDED event; this enqueue is fail-closed like the
-- other intents.

begin;

alter table ifood_internal.order_commands
  drop constraint if exists ifood_order_commands_intent_check;

alter table ifood_internal.order_commands
  add constraint ifood_order_commands_intent_check
  check (intent in (
    'confirm',
    'start_preparation',
    'ready_to_pickup',
    'dispatch',
    'verify_delivery_code',
    'cancel'
  ));

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

  if v_intent not in (
    'confirm',
    'start_preparation',
    'ready_to_pickup',
    'dispatch',
    'verify_delivery_code',
    'cancel'
  ) then
    raise exception 'INVALID_COMMAND_INTENT';
  end if;
  if jsonb_typeof(v_payload) <> 'object' then
    outcome := 'invalid_payload';
    command_id := null;
    status := null;
    return next;
    return;
  end if;

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
    when 'verify_delivery_code' then
      v_order.status = 'out_for_delivery'
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

    v_payload := jsonb_build_object('cancellationCode', btrim(p_payload->>'cancellationCode'))
      || case
           when nullif(btrim(coalesce(p_payload->>'reason', '')), '') is not null
             then jsonb_build_object('reason', btrim(p_payload->>'reason'))
           else '{}'::jsonb
         end;
  elsif v_intent = 'verify_delivery_code' then
    if not (v_payload ? 'code')
       or jsonb_typeof(v_payload->'code') <> 'string'
       or nullif(btrim(v_payload->>'code'), '') is null
       or length(btrim(v_payload->>'code')) > 32 then
      outcome := 'invalid_payload';
      command_id := null;
      status := null;
      return next;
      return;
    end if;
    v_payload := jsonb_build_object('code', btrim(p_payload->>'code'));
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
    when 'CONCLUDED' then 'verify_delivery_code'
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

comment on function public.enqueue_ifood_order_command_v1(uuid, uuid, text, integer, jsonb, text) is
  'Enqueue an iFood provider intent. verify_delivery_code requires payload.code.';

revoke all on function public.enqueue_ifood_order_command_v1(uuid, uuid, text, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.enqueue_ifood_order_command_v1(uuid, uuid, text, integer, jsonb, text) to service_role;

revoke all on function public.confirm_ifood_order_commands_v1(text, text, text) from public, anon, authenticated;
grant execute on function public.confirm_ifood_order_commands_v1(text, text, text) to service_role;

commit;

-- iFood canonical order projection RPC.
--
-- This is the only place an iFood event ever mutates public.zelo_orders /
-- zelo_order_items / zelo_order_events / zelo_order_outbox. It intentionally
-- does not reuse create_zelo_order or transition_zelo_order: the former's
-- own p_source whitelist does not include 'ifood', and the latter runs PDV
-- stock-commitment logic tied to produtos/categorias that must never run
-- for iFood items (an unmapped item must not block the order or move
-- stock -- product mapping is a later task).
--
-- The compare-and-set decision (new vs. duplicate vs. stale vs. terminal
-- conflict vs. advance) is SQL-authoritative only: this function locks the
-- matching ifood_internal.order_refs row FOR UPDATE and recomputes the same
-- 7-entry monotonic rank table src/lib/server/ifood/eventPolicy.js already
-- uses in the domain module, inline as a CASE. The JS event handler
-- (src/lib/server/ifood/eventHandler.js) deliberately does not duplicate
-- this compare-and-set logic against a speculative read of order_refs: the
-- only correctness-critical use of the rank table is inside the same
-- transaction that writes the row, so it lives here alone. The JS handler
-- only short-circuits two cases before ever calling this RPC: known
-- informational event codes (DELIVERY_DROP_CODE_REQUESTED,
-- CANCELLATION_REQUESTED -- observed live 2026-09-16, no commercial
-- transition of their own) and event codes outside the 7-entry canonical
-- set (durable quarantine, never reaching this function).
--
-- additionalFees has no dedicated column on zelo_orders, so it is folded
-- into delivery_fee (delivery_fee := totals.deliveryFee + totals.additionalFees)
-- as a deliberate, documented simplification; discount := totals.benefits;
-- subtotal := totals.subTotal. total is *computed* here from those three
-- already-rounded numeric(14,2) columns (subtotal + delivery_fee - discount)
-- rather than trusted from the caller's totals.orderAmount, so
-- zelo_orders_total_consistent's CHECK can never be violated by floating
-- point drift between the JS normalizer's 0.01 reconciliation tolerance and
-- Postgres's exact numeric arithmetic.
begin;

do $$
begin
  if to_regclass('ifood_internal.order_refs') is null
     or to_regclass('ifood_internal.connections') is null
     or to_regclass('public.zelo_orders') is null
     or to_regclass('public.zelo_order_items') is null
     or to_regclass('public.zelo_order_events') is null
     or to_regclass('public.zelo_order_outbox') is null then
    raise exception 'PRECONDITION_FAILED: iFood order projection dependencies are missing';
  end if;
  if to_regprocedure('public.zelo_order_result(public.zelo_orders)') is null then
    raise exception 'PRECONDITION_FAILED: public.zelo_order_result is missing';
  end if;
end
$$;

create or replace function public.project_ifood_order_event_v1(
  p_merchant_id text,
  p_external_order_id text,
  p_event_id text,
  p_external_status text,
  p_occurred_at timestamptz,
  p_order jsonb
) returns table (
  outcome text,
  zelo_order_id uuid,
  revision integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection_id uuid;
  v_empresa_id uuid;
  v_ref ifood_internal.order_refs;
  v_order public.zelo_orders;
  v_rank integer;
  v_current_rank integer;
  v_internal_status text;
  v_decision text;
  v_customer jsonb;
  v_fulfillment jsonb;
  v_payment jsonb;
  v_subtotal numeric(14,2);
  v_delivery_fee numeric(14,2);
  v_discount numeric(14,2);
  v_total numeric(14,2);
  v_item jsonb;
  v_position integer := 0;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;
  if nullif(btrim(p_merchant_id), '') is null
     or nullif(btrim(p_external_order_id), '') is null
     or nullif(btrim(p_event_id), '') is null
     or nullif(btrim(p_external_status), '') is null then
    raise exception 'INVALID_PROJECTION_ARGUMENTS';
  end if;
  if p_order is null or jsonb_typeof(p_order) <> 'object' then
    raise exception 'INVALID_ORDER_SNAPSHOT';
  end if;

  -- Mirrors eventPolicy.js's IFOOD_STATUS_RANK / IFOOD_STATUS_TO_INTERNAL
  -- exactly. This 7-entry table is a closed, stable set (the iFood Events
  -- v1 contract snapshot); if it ever grows, both this CASE and
  -- eventPolicy.js must be updated together.
  v_rank := case p_external_status
    when 'PLACED' then 0
    when 'CONFIRMED' then 1
    when 'PREPARATION_STARTED' then 2
    when 'READY_TO_PICKUP' then 3
    when 'DISPATCHED' then 4
    when 'CONCLUDED' then 5
    when 'CANCELLED' then 5
    else null
  end;
  v_internal_status := case p_external_status
    when 'PLACED' then 'pending_review'
    when 'CONFIRMED' then 'accepted'
    when 'PREPARATION_STARTED' then 'preparing'
    when 'READY_TO_PICKUP' then 'ready'
    when 'DISPATCHED' then 'out_for_delivery'
    when 'CONCLUDED' then 'delivered'
    when 'CANCELLED' then 'cancelled'
    else null
  end;
  if v_rank is null or v_internal_status is null then
    -- The JS event handler already quarantines any code outside the 7-entry
    -- canonical set before ever calling this RPC; reaching here with an
    -- unknown status means a caller bug, not a real provider event.
    raise exception 'UNKNOWN_EXTERNAL_STATUS';
  end if;

  select c.id, c.empresa_id
    into v_connection_id, v_empresa_id
    from ifood_internal.connections as c
   where c.merchant_id = p_merchant_id
     and c.status <> 'revoked'
   limit 1;

  if v_connection_id is null then
    outcome := 'unknown_merchant';
    zelo_order_id := null;
    revision := null;
    return next;
    return;
  end if;

  v_customer := coalesce(p_order->'customerSnapshot', '{}'::jsonb);
  v_fulfillment := coalesce(p_order->'fulfillment', '{}'::jsonb);
  v_payment := coalesce(p_order->'payment', '{}'::jsonb);
  v_subtotal := coalesce((p_order#>>'{totals,subTotal}')::numeric, 0);
  v_delivery_fee := coalesce((p_order#>>'{totals,deliveryFee}')::numeric, 0)
                  + coalesce((p_order#>>'{totals,additionalFees}')::numeric, 0);
  v_discount := coalesce((p_order#>>'{totals,benefits}')::numeric, 0);
  v_total := v_subtotal + v_delivery_fee - v_discount;

  select * into v_ref
    from ifood_internal.order_refs
   where merchant_id = p_merchant_id
     and external_order_id = p_external_order_id
   for update;

  if not found then
    insert into public.zelo_orders (
      empresa_id, source, status, idempotency_key,
      customer, fulfillment, payment,
      subtotal, delivery_fee, discount, total,
      pessoa_id,
      accepted_at, closed_at
    ) values (
      v_empresa_id, 'ifood', v_internal_status,
      'ifood:' || p_merchant_id || ':' || p_external_order_id,
      v_customer, v_fulfillment, v_payment,
      v_subtotal, v_delivery_fee, v_discount, v_total,
      null,
      case when v_internal_status in ('accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered') then now() else null end,
      case when v_internal_status in ('delivered', 'cancelled') then now() else null end
    ) returning * into v_order;

    for v_item in select value from jsonb_array_elements(coalesce(p_order->'items', '[]'::jsonb)) loop
      v_position := v_position + 1;
      insert into public.zelo_order_items (
        order_id, product_id, name, unit_price, quantity, subtotal, modifiers, position
      ) values (
        v_order.id,
        null,
        coalesce(nullif(v_item->>'name', ''), 'Item iFood'),
        coalesce((v_item->>'unitPrice')::numeric, 0),
        coalesce((v_item->>'quantity')::integer, 1),
        coalesce((v_item->>'totalPrice')::numeric, 0),
        coalesce(v_item->'options', '[]'::jsonb),
        coalesce((v_item->>'position')::integer, v_position)
      );
    end loop;

    insert into ifood_internal.order_refs (
      connection_id, empresa_id, merchant_id, external_order_id, zelo_order_id,
      external_status, last_event_at
    ) values (
      v_connection_id, v_empresa_id, p_merchant_id, p_external_order_id, v_order.id,
      p_external_status, coalesce(p_occurred_at, now())
    );

    insert into public.zelo_order_events(order_id, empresa_id, event_type, to_status, detail)
      values (v_order.id, v_order.empresa_id, 'ifood_event', v_order.status,
        jsonb_build_object('externalStatus', p_external_status, 'eventId', p_event_id));
    insert into public.zelo_order_outbox(order_id, empresa_id, topic, payload, idempotency_key)
      values (v_order.id, v_order.empresa_id, 'order.created', public.zelo_order_result(v_order), 'order.created:' || v_order.id);

    outcome := 'applied';
    zelo_order_id := v_order.id;
    revision := v_order.revision;
    return next;
    return;
  end if;

  -- An order_ref already exists: lock the matching zelo_orders row too
  -- (order_refs.zelo_order_id is unique, so this is exactly one row) before
  -- deciding, so a concurrent projection call for the same external order
  -- cannot interleave between the decision and the write.
  select * into v_order from public.zelo_orders where id = v_ref.zelo_order_id for update;

  v_current_rank := case v_ref.external_status
    when 'PLACED' then 0
    when 'CONFIRMED' then 1
    when 'PREPARATION_STARTED' then 2
    when 'READY_TO_PICKUP' then 3
    when 'DISPATCHED' then 4
    when 'CONCLUDED' then 5
    when 'CANCELLED' then 5
    else null
  end;

  if v_ref.external_status = p_external_status then
    v_decision := 'ignored_duplicate';
  elsif v_ref.external_status in ('CONCLUDED', 'CANCELLED') and p_external_status in ('CONCLUDED', 'CANCELLED') then
    -- Mirrors eventPolicy.js's terminal-vs-terminal exception: ambiguous or
    -- non-newer timestamps are quarantined instead of silently overwriting
    -- a terminal outcome; a strictly newer terminal event overrides it.
    if v_ref.last_event_at is null or p_occurred_at is null or p_occurred_at <= v_ref.last_event_at then
      v_decision := 'quarantined_terminal_conflict';
    else
      v_decision := 'applied';
    end if;
  elsif v_current_rank is null then
    v_decision := 'applied';
  elsif v_rank <= v_current_rank then
    v_decision := 'ignored_stale';
  else
    v_decision := 'applied';
  end if;

  if v_decision <> 'applied' then
    outcome := v_decision;
    zelo_order_id := v_order.id;
    revision := v_order.revision;
    return next;
    return;
  end if;

  -- Table-qualified assignments: `revision`, `outcome`, and `zelo_order_id`
  -- are also this function's OUT parameter names, so an unqualified
  -- `revision = revision + 1` would be ambiguous between the OUT parameter
  -- and the column inside this UPDATE.
  update public.zelo_orders as zo set
    status = v_internal_status,
    revision = zo.revision + 1,
    customer = v_customer,
    fulfillment = v_fulfillment,
    payment = v_payment,
    subtotal = v_subtotal,
    delivery_fee = v_delivery_fee,
    discount = v_discount,
    total = v_total,
    updated_at = now(),
    accepted_at = case when v_internal_status in ('accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered')
                        then coalesce(zo.accepted_at, now()) else zo.accepted_at end,
    closed_at = case when v_internal_status in ('delivered', 'cancelled') then now() else zo.closed_at end
  where zo.id = v_order.id
  returning * into v_order;

  update ifood_internal.order_refs
     set external_status = p_external_status,
         last_event_at = coalesce(p_occurred_at, now()),
         updated_at = now()
   where id = v_ref.id;

  insert into public.zelo_order_events(order_id, empresa_id, event_type, from_status, to_status, detail)
    values (v_order.id, v_order.empresa_id, 'ifood_event', v_ref.external_status, p_external_status,
      jsonb_build_object('externalStatus', p_external_status, 'eventId', p_event_id));
  insert into public.zelo_order_outbox(order_id, empresa_id, topic, payload, idempotency_key)
    values (v_order.id, v_order.empresa_id, 'order.updated', public.zelo_order_result(v_order),
      'order.updated:' || v_order.id || ':' || v_order.revision);

  outcome := 'applied';
  zelo_order_id := v_order.id;
  revision := v_order.revision;
  return next;
end;
$$;

comment on function public.project_ifood_order_event_v1(text, text, text, text, timestamptz, jsonb) is
  'Projeta um evento iFood (ja normalizado pelo dominio) em zelo_orders/zelo_order_items; unico ponto de escrita do pedido canonico iFood.';

revoke all on function public.project_ifood_order_event_v1(text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.project_ifood_order_event_v1(text, text, text, text, timestamptz, jsonb) to service_role;

commit;

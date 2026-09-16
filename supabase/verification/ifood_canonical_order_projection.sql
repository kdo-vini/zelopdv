-- Transactional verification for project_ifood_order_event_v1. All fixtures
-- are rolled back; this never targets the linked project.
begin;

create temporary table ifood_projection_verification_fixture (
  empresa_a uuid not null,
  owner_a uuid not null,
  connection_a uuid not null
) on commit drop;

insert into ifood_projection_verification_fixture (empresa_a, owner_a, connection_a)
values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select owner_a, 'codex-ifood-projection-' || owner_a::text || '@invalid.local',
       'authenticated', 'authenticated', '{}', '{}', now(), now()
  from ifood_projection_verification_fixture;

insert into public.empresa_perfil (id, user_id, nome_exibicao)
select empresa_a, owner_a, 'iFood projection verification'
  from ifood_projection_verification_fixture;

insert into ifood_internal.connections (id, empresa_id, merchant_id, status)
select connection_a, empresa_a, 'merchant-projection-active', 'active'
  from ifood_projection_verification_fixture;

grant select on ifood_projection_verification_fixture to service_role;

set local role service_role;

do $$
begin
  if has_function_privilege('anon', 'public.project_ifood_order_event_v1(text,text,text,text,timestamptz,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.project_ifood_order_event_v1(text,text,text,text,timestamptz,jsonb)', 'EXECUTE') then
    raise exception 'browser role can execute the projection RPC';
  end if;
  if not has_function_privilege('service_role', 'public.project_ifood_order_event_v1(text,text,text,text,timestamptz,jsonb)', 'EXECUTE') then
    raise exception 'service_role cannot execute the projection RPC';
  end if;
end;
$$;

-- Fixture order snapshot as the JS normalizer would produce it
-- (normalizeIfoodOrder output shape): subTotal 40.00 + deliveryFee 5.00 +
-- additionalFees 1.50 - benefits 2.00 = orderAmount 44.50.
create temporary table ifood_projection_order_snapshot (payload jsonb) on commit drop;
insert into ifood_projection_order_snapshot values (jsonb_build_object(
  'externalOrderId', 'order-projection-1',
  'merchantId', 'merchant-projection-active',
  'customerSnapshot', jsonb_build_object('name', 'Cliente Teste'),
  'fulfillment', jsonb_build_object('orderType', 'DELIVERY', 'orderTiming', 'IMMEDIATE'),
  'payment', jsonb_build_object('declaredMethod', 'cartao_credito', 'isSplit', false),
  'totals', jsonb_build_object(
    'subTotal', 40.00, 'deliveryFee', 5.00, 'additionalFees', 1.50,
    'benefits', 2.00, 'orderAmount', 44.50
  ),
  'items', jsonb_build_array(
    jsonb_build_object('name', 'X-Burger', 'unitPrice', 20.00, 'quantity', 2, 'totalPrice', 40.00, 'options', '[]'::jsonb, 'position', 1)
  )
));

-- 1) First PLACED-equivalent event creates exactly one zelo_orders row,
--    the matching item count, and one order_refs row.
create temporary table ifood_projection_placed_result on commit drop as
select * from public.project_ifood_order_event_v1(
  'merchant-projection-active', 'order-projection-1', 'event-projection-placed', 'PLACED',
  '2026-09-16T12:00:00Z'::timestamptz,
  (select payload from ifood_projection_order_snapshot)
);

do $$
declare
  v_outcome text;
  v_order_id uuid;
  v_order_count integer;
  v_item_count integer;
  v_ref_count integer;
  v_subtotal numeric; v_fee numeric; v_discount numeric; v_total numeric;
begin
  select outcome, zelo_order_id into v_outcome, v_order_id from ifood_projection_placed_result;
  if v_outcome <> 'applied' or v_order_id is null then
    raise exception 'expected applied outcome for the first PLACED-equivalent event, got %', v_outcome;
  end if;

  select count(*) into v_order_count from public.zelo_orders where id = v_order_id;
  if v_order_count <> 1 then
    raise exception 'expected exactly one zelo_orders row, found %', v_order_count;
  end if;

  select count(*) into v_item_count from public.zelo_order_items where order_id = v_order_id;
  if v_item_count <> 1 then
    raise exception 'expected exactly one zelo_order_items row, found %', v_item_count;
  end if;

  select count(*) into v_ref_count from ifood_internal.order_refs where zelo_order_id = v_order_id;
  if v_ref_count <> 1 then
    raise exception 'expected exactly one order_refs row, found %', v_ref_count;
  end if;

  select subtotal, delivery_fee, discount, total into v_subtotal, v_fee, v_discount, v_total
    from public.zelo_orders where id = v_order_id;
  -- additionalFees (1.50) is folded into delivery_fee alongside deliveryFee (5.00).
  if v_subtotal <> 40.00 or v_fee <> 6.50 or v_discount <> 2.00 or v_total <> 44.50 then
    raise exception 'unexpected totals: subtotal=%, delivery_fee=%, discount=%, total=%', v_subtotal, v_fee, v_discount, v_total;
  end if;
  if v_total <> v_subtotal + v_fee - v_discount then
    raise exception 'zelo_orders_total_consistent arithmetic mismatch';
  end if;

  if (select status from public.zelo_orders where id = v_order_id) <> 'pending_review' then
    raise exception 'expected pending_review status for a PLACED-equivalent projection';
  end if;
  if (select empresa_id from public.zelo_orders where id = v_order_id) <> (select empresa_a from ifood_projection_verification_fixture) then
    raise exception 'empresa_id was not resolved from the connection';
  end if;
end;
$$;

-- 2) A duplicate event (same external status) is a no-op: no second insert,
--    no revision bump.
create temporary table ifood_projection_duplicate_result on commit drop as
select * from public.project_ifood_order_event_v1(
  'merchant-projection-active', 'order-projection-1', 'event-projection-placed-retry', 'PLACED',
  '2026-09-16T12:00:05Z'::timestamptz,
  (select payload from ifood_projection_order_snapshot)
);

do $$
declare
  v_outcome text;
  v_order_count integer;
  v_revision integer;
begin
  select outcome into v_outcome from ifood_projection_duplicate_result;
  if v_outcome <> 'ignored_duplicate' then
    raise exception 'expected ignored_duplicate outcome, got %', v_outcome;
  end if;
  select count(*) into v_order_count from public.zelo_orders where source = 'ifood';
  if v_order_count <> 1 then
    raise exception 'duplicate event was not idempotent, found % zelo_orders rows', v_order_count;
  end if;
  select revision into v_revision from public.zelo_orders where source = 'ifood';
  if v_revision <> 1 then
    raise exception 'duplicate event must not bump revision, got %', v_revision;
  end if;
end;
$$;

-- 3) A later event (CONFIRMED) advances status/revision and refreshes the snapshot.
create temporary table ifood_projection_confirmed_snapshot (payload jsonb) on commit drop;
insert into ifood_projection_confirmed_snapshot values (jsonb_build_object(
  'externalOrderId', 'order-projection-1',
  'merchantId', 'merchant-projection-active',
  'customerSnapshot', jsonb_build_object('name', 'Cliente Teste Atualizado'),
  'fulfillment', jsonb_build_object('orderType', 'DELIVERY', 'orderTiming', 'IMMEDIATE'),
  'payment', jsonb_build_object('declaredMethod', 'cartao_credito', 'isSplit', false),
  'totals', jsonb_build_object(
    'subTotal', 40.00, 'deliveryFee', 5.00, 'additionalFees', 1.50,
    'benefits', 2.00, 'orderAmount', 44.50
  ),
  'items', jsonb_build_array(
    jsonb_build_object('name', 'X-Burger', 'unitPrice', 20.00, 'quantity', 2, 'totalPrice', 40.00, 'options', '[]'::jsonb, 'position', 1)
  )
));

create temporary table ifood_projection_confirmed_result on commit drop as
select * from public.project_ifood_order_event_v1(
  'merchant-projection-active', 'order-projection-1', 'event-projection-confirmed', 'CONFIRMED',
  '2026-09-16T12:01:00Z'::timestamptz,
  (select payload from ifood_projection_confirmed_snapshot)
);

do $$
declare
  v_outcome text;
  v_status text;
  v_revision integer;
  v_customer_name text;
  v_item_count integer;
begin
  select outcome, revision into v_outcome, v_revision from ifood_projection_confirmed_result;
  if v_outcome <> 'applied' then
    raise exception 'expected applied outcome for a later CONFIRMED event, got %', v_outcome;
  end if;
  if v_revision <> 2 then
    raise exception 'expected revision to advance to 2, got %', v_revision;
  end if;

  select status, customer->>'name' into v_status, v_customer_name
    from public.zelo_orders where source = 'ifood';
  if v_status <> 'accepted' then
    raise exception 'expected status accepted after CONFIRMED, got %', v_status;
  end if;
  if v_customer_name <> 'Cliente Teste Atualizado' then
    raise exception 'expected the customer snapshot to be refreshed, got %', v_customer_name;
  end if;

  -- Items are set once at creation; a status-only update must not touch them.
  select count(*) into v_item_count from public.zelo_order_items oi
    join public.zelo_orders o on o.id = oi.order_id where o.source = 'ifood';
  if v_item_count <> 1 then
    raise exception 'a status update must not re-insert order items, found %', v_item_count;
  end if;
end;
$$;

-- 4) A stale event (older rank than current) is a no-op.
create temporary table ifood_projection_stale_result on commit drop as
select * from public.project_ifood_order_event_v1(
  'merchant-projection-active', 'order-projection-1', 'event-projection-stale-placed', 'PLACED',
  '2026-09-16T12:02:00Z'::timestamptz,
  (select payload from ifood_projection_order_snapshot)
);

do $$
declare
  v_outcome text;
  v_revision integer;
begin
  select outcome into v_outcome from ifood_projection_stale_result;
  if v_outcome <> 'ignored_stale' then
    raise exception 'expected ignored_stale outcome for an older-rank event, got %', v_outcome;
  end if;
  select revision into v_revision from public.zelo_orders where source = 'ifood';
  if v_revision <> 2 then
    raise exception 'a stale event must not bump revision, got %', v_revision;
  end if;
end;
$$;

-- 5) An unknown merchant does not write anything.
create temporary table ifood_projection_unknown_merchant_result on commit drop as
select * from public.project_ifood_order_event_v1(
  'merchant-projection-does-not-exist', 'order-projection-unknown', 'event-projection-unknown-merchant', 'PLACED',
  now(),
  (select payload from ifood_projection_order_snapshot)
);

do $$
declare
  v_outcome text;
  v_order_id uuid;
  v_order_count integer;
begin
  select outcome, zelo_order_id into v_outcome, v_order_id from ifood_projection_unknown_merchant_result;
  if v_outcome <> 'unknown_merchant' or v_order_id is not null then
    raise exception 'expected unknown_merchant outcome with no order id, got outcome=% order_id=%', v_outcome, v_order_id;
  end if;
  select count(*) into v_order_count from public.zelo_orders where idempotency_key like 'ifood:merchant-projection-does-not-exist:%';
  if v_order_count <> 0 then
    raise exception 'unknown merchant must not write any zelo_orders row';
  end if;
end;
$$;

-- 6) Tenant isolation: empresa_id always comes from the connection, never
--    from any empresaId-like field an event payload might carry.
create temporary table ifood_projection_forged_snapshot (payload jsonb) on commit drop;
insert into ifood_projection_forged_snapshot values (
  (select payload from ifood_projection_order_snapshot)
    || jsonb_build_object('externalOrderId', 'order-projection-2', 'empresaId', gen_random_uuid()::text)
);

create temporary table ifood_projection_forged_result on commit drop as
select * from public.project_ifood_order_event_v1(
  'merchant-projection-active', 'order-projection-2', 'event-projection-forged-empresa', 'PLACED',
  now(),
  (select payload from ifood_projection_forged_snapshot)
);

do $$
declare
  v_order_id uuid;
  v_empresa_id uuid;
begin
  select zelo_order_id into v_order_id from ifood_projection_forged_result;
  select empresa_id into v_empresa_id from public.zelo_orders where id = v_order_id;
  if v_empresa_id <> (select empresa_a from ifood_projection_verification_fixture) then
    raise exception 'empresa_id must be resolved from the connection, never from the event payload';
  end if;
end;
$$;

rollback;

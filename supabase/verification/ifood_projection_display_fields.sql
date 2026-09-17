-- Transactional verification for the iFood projection display fields.
-- All fixtures are rolled back; this never targets the linked project.
begin;

create temporary table ifood_projection_display_fixture (
  empresa_a uuid not null,
  owner_a uuid not null,
  connection_a uuid not null
) on commit drop;

insert into ifood_projection_display_fixture (empresa_a, owner_a, connection_a)
values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select owner_a, 'codex-ifood-display-' || owner_a::text || '@invalid.local',
       'authenticated', 'authenticated', '{}', '{}', now(), now()
  from ifood_projection_display_fixture;

insert into public.empresa_perfil (id, user_id, nome_exibicao)
select empresa_a, owner_a, 'iFood display fields verification'
  from ifood_projection_display_fixture;

insert into ifood_internal.connections (id, empresa_id, merchant_id, status)
select connection_a, empresa_a, 'merchant-display-fields-active', 'active'
  from ifood_projection_display_fixture;

grant select on ifood_projection_display_fixture to service_role;

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

create temporary table ifood_projection_display_placed_snapshot (payload jsonb) on commit drop;
insert into ifood_projection_display_placed_snapshot values (jsonb_build_object(
  'externalOrderId', 'order-display-fields-1',
  'displayId', 'display-id-fixture',
  'preparationStartAt', '2026-09-17T10:30:00Z',
  'scheduled', true,
  'pickupCode', 'pickup-code-fixture',
  'deliveryCode', 'delivery-code-fixture',
  'customerSnapshot', jsonb_build_object('name', 'customer-display-fixture'),
  'fulfillment', jsonb_build_object(
    'orderType', 'DELIVERY',
    'orderTiming', 'SCHEDULED',
    'schedule', jsonb_build_object(
      'start', '2026-09-17T11:00:00Z',
      'end', '2026-09-17T11:30:00Z'
    )
  ),
  'payment', jsonb_build_object('declaredMethod', 'pix', 'isSplit', false),
  'totals', jsonb_build_object(
    'subTotal', 20.00, 'deliveryFee', 0.00,
    'additionalFees', 0.00, 'benefits', 0.00, 'orderAmount', 20.00
  ),
  'items', jsonb_build_array(
    jsonb_build_object(
      'name', 'item-display-fixture', 'unitPrice', 20.00,
      'quantity', 1, 'totalPrice', 20.00, 'options', '[]'::jsonb, 'position', 1
    )
  )
));

-- 1) The first PLACED event persists every display/fulfillment field.
create temporary table ifood_projection_display_placed_result on commit drop as
select * from public.project_ifood_order_event_v1(
  'merchant-display-fields-active', 'order-display-fields-1', 'event-display-placed', 'PLACED',
  '2026-09-17T10:00:00Z'::timestamptz,
  (select payload from ifood_projection_display_placed_snapshot)
);

do $$
declare
  v_outcome text;
  v_order_id uuid;
  v_ifood jsonb;
begin
  select outcome, zelo_order_id into v_outcome, v_order_id
    from ifood_projection_display_placed_result;
  if v_outcome <> 'applied' or v_order_id is null then
    raise exception 'expected applied display-fields projection, got %', v_outcome;
  end if;

  select fulfillment->'ifood' into v_ifood
    from public.zelo_orders where id = v_order_id;
  if v_ifood->>'displayId' <> 'display-id-fixture'
     or v_ifood->>'externalOrderId' <> 'order-display-fields-1'
     or v_ifood->>'preparationStartAt' <> '2026-09-17T10:30:00Z'
     or v_ifood->>'scheduleStart' <> '2026-09-17T11:00:00Z'
     or v_ifood->>'scheduleEnd' <> '2026-09-17T11:30:00Z'
     or v_ifood->>'pickupCode' <> 'pickup-code-fixture'
     or v_ifood->>'deliveryCode' <> 'delivery-code-fixture'
     or v_ifood->>'scheduled' <> 'true' then
    raise exception 'iFood display block was not persisted with the expected values: %', v_ifood;
  end if;
  if jsonb_typeof(v_ifood->'scheduled') <> 'boolean' then
    raise exception 'scheduled must be stored as a JSON boolean';
  end if;
end;
$$;

-- 2) A later applied event refreshes the nested block, including displayId.
create temporary table ifood_projection_display_confirmed_snapshot (payload jsonb) on commit drop;
insert into ifood_projection_display_confirmed_snapshot values (
  (select payload from ifood_projection_display_placed_snapshot)
    || jsonb_build_object('displayId', 'display-id-refreshed-fixture')
);

create temporary table ifood_projection_display_confirmed_result on commit drop as
select * from public.project_ifood_order_event_v1(
  'merchant-display-fields-active', 'order-display-fields-1', 'event-display-confirmed', 'CONFIRMED',
  '2026-09-17T10:01:00Z'::timestamptz,
  (select payload from ifood_projection_display_confirmed_snapshot)
);

do $$
declare
  v_outcome text;
  v_revision integer;
  v_display_id text;
begin
  select outcome, revision into v_outcome, v_revision
    from ifood_projection_display_confirmed_result;
  if v_outcome <> 'applied' or v_revision <> 2 then
    raise exception 'expected applied refreshed projection at revision 2, got outcome=% revision=%', v_outcome, v_revision;
  end if;

  select fulfillment#>>'{ifood,displayId}' into v_display_id
    from public.zelo_orders where source = 'ifood' and idempotency_key = 'ifood:merchant-display-fields-active:order-display-fields-1';
  if v_display_id <> 'display-id-refreshed-fixture' then
    raise exception 'later applied event did not refresh displayId, got %', v_display_id;
  end if;
end;
$$;

-- 3) Missing optional fields are still represented explicitly as JSON nulls;
--    scheduled defaults to a JSON false.
create temporary table ifood_projection_display_null_snapshot (payload jsonb) on commit drop;
insert into ifood_projection_display_null_snapshot values (jsonb_build_object(
  'externalOrderId', 'order-display-fields-null',
  'customerSnapshot', jsonb_build_object('name', 'customer-null-fixture'),
  'fulfillment', jsonb_build_object('orderType', 'DELIVERY', 'orderTiming', 'IMMEDIATE'),
  'payment', jsonb_build_object('declaredMethod', 'pix', 'isSplit', false),
  'totals', jsonb_build_object(
    'subTotal', 20.00, 'deliveryFee', 0.00,
    'additionalFees', 0.00, 'benefits', 0.00, 'orderAmount', 20.00
  ),
  'items', jsonb_build_array(
    jsonb_build_object(
      'name', 'item-null-fixture', 'unitPrice', 20.00,
      'quantity', 1, 'totalPrice', 20.00, 'options', '[]'::jsonb, 'position', 1
    )
  )
));

create temporary table ifood_projection_display_null_result on commit drop as
select * from public.project_ifood_order_event_v1(
  'merchant-display-fields-active', 'order-display-fields-null', 'event-display-null', 'PLACED',
  '2026-09-17T10:02:00Z'::timestamptz,
  (select payload from ifood_projection_display_null_snapshot)
);

do $$
declare
  v_outcome text;
  v_order_id uuid;
  v_ifood jsonb;
  v_key text;
begin
  select outcome, zelo_order_id into v_outcome, v_order_id
    from ifood_projection_display_null_result;
  if v_outcome <> 'applied' or v_order_id is null then
    raise exception 'expected applied null-default projection, got %', v_outcome;
  end if;

  select fulfillment->'ifood' into v_ifood
    from public.zelo_orders where id = v_order_id;
  foreach v_key in array array['displayId', 'preparationStartAt', 'scheduleStart', 'scheduleEnd', 'pickupCode', 'deliveryCode'] loop
    if not (v_ifood ? v_key) or jsonb_typeof(v_ifood->v_key) is distinct from 'null' then
      raise exception 'missing field % was not stored as explicit JSON null: %', v_key, v_ifood;
    end if;
  end loop;
  if not (v_ifood ? 'scheduled')
     or jsonb_typeof(v_ifood->'scheduled') <> 'boolean'
     or v_ifood->>'scheduled' <> 'false' then
    raise exception 'scheduled must default to JSON false: %', v_ifood;
  end if;
  if v_ifood->>'externalOrderId' <> 'order-display-fields-null' then
    raise exception 'externalOrderId must remain present in the iFood block';
  end if;
end;
$$;

rollback;

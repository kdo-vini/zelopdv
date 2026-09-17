-- Transactional verification for the sanitized iFood order sync-state RPC.
-- All fixtures are rolled back; this never targets the linked project.
begin;

create temporary table ifood_sync_state_verification_fixture (
  empresa_a uuid not null,
  empresa_b uuid not null,
  owner_a uuid not null,
  owner_b uuid not null,
  connection_a uuid not null,
  connection_b uuid not null
) on commit drop;

insert into ifood_sync_state_verification_fixture (
  empresa_a, empresa_b, owner_a, owner_b, connection_a, connection_b
)
values (
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), gen_random_uuid()
);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select owner_a, 'codex-ifood-sync-state-a-' || owner_a::text || '@invalid.local',
       'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()
  from ifood_sync_state_verification_fixture
union all
select owner_b, 'codex-ifood-sync-state-b-' || owner_b::text || '@invalid.local',
       'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()
  from ifood_sync_state_verification_fixture;

insert into public.empresa_perfil (id, user_id, nome_exibicao)
select empresa_a, owner_a, 'iFood sync-state verification A'
  from ifood_sync_state_verification_fixture
union all
select empresa_b, owner_b, 'iFood sync-state verification B'
  from ifood_sync_state_verification_fixture;

insert into ifood_internal.connections (id, empresa_id, merchant_id, status)
select connection_a, empresa_a, 'merchant-sync-state-a', 'active'
  from ifood_sync_state_verification_fixture
union all
select connection_b, empresa_b, 'merchant-sync-state-b', 'active'
  from ifood_sync_state_verification_fixture;

grant select on ifood_sync_state_verification_fixture to service_role;
set local role service_role;

do $$
begin
  if has_function_privilege('anon', 'public.get_ifood_order_sync_state_v1(uuid,uuid[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.get_ifood_order_sync_state_v1(uuid,uuid[])', 'EXECUTE') then
    raise exception 'browser role can execute the iFood sync-state RPC';
  end if;
  if not has_function_privilege('service_role', 'public.get_ifood_order_sync_state_v1(uuid,uuid[])', 'EXECUTE') then
    raise exception 'service_role cannot execute the iFood sync-state RPC';
  end if;
end;
$$;

create temporary table ifood_sync_state_snapshot (payload jsonb not null) on commit drop;
insert into ifood_sync_state_snapshot values (jsonb_build_object(
  'externalOrderId', 'order-sync-state-owner',
  'merchantId', 'merchant-sync-state-a',
  'customerSnapshot', jsonb_build_object('name', 'Fixture Customer'),
  'fulfillment', jsonb_build_object('type', 'delivery', 'deliveredBy', 'IFOOD'),
  'payment', jsonb_build_object('declaredMethod', 'pix', 'isSplit', false),
  'totals', jsonb_build_object('subTotal', 40.00, 'deliveryFee', 0, 'additionalFees', 0, 'benefits', 0, 'orderAmount', 40.00),
  'items', jsonb_build_array(jsonb_build_object(
    'name', 'Fixture Item', 'unitPrice', 40.00, 'quantity', 1, 'totalPrice', 40.00,
    'options', '[]'::jsonb, 'position', 1
  ))
));

create temporary table ifood_sync_state_orders (
  order_key text primary key,
  order_id uuid not null
) on commit drop;

-- Owner company fixture with a live command and a newer terminal command.
insert into ifood_sync_state_orders (order_key, order_id)
select 'owner-live', zelo_order_id
  from public.project_ifood_order_event_v1(
    'merchant-sync-state-a', 'order-sync-state-owner', 'event-sync-state-owner-placed', 'PLACED',
    '2026-09-16T12:00:00Z'::timestamptz,
    (select payload from ifood_sync_state_snapshot)
  );

-- Owner company fixture with no command row.
insert into ifood_sync_state_orders (order_key, order_id)
select 'owner-empty', zelo_order_id
  from public.project_ifood_order_event_v1(
    'merchant-sync-state-a', 'order-sync-state-empty', 'event-sync-state-empty-placed', 'PLACED',
    '2026-09-16T12:01:00Z'::timestamptz,
    (select payload || jsonb_build_object('externalOrderId', 'order-sync-state-empty')
       from ifood_sync_state_snapshot)
  );

-- Other company fixture proves tenant omission for a requested foreign id.
insert into ifood_sync_state_orders (order_key, order_id)
select 'other-company', zelo_order_id
  from public.project_ifood_order_event_v1(
    'merchant-sync-state-b', 'order-sync-state-other', 'event-sync-state-other-placed', 'PLACED',
    '2026-09-16T12:02:00Z'::timestamptz,
    (select payload || jsonb_build_object(
      'merchantId', 'merchant-sync-state-b',
      'externalOrderId', 'order-sync-state-other'
    ) from ifood_sync_state_snapshot)
  );

create temporary table ifood_sync_state_live_result on commit drop as
select *
  from public.enqueue_ifood_order_command_v1(
    (select empresa_a from ifood_sync_state_verification_fixture),
    (select order_id from ifood_sync_state_orders where order_key = 'owner-live'),
    'confirm', 1, '{}'::jsonb, 'ifood:verify:sync-state:confirm:1'
  );

create temporary table ifood_sync_state_terminal_result on commit drop as
select *
  from public.enqueue_ifood_order_command_v1(
    (select empresa_a from ifood_sync_state_verification_fixture),
    (select order_id from ifood_sync_state_orders where order_key = 'owner-live'),
    'cancel', 1, jsonb_build_object('cancellationCode', '501'),
    'ifood:verify:sync-state:cancel:1'
  );

update ifood_internal.order_commands as c
   set status = 'accepted_http',
       updated_at = now() - interval '10 minutes'
 where c.id = (select command_id from ifood_sync_state_live_result);

update ifood_internal.order_commands as c
   set status = 'confirmed_event',
       updated_at = now()
 where c.id = (select command_id from ifood_sync_state_terminal_result);

create temporary table ifood_sync_state_result on commit drop as
select *
  from public.get_ifood_order_sync_state_v1(
    (select empresa_a from ifood_sync_state_verification_fixture),
    array[
      (select order_id from ifood_sync_state_orders where order_key = 'owner-live'),
      (select order_id from ifood_sync_state_orders where order_key = 'owner-empty'),
      (select order_id from ifood_sync_state_orders where order_key = 'other-company')
    ]::uuid[]
  );

-- Owner company rows are visible, the other company id is silently omitted,
-- live command preferred over newer terminal one, and no command returns nulls.
do $$
declare
  v_live_id uuid;
  v_empty_id uuid;
  v_other_id uuid;
  v_row_count integer;
  v_command_intent text;
  v_command_status text;
  v_empty_command_status text;
  v_empty_command_error text;
begin
  select order_id into v_live_id
    from ifood_sync_state_orders where order_key = 'owner-live';
  select order_id into v_empty_id
    from ifood_sync_state_orders where order_key = 'owner-empty';
  select order_id into v_other_id
    from ifood_sync_state_orders where order_key = 'other-company';

  select count(*) into v_row_count from ifood_sync_state_result;
  if v_row_count <> 2 then
    raise exception 'owner company or other company isolation failed';
  end if;
  if exists (select 1 from ifood_sync_state_result where zelo_order_id = v_other_id) then
    raise exception 'other company id was returned';
  end if;

  select command_intent, command_status
    into v_command_intent, v_command_status
    from ifood_sync_state_result
   where zelo_order_id = v_live_id;
  if v_command_intent <> 'confirm' or v_command_status <> 'accepted_http' then
    raise exception 'live command preferred over newer terminal command';
  end if;

  select command_status, command_error_code
    into v_empty_command_status, v_empty_command_error
    from ifood_sync_state_result
   where zelo_order_id = v_empty_id;
  if v_empty_command_status is not null or v_empty_command_error is not null then
    raise exception 'no command did not return null command fields';
  end if;
end;
$$;

do $$
declare
  v_rows integer;
begin
  select count(*) into v_rows
    from public.get_ifood_order_sync_state_v1(
      (select empresa_a from ifood_sync_state_verification_fixture), null::uuid[]
    );
  if v_rows <> 0 then
    raise exception 'null order id array returned rows';
  end if;

  select count(*) into v_rows
    from public.get_ifood_order_sync_state_v1(
      (select empresa_a from ifood_sync_state_verification_fixture), '{}'::uuid[]
    );
  if v_rows <> 0 then
    raise exception 'empty order id array returned rows';
  end if;
end;
$$;

do $$
begin
  begin
    perform 1
      from public.get_ifood_order_sync_state_v1(
        (select empresa_a from ifood_sync_state_verification_fixture),
        (select array_agg(gen_random_uuid())::uuid[] from generate_series(1, 201))
      );
    raise exception 'too many order ids did not raise';
  exception
    when others then
      if sqlerrm <> 'TOO_MANY_ORDER_IDS' then
        raise;
      end if;
  end;
end;
$$;

rollback;

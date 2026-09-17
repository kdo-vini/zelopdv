-- Transactional verification: canonical accept/reject/cancel enqueue iFood
-- commands BEFORE flipping zelo_orders.status. All fixtures roll back.
begin;

create temporary table ifood_canonical_cmd_fixture (
  empresa_a uuid not null,
  empresa_b uuid not null,
  owner_a uuid not null,
  owner_b uuid not null,
  connection_active uuid not null,
  connection_degraded uuid not null
) on commit drop;

insert into ifood_canonical_cmd_fixture (
  empresa_a, empresa_b, owner_a, owner_b, connection_active, connection_degraded
)
values (
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), gen_random_uuid()
);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select owner_a, 'codex-ifood-canonical-cmd-a-' || owner_a::text || '@invalid.local',
       'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()
  from ifood_canonical_cmd_fixture
union all
select owner_b, 'codex-ifood-canonical-cmd-b-' || owner_b::text || '@invalid.local',
       'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()
  from ifood_canonical_cmd_fixture;

insert into public.empresa_perfil (id, user_id, nome_exibicao)
select empresa_a, owner_a, 'iFood canonical command A'
  from ifood_canonical_cmd_fixture
union all
select empresa_b, owner_b, 'iFood canonical command B'
  from ifood_canonical_cmd_fixture;

insert into ifood_internal.connections (id, empresa_id, merchant_id, status)
select connection_active, empresa_a, 'merchant-canonical-cmd-active', 'active'
  from ifood_canonical_cmd_fixture
union all
select connection_degraded, empresa_a, 'merchant-canonical-cmd-degraded', 'degraded'
  from ifood_canonical_cmd_fixture;

grant select on ifood_canonical_cmd_fixture to service_role, authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.enqueue_ifood_command_for_canonical_action_v1(uuid,integer,text,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.enqueue_ifood_command_for_canonical_action_v1(uuid,integer,text,jsonb)', 'EXECUTE') then
    raise exception 'browser role can execute enqueue_ifood_command_for_canonical_action_v1';
  end if;
  if not has_function_privilege('service_role', 'public.enqueue_ifood_command_for_canonical_action_v1(uuid,integer,text,jsonb)', 'EXECUTE') then
    raise exception 'service_role cannot execute enqueue_ifood_command_for_canonical_action_v1';
  end if;
end;
$$;

create temporary table ifood_canonical_cmd_snapshot (payload jsonb not null) on commit drop;
insert into ifood_canonical_cmd_snapshot values (jsonb_build_object(
  'externalOrderId', 'order-canonical-cmd-accept',
  'merchantId', 'merchant-canonical-cmd-active',
  'customerSnapshot', jsonb_build_object('name', 'Fixture Customer'),
  'fulfillment', jsonb_build_object('type', 'delivery', 'deliveredBy', 'IFOOD'),
  'payment', jsonb_build_object('declaredMethod', 'pix', 'isSplit', false),
  'totals', jsonb_build_object('subTotal', 40.00, 'deliveryFee', 0, 'additionalFees', 0, 'benefits', 0, 'orderAmount', 40.00),
  'items', jsonb_build_array(jsonb_build_object(
    'name', 'Fixture Item', 'unitPrice', 40.00, 'quantity', 1, 'totalPrice', 40.00,
    'options', '[]'::jsonb, 'position', 1
  ))
));

set local role service_role;

create temporary table ifood_canonical_cmd_orders (
  order_key text primary key,
  order_id uuid not null
) on commit drop;

insert into ifood_canonical_cmd_orders (order_key, order_id)
select 'accept', zelo_order_id
  from public.project_ifood_order_event_v1(
    'merchant-canonical-cmd-active', 'order-canonical-cmd-accept',
    'event-canonical-cmd-accept-placed', 'PLACED',
    '2026-09-16T12:00:00Z'::timestamptz,
    (select payload from ifood_canonical_cmd_snapshot)
  );

insert into ifood_canonical_cmd_orders (order_key, order_id)
select 'reject', zelo_order_id
  from public.project_ifood_order_event_v1(
    'merchant-canonical-cmd-active', 'order-canonical-cmd-reject',
    'event-canonical-cmd-reject-placed', 'PLACED',
    '2026-09-16T12:01:00Z'::timestamptz,
    (select payload || jsonb_build_object('externalOrderId', 'order-canonical-cmd-reject')
       from ifood_canonical_cmd_snapshot)
  );

insert into ifood_canonical_cmd_orders (order_key, order_id)
select 'cancel', zelo_order_id
  from public.project_ifood_order_event_v1(
    'merchant-canonical-cmd-active', 'order-canonical-cmd-cancel',
    'event-canonical-cmd-cancel-placed', 'PLACED',
    '2026-09-16T12:02:00Z'::timestamptz,
    (select payload || jsonb_build_object('externalOrderId', 'order-canonical-cmd-cancel')
       from ifood_canonical_cmd_snapshot)
  );

insert into ifood_canonical_cmd_orders (order_key, order_id)
select 'degraded', zelo_order_id
  from public.project_ifood_order_event_v1(
    'merchant-canonical-cmd-degraded', 'order-canonical-cmd-degraded',
    'event-canonical-cmd-degraded-placed', 'PLACED',
    '2026-09-16T12:03:00Z'::timestamptz,
    (select payload || jsonb_build_object(
      'externalOrderId', 'order-canonical-cmd-degraded',
      'merchantId', 'merchant-canonical-cmd-degraded'
    ) from ifood_canonical_cmd_snapshot)
  );

insert into ifood_canonical_cmd_orders (order_key, order_id)
select 'prequeued', zelo_order_id
  from public.project_ifood_order_event_v1(
    'merchant-canonical-cmd-active', 'order-canonical-cmd-prequeued',
    'event-canonical-cmd-prequeued-placed', 'PLACED',
    '2026-09-16T12:04:00Z'::timestamptz,
    (select payload || jsonb_build_object('externalOrderId', 'order-canonical-cmd-prequeued')
       from ifood_canonical_cmd_snapshot)
  );

-- Non-iFood order: accept must not write ifood_internal.order_commands.
insert into ifood_canonical_cmd_orders (order_key, order_id)
select 'zelomenu', gen_random_uuid() from ifood_canonical_cmd_fixture;

insert into public.zelo_orders (
  id, empresa_id, source, status, revision, customer, fulfillment, payment,
  subtotal, delivery_fee, discount, total
)
select o.order_id, f.empresa_a, 'zelomenu', 'pending_review', 1,
       '{"name":"Local"}'::jsonb, '{}'::jsonb, '{}'::jsonb, 10, 0, 0, 10
  from ifood_canonical_cmd_fixture f
  join ifood_canonical_cmd_orders o on o.order_key = 'zelomenu';

-- Function sources enqueue before the commercial status write.
do $$
declare
  v_accept text;
  v_reject text;
  v_transition text;
begin
  select pg_get_functiondef('public.accept_zelo_order(uuid,integer,uuid)'::regprocedure) into v_accept;
  select pg_get_functiondef('public.reject_zelo_order(uuid,integer,uuid,text)'::regprocedure) into v_reject;
  select pg_get_functiondef('public.transition_zelo_order(uuid,integer,text,uuid,jsonb)'::regprocedure) into v_transition;

  if position('enqueue_ifood_command_for_canonical_action_v1' in v_accept) = 0
     or position('transition_zelo_order' in v_accept) = 0 then
    raise exception 'accept_zelo_order does not enqueue before transition';
  end if;
  if position('enqueue_ifood_command_for_canonical_action_v1' in v_reject) = 0 then
    raise exception 'reject_zelo_order does not enqueue before transition';
  end if;
  if position('set_config(''role'', ''service_role'', true)' in
        pg_get_functiondef('public.enqueue_ifood_command_for_canonical_action_v1(uuid,integer,text,jsonb)'::regprocedure)
     ) = 0
     or position('set local role service_role' in
        pg_get_functiondef('public.enqueue_ifood_command_for_canonical_action_v1(uuid,integer,text,jsonb)'::regprocedure)
     ) = 0 then
    raise exception 'helper does not elevate to service_role before enqueue';
  end if;
  if position('enqueue_ifood_command_for_canonical_action_v1' in v_transition) = 0 then
    raise exception 'transition_zelo_order cancel path does not enqueue iFood commands';
  end if;
  if strpos(v_transition, 'enqueue_ifood_command_for_canonical_action_v1')
     > strpos(lower(v_transition), 'update public.zelo_orders set status')
     and strpos(lower(v_transition), 'update public.zelo_orders set status') > 0 then
    raise exception 'transition_zelo_order enqueues after the status write';
  end if;
end;
$$;

-- 1) accept → confirm command queued, THEN status accepted (same TX).
do $$
declare
  v_order uuid;
  v_revision integer;
  v_status text;
  v_source text;
  v_intent text;
  v_cmd_status text;
  v_cmd_count integer;
begin
  select order_id into v_order from ifood_canonical_cmd_orders where order_key = 'accept';
  select revision, status, source into v_revision, v_status, v_source
    from public.zelo_orders where id = v_order;
  if v_status <> 'pending_review' or v_source <> 'ifood' then
    raise exception 'accept fixture is not a pending_review ifood order';
  end if;

  perform public.accept_zelo_order(v_order, v_revision, null);

  select zo.status into v_status from public.zelo_orders zo where zo.id = v_order;
  if v_status <> 'accepted' then
    raise exception 'accept_zelo_order did not flip ifood order to accepted';
  end if;

  select c.intent, c.status, count(*) over ()
    into v_intent, v_cmd_status, v_cmd_count
    from ifood_internal.order_commands c
   where c.external_order_id = 'order-canonical-cmd-accept'
     and c.intent = 'confirm';
  if v_intent <> 'confirm' or v_cmd_status <> 'queued' or v_cmd_count <> 1 then
    raise exception 'accept did not enqueue a single confirm command';
  end if;
end;
$$;

-- 2) reject → cancel with default cancellationCode 501, status rejected.
do $$
declare
  v_order uuid;
  v_revision integer;
  v_status text;
  v_code text;
begin
  select order_id into v_order from ifood_canonical_cmd_orders where order_key = 'reject';
  select revision into v_revision from public.zelo_orders where id = v_order;
  perform public.reject_zelo_order(v_order, v_revision, null, 'sem insumo');
  select zo.status into v_status from public.zelo_orders zo where zo.id = v_order;
  if v_status <> 'rejected' then
    raise exception 'reject_zelo_order did not flip ifood order to rejected';
  end if;
  select c.payload->>'cancellationCode' into v_code
    from ifood_internal.order_commands c
   where c.external_order_id = 'order-canonical-cmd-reject'
     and c.intent = 'cancel';
  if v_code <> '501' then
    raise exception 'reject did not enqueue cancel with default cancellationCode 501';
  end if;
end;
$$;

-- 3) cancel path on transition_zelo_order with explicit code.
do $$
declare
  v_order uuid;
  v_revision integer;
  v_status text;
  v_code text;
begin
  select order_id into v_order from ifood_canonical_cmd_orders where order_key = 'cancel';
  select revision into v_revision from public.zelo_orders where id = v_order;
  perform public.transition_zelo_order(
    v_order, v_revision, 'cancel', null,
    jsonb_build_object('cancellationCode', '502', 'reason', 'teste')
  );
  select zo.status into v_status from public.zelo_orders zo where zo.id = v_order;
  if v_status <> 'cancelled' then
    raise exception 'cancel path did not flip ifood order to cancelled';
  end if;
  select c.payload->>'cancellationCode' into v_code
    from ifood_internal.order_commands c
   where c.external_order_id = 'order-canonical-cmd-cancel'
     and c.intent = 'cancel';
  if v_code <> '502' then
    raise exception 'cancel path dropped the provided cancellationCode';
  end if;
end;
$$;

-- 4) Fail-closed: degraded connection must not flip status and must not leave a command.
do $$
declare
  v_order uuid;
  v_revision integer;
  v_status text;
  v_cmds integer;
  v_raised boolean := false;
begin
  select order_id into v_order from ifood_canonical_cmd_orders where order_key = 'degraded';
  select revision into v_revision from public.zelo_orders where id = v_order;
  begin
    perform public.accept_zelo_order(v_order, v_revision, null);
  exception
    when others then
      if sqlerrm like '%IFOOD_CONNECTION_UNAVAILABLE%' then
        v_raised := true;
      else
        raise;
      end if;
  end;
  if not v_raised then
    raise exception 'degraded connection did not fail closed';
  end if;
  select zo.status into v_status from public.zelo_orders zo where zo.id = v_order;
  if v_status <> 'pending_review' then
    raise exception 'failed accept flipped status (enqueue must run before transition)';
  end if;
  select count(*) into v_cmds
    from ifood_internal.order_commands c
   where c.external_order_id = 'order-canonical-cmd-degraded';
  if v_cmds <> 0 then
    raise exception 'failed accept left an orphan iFood command';
  end if;
end;
$$;

-- 5) Pre-queued confirm (previous command-API path) is duplicate-success and still flips.
do $$
declare
  v_order uuid;
  v_revision integer;
  v_status text;
  v_cmds integer;
  v_empresa uuid;
begin
  select order_id into v_order from ifood_canonical_cmd_orders where order_key = 'prequeued';
  select revision into v_revision from public.zelo_orders where id = v_order;
  select empresa_a into v_empresa from ifood_canonical_cmd_fixture;
  perform set_config('role', 'service_role', true);
  perform public.enqueue_ifood_order_command_v1(
    v_empresa, v_order, 'confirm', v_revision, '{}'::jsonb,
    'ifood:command:v1:' || v_empresa::text || ':' || v_order::text || ':confirm:' || v_revision::text
  );
  perform public.accept_zelo_order(v_order, v_revision, null);
  select zo.status into v_status from public.zelo_orders zo where zo.id = v_order;
  if v_status <> 'accepted' then
    raise exception 'duplicate confirm did not allow the canonical status flip';
  end if;
  select count(*) into v_cmds
    from ifood_internal.order_commands c
   where c.external_order_id = 'order-canonical-cmd-prequeued'
     and c.intent = 'confirm';
  if v_cmds <> 1 then
    raise exception 'duplicate confirm inserted a second command row';
  end if;
end;
$$;

-- 6) Non-iFood accept does not enqueue.
do $$
declare
  v_order uuid;
  v_revision integer;
  v_cmds integer;
begin
  select order_id into v_order from ifood_canonical_cmd_orders where order_key = 'zelomenu';
  select revision into v_revision from public.zelo_orders where id = v_order;
  perform public.accept_zelo_order(v_order, v_revision, null);
  select count(*) into v_cmds
    from ifood_internal.order_commands c
    join ifood_internal.order_refs r on r.id = c.order_ref_id
   where r.zelo_order_id = v_order;
  if v_cmds <> 0 then
    raise exception 'non-ifood accept enqueued an iFood command';
  end if;
end;
$$;

rollback;

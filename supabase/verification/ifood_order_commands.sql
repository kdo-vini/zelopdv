-- Transactional verification for asynchronous iFood order commands.
-- All fixtures are rolled back; this never targets the linked project.
begin;

create temporary table ifood_command_verification_fixture (
  empresa_a uuid not null,
  empresa_b uuid not null,
  owner_a uuid not null,
  owner_b uuid not null,
  connection_active uuid not null,
  connection_degraded uuid not null
) on commit drop;

insert into ifood_command_verification_fixture (
  empresa_a, empresa_b, owner_a, owner_b, connection_active, connection_degraded
)
values (
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), gen_random_uuid()
);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select owner_a, 'codex-ifood-command-a-' || owner_a::text || '@invalid.local',
       'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()
  from ifood_command_verification_fixture
union all
select owner_b, 'codex-ifood-command-b-' || owner_b::text || '@invalid.local',
       'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()
  from ifood_command_verification_fixture;

insert into public.empresa_perfil (id, user_id, nome_exibicao)
select empresa_a, owner_a, 'iFood command verification A'
  from ifood_command_verification_fixture
union all
select empresa_b, owner_b, 'iFood command verification B'
  from ifood_command_verification_fixture;

insert into ifood_internal.connections (id, empresa_id, merchant_id, status)
select connection_active, empresa_a, 'merchant-command-active', 'active'
  from ifood_command_verification_fixture
union all
select connection_degraded, empresa_a, 'merchant-command-degraded', 'degraded'
  from ifood_command_verification_fixture;

grant select on ifood_command_verification_fixture to service_role;
set local role service_role;

do $$
begin
  if has_function_privilege('anon', 'public.enqueue_ifood_order_command_v1(uuid,uuid,text,integer,jsonb,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.enqueue_ifood_order_command_v1(uuid,uuid,text,integer,jsonb,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.confirm_ifood_order_commands_v1(text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.confirm_ifood_order_commands_v1(text,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.expire_ifood_accepted_commands_v1(integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.expire_ifood_accepted_commands_v1(integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_ifood_order_ref_v1(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.get_ifood_order_ref_v1(uuid,uuid)', 'EXECUTE') then
    raise exception 'browser role can execute an iFood order-command RPC';
  end if;
  if not has_function_privilege('service_role', 'public.enqueue_ifood_order_command_v1(uuid,uuid,text,integer,jsonb,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.confirm_ifood_order_commands_v1(text,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.expire_ifood_accepted_commands_v1(integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.get_ifood_order_ref_v1(uuid,uuid)', 'EXECUTE') then
    raise exception 'service_role cannot execute an iFood order-command RPC';
  end if;
end;
$$;

-- The order refs used by commands are created by the canonical projection
-- first, never by the enqueue RPC.
create temporary table ifood_command_orders (order_key text primary key, order_id uuid not null) on commit drop;

create temporary table ifood_command_snapshot (payload jsonb not null) on commit drop;
insert into ifood_command_snapshot values (jsonb_build_object(
  'externalOrderId', 'order-command-owner',
  'merchantId', 'merchant-command-active',
  'customerSnapshot', jsonb_build_object('name', 'Fixture Customer'),
  'fulfillment', jsonb_build_object('type', 'delivery', 'deliveredBy', 'IFOOD'),
  'payment', jsonb_build_object('declaredMethod', 'pix', 'isSplit', false),
  'totals', jsonb_build_object('subTotal', 40.00, 'deliveryFee', 0, 'additionalFees', 0, 'benefits', 0, 'orderAmount', 40.00),
  'items', jsonb_build_array(jsonb_build_object(
    'name', 'Fixture Item', 'unitPrice', 40.00, 'quantity', 1, 'totalPrice', 40.00,
    'options', '[]'::jsonb, 'position', 1
  ))
));

insert into ifood_command_orders (order_key, order_id)
select 'owner', zelo_order_id
  from public.project_ifood_order_event_v1(
    'merchant-command-active', 'order-command-owner', 'event-command-owner-placed', 'PLACED',
    '2026-09-16T12:00:00Z'::timestamptz,
    (select payload from ifood_command_snapshot)
  );

insert into ifood_command_orders (order_key, order_id)
select 'degraded', zelo_order_id
  from public.project_ifood_order_event_v1(
    'merchant-command-degraded', 'order-command-degraded', 'event-command-degraded-placed', 'PLACED',
    '2026-09-16T12:01:00Z'::timestamptz,
    (select payload || jsonb_build_object(
      'externalOrderId', 'order-command-degraded',
      'merchantId', 'merchant-command-degraded'
    ) from ifood_command_snapshot)
  );

insert into ifood_command_orders (order_key, order_id)
select 'expiry', zelo_order_id
  from public.project_ifood_order_event_v1(
    'merchant-command-active', 'order-command-expiry', 'event-command-expiry-placed', 'PLACED',
    '2026-09-16T12:02:00Z'::timestamptz,
    (select payload || jsonb_build_object('externalOrderId', 'order-command-expiry') from ifood_command_snapshot)
  );

select *
  from public.project_ifood_order_event_v1(
    'merchant-command-active', 'order-command-expiry', 'event-command-expiry-confirmed', 'CONFIRMED',
    '2026-09-16T12:03:00Z'::timestamptz,
    (select payload || jsonb_build_object('externalOrderId', 'order-command-expiry') from ifood_command_snapshot)
  );

-- 1) Owner/company enqueue works and leaves zelo_orders.status unchanged.
create temporary table ifood_command_owner_result on commit drop as
select *
  from public.enqueue_ifood_order_command_v1(
    (select empresa_a from ifood_command_verification_fixture),
    (select order_id from ifood_command_orders where order_key = 'owner'),
    'confirm', 1, '{}'::jsonb, 'ifood:verify:owner:confirm:1'
  );

do $$
declare
  v_outcome text;
  v_command_id uuid;
  v_status text;
  v_order_status text;
begin
  select outcome, command_id, status
    into v_outcome, v_command_id, v_status
    from ifood_command_owner_result;
  if v_outcome <> 'queued' or v_command_id is null or v_status <> 'queued' then
    raise exception 'owner enqueue did not return queued';
  end if;

  -- zelo_orders.status remains pending_review after enqueue; the command is
  -- asynchronous and has no optimistic commercial transition.
  select zo.status
    into v_order_status
    from public.zelo_orders as zo
   where zo.id = (select order_id from ifood_command_orders where order_key = 'owner');
  if v_order_status <> 'pending_review' then
    raise exception 'zelo_orders.status changed during enqueue';
  end if;
end;
$$;

-- 2) A ref from another company is not found and creates no command row.
do $$
declare
  v_before integer;
  v_after integer;
  v_outcome text;
begin
  select count(*) into v_before
    from ifood_internal.order_commands as c
   where c.empresa_id = (select empresa_b from ifood_command_verification_fixture);

  create temporary table ifood_command_cross_company_result on commit drop as
  select *
    from public.enqueue_ifood_order_command_v1(
      (select empresa_b from ifood_command_verification_fixture),
      (select order_id from ifood_command_orders where order_key = 'owner'),
      'confirm', 1, '{}'::jsonb, 'ifood:verify:cross-company'
    );

  select outcome into v_outcome from ifood_command_cross_company_result;
  select count(*) into v_after
    from ifood_internal.order_commands as c
   where c.empresa_id = (select empresa_b from ifood_command_verification_fixture);
  if v_outcome <> 'not_found' or v_before <> v_after then
    raise exception 'cross-company enqueue was not isolated';
  end if;
end;
$$;

-- 3) A degraded connection is unavailable and creates no command row.
create temporary table ifood_command_degraded_result on commit drop as
select *
  from public.enqueue_ifood_order_command_v1(
    (select empresa_a from ifood_command_verification_fixture),
    (select order_id from ifood_command_orders where order_key = 'degraded'),
    'confirm', 1, '{}'::jsonb, 'ifood:verify:degraded:confirm:1'
  );

do $$
declare
  v_outcome text;
  v_count integer;
begin
  select outcome into v_outcome from ifood_command_degraded_result;
  select count(*) into v_count
   from ifood_internal.order_commands as c
   where c.external_order_id = 'order-command-degraded';
  if v_outcome <> 'connection_unavailable' or v_count <> 0 then
    raise exception 'degraded connection was not fail-closed';
  end if;
end;
$$;

-- 4) Revision mismatch is a conflict before any command insert.
create temporary table ifood_command_revision_result on commit drop as
select *
  from public.enqueue_ifood_order_command_v1(
    (select empresa_a from ifood_command_verification_fixture),
    (select order_id from ifood_command_orders where order_key = 'owner'),
    'confirm', 999, '{}'::jsonb, 'ifood:verify:revision-conflict'
  );

do $$
begin
  if (select outcome from ifood_command_revision_result) <> 'revision_conflict' then
    raise exception 'revision mismatch did not return revision_conflict';
  end if;
end;
$$;

-- 5) Repeating revision + intent returns duplicate and keeps one row.
create temporary table ifood_command_duplicate_result on commit drop as
select *
  from public.enqueue_ifood_order_command_v1(
    (select empresa_a from ifood_command_verification_fixture),
    (select order_id from ifood_command_orders where order_key = 'owner'),
    'confirm', 1, '{}'::jsonb, 'ifood:verify:owner:confirm:1'
  );

do $$
declare
  v_count integer;
begin
  if (select outcome from ifood_command_duplicate_result) <> 'duplicate' then
    raise exception 'repeated command did not return duplicate';
  end if;
  select count(*) into v_count
   from ifood_internal.order_commands as c
   where c.external_order_id = 'order-command-owner'
     and c.intent = 'confirm'
     and c.expected_external_revision = 1;
  if v_count <> 1 then
    raise exception 'duplicate enqueue created more than one row';
  end if;
end;
$$;

-- 5b) A terminally failed command for the same revision can be retried: it
-- is re-queued in place (still exactly one row), never duplicated.
update ifood_internal.order_commands as c
   set status = 'failed_terminal', attempts = 3, terminal_at = now(),
       last_error_code = 'IFOOD_HTTP_CLIENT', updated_at = now()
 where c.external_order_id = 'order-command-owner'
   and c.intent = 'confirm'
   and c.expected_external_revision = 1;

create temporary table ifood_command_requeue_result on commit drop as
select *
  from public.enqueue_ifood_order_command_v1(
    (select empresa_a from ifood_command_verification_fixture),
    (select order_id from ifood_command_orders where order_key = 'owner'),
    'confirm', 1, '{}'::jsonb, 'ifood:verify:owner:confirm:1'
  );

do $$
declare
  v_count integer;
  v_status text;
  v_attempts integer;
  v_error text;
begin
  if (select outcome from ifood_command_requeue_result) <> 'requeued' then
    raise exception 'failed_terminal command was not requeued, got %', (select outcome from ifood_command_requeue_result);
  end if;
  select count(*), max(c.status), max(c.attempts), max(c.last_error_code)
    into v_count, v_status, v_attempts, v_error
    from ifood_internal.order_commands as c
   where c.external_order_id = 'order-command-owner'
     and c.intent = 'confirm'
     and c.expected_external_revision = 1;
  if v_count <> 1 or v_status <> 'queued' or v_attempts <> 0 or v_error is not null then
    raise exception 'requeue did not reset the single command row (count=%, status=%, attempts=%, error=%)', v_count, v_status, v_attempts, v_error;
  end if;
end;
$$;

-- 6) The iFood-delivered fulfillment cannot use the pickup action, even after
-- the canonical order has reached accepted.
select *
  from public.project_ifood_order_event_v1(
    'merchant-command-active', 'order-command-owner', 'event-command-owner-confirmed', 'CONFIRMED',
    '2026-09-16T12:04:00Z'::timestamptz,
    (select payload from ifood_command_snapshot)
  );

create temporary table ifood_command_fulfillment_result on commit drop as
select *
  from public.enqueue_ifood_order_command_v1(
    (select empresa_a from ifood_command_verification_fixture),
    (select order_id from ifood_command_orders where order_key = 'owner'),
    'ready_to_pickup', 2, '{}'::jsonb, 'ifood:verify:ifood-delivery-ready:2'
  );

do $$
begin
  if (select outcome from ifood_command_fulfillment_result) <> 'invalid_transition' then
    raise exception 'iFood-delivered ready_to_pickup was not rejected';
  end if;
end;
$$;

-- 7) Cancellation requires a provider cancellation code.
create temporary table ifood_command_cancel_payload_result on commit drop as
select *
  from public.enqueue_ifood_order_command_v1(
    (select empresa_a from ifood_command_verification_fixture),
    (select order_id from ifood_command_orders where order_key = 'owner'),
    'cancel', 2, '{}'::jsonb, 'ifood:verify:cancel-without-code:2'
  );

do $$
begin
  if (select outcome from ifood_command_cancel_payload_result) <> 'invalid_payload' then
    raise exception 'cancel without cancellationCode was accepted';
  end if;
end;
$$;

-- 7b) A valid cancellation keeps only provider fields, including the reason.
create temporary table ifood_command_cancel_valid_result on commit drop as
select *
  from public.enqueue_ifood_order_command_v1(
    (select empresa_a from ifood_command_verification_fixture),
    (select order_id from ifood_command_orders where order_key = 'owner'),
    'cancel', 2,
    jsonb_build_object('cancellationCode', ' 501 ', 'reason', ' Problemas de sistema ', 'browserExtra', 'drop-me'),
    'ifood:verify:cancel-valid:2'
  );

do $$
declare
  v_payload jsonb;
begin
  if (select outcome from ifood_command_cancel_valid_result) <> 'queued' then
    raise exception 'valid cancellation was not queued, got %', (select outcome from ifood_command_cancel_valid_result);
  end if;
  select c.payload into v_payload
    from ifood_internal.order_commands as c
   where c.id = (select command_id from ifood_command_cancel_valid_result);
  if v_payload <> jsonb_build_object('cancellationCode', '501', 'reason', 'Problemas de sistema') then
    raise exception 'cancellation payload not sanitized/preserved: %', v_payload;
  end if;
end;
$$;

-- 8) The event correlation RPC moves accepted_http to confirmed_event.
update ifood_internal.order_commands as c
   set status = 'accepted_http', updated_at = now()
 where c.external_order_id = 'order-command-owner'
   and c.intent = 'confirm';

do $$
declare
  v_status text;
  v_terminal_at timestamptz;
begin
  if (select public.confirm_ifood_order_commands_v1(
        'merchant-command-active', 'order-command-owner', 'CONFIRMED'
      )) <> 1 then
    raise exception 'confirm-by-event did not update accepted_http';
  end if;
  select c.status, c.terminal_at
    into v_status, v_terminal_at
   from ifood_internal.order_commands as c
   where c.external_order_id = 'order-command-owner'
     and c.intent = 'confirm';
  if v_status <> 'confirmed_event' or v_terminal_at is null then
    raise exception 'accepted_http command was not confirmed_event';
  end if;
end;
$$;

-- 9) Expiry is administrative and never changes the canonical order status.
insert into ifood_internal.order_commands (
  connection_id, order_ref_id, empresa_id, merchant_id, external_order_id,
  intent, expected_external_revision, idempotency_key, payload, status
)
select r.connection_id, r.id, r.empresa_id, r.merchant_id, r.external_order_id,
       'start_preparation', 2, 'ifood:verify:expiry:start:2', '{}'::jsonb, 'accepted_http'
  from ifood_internal.order_refs as r
 where r.zelo_order_id = (select order_id from ifood_command_orders where order_key = 'expiry');

update ifood_internal.order_commands as c
   set updated_at = now() - interval '15 minutes'
 where c.idempotency_key = 'ifood:verify:expiry:start:2';

do $$
declare
  v_expired integer;
  v_status text;
  v_order_status text;
begin
  v_expired := public.expire_ifood_accepted_commands_v1(600);
  if v_expired <> 1 then
    raise exception 'expected one stale accepted_http command to expire, got %', v_expired;
  end if;
  select c.status into v_status
    from ifood_internal.order_commands as c
   where c.idempotency_key = 'ifood:verify:expiry:start:2';
  select zo.status into v_order_status
    from public.zelo_orders as zo
   where zo.id = (select order_id from ifood_command_orders where order_key = 'expiry');
  if v_status <> 'expired' or v_order_status <> 'accepted' then
    raise exception 'expiry changed the wrong state';
  end if;
end;
$$;

-- 10) Ref lookup is tenant-scoped and exposes no row cross-company.
do $$
declare
  v_ref_count integer;
  v_merchant text;
begin
  select count(*) into v_ref_count
    from public.get_ifood_order_ref_v1(
      (select empresa_b from ifood_command_verification_fixture),
      (select order_id from ifood_command_orders where order_key = 'owner')
    );
  if v_ref_count <> 0 then
    raise exception 'cross-company get_ifood_order_ref_v1 returned a row';
  end if;
  select merchant_id into v_merchant
    from public.get_ifood_order_ref_v1(
      (select empresa_a from ifood_command_verification_fixture),
      (select order_id from ifood_command_orders where order_key = 'owner')
    );
  if v_merchant <> 'merchant-command-active' then
    raise exception 'owner get_ifood_order_ref_v1 returned the wrong merchant';
  end if;
end;
$$;

rollback;

-- Transactional verification for the iFood persistence foundation.
-- All fixtures are intentionally rolled back. This verifies the queue contract
-- in a disposable database; it never targets the linked project.
--
-- The claim calls below are sequential calls from one database session. They
-- exercise eligibility, lease assignment, tenant identity, and reclaim after
-- expiry, but they do not prove concurrent-worker behavior or non-overlap.
-- A concurrency proof requires two independent database sessions and is not
-- performed by this single-session verifier.
begin;

create temporary table ifood_verification_fixture (
  empresa_a uuid not null,
  empresa_b uuid not null,
  owner_a uuid not null,
  owner_b uuid not null,
  order_a uuid not null,
  connection_a uuid not null,
  connection_b uuid not null
) on commit drop;

insert into ifood_verification_fixture
  (empresa_a, empresa_b, owner_a, owner_b, order_a, connection_a, connection_b)
values
  (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
   gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

-- The fixture rows are created by the disposable superuser before switching to
-- the same service role used by the workers.
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select owner_id,
       'codex-ifood-' || owner_id::text || '@invalid.local',
       'authenticated', 'authenticated', '{}', '{}', now(), now()
  from ifood_verification_fixture
 cross join lateral (values (owner_a), (owner_b)) as owners(owner_id);

insert into public.empresa_perfil (id, user_id, nome_exibicao)
select empresa_a, owner_a, 'iFood verification A' from ifood_verification_fixture
union all
select empresa_b, owner_b, 'iFood verification B' from ifood_verification_fixture;

-- The fixture was created by the disposable superuser. Grant the worker role
-- read access before switching roles; later temporary claim tables are owned
-- by service_role and therefore need no extra grant.
grant select on ifood_verification_fixture to service_role;

set local role service_role;

do $$
begin
  if has_schema_privilege('anon', 'ifood_internal', 'USAGE')
     or has_schema_privilege('authenticated', 'ifood_internal', 'USAGE') then
    raise exception 'browser role can use ifood_internal schema';
  end if;
  if has_table_privilege('anon', 'ifood_internal.event_inbox', 'SELECT')
     or has_table_privilege('authenticated', 'ifood_internal.event_inbox', 'SELECT') then
    raise exception 'browser role can read iFood payloads';
  end if;
  if has_function_privilege('anon', 'public.claim_ifood_events_v1(text,integer,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.claim_ifood_events_v1(text,integer,integer)', 'EXECUTE') then
    raise exception 'browser role can execute iFood worker RPC';
  end if;
  if not has_function_privilege('service_role', 'public.claim_ifood_events_v1(text,integer,integer)', 'EXECUTE') then
    raise exception 'service_role cannot execute iFood worker RPC';
  end if;
  if not exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'ifood_internal'
       and c.relname = 'event_inbox'
       and c.relrowsecurity
  ) then
    raise exception 'event_inbox is not protected by RLS';
  end if;
  if not exists (
    select 1
      from pg_proc
     where oid = 'public.claim_ifood_events_v1(text,integer,integer)'::regprocedure
       and array_to_string(proconfig, ',') like '%search_path=%'
  ) then
    raise exception 'claim_ifood_events_v1 search_path is not hardened';
  end if;
end;
$$;

insert into ifood_internal.connections (
  id, empresa_id, merchant_id, status
)
select connection_a, empresa_a, 'merchant-verification-a', 'active'
  from ifood_verification_fixture
union all
select connection_b, empresa_b, 'merchant-verification-b', 'active'
  from ifood_verification_fixture;

-- A first event exercises provider-event idempotency.
create temporary table ifood_first_enqueue on commit drop as
select * from public.enqueue_ifood_event_v1(
  (select connection_a from ifood_verification_fixture),
  'event-verification-duplicate',
  'merchant-verification-a',
  'external-order-a',
  'order.created',
  1,
  now(),
  jsonb_build_object('orderId', 'external-order-a', 'revision', 1)
);

create temporary table ifood_duplicate_enqueue on commit drop as
select * from public.enqueue_ifood_event_v1(
  (select connection_a from ifood_verification_fixture),
  'event-verification-duplicate',
  'merchant-verification-a',
  'external-order-a',
  'order.created',
  1,
  now(),
  jsonb_build_object('orderId', 'external-order-a', 'revision', 1)
);

do $$
begin
  if (select count(*) from ifood_first_enqueue) <> 1
     or not (select inserted from ifood_first_enqueue) then
    raise exception 'first event enqueue did not insert';
  end if;
  if (select count(*) from ifood_duplicate_enqueue) <> 1
     or (select inserted from ifood_duplicate_enqueue)
     or (select inbox_id from ifood_duplicate_enqueue) <> (select inbox_id from ifood_first_enqueue) then
    raise exception 'duplicate event was not idempotent';
  end if;
end;
$$;

-- Remove the first idempotency fixture from the work queue before exercising
-- tenant claims; its purpose was already covered by the duplicate assertion.
update ifood_internal.event_inbox
   set status = 'processed',
       processed_at = now()
 where id = (select inbox_id from ifood_first_enqueue);

-- Two worker identities claim a two-tenant batch sequentially. This checks
-- that an already-processing row is not returned to the next sequential
-- claim, while deliberately making no concurrency claim.
select public.enqueue_ifood_event_v1(
  (select connection_a from ifood_verification_fixture),
  'event-verification-tenant-a',
  'merchant-verification-a',
  'external-order-a-2',
  'order.updated',
  2,
  now(),
  jsonb_build_object('orderId', 'external-order-a-2')
);
select public.enqueue_ifood_event_v1(
  (select connection_b from ifood_verification_fixture),
  'event-verification-tenant-b',
  'merchant-verification-b',
  'external-order-b-1',
  'order.created',
  1,
  now(),
  jsonb_build_object('orderId', 'external-order-b-1')
);

create temporary table ifood_claim_worker_a on commit drop as
select * from public.claim_ifood_events_v1('worker-a', 1, 120);
create temporary table ifood_claim_worker_b on commit drop as
select * from public.claim_ifood_events_v1('worker-b', 1, 120);

do $$
begin
  if (select count(*) from ifood_claim_worker_a) <> 1
     or (select count(*) from ifood_claim_worker_b) <> 1 then
    raise exception 'sequential claims did not receive two independent events';
  end if;
  if exists (
    select 1 from ifood_claim_worker_a a
    join ifood_claim_worker_b b on b.inbox_id = a.inbox_id
  ) then
    raise exception 'sequential claims returned the same inbox row';
  end if;
  if (select count(distinct empresa_id) from (
    select empresa_id from ifood_claim_worker_a
    union all
    select empresa_id from ifood_claim_worker_b
  ) claimed) <> 2 then
    raise exception 'tenant isolation was not preserved by claims';
  end if;
end;
$$;

-- Finish the two leases, then prove the compare-and-set rejects a stale lease.
do $$
declare
  v_inbox_id uuid;
  v_lease_id uuid;
begin
  select inbox_id, lease_id into v_inbox_id, v_lease_id from ifood_claim_worker_a;
  begin
    perform * from public.finish_ifood_event_v1(v_inbox_id, gen_random_uuid(), 'processed');
    raise exception 'stale event lease was accepted';
  exception when others then
    if sqlerrm <> 'LEASE_LOST' then raise; end if;
  end;
  perform * from public.finish_ifood_event_v1(v_inbox_id, v_lease_id, 'processed');
  select inbox_id, lease_id into v_inbox_id, v_lease_id from ifood_claim_worker_b;
  perform * from public.finish_ifood_event_v1(v_inbox_id, v_lease_id, 'processed');
end;
$$;

-- A short lease can be reclaimed after expiry, and a terminal outcome moves
-- the event to the dead-letter state with bounded error text.
select public.enqueue_ifood_event_v1(
  (select connection_a from ifood_verification_fixture),
  'event-verification-expired',
  'merchant-verification-a',
  'external-order-expired',
  'order.updated',
  3,
  now(),
  jsonb_build_object('orderId', 'external-order-expired')
);
create temporary table ifood_expired_claim on commit drop as
select * from public.claim_ifood_events_v1('worker-expiring', 1, 5);
update ifood_internal.event_inbox
   set lease_until = now() - interval '1 second'
 where id = (select inbox_id from ifood_expired_claim);
create temporary table ifood_reclaimed on commit drop as
select * from public.claim_ifood_events_v1('worker-reclaimer', 1, 60);

do $$
declare
  v_inbox_id uuid;
  v_lease_id uuid;
  v_status text;
  v_error text;
begin
  if (select count(*) from ifood_reclaimed) <> 1 then
    raise exception 'expired event lease was not reclaimable';
  end if;
  select inbox_id, lease_id into v_inbox_id, v_lease_id from ifood_reclaimed;
  select status into v_status
    from public.finish_ifood_event_v1(
      v_inbox_id, v_lease_id, 'terminal', 'provider_terminal',
      repeat('x', 700)
    );
  select last_error into v_error
    from ifood_internal.event_inbox
   where id = v_inbox_id;
  if v_status <> 'dead_letter' or length(v_error) > 500 then
    raise exception 'terminal event was not dead-lettered and truncated';
  end if;
end;
$$;

-- Canonical order source and command idempotency key.
insert into public.zelo_orders (
  id, empresa_id, source, status, revision, customer, fulfillment, payment,
  subtotal, delivery_fee, discount, total
)
select order_a, empresa_a, 'ifood', 'pending_review', 1, '{}', '{}', '{}',
       10, 0, 0, 10
  from ifood_verification_fixture;

insert into ifood_internal.order_refs (
  connection_id, empresa_id, merchant_id, external_order_id, zelo_order_id,
  external_revision, external_status
)
select connection_a, empresa_a, 'merchant-verification-a', 'external-order-command',
       order_a, 1, 'PLACED'
  from ifood_verification_fixture;

insert into ifood_internal.order_commands (
  connection_id, order_ref_id, empresa_id, merchant_id, external_order_id,
  intent, expected_external_revision, idempotency_key, payload
)
select c.connection_a, r.id, c.empresa_a, 'merchant-verification-a',
       'external-order-command', 'confirm', 1, 'command-verification-key',
       jsonb_build_object('orderId', 'external-order-command')
  from ifood_verification_fixture c
  join ifood_internal.order_refs r on r.zelo_order_id = c.order_a;

insert into ifood_internal.order_commands (
  connection_id, order_ref_id, empresa_id, merchant_id, external_order_id,
  intent, expected_external_revision, idempotency_key, payload
)
select c.connection_a, r.id, c.empresa_a, 'merchant-verification-a',
       'external-order-command', 'confirm', 1, 'command-verification-key',
       jsonb_build_object('orderId', 'external-order-command')
  from ifood_verification_fixture c
  join ifood_internal.order_refs r on r.zelo_order_id = c.order_a
on conflict (connection_id, external_order_id, intent, expected_external_revision) do nothing;

do $$
begin
  if (select count(*) from ifood_internal.order_commands where idempotency_key = 'command-verification-key') <> 1 then
    raise exception 'command identity is not idempotent';
  end if;
  if (select source from public.zelo_orders where id = (select order_a from ifood_verification_fixture)) <> 'ifood' then
    raise exception 'canonical order source is not ifood';
  end if;
end;
$$;

create temporary table ifood_command_claim on commit drop as
select * from public.claim_ifood_commands_v1('command-worker', 1, 120);

do $$
declare
  v_command_id uuid;
  v_lease_id uuid;
  v_status text;
begin
  if (select count(*) from ifood_command_claim) <> 1 then
    raise exception 'command was not claimed';
  end if;
  select command_id, lease_id into v_command_id, v_lease_id from ifood_command_claim;
  select status into v_status
    from public.finish_ifood_command_v1(
      v_command_id, v_lease_id, 'accepted_http', null, null,
      jsonb_build_object('httpStatus', 202)
    );
  if v_status <> 'accepted_http' then
    raise exception 'command finish did not persist accepted_http';
  end if;
end;
$$;

rollback;

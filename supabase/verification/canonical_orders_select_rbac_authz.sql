-- Transactional authorization and action-regression matrix for canonical
-- orders. Every fixture row rolls back; identity sequences may advance.

begin;

create temporary table canonical_orders_authz_fixture (
  owner_id uuid not null,
  access_id uuid not null,
  kitchen_id uuid not null,
  receive_id uuid not null,
  cancel_id uuid not null,
  no_cap_id uuid not null,
  removed_id uuid not null,
  regular_id uuid not null,
  super_admin_id uuid not null,
  access_role_id uuid not null,
  kitchen_role_id uuid not null,
  receive_role_id uuid not null,
  cancel_role_id uuid not null,
  no_cap_role_id uuid not null,
  empresa_id uuid not null,
  primary_order_id uuid not null,
  access_order_id uuid not null,
  kitchen_order_id uuid not null,
  receive_order_id uuid not null,
  cancel_order_id uuid not null
) on commit drop;

grant select on canonical_orders_authz_fixture to anon, authenticated, service_role;

insert into canonical_orders_authz_fixture
select gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
       gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
       gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
       gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
       gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
       gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
       gen_random_uuid(), gen_random_uuid();

insert into auth.users (
  id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select actor_id,
       'codex-orders-authz-' || actor_id::text || '@invalid.local',
       'authenticated',
       'authenticated',
       '{}'::jsonb,
       '{}'::jsonb,
       now(),
       now()
from canonical_orders_authz_fixture f
cross join lateral (
  values (f.owner_id), (f.access_id), (f.kitchen_id), (f.receive_id),
         (f.cancel_id), (f.no_cap_id), (f.removed_id), (f.regular_id),
         (f.super_admin_id)
) actors(actor_id);

insert into public.access_roles (id, owner_user_id, name, permissions)
select access_role_id, owner_id, 'Codex orders access',
       '{"pedidos.acessar":true}'::jsonb
from canonical_orders_authz_fixture
union all
select kitchen_role_id, owner_id, 'Codex orders kitchen',
       '{"pedidos.cozinha":true}'::jsonb
from canonical_orders_authz_fixture
union all
select receive_role_id, owner_id, 'Codex orders receive',
       '{"pedidos.receber":true}'::jsonb
from canonical_orders_authz_fixture
union all
select cancel_role_id, owner_id, 'Codex orders cancel',
       '{"pedidos.cancelar":true}'::jsonb
from canonical_orders_authz_fixture
union all
select no_cap_role_id, owner_id, 'Codex orders unrelated',
       '{"pdv.acessar":true}'::jsonb
from canonical_orders_authz_fixture;

insert into public.access_users (
  owner_user_id, auth_user_id, email, role_id, status
)
select owner_id, actor_id,
       'codex-orders-subuser-' || actor_id::text || '@invalid.local',
       role_id, status
from canonical_orders_authz_fixture f
cross join lateral (
  values
    (f.access_id, f.access_role_id, 'active'),
    (f.kitchen_id, f.kitchen_role_id, 'active'),
    (f.receive_id, f.receive_role_id, 'active'),
    (f.cancel_id, f.cancel_role_id, 'active'),
    (f.no_cap_id, f.no_cap_role_id, 'active'),
    (f.removed_id, f.access_role_id, 'removed')
) actors(actor_id, role_id, status);

insert into public.super_admins (user_id, email, role, is_active)
select super_admin_id,
       'codex-orders-super-admin-' || super_admin_id::text || '@invalid.local',
       'super_admin',
       true
from canonical_orders_authz_fixture;

insert into public.empresa_perfil (id, user_id, nome_exibicao)
select empresa_id, owner_id, 'Codex canonical orders authz fixture'
from canonical_orders_authz_fixture;

insert into public.zelo_orders (
  id, empresa_id, source, status, revision, customer, fulfillment, payment,
  subtotal, delivery_fee, discount, total, observations
)
select primary_order_id, empresa_id, 'manual', 'pending_review', 1,
       '{"name":"Sensitive fixture customer"}'::jsonb,
       '{"type":"pickup"}'::jsonb,
       '{"declaredMethod":"pix"}'::jsonb,
       10, 0, 0, 10, 'Primary read fixture'
from canonical_orders_authz_fixture
union all
select access_order_id, empresa_id, 'manual', 'pending_review', 1,
       '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 0, 0, 0, 0,
       'Access action fixture'
from canonical_orders_authz_fixture
union all
select kitchen_order_id, empresa_id, 'manual', 'accepted', 1,
       '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 0, 0, 0, 0,
       'Kitchen action fixture'
from canonical_orders_authz_fixture
union all
select receive_order_id, empresa_id, 'mesa', 'ready', 1,
       '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 0, 0, 0, 0,
       'Receive action fixture'
from canonical_orders_authz_fixture
union all
select cancel_order_id, empresa_id, 'mesa', 'pending_review', 1,
       '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 0, 0, 0, 0,
       'Cancel action fixture'
from canonical_orders_authz_fixture;

insert into public.zelo_order_items (
  order_id, name, unit_price, quantity, subtotal, position
)
select primary_order_id, 'Sensitive fixture item', 10, 1, 10, 0
from canonical_orders_authz_fixture;

insert into public.zelo_order_events (
  order_id, empresa_id, event_type, to_status, detail
)
select primary_order_id, empresa_id, 'fixture_created', 'pending_review',
       '{"sensitive":"fixture event"}'::jsonb
from canonical_orders_authz_fixture;

select set_config('zelo.orders.owner_id', owner_id::text, true),
       set_config('zelo.orders.access_id', access_id::text, true),
       set_config('zelo.orders.kitchen_id', kitchen_id::text, true),
       set_config('zelo.orders.receive_id', receive_id::text, true),
       set_config('zelo.orders.cancel_id', cancel_id::text, true),
       set_config('zelo.orders.no_cap_id', no_cap_id::text, true),
       set_config('zelo.orders.removed_id', removed_id::text, true),
       set_config('zelo.orders.regular_id', regular_id::text, true),
       set_config('zelo.orders.super_admin_id', super_admin_id::text, true),
       set_config('zelo.orders.primary_order_id', primary_order_id::text, true),
       set_config('zelo.orders.access_order_id', access_order_id::text, true),
       set_config('zelo.orders.kitchen_order_id', kitchen_order_id::text, true),
       set_config('zelo.orders.receive_order_id', receive_order_id::text, true),
       set_config('zelo.orders.cancel_order_id', cancel_order_id::text, true)
from canonical_orders_authz_fixture;

create function pg_temp.assert_canonical_visibility(
  expected_orders bigint,
  expected_items bigint,
  expected_events bigint,
  actor_label text
) returns void
language plpgsql
as $$
declare
  actual_orders bigint;
  actual_items bigint;
  actual_events bigint;
begin
  select count(*) into actual_orders from public.zelo_orders;
  select count(*) into actual_items from public.zelo_order_items;
  select count(*) into actual_events from public.zelo_order_events;

  if actual_orders <> expected_orders
     or actual_items <> expected_items
     or actual_events <> expected_events then
    raise exception '% visibility mismatch: orders=%/% items=%/% events=%/%',
      actor_label, actual_orders, expected_orders, actual_items, expected_items,
      actual_events, expected_events;
  end if;
end;
$$;

-- Owner keeps the complete aggregate and audit trail.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'authenticated',
    'sub', current_setting('zelo.orders.owner_id'))::text,
  true
);
select pg_temp.assert_canonical_visibility(5, 1, 1, 'owner');
reset role;

-- Queue and kitchen readers keep full tenant visibility.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'authenticated',
    'sub', current_setting('zelo.orders.access_id'))::text,
  true
);
select pg_temp.assert_canonical_visibility(5, 1, 1, 'pedidos.acessar');
select public.transition_zelo_order(
  current_setting('zelo.orders.access_order_id')::uuid,
  1,
  'accept'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'authenticated',
    'sub', current_setting('zelo.orders.kitchen_id'))::text,
  true
);
select pg_temp.assert_canonical_visibility(5, 1, 2, 'pedidos.cozinha');
select public.transition_zelo_order(
  current_setting('zelo.orders.kitchen_order_id')::uuid,
  1,
  'start_preparing'
);
reset role;

-- Action-only roles keep their RPC operation but no direct customer/payment
-- or audit-trail read.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'authenticated',
    'sub', current_setting('zelo.orders.receive_id'))::text,
  true
);
select pg_temp.assert_canonical_visibility(0, 0, 0, 'pedidos.receber only');
select public.transition_zelo_order(
  current_setting('zelo.orders.receive_order_id')::uuid,
  1,
  'deliver'
);
select pg_temp.assert_canonical_visibility(0, 0, 0, 'pedidos.receber after action');
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'authenticated',
    'sub', current_setting('zelo.orders.cancel_id'))::text,
  true
);
select pg_temp.assert_canonical_visibility(0, 0, 0, 'pedidos.cancelar only');
select public.transition_zelo_order(
  current_setting('zelo.orders.cancel_order_id')::uuid,
  1,
  'cancel'
);
select pg_temp.assert_canonical_visibility(0, 0, 0, 'pedidos.cancelar after action');
reset role;

-- The unrelated active subuser is the confirmed pre-change bypass.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'authenticated',
    'sub', current_setting('zelo.orders.no_cap_id'))::text,
  true
);
select pg_temp.assert_canonical_visibility(0, 0, 0, 'unrelated active subuser');

do $$
declare
  call_succeeded boolean := false;
begin
  begin
    perform public.transition_zelo_order(
      current_setting('zelo.orders.primary_order_id')::uuid,
      1,
      'accept'
    );
    call_succeeded := true;
  exception
    when insufficient_privilege then
      if sqlerrm <> 'ORDER_PERMISSION_DENIED' then
        raise;
      end if;
  end;

  if call_succeeded then
    raise exception 'unrelated active subuser transitioned an order';
  end if;
end;
$$;
reset role;

-- Removed users, unrelated authenticated users and external super-admins have
-- no tenant visibility or implicit bypass.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'authenticated',
    'sub', current_setting('zelo.orders.removed_id'))::text,
  true
);
select pg_temp.assert_canonical_visibility(0, 0, 0, 'removed subuser');
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'authenticated',
    'sub', current_setting('zelo.orders.regular_id'))::text,
  true
);
select pg_temp.assert_canonical_visibility(0, 0, 0, 'unrelated authenticated');
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'authenticated',
    'sub', current_setting('zelo.orders.super_admin_id'))::text,
  true
);
select pg_temp.assert_canonical_visibility(0, 0, 0, 'external super-admin');
reset role;

-- Anon lacks the relation grant. A denied query must not be mistaken for an
-- empty authorized result.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare
  query_succeeded boolean := false;
begin
  begin
    perform count(*) from public.zelo_orders;
    query_succeeded := true;
  exception
    when insufficient_privilege then null;
  end;
  if query_succeeded then
    raise exception 'anon queried canonical orders';
  end if;
end;
$$;
reset role;

-- service_role bypasses RLS and therefore also sees real production rows.
-- Scope this assertion to the synthetic IDs instead of comparing global
-- relation counts.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  fixture_orders bigint;
  fixture_items bigint;
  fixture_events bigint;
begin
  select count(*) into fixture_orders
  from public.zelo_orders
  where id in (
    current_setting('zelo.orders.primary_order_id')::uuid,
    current_setting('zelo.orders.access_order_id')::uuid,
    current_setting('zelo.orders.kitchen_order_id')::uuid,
    current_setting('zelo.orders.receive_order_id')::uuid,
    current_setting('zelo.orders.cancel_order_id')::uuid
  );

  select count(*) into fixture_items
  from public.zelo_order_items
  where order_id = current_setting('zelo.orders.primary_order_id')::uuid;

  select count(*) into fixture_events
  from public.zelo_order_events
  where order_id in (
    current_setting('zelo.orders.primary_order_id')::uuid,
    current_setting('zelo.orders.access_order_id')::uuid,
    current_setting('zelo.orders.kitchen_order_id')::uuid,
    current_setting('zelo.orders.receive_order_id')::uuid,
    current_setting('zelo.orders.cancel_order_id')::uuid
  );

  if fixture_orders <> 5 or fixture_items <> 1 or fixture_events <> 5 then
    raise exception
      'service_role fixture visibility mismatch: orders=%/5 items=%/1 events=%/5',
      fixture_orders, fixture_items, fixture_events;
  end if;
end;
$$;
reset role;

-- Owner and both read roles see the final action/audit state as well.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'authenticated',
    'sub', current_setting('zelo.orders.owner_id'))::text,
  true
);
select pg_temp.assert_canonical_visibility(5, 1, 5, 'owner final');
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'authenticated',
    'sub', current_setting('zelo.orders.access_id'))::text,
  true
);
select pg_temp.assert_canonical_visibility(5, 1, 5, 'pedidos.acessar final');
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'authenticated',
    'sub', current_setting('zelo.orders.kitchen_id'))::text,
  true
);
select pg_temp.assert_canonical_visibility(5, 1, 5, 'pedidos.cozinha final');
reset role;

rollback;

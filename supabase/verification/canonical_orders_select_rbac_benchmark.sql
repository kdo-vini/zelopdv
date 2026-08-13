-- Representative transactional benchmark for the parent canonical-order
-- SELECT policy. Run immediately before and after the containment migration.

begin;

create temporary table canonical_orders_benchmark_fixture as
select gen_random_uuid() as owner_id,
       gen_random_uuid() as access_id,
       gen_random_uuid() as no_cap_id,
       gen_random_uuid() as access_role_id,
       gen_random_uuid() as no_cap_role_id,
       gen_random_uuid() as empresa_id;

insert into auth.users (
  id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select actor_id,
       'codex-orders-benchmark-' || actor_id::text || '@invalid.local',
       'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()
from canonical_orders_benchmark_fixture f
cross join lateral (values (f.owner_id), (f.access_id), (f.no_cap_id)) actors(actor_id);

insert into public.access_roles (id, owner_user_id, name, permissions)
select access_role_id, owner_id, 'Codex orders benchmark access',
       '{"pedidos.acessar":true}'::jsonb
from canonical_orders_benchmark_fixture
union all
select no_cap_role_id, owner_id, 'Codex orders benchmark unrelated',
       '{"pdv.acessar":true}'::jsonb
from canonical_orders_benchmark_fixture;

insert into public.access_users (owner_user_id, auth_user_id, email, role_id, status)
select owner_id, access_id,
       'codex-orders-benchmark-access-' || access_id::text || '@invalid.local',
       access_role_id, 'active'
from canonical_orders_benchmark_fixture
union all
select owner_id, no_cap_id,
       'codex-orders-benchmark-no-cap-' || no_cap_id::text || '@invalid.local',
       no_cap_role_id, 'active'
from canonical_orders_benchmark_fixture;

insert into public.empresa_perfil (id, user_id, nome_exibicao)
select empresa_id, owner_id, 'Codex canonical orders benchmark fixture'
from canonical_orders_benchmark_fixture;

insert into public.zelo_orders (
  empresa_id, source, status, revision, customer, fulfillment, payment,
  subtotal, delivery_fee, discount, total, observations
)
select f.empresa_id, 'manual', 'pending_review', 1,
       '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 0, 0, 0, 0,
       'Canonical orders benchmark ' || n
from canonical_orders_benchmark_fixture f
cross join generate_series(1, 1000) n;

select set_config('zelo.orders.benchmark_empresa', empresa_id::text, true),
       set_config('zelo.orders.benchmark_owner', owner_id::text, true),
       set_config('zelo.orders.benchmark_access', access_id::text, true),
       set_config('zelo.orders.benchmark_no_cap', no_cap_id::text, true)
from canonical_orders_benchmark_fixture;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'authenticated',
    'sub', current_setting('zelo.orders.benchmark_owner'))::text,
  true
);
explain (analyze, buffers, format json)
select count(*)
from public.zelo_orders
where empresa_id = current_setting('zelo.orders.benchmark_empresa')::uuid;
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'authenticated',
    'sub', current_setting('zelo.orders.benchmark_access'))::text,
  true
);
explain (analyze, buffers, format json)
select count(*)
from public.zelo_orders
where empresa_id = current_setting('zelo.orders.benchmark_empresa')::uuid;
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'authenticated',
    'sub', current_setting('zelo.orders.benchmark_no_cap'))::text,
  true
);
explain (analyze, buffers, format json)
select count(*)
from public.zelo_orders
where empresa_id = current_setting('zelo.orders.benchmark_empresa')::uuid;
reset role;

-- Keep the authorized subuser as the final plan returned by db query so the
-- before/after comparison measures the production queue path.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'authenticated',
    'sub', current_setting('zelo.orders.benchmark_access'))::text,
  true
);
explain (analyze, buffers, format json)
select count(*)
from public.zelo_orders
where empresa_id = current_setting('zelo.orders.benchmark_empresa')::uuid;
reset role;

rollback;

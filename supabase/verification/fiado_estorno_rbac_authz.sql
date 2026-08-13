-- Transactional actor matrix for fiado_estornar_venda(bigint).
-- The fixture uses synthetic auth users and rolls back every table row. Identity
-- sequences may advance, as with any rolled-back insert in PostgreSQL.

begin;

create temporary table fiado_estorno_authz_fixture (
  owner_id uuid not null,
  no_cap_id uuid not null,
  allowed_id uuid not null,
  removed_id uuid not null,
  regular_id uuid not null,
  super_admin_id uuid not null,
  no_cap_role_id uuid not null,
  allowed_role_id uuid not null,
  no_cap_person_id uuid not null,
  owner_person_id uuid not null,
  allowed_person_id uuid not null,
  service_person_id uuid not null,
  no_cap_sale_id bigint not null,
  owner_sale_id bigint not null,
  allowed_sale_id bigint not null,
  service_sale_id bigint not null
) on commit drop;

insert into fiado_estorno_authz_fixture
select
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  -900000000000001, -900000000000002, -900000000000003, -900000000000004;

insert into auth.users (
  id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select actor_id,
       'codex-fiado-authz-' || actor_id::text || '@invalid.local',
       'authenticated',
       'authenticated',
       '{}'::jsonb,
       '{}'::jsonb,
       now(),
       now()
from fiado_estorno_authz_fixture f
cross join lateral (
  values
    (f.owner_id),
    (f.no_cap_id),
    (f.allowed_id),
    (f.removed_id),
    (f.regular_id),
    (f.super_admin_id)
) actors(actor_id);

insert into public.access_roles (id, owner_user_id, name, permissions)
select no_cap_role_id, owner_id, 'Codex no cancel', '{"pdv.acessar":true}'::jsonb
from fiado_estorno_authz_fixture
union all
select allowed_role_id, owner_id, 'Codex can cancel', '{"pdv.cancelar":true}'::jsonb
from fiado_estorno_authz_fixture;

insert into public.access_users (
  owner_user_id, auth_user_id, email, role_id, status
)
select owner_id,
       no_cap_id,
       'codex-fiado-no-cap-' || no_cap_id::text || '@invalid.local',
       no_cap_role_id,
       'active'
from fiado_estorno_authz_fixture
union all
select owner_id,
       allowed_id,
       'codex-fiado-allowed-' || allowed_id::text || '@invalid.local',
       allowed_role_id,
       'active'
from fiado_estorno_authz_fixture
union all
select owner_id,
       removed_id,
       'codex-fiado-removed-' || removed_id::text || '@invalid.local',
       allowed_role_id,
       'removed'
from fiado_estorno_authz_fixture;

insert into public.super_admins (user_id, email, role, is_active)
select super_admin_id,
       'codex-fiado-super-admin-' || super_admin_id::text || '@invalid.local',
       'super_admin',
       true
from fiado_estorno_authz_fixture;

insert into public.pessoas (id, id_usuario, nome, saldo_fiado)
select no_cap_person_id, owner_id, 'Codex no-cap fixture', 100
from fiado_estorno_authz_fixture
union all
select owner_person_id, owner_id, 'Codex owner fixture', 100
from fiado_estorno_authz_fixture
union all
select allowed_person_id, owner_id, 'Codex allowed fixture', 100
from fiado_estorno_authz_fixture
union all
select service_person_id, owner_id, 'Codex service fixture', 100
from fiado_estorno_authz_fixture;

-- The production insert guard deliberately preserves service-role maintenance.
select set_config('request.jwt.claim.role', 'service_role', true);

insert into public.vendas (
  id, id_usuario, valor_total, forma_pagamento, id_cliente, numero_venda
)
select no_cap_sale_id, owner_id, 10, 'fiado', no_cap_person_id, 1
from fiado_estorno_authz_fixture
union all
select owner_sale_id, owner_id, 10, 'fiado', owner_person_id, 2
from fiado_estorno_authz_fixture
union all
select allowed_sale_id, owner_id, 10, 'fiado', allowed_person_id, 3
from fiado_estorno_authz_fixture
union all
select service_sale_id, owner_id, 10, 'fiado', service_person_id, 4
from fiado_estorno_authz_fixture;

select set_config('request.jwt.claim.role', '', true);

select set_config('zelo.fiado.owner_id', owner_id::text, true),
       set_config('zelo.fiado.no_cap_id', no_cap_id::text, true),
       set_config('zelo.fiado.allowed_id', allowed_id::text, true),
       set_config('zelo.fiado.removed_id', removed_id::text, true),
       set_config('zelo.fiado.regular_id', regular_id::text, true),
       set_config('zelo.fiado.super_admin_id', super_admin_id::text, true),
       set_config('zelo.fiado.no_cap_sale_id', no_cap_sale_id::text, true),
       set_config('zelo.fiado.owner_sale_id', owner_sale_id::text, true),
       set_config('zelo.fiado.allowed_sale_id', allowed_sale_id::text, true),
       set_config('zelo.fiado.service_sale_id', service_sale_id::text, true)
from fiado_estorno_authz_fixture;

-- Anonymous execution must be rejected either by ACL or by the auth guard.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  call_succeeded boolean := false;
begin
  begin
    perform public.fiado_estornar_venda(
      current_setting('zelo.fiado.no_cap_sale_id')::bigint
    );
    call_succeeded := true;
  exception
    when insufficient_privilege or invalid_authorization_specification then null;
  end;

  if call_succeeded then
    raise exception 'anon executed fiado_estornar_venda';
  end if;
end;
$$;

reset role;

-- A regular authenticated user outside the tenant must get the historical
-- neutral result and must not mutate the owner's fixture.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', current_setting('zelo.fiado.regular_id')
  )::text,
  true
);

do $$
declare
  result jsonb;
begin
  result := public.fiado_estornar_venda(
    current_setting('zelo.fiado.no_cap_sale_id')::bigint
  );
  if result <> jsonb_build_object('valor_estornado', 0) then
    raise exception 'external authenticated actor result changed: %', result;
  end if;
end;
$$;

reset role;

-- Confirmed pre-fix bypass: an active tenant subuser without pdv.cancelar
-- must be rejected before balance or ledger mutation.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', current_setting('zelo.fiado.no_cap_id')
  )::text,
  true
);

do $$
declare
  call_succeeded boolean := false;
begin
  begin
    perform public.fiado_estornar_venda(
      current_setting('zelo.fiado.no_cap_sale_id')::bigint
    );
    call_succeeded := true;
  exception
    when insufficient_privilege then null;
  end;

  if call_succeeded then
    raise exception 'active subuser without pdv.cancelar reversed a fiado sale';
  end if;
end;
$$;

reset role;

do $$
begin
  if exists (
    select 1
    from public.pessoas p
    join fiado_estorno_authz_fixture f on f.no_cap_person_id = p.id
    where p.saldo_fiado <> 100
  ) or exists (
    select 1
    from public.fiado_lancamentos l
    join fiado_estorno_authz_fixture f on f.no_cap_sale_id = l.id_venda
    where l.natureza = 'estorno_venda'
  ) then
    raise exception 'denied subuser changed fiado balance or ledger';
  end if;
end;
$$;

-- An active subuser with pdv.cancelar retains the existing successful flow.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', current_setting('zelo.fiado.allowed_id')
  )::text,
  true
);

do $$
declare
  result jsonb;
begin
  result := public.fiado_estornar_venda(
    current_setting('zelo.fiado.allowed_sale_id')::bigint
  );
  if (result ->> 'valor_estornado')::numeric <> 10 then
    raise exception 'authorized subuser reversal changed: %', result;
  end if;
end;
$$;

reset role;

do $$
begin
  if not exists (
    select 1
    from public.pessoas p
    join fiado_estorno_authz_fixture f on f.allowed_person_id = p.id
    where p.saldo_fiado = 90
  ) or not exists (
    select 1
    from public.fiado_lancamentos l
    join fiado_estorno_authz_fixture f on f.allowed_sale_id = l.id_venda
    where l.natureza = 'estorno_venda'
      and l.id_operador = f.allowed_id
      and l.valor = -10
  ) then
    raise exception 'authorized subuser did not produce the expected reversal';
  end if;
end;
$$;

-- Removed subusers no longer resolve to the former tenant and remain neutral.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', current_setting('zelo.fiado.removed_id')
  )::text,
  true
);

do $$
declare
  result jsonb;
begin
  result := public.fiado_estornar_venda(
    current_setting('zelo.fiado.no_cap_sale_id')::bigint
  );
  if result <> jsonb_build_object('valor_estornado', 0) then
    raise exception 'removed subuser result changed: %', result;
  end if;
end;
$$;

reset role;

-- A super-admin has no implicit tenant bypass in this tenant-scoped RPC.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', current_setting('zelo.fiado.super_admin_id')
  )::text,
  true
);

do $$
declare
  result jsonb;
begin
  result := public.fiado_estornar_venda(
    current_setting('zelo.fiado.no_cap_sale_id')::bigint
  );
  if result <> jsonb_build_object('valor_estornado', 0) then
    raise exception 'external super-admin received tenant access: %', result;
  end if;
end;
$$;

reset role;

-- Owner behavior, including idempotency, is unchanged.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', current_setting('zelo.fiado.owner_id')
  )::text,
  true
);

do $$
declare
  first_result jsonb;
  second_result jsonb;
begin
  first_result := public.fiado_estornar_venda(
    current_setting('zelo.fiado.owner_sale_id')::bigint
  );
  second_result := public.fiado_estornar_venda(
    current_setting('zelo.fiado.owner_sale_id')::bigint
  );

  if (first_result ->> 'valor_estornado')::numeric <> 10
     or coalesce((second_result ->> 'idempotent')::boolean, false) is not true then
    raise exception 'owner reversal/idempotency changed: first=%, second=%',
      first_result, second_result;
  end if;
end;
$$;

reset role;

do $$
begin
  if not exists (
    select 1
    from public.pessoas p
    join fiado_estorno_authz_fixture f on f.owner_person_id = p.id
    where p.saldo_fiado = 90
  ) or (
    select count(*)
    from public.fiado_lancamentos l
    join fiado_estorno_authz_fixture f on f.owner_sale_id = l.id_venda
    where l.natureza = 'estorno_venda'
  ) <> 1 then
    raise exception 'owner reversal did not preserve balance/idempotency';
  end if;
end;
$$;

-- A bare service-role context has no actor UUID and remains rejected.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  call_succeeded boolean := false;
begin
  begin
    perform public.fiado_estornar_venda(
      current_setting('zelo.fiado.service_sale_id')::bigint
    );
    call_succeeded := true;
  exception
    when invalid_authorization_specification then null;
  end;

  if call_succeeded then
    raise exception 'service_role without actor unexpectedly reversed a sale';
  end if;
end;
$$;

-- An explicit owner context through service_role retains the existing grant.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'service_role',
    'sub', current_setting('zelo.fiado.owner_id')
  )::text,
  true
);

do $$
declare
  result jsonb;
begin
  result := public.fiado_estornar_venda(
    current_setting('zelo.fiado.service_sale_id')::bigint
  );
  if (result ->> 'valor_estornado')::numeric <> 10 then
    raise exception 'service_role owner-context reversal changed: %', result;
  end if;
end;
$$;

reset role;

do $$
begin
  if not exists (
    select 1
    from public.pessoas p
    join fiado_estorno_authz_fixture f on f.service_person_id = p.id
    where p.saldo_fiado = 90
  ) then
    raise exception 'service_role owner-context did not preserve reversal behavior';
  end if;
end;
$$;

rollback;

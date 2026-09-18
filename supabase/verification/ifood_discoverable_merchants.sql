-- Transactional verification for list_ifood_claimed_merchant_ids_v1.
-- All fixtures are rolled back; this never targets the linked project.
-- Not executed in this session (no local Docker/Postgres harness available);
-- code-reviewed against the migration it exercises.
begin;

create temporary table ifood_discoverable_merchants_fixture (
  empresa_a uuid not null,
  owner_a uuid not null,
  empresa_b uuid not null,
  owner_b uuid not null
) on commit drop;

insert into ifood_discoverable_merchants_fixture (empresa_a, owner_a, empresa_b, owner_b)
values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select owner_a, 'codex-ifood-discoverable-a-' || owner_a::text || '@invalid.local',
       'authenticated', 'authenticated', '{}', '{}', now(), now()
  from ifood_discoverable_merchants_fixture
union all
select owner_b, 'codex-ifood-discoverable-b-' || owner_b::text || '@invalid.local',
       'authenticated', 'authenticated', '{}', '{}', now(), now()
  from ifood_discoverable_merchants_fixture;

insert into public.empresa_perfil (id, user_id, nome_exibicao)
select empresa_a, owner_a, 'iFood discoverable verification A' from ifood_discoverable_merchants_fixture
union all
select empresa_b, owner_b, 'iFood discoverable verification B' from ifood_discoverable_merchants_fixture;

grant select on ifood_discoverable_merchants_fixture to service_role;

set local role service_role;

-- 1) Browser roles must never execute this RPC.
do $$
begin
  if has_function_privilege('anon', 'public.list_ifood_claimed_merchant_ids_v1()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.list_ifood_claimed_merchant_ids_v1()', 'EXECUTE') then
    raise exception 'browser role can execute list_ifood_claimed_merchant_ids_v1';
  end if;
  if not has_function_privilege('service_role', 'public.list_ifood_claimed_merchant_ids_v1()', 'EXECUTE') then
    raise exception 'service_role cannot execute list_ifood_claimed_merchant_ids_v1';
  end if;
end;
$$;

insert into ifood_internal.connections (empresa_id, merchant_id, status)
select empresa_a, 'merchant-discoverable-active', 'active' from ifood_discoverable_merchants_fixture;
insert into ifood_internal.connections (empresa_id, merchant_id, status)
select empresa_b, 'merchant-discoverable-revoked', 'revoked' from ifood_discoverable_merchants_fixture;

-- 2) Returns every claimed merchant_id regardless of status -- including
-- revoked, because the UNIQUE constraint still reserves that id forever.
do $$
declare
  v_ids text[];
begin
  select array_agg(merchant_id order by merchant_id)
    into v_ids
    from public.list_ifood_claimed_merchant_ids_v1()
   where merchant_id like 'merchant-discoverable-%';
  if v_ids is distinct from array['merchant-discoverable-active', 'merchant-discoverable-revoked'] then
    raise exception 'unexpected claimed merchant ids: %', v_ids;
  end if;
end;
$$;

-- 3) A merchant nobody has ever connected does not appear.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from public.list_ifood_claimed_merchant_ids_v1()
   where merchant_id = 'merchant-never-connected';
  if v_count <> 0 then
    raise exception 'an unclaimed merchant id was reported as claimed';
  end if;
end;
$$;

rollback;

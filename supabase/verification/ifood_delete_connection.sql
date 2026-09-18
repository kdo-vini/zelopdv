-- Transactional verification for delete_ifood_connection_v1.
-- All fixtures are rolled back; this never targets the linked project.
-- Executed live against the linked project (rollback transaction) on
-- 2026-09-18 -- ALL VERIFICATIONS PASSED.
begin;

create temporary table ifood_delete_connection_fixture (
  empresa_a uuid not null,
  owner_a uuid not null,
  empresa_b uuid not null,
  owner_b uuid not null
) on commit drop;

insert into ifood_delete_connection_fixture (empresa_a, owner_a, empresa_b, owner_b)
values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select owner_a, 'codex-ifood-delete-a-' || owner_a::text || '@invalid.local',
       'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()
  from ifood_delete_connection_fixture
union all
select owner_b, 'codex-ifood-delete-b-' || owner_b::text || '@invalid.local',
       'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()
  from ifood_delete_connection_fixture;

insert into public.empresa_perfil (id, user_id, nome_exibicao)
select empresa_a, owner_a, 'iFood delete-connection verification A' from ifood_delete_connection_fixture
union all
select empresa_b, owner_b, 'iFood delete-connection verification B' from ifood_delete_connection_fixture;

grant select on ifood_delete_connection_fixture to service_role;

set local role service_role;

-- 1) Browser roles must never execute this RPC.
do $$
begin
  if has_function_privilege('anon', 'public.delete_ifood_connection_v1(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.delete_ifood_connection_v1(uuid)', 'EXECUTE') then
    raise exception 'browser role can execute delete_ifood_connection_v1';
  end if;
  if not has_function_privilege('service_role', 'public.delete_ifood_connection_v1(uuid)', 'EXECUTE') then
    raise exception 'service_role cannot execute delete_ifood_connection_v1';
  end if;
end;
$$;

insert into ifood_internal.connections (empresa_id, merchant_id, status)
select empresa_a, 'merchant-delete-fixture-a', 'active' from ifood_delete_connection_fixture;

do $$
declare
  v_empresa_a uuid;
  v_empresa_b uuid;
  v_connection_id uuid;
  v_outcome text;
  v_remaining_events integer;
  v_remaining_connections integer;
  v_count_b integer;
begin
  select empresa_a, empresa_b into v_empresa_a, v_empresa_b from ifood_delete_connection_fixture;

  select id into v_connection_id
    from ifood_internal.connections
   where merchant_id = 'merchant-delete-fixture-a';

  -- 2) Deleting a connection cascades away its event/command history
  -- (`event_inbox` stands in for `order_commands`/`product_mappings`/
  -- `stock_commitments`, which share the identical
  -- `connection_id ... on delete cascade` shape) -- the explicit, confirmed
  -- product decision: "excluir configuração" means starting over from zero,
  -- including history.
  insert into ifood_internal.event_inbox (
    connection_id, empresa_id, merchant_id, event_id, event_type, payload
  ) values (v_connection_id, v_empresa_a, 'merchant-delete-fixture-a', 'event-delete-fixture', 'PLACED', '{}'::jsonb);

  select outcome into v_outcome from public.delete_ifood_connection_v1(v_empresa_a);
  if v_outcome is distinct from 'deleted' then
    raise exception 'expected outcome deleted, got %', v_outcome;
  end if;

  select count(*) into v_remaining_connections
    from ifood_internal.connections where id = v_connection_id;
  if v_remaining_connections <> 0 then
    raise exception 'connection row survived delete';
  end if;

  select count(*) into v_remaining_events
    from ifood_internal.event_inbox where connection_id = v_connection_id;
  if v_remaining_events <> 0 then
    raise exception 'event_inbox row survived cascade delete: %', v_remaining_events;
  end if;

  -- 3) Deleting an empresa with no connection is a no-op, reported as not_found.
  select outcome into v_outcome from public.delete_ifood_connection_v1(v_empresa_b);
  if v_outcome is distinct from 'not_found' then
    raise exception 'expected outcome not_found, got %', v_outcome;
  end if;

  -- 4) Deleting empresa A's connection never touches empresa B's (tenant isolation).
  insert into ifood_internal.connections (empresa_id, merchant_id, status)
  values (v_empresa_b, 'merchant-delete-fixture-b', 'active');

  perform public.delete_ifood_connection_v1(v_empresa_a);

  select count(*) into v_count_b
    from ifood_internal.connections
   where empresa_id = v_empresa_b and merchant_id = 'merchant-delete-fixture-b';
  if v_count_b <> 1 then
    raise exception 'unrelated tenant connection was affected by delete';
  end if;
end;
$$;

rollback;

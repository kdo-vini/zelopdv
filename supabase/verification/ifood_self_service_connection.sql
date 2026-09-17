-- Transactional verification for the iFood self-service connection RPCs.
-- All fixtures are rolled back; this never targets the linked project.
-- Not executed in this session (no local Docker/Postgres harness available);
-- code-reviewed against the migration it exercises.
begin;

create temporary table ifood_connection_verification_fixture (
  empresa_a uuid not null,
  owner_a uuid not null,
  empresa_b uuid not null,
  owner_b uuid not null
) on commit drop;

insert into ifood_connection_verification_fixture (empresa_a, owner_a, empresa_b, owner_b)
values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select owner_a, 'codex-ifood-connection-a-' || owner_a::text || '@invalid.local',
       'authenticated', 'authenticated', '{}', '{}', now(), now()
  from ifood_connection_verification_fixture
union all
select owner_b, 'codex-ifood-connection-b-' || owner_b::text || '@invalid.local',
       'authenticated', 'authenticated', '{}', '{}', now(), now()
  from ifood_connection_verification_fixture;

insert into public.empresa_perfil (id, user_id, nome_exibicao)
select empresa_a, owner_a, 'iFood connection verification A' from ifood_connection_verification_fixture
union all
select empresa_b, owner_b, 'iFood connection verification B' from ifood_connection_verification_fixture;

grant select on ifood_connection_verification_fixture to service_role;

set local role service_role;

do $$
begin
  if has_function_privilege('anon', 'public.upsert_ifood_connection_v1(uuid,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.upsert_ifood_connection_v1(uuid,text,text)', 'EXECUTE') then
    raise exception 'browser role can execute upsert_ifood_connection_v1';
  end if;
  if not has_function_privilege('service_role', 'public.upsert_ifood_connection_v1(uuid,text,text)', 'EXECUTE') then
    raise exception 'service_role cannot execute upsert_ifood_connection_v1';
  end if;
end;
$$;

-- 1) First connect creates a pending row.
create temporary table ifood_connection_created on commit drop as
select * from public.upsert_ifood_connection_v1(
  (select empresa_a from ifood_connection_verification_fixture),
  'merchant-connection-a',
  'pending'
);

do $$
begin
  if (select outcome from ifood_connection_created) <> 'created'
     or (select status from ifood_connection_created) <> 'pending' then
    raise exception 'first connect did not create a pending row';
  end if;
end;
$$;

-- 2) A second empresa trying to claim the same merchant_id must not see
-- whose it is, and must not corrupt the first empresa's row.
create temporary table ifood_connection_taken on commit drop as
select * from public.upsert_ifood_connection_v1(
  (select empresa_b from ifood_connection_verification_fixture),
  'merchant-connection-a',
  'pending'
);

do $$
begin
  if (select outcome from ifood_connection_taken) <> 'merchant_taken'
     or (select connection_id from ifood_connection_taken) is not null then
    raise exception 'cross-tenant merchant claim was not rejected cleanly';
  end if;
  if (select count(*) from ifood_internal.connections
       where merchant_id = 'merchant-connection-a') <> 1 then
    raise exception 'a merchant_taken conflict mutated the existing connection';
  end if;
end;
$$;

-- 3) Reconnecting the same empresa+merchant transitions status without
-- creating a second row (webhook enqueue keeps resolving the same connection).
create temporary table ifood_connection_activated on commit drop as
select * from public.upsert_ifood_connection_v1(
  (select empresa_a from ifood_connection_verification_fixture),
  'merchant-connection-a',
  'active'
);

do $$
begin
  if (select outcome from ifood_connection_activated) <> 'updated'
     or (select status from ifood_connection_activated) <> 'active' then
    raise exception 'reconnect did not transition the same row to active';
  end if;
  if (select count(*) from ifood_internal.connections
       where empresa_id = (select empresa_a from ifood_connection_verification_fixture)) <> 1 then
    raise exception 'reconnect created a duplicate connection row';
  end if;
end;
$$;

-- 4) A different merchant_id for an empresa that already has a live
-- connection is a conflict, not a silent switch.
create temporary table ifood_connection_conflict on commit drop as
select * from public.upsert_ifood_connection_v1(
  (select empresa_a from ifood_connection_verification_fixture),
  'merchant-connection-other',
  'pending'
);

do $$
begin
  if (select outcome from ifood_connection_conflict) <> 'conflict_other_merchant'
     or (select merchant_id from ifood_connection_conflict) <> 'merchant-connection-a' then
    raise exception 'switching merchant on a live connection was not rejected';
  end if;
end;
$$;

-- 5) get_ifood_connection_v1 returns the same row without leaking any
-- other tenant's connection.
do $$
declare
  v_merchant text;
begin
  select merchant_id into v_merchant
    from public.get_ifood_connection_v1((select empresa_a from ifood_connection_verification_fixture));
  if v_merchant <> 'merchant-connection-a' then
    raise exception 'get_ifood_connection_v1 did not return the empresa''s own connection';
  end if;

  if exists (
    select 1 from public.get_ifood_connection_v1((select empresa_b from ifood_connection_verification_fixture))
  ) then
    raise exception 'get_ifood_connection_v1 leaked a row for an empresa with no connection';
  end if;
end;
$$;

-- 6) count_ifood_active_orders_v1 is zero with no order_refs at all, and the
-- ACL matches the other two RPCs.
do $$
declare
  v_connection_id uuid;
  v_count integer;
begin
  select connection_id into v_connection_id from ifood_connection_activated;
  select public.count_ifood_active_orders_v1(v_connection_id) into v_count;
  if v_count <> 0 then
    raise exception 'count_ifood_active_orders_v1 counted orders that do not exist';
  end if;

  if has_function_privilege('anon', 'public.count_ifood_active_orders_v1(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.count_ifood_active_orders_v1(uuid)', 'EXECUTE') then
    raise exception 'browser role can execute count_ifood_active_orders_v1';
  end if;
end;
$$;

rollback;

-- Transactional verification for the iFood worker polling RPCs.
-- All fixtures are rolled back; this never targets the linked project.
-- Not executed in this session (no local Docker/Postgres harness available);
-- code-reviewed against the migration it exercises.
begin;

create temporary table ifood_polling_verification_fixture (
  empresa_a uuid not null,
  owner_a uuid not null
) on commit drop;

insert into ifood_polling_verification_fixture (empresa_a, owner_a)
values (gen_random_uuid(), gen_random_uuid());

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select owner_a, 'codex-ifood-polling-' || owner_a::text || '@invalid.local',
       'authenticated', 'authenticated', '{}', '{}', now(), now()
  from ifood_polling_verification_fixture;

insert into public.empresa_perfil (id, user_id, nome_exibicao)
select empresa_a, owner_a, 'iFood polling verification A' from ifood_polling_verification_fixture;

grant select on ifood_polling_verification_fixture to service_role;

set local role service_role;

-- 1) Browser roles must never reach either RPC.
do $$
begin
  if has_function_privilege('anon', 'public.list_ifood_connections_for_polling_v1(timestamptz,bigint,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.list_ifood_connections_for_polling_v1(timestamptz,bigint,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.record_ifood_poll_success_v1(uuid,text,timestamptz,timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.record_ifood_poll_success_v1(uuid,text,timestamptz,timestamptz)', 'EXECUTE') then
    raise exception 'browser role can execute an iFood polling RPC';
  end if;
  if not has_function_privilege('service_role', 'public.list_ifood_connections_for_polling_v1(timestamptz,bigint,integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.record_ifood_poll_success_v1(uuid,text,timestamptz,timestamptz)', 'EXECUTE') then
    raise exception 'service_role cannot execute an iFood polling RPC';
  end if;
end;
$$;

insert into ifood_internal.connections (empresa_id, merchant_id, status)
select empresa_a, 'merchant-polling-active', 'active' from ifood_polling_verification_fixture;
insert into ifood_internal.connections (empresa_id, merchant_id, status)
select empresa_a, 'merchant-polling-paused', 'paused' from ifood_polling_verification_fixture;
insert into ifood_internal.connections (empresa_id, merchant_id, status)
select empresa_a, 'merchant-polling-pending', 'pending' from ifood_polling_verification_fixture;
insert into ifood_internal.connections (empresa_id, merchant_id, status)
select empresa_a, 'merchant-polling-revoked', 'revoked' from ifood_polling_verification_fixture;

-- 2) Listing selects active/degraded/paused and never pending or revoked.
do $$
declare
  v_merchants text[];
begin
  select array_agg(merchant_id order by merchant_id)
    into v_merchants
    from public.list_ifood_connections_for_polling_v1(now(), 0, 1000)
   where merchant_id like 'merchant-polling-%';
  if v_merchants is distinct from array['merchant-polling-active', 'merchant-polling-paused'] then
    raise exception 'unexpected polling selection: %', v_merchants;
  end if;
end;
$$;

-- 3) A successful poll stamps last_poll_at/last_token_at/worker_heartbeat_at.
do $$
declare
  v_outcome text;
  v_at timestamptz := now();
  v_row ifood_internal.connections;
begin
  select outcome into v_outcome
    from public.record_ifood_poll_success_v1(null, 'merchant-polling-active', v_at, v_at);
  if v_outcome <> 'updated' then
    raise exception 'expected updated outcome, got %', v_outcome;
  end if;

  select * into v_row from ifood_internal.connections where merchant_id = 'merchant-polling-active';
  if v_row.last_poll_at is distinct from v_at
     or v_row.last_token_at is distinct from v_at
     or v_row.worker_heartbeat_at is distinct from v_at then
    raise exception 'poll success did not stamp the liveness columns';
  end if;
end;
$$;

-- 4) Timestamps only move forward, so a late worker cannot age a connection.
do $$
declare
  v_before timestamptz;
  v_after timestamptz;
begin
  select last_poll_at into v_before from ifood_internal.connections where merchant_id = 'merchant-polling-active';
  perform public.record_ifood_poll_success_v1(null, 'merchant-polling-active', v_before - interval '1 hour', v_before - interval '1 hour');
  select last_poll_at into v_after from ifood_internal.connections where merchant_id = 'merchant-polling-active';
  if v_after is distinct from v_before then
    raise exception 'a stale poll regressed last_poll_at';
  end if;
end;
$$;

-- 5) The min-interval filter suppresses a connection polled too recently.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from public.list_ifood_connections_for_polling_v1(now(), 3600000, 1000)
   where merchant_id = 'merchant-polling-active';
  if v_count <> 0 then
    raise exception 'min interval did not suppress a freshly polled connection';
  end if;
end;
$$;

-- 6) A revoked/unknown merchant is a distinguishable outcome, never a write.
do $$
declare
  v_outcome text;
begin
  select outcome into v_outcome
    from public.record_ifood_poll_success_v1(null, 'merchant-polling-revoked', now(), now());
  if v_outcome <> 'unknown_merchant' then
    raise exception 'expected unknown_merchant for a revoked connection, got %', v_outcome;
  end if;

  select outcome into v_outcome
    from public.record_ifood_poll_success_v1(null, 'merchant-polling-absent', now(), now());
  if v_outcome <> 'unknown_merchant' then
    raise exception 'expected unknown_merchant for an absent connection, got %', v_outcome;
  end if;
end;
$$;

rollback;

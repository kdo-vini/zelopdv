-- Transactional verification for the iFood admin operations console RPCs.
-- All fixtures are rolled back; this never targets the linked project.
-- Not executed in this session (no local Docker/Postgres harness available);
-- code-reviewed against the migration it exercises.
begin;

create temporary table ifood_admin_ops_fixture (
  empresa_a uuid not null,
  owner_a uuid not null,
  connection_a uuid not null,
  product_a integer
) on commit drop;

insert into ifood_admin_ops_fixture (empresa_a, owner_a, connection_a)
values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select owner_a, 'codex-ifood-admin-ops-' || owner_a::text || '@invalid.local',
       'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()
  from ifood_admin_ops_fixture;

insert into public.empresa_perfil (id, user_id, nome_exibicao)
select empresa_a, owner_a, 'iFood admin ops verification A' from ifood_admin_ops_fixture;

grant select on ifood_admin_ops_fixture to service_role;

set local role service_role;

do $$
begin
  if has_function_privilege('anon', 'public.admin_ifood_connections_overview_v1()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.admin_ifood_connections_overview_v1()', 'EXECUTE') then
    raise exception 'browser role can execute admin_ifood_connections_overview_v1';
  end if;
  if not has_function_privilege('service_role', 'public.admin_ifood_connections_overview_v1()', 'EXECUTE') then
    raise exception 'service_role cannot execute admin_ifood_connections_overview_v1';
  end if;
end;
$$;

insert into ifood_internal.connections (id, empresa_id, merchant_id, status)
select connection_a, empresa_a, 'merchant-admin-ops-a', 'active'
  from ifood_admin_ops_fixture;

insert into ifood_internal.event_inbox (
  connection_id, empresa_id, merchant_id, event_id, event_type, payload, status
)
select connection_a, empresa_a, 'merchant-admin-ops-a', 'event-stuck-1', 'PLC', '{}'::jsonb, 'failed_retryable'
  from ifood_admin_ops_fixture
union all
select connection_a, empresa_a, 'merchant-admin-ops-a', 'event-dead-1', 'PLC', '{}'::jsonb, 'dead_letter'
  from ifood_admin_ops_fixture;

-- 1) Overview aggregates queued/dead-letter counts without leaking payload.
do $$
declare
  v_queued integer;
  v_dead_letter integer;
begin
  select queued_events, dead_letter_events into v_queued, v_dead_letter
    from public.admin_ifood_connections_overview_v1()
   where connection_id = (select connection_a from ifood_admin_ops_fixture);
  if v_queued <> 1 or v_dead_letter <> 1 then
    raise exception 'overview did not aggregate event_inbox counts correctly (queued=%, dead_letter=%)', v_queued, v_dead_letter;
  end if;
end;
$$;

-- 2) Kill switch pauses the exact connection row addressed by id.
do $$
declare
  v_status text;
  v_outcome text;
begin
  select status, outcome into v_status, v_outcome
    from public.admin_set_ifood_connection_status_v1(
      (select connection_a from ifood_admin_ops_fixture),
      'paused'
    );
  if v_status <> 'paused' or v_outcome <> 'updated' then
    raise exception 'kill switch did not pause the connection';
  end if;
end;
$$;

do $$
declare
  v_outcome text;
begin
  select outcome into v_outcome
    from public.admin_set_ifood_connection_status_v1(gen_random_uuid(), 'paused');
  if v_outcome <> 'not_found' then
    raise exception 'kill switch on a non-existent connection did not report not_found';
  end if;
end;
$$;

-- 3) Replay resets the SAME row (never inserts a new one) and rejects an
-- already-healthy event.
do $$
declare
  v_before_count integer;
  v_after_count integer;
  v_status text;
  v_outcome text;
  v_row_id uuid;
begin
  select count(*) into v_before_count from ifood_internal.event_inbox
   where connection_id = (select connection_a from ifood_admin_ops_fixture);

  select id into strict v_row_id from ifood_internal.event_inbox
   where connection_id = (select connection_a from ifood_admin_ops_fixture)
     and event_id = 'event-dead-1';

  select status, outcome into v_status, v_outcome
    from public.admin_replay_ifood_event_v1(v_row_id);
  if v_status <> 'queued' or v_outcome <> 'requeued' then
    raise exception 'replay did not requeue the dead-lettered event';
  end if;

  select count(*) into v_after_count from ifood_internal.event_inbox
   where connection_id = (select connection_a from ifood_admin_ops_fixture);
  if v_before_count <> v_after_count then
    raise exception 'replay duplicated the event row instead of resetting it in place';
  end if;

  select outcome into v_outcome
    from public.admin_replay_ifood_event_v1(v_row_id);
  if v_outcome <> 'not_replayable' then
    raise exception 'replaying an already-queued event should be a no-op, not a silent success';
  end if;
end;
$$;

rollback;

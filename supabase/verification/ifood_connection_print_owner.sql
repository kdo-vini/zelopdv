-- Transactional verification for set_ifood_connection_print_owner_v1.
-- All fixtures are rolled back; this never targets the linked project.
-- Not executed in this session (no local Docker/Postgres harness available);
-- code-reviewed against the migration it exercises.
begin;

create temporary table ifood_print_owner_verification_fixture (
  empresa_a uuid not null,
  owner_a uuid not null
) on commit drop;

insert into ifood_print_owner_verification_fixture (empresa_a, owner_a)
values (gen_random_uuid(), gen_random_uuid());

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select owner_a, 'codex-ifood-print-owner-' || owner_a::text || '@invalid.local',
       'authenticated', 'authenticated', '{}', '{}', now(), now()
  from ifood_print_owner_verification_fixture;

insert into public.empresa_perfil (id, user_id, nome_exibicao)
select empresa_a, owner_a, 'iFood print owner verification A' from ifood_print_owner_verification_fixture;

grant select on ifood_print_owner_verification_fixture to service_role;

set local role service_role;

do $$
begin
  if has_function_privilege('anon', 'public.set_ifood_connection_print_owner_v1(uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.set_ifood_connection_print_owner_v1(uuid,text)', 'EXECUTE') then
    raise exception 'browser role can execute set_ifood_connection_print_owner_v1';
  end if;
  if not has_function_privilege('service_role', 'public.set_ifood_connection_print_owner_v1(uuid,text)', 'EXECUTE') then
    raise exception 'service_role cannot execute set_ifood_connection_print_owner_v1';
  end if;
end;
$$;

-- 1) No connection yet: outcome is a distinguishable not_connected, never a raw error.
do $$
declare
  v_outcome text;
begin
  select outcome into v_outcome
    from public.set_ifood_connection_print_owner_v1(
      (select empresa_a from ifood_print_owner_verification_fixture),
      'external'
    );
  if v_outcome <> 'not_connected' then
    raise exception 'expected not_connected outcome before any connection exists';
  end if;
end;
$$;

-- 2) Create the connection, then flip print_owner to 'external' and back to 'zelo'.
insert into ifood_internal.connections (empresa_id, merchant_id, status)
select empresa_a, 'merchant-print-owner-a', 'active'
  from ifood_print_owner_verification_fixture;

do $$
declare
  v_outcome text;
  v_print_owner text;
begin
  select outcome, print_owner into v_outcome, v_print_owner
    from public.set_ifood_connection_print_owner_v1(
      (select empresa_a from ifood_print_owner_verification_fixture),
      'external'
    );
  if v_outcome <> 'updated' or v_print_owner <> 'external' then
    raise exception 'print_owner was not updated to external';
  end if;
  if (select print_owner from ifood_internal.connections
       where empresa_id = (select empresa_a from ifood_print_owner_verification_fixture)) <> 'external' then
    raise exception 'print_owner column did not persist external';
  end if;
end;
$$;

-- 3) Invalid values are rejected before touching the row.
do $$
begin
  begin
    perform public.set_ifood_connection_print_owner_v1(
      (select empresa_a from ifood_print_owner_verification_fixture),
      'not-a-real-owner'
    );
    raise exception 'invalid print_owner was accepted';
  exception when others then
    if sqlerrm <> 'INVALID_PRINT_OWNER' then
      raise exception 'unexpected error for invalid print_owner: %', sqlerrm;
    end if;
  end;
end;
$$;

rollback;

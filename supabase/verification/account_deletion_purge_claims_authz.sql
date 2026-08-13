-- Transactional authorization, fencing and finalization matrix for the
-- account-deletion sweeper. Every synthetic row is rolled back.

begin;

create temporary table account_deletion_purge_fixture (
  owner_id uuid not null,
  empresa_id uuid not null,
  second_owner_id uuid not null,
  second_empresa_id uuid not null,
  reactivation_owner_id uuid not null,
  reactivation_empresa_id uuid not null,
  subuser_id uuid not null,
  subuser_role_id uuid not null,
  regular_id uuid not null,
  super_admin_id uuid not null
) on commit drop;

insert into account_deletion_purge_fixture
select gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
       gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
       gen_random_uuid(), gen_random_uuid();

insert into auth.users (
  id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select actor_id,
       'codex-purge-' || actor_id::text || '@invalid.local',
       'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()
from account_deletion_purge_fixture f
cross join lateral (
  values (f.owner_id), (f.second_owner_id), (f.subuser_id),
         (f.reactivation_owner_id), (f.regular_id), (f.super_admin_id)
) actors(actor_id);

insert into public.access_roles (id, owner_user_id, name, permissions)
select subuser_role_id, owner_id, 'Codex purge subuser', '{"pdv.acessar":true}'::jsonb
from account_deletion_purge_fixture;

insert into public.access_users (
  owner_user_id, auth_user_id, email, role_id, status
)
select owner_id, subuser_id,
       'codex-purge-subuser-' || subuser_id::text || '@invalid.local',
       subuser_role_id, 'active'
from account_deletion_purge_fixture;

insert into public.super_admins (user_id, email, role, is_active)
select super_admin_id,
       'codex-purge-super-admin-' || super_admin_id::text || '@invalid.local',
       'super_admin', true
from account_deletion_purge_fixture;

insert into public.empresa_perfil (
  id, user_id, nome_exibicao, deletion_scheduled_at,
  deletion_requested_at, deletion_source
)
select empresa_id, owner_id, 'Codex purge primary',
       clock_timestamp() - interval '1 hour',
       clock_timestamp() - interval '31 days', 'pdv'
from account_deletion_purge_fixture
union all
select second_empresa_id, second_owner_id, 'Codex purge second',
       clock_timestamp() - interval '2 hours',
       clock_timestamp() - interval '31 days', 'zelochat'
from account_deletion_purge_fixture
union all
select reactivation_empresa_id, reactivation_owner_id, 'Codex reactivation',
       clock_timestamp() - interval '3 hours',
       clock_timestamp() - interval '31 days', 'pdv'
from account_deletion_purge_fixture;

update public.empresa_perfil ep
set whatsmiau_instance = 'codex-reactivation-instance',
    whatsmiau_connected = true,
    whatsmiau_phone = '5511999999999'
from account_deletion_purge_fixture f
where ep.id = f.reactivation_empresa_id;

select set_config('zelo.purge.owner_id', owner_id::text, true),
       set_config('zelo.purge.empresa_id', empresa_id::text, true),
       set_config('zelo.purge.second_owner_id', second_owner_id::text, true),
       set_config('zelo.purge.second_empresa_id', second_empresa_id::text, true),
       set_config('zelo.purge.reactivation_owner_id', reactivation_owner_id::text, true),
       set_config('zelo.purge.reactivation_empresa_id', reactivation_empresa_id::text, true),
       set_config('zelo.purge.subuser_id', subuser_id::text, true),
       set_config('zelo.purge.regular_id', regular_id::text, true),
       set_config('zelo.purge.super_admin_id', super_admin_id::text, true)
from account_deletion_purge_fixture;

create function pg_temp.assert_rpc_denied(p_role name, p_sub uuid, p_label text)
returns void
language plpgsql
as $$
declare
  v_claim_succeeded boolean := false;
  v_renew_succeeded boolean := false;
  v_finalize_succeeded boolean := false;
  v_begin_succeeded boolean := false;
  v_complete_succeeded boolean := false;
  v_abort_succeeded boolean := false;
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('role', p_role, 'sub', p_sub)::text, true);

  begin
    perform public.claim_due_account_deletions(1);
    v_claim_succeeded := true;
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.renew_account_deletion_claim(
      current_setting('zelo.purge.empresa_id')::uuid,
      current_setting('zelo.purge.owner_id')::uuid,
      gen_random_uuid()
    );
    v_renew_succeeded := true;
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.finalize_claimed_account_deletion(
      current_setting('zelo.purge.empresa_id')::uuid,
      current_setting('zelo.purge.owner_id')::uuid,
      gen_random_uuid()
    );
    v_finalize_succeeded := true;
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.begin_account_deletion_reactivation(
      current_setting('zelo.purge.reactivation_empresa_id')::uuid,
      current_setting('zelo.purge.reactivation_owner_id')::uuid
    );
    v_begin_succeeded := true;
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.complete_account_deletion_reactivation(
      current_setting('zelo.purge.reactivation_empresa_id')::uuid,
      current_setting('zelo.purge.reactivation_owner_id')::uuid,
      gen_random_uuid()
    );
    v_complete_succeeded := true;
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.abort_account_deletion_reactivation(
      current_setting('zelo.purge.reactivation_empresa_id')::uuid,
      current_setting('zelo.purge.reactivation_owner_id')::uuid,
      gen_random_uuid()
    );
    v_abort_succeeded := true;
  exception when insufficient_privilege then null;
  end;

  if v_claim_succeeded or v_renew_succeeded or v_finalize_succeeded
     or v_begin_succeeded or v_complete_succeeded or v_abort_succeeded then
    raise exception '% executed a deletion RPC: claim=% renew=% finalize=% begin=% complete=% abort=%',
      p_label, v_claim_succeeded, v_renew_succeeded, v_finalize_succeeded,
      v_begin_succeeded, v_complete_succeeded, v_abort_succeeded;
  end if;
end;
$$;

create function pg_temp.assert_direct_claim_mutation_denied(
  p_role name,
  p_sub uuid,
  p_empresa_id uuid,
  p_label text
)
returns void
language plpgsql
as $$
declare
  v_changed integer;
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('role', p_role, 'sub', p_sub)::text, true);

  begin
    update public.empresa_perfil
    set deletion_purge_token = gen_random_uuid(),
        deletion_purge_claimed_at = clock_timestamp()
    where id = p_empresa_id;
    get diagnostics v_changed = row_count;
    if v_changed <> 0 then
      raise exception '% directly changed purge claim columns', p_label;
    end if;
  exception
    when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm <> 'ACCOUNT_DELETION_CLAIM_FORBIDDEN' then raise; end if;
  end;

  begin
    update public.empresa_perfil
    set deletion_reactivation_token = gen_random_uuid(),
        deletion_reactivation_started_at = clock_timestamp()
    where id = p_empresa_id;
    get diagnostics v_changed = row_count;
    if v_changed <> 0 then
      raise exception '% directly changed reactivation claim columns', p_label;
    end if;
  exception
    when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm <> 'ACCOUNT_DELETION_CLAIM_FORBIDDEN' then raise; end if;
  end;
end;
$$;

-- PUBLIC/anon has no EXECUTE privilege.
set local role anon;
select pg_temp.assert_rpc_denied('anon', null, 'anon');
select pg_temp.assert_direct_claim_mutation_denied(
  'anon', null, current_setting('zelo.purge.empresa_id')::uuid, 'anon'
);
reset role;

-- Ordinary authenticated, owner and external super-admin all remain denied.
set local role authenticated;
select pg_temp.assert_rpc_denied(
  'authenticated', current_setting('zelo.purge.regular_id')::uuid,
  'regular authenticated'
);
select pg_temp.assert_direct_claim_mutation_denied(
  'authenticated', current_setting('zelo.purge.regular_id')::uuid,
  current_setting('zelo.purge.empresa_id')::uuid, 'regular authenticated'
);
select pg_temp.assert_rpc_denied(
  'authenticated', current_setting('zelo.purge.owner_id')::uuid,
  'owner'
);
select pg_temp.assert_direct_claim_mutation_denied(
  'authenticated', current_setting('zelo.purge.owner_id')::uuid,
  current_setting('zelo.purge.empresa_id')::uuid, 'owner'
);
select pg_temp.assert_rpc_denied(
  'authenticated', current_setting('zelo.purge.subuser_id')::uuid,
  'active subuser'
);
select pg_temp.assert_direct_claim_mutation_denied(
  'authenticated', current_setting('zelo.purge.subuser_id')::uuid,
  current_setting('zelo.purge.empresa_id')::uuid, 'active subuser'
);
select pg_temp.assert_rpc_denied(
  'authenticated', current_setting('zelo.purge.super_admin_id')::uuid,
  'external super-admin'
);
select pg_temp.assert_direct_claim_mutation_denied(
  'authenticated', current_setting('zelo.purge.super_admin_id')::uuid,
  current_setting('zelo.purge.empresa_id')::uuid, 'external super-admin'
);
reset role;

-- Only service_role can atomically claim due rows. The oldest row is claimed
-- first, and a second invocation gets a disjoint row rather than duplicating it.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Reactivation acquires a mutually exclusive row lock before any provider
-- effect. The schedule and WhatsApp identity remain unchanged while fenced.
create temporary table reactivation_claim (
  first_token uuid not null,
  replacement_token uuid
) on commit drop;

insert into reactivation_claim (first_token)
select public.begin_account_deletion_reactivation(
  current_setting('zelo.purge.reactivation_empresa_id')::uuid,
  current_setting('zelo.purge.reactivation_owner_id')::uuid
);

do $$
declare
  v_token uuid;
  v_ok boolean;
begin
  select first_token into v_token from reactivation_claim;
  if v_token is null then
    raise exception 'reactivation did not acquire a token';
  end if;

  if not exists (
    select 1
    from public.empresa_perfil
    where id = current_setting('zelo.purge.reactivation_empresa_id')::uuid
      and deletion_reactivation_token = v_token
      and deletion_scheduled_at is not null
      and whatsmiau_instance = 'codex-reactivation-instance'
  ) then
    raise exception 'begin reactivation changed scheduled/provider state';
  end if;

  begin
    perform public.begin_account_deletion_reactivation(
      current_setting('zelo.purge.reactivation_empresa_id')::uuid,
      current_setting('zelo.purge.reactivation_owner_id')::uuid
    );
    raise exception 'active reactivation token was replaced early';
  exception when raise_exception then
    if sqlerrm <> 'ACCOUNT_DELETION_REACTIVATION_IN_PROGRESS' then raise; end if;
  end;

  select public.complete_account_deletion_reactivation(
    current_setting('zelo.purge.reactivation_empresa_id')::uuid,
    current_setting('zelo.purge.reactivation_owner_id')::uuid,
    gen_random_uuid()
  ) into v_ok;
  if v_ok then raise exception 'wrong token completed reactivation'; end if;

  select public.abort_account_deletion_reactivation(
    current_setting('zelo.purge.reactivation_empresa_id')::uuid,
    current_setting('zelo.purge.reactivation_owner_id')::uuid,
    gen_random_uuid()
  ) into v_ok;
  if v_ok then raise exception 'wrong token aborted reactivation'; end if;

  begin
    update public.empresa_perfil
    set deletion_scheduled_at = null
    where id = current_setting('zelo.purge.reactivation_empresa_id')::uuid;
    raise exception 'service_role directly cleared a reactivation schedule';
  exception when raise_exception then
    if sqlerrm <> 'ACCOUNT_DELETION_REACTIVATION_IN_PROGRESS' then raise; end if;
  end;

  begin
    update public.empresa_perfil
    set whatsmiau_instance = null,
        whatsmiau_connected = false,
        whatsmiau_phone = null
    where id = current_setting('zelo.purge.reactivation_empresa_id')::uuid;
    raise exception 'service_role directly cleared an instance during reactivation';
  exception when raise_exception then
    if sqlerrm <> 'ACCOUNT_DELETION_REACTIVATION_IN_PROGRESS' then raise; end if;
  end;
end;
$$;

-- Simulate a crashed reactivation. At exactly 30 minutes a retry may replace
-- the token, but purge must still never reclaim the row as a stale purge.
reset role;
alter table public.empresa_perfil
  disable trigger guard_account_deletion_purge_state;
update public.empresa_perfil
set deletion_reactivation_started_at = clock_timestamp() - interval '30 minutes'
where id = current_setting('zelo.purge.reactivation_empresa_id')::uuid;
alter table public.empresa_perfil
  enable trigger guard_account_deletion_purge_state;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

update reactivation_claim
set replacement_token = public.begin_account_deletion_reactivation(
  current_setting('zelo.purge.reactivation_empresa_id')::uuid,
  current_setting('zelo.purge.reactivation_owner_id')::uuid
);

do $$
declare
  v_first uuid;
  v_replacement uuid;
  v_ok boolean;
begin
  select first_token, replacement_token
  into v_first, v_replacement
  from reactivation_claim;
  if v_replacement is null or v_replacement = v_first then
    raise exception 'stale reactivation token was not replaced';
  end if;

  select public.abort_account_deletion_reactivation(
    current_setting('zelo.purge.reactivation_empresa_id')::uuid,
    current_setting('zelo.purge.reactivation_owner_id')::uuid,
    v_first
  ) into v_ok;
  if v_ok then raise exception 'stale reactivation token aborted replacement'; end if;
end;
$$;

-- Even the existing SECURITY DEFINER delete_account path may not erase an
-- account while the outcome of provider reactivation is unresolved.
reset role;
do $$
begin
  begin
    perform public.delete_account(
      current_setting('zelo.purge.reactivation_owner_id')::uuid,
      'grace-purge'
    );
    raise exception 'postgres deletion bypassed the reactivation fence';
  exception when raise_exception then
    if sqlerrm <> 'ACCOUNT_DELETION_REACTIVATION_IN_PROGRESS' then raise; end if;
  end;
end;
$$;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temporary table purge_claims as
select * from public.claim_due_account_deletions(50);

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from purge_claims;
  if v_count <> 2 then
    raise exception 'purge did not claim exactly the two unfenced due accounts';
  end if;
  if exists (
    select 1 from purge_claims
    where empresa_id = current_setting('zelo.purge.reactivation_empresa_id')::uuid
  ) then
    raise exception 'purge claimed an account with a reactivation token';
  end if;
end;
$$;

insert into purge_claims
select * from public.claim_due_account_deletions(50);

do $$
declare
  v_count integer;
  v_distinct integer;
begin
  select count(*), count(distinct empresa_id)
  into v_count, v_distinct
  from purge_claims;
  if v_count <> 2 or v_distinct <> 2 then
    raise exception 'claims overlapped: rows=% distinct=%', v_count, v_distinct;
  end if;
end;
$$;

-- The owner still has the legacy table DELETE policy, but cannot bypass an
-- active purge claim by deleting only the profile marker.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', current_setting('zelo.purge.owner_id')
  )::text,
  true
);
do $$
declare
  v_deleted integer;
begin
  begin
    delete from public.empresa_perfil
    where id = current_setting('zelo.purge.empresa_id')::uuid;
    get diagnostics v_deleted = row_count;
    if v_deleted <> 0 then
      raise exception 'owner profile delete was not fenced (rows=%)', v_deleted;
    end if;
  exception when raise_exception then
    if sqlerrm <> 'ACCOUNT_DELETION_PURGE_IN_PROGRESS' then raise; end if;
  end;
end;
$$;
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Wrong token cannot renew. The current token renews, and an active claim
-- blocks schedule clearing even for service_role route code.
do $$
declare
  v_token uuid;
  v_ok boolean;
begin
  select purge_token into v_token
  from purge_claims
  where empresa_id = current_setting('zelo.purge.empresa_id')::uuid;

  select public.renew_account_deletion_claim(
    current_setting('zelo.purge.empresa_id')::uuid,
    current_setting('zelo.purge.owner_id')::uuid,
    gen_random_uuid()
  ) into v_ok;
  if v_ok then raise exception 'wrong token renewed claim'; end if;

  select public.renew_account_deletion_claim(
    current_setting('zelo.purge.empresa_id')::uuid,
    current_setting('zelo.purge.owner_id')::uuid,
    v_token
  ) into v_ok;
  if not v_ok then raise exception 'current token failed renewal'; end if;

  begin
    update public.empresa_perfil
    set deletion_scheduled_at = null,
        deletion_requested_at = null,
        deletion_source = null
    where id = current_setting('zelo.purge.empresa_id')::uuid;
    raise exception 'active claim allowed reactivation';
  exception when raise_exception then
    if sqlerrm <> 'ACCOUNT_DELETION_PURGE_IN_PROGRESS' then raise; end if;
  end;
end;
$$;

-- Simulate an expired lease. Only the claim RPC may replace its token; the
-- stale token cannot renew or finalize after replacement.
create temporary table stale_claim (token uuid not null) on commit drop;
insert into stale_claim
select deletion_purge_token
from public.empresa_perfil
where id = current_setting('zelo.purge.empresa_id')::uuid;

reset role;
alter table public.empresa_perfil
  disable trigger guard_account_deletion_purge_state;
update public.empresa_perfil
set deletion_purge_claimed_at = clock_timestamp() - interval '31 minutes'
where id = current_setting('zelo.purge.empresa_id')::uuid;
alter table public.empresa_perfil
  enable trigger guard_account_deletion_purge_state;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temporary table replacement_claim as
select * from public.claim_due_account_deletions(1);

do $$
declare
  v_old uuid;
  v_new uuid;
  v_ok boolean;
begin
  select token into v_old from stale_claim;
  select purge_token into v_new from replacement_claim
  where empresa_id = current_setting('zelo.purge.empresa_id')::uuid;
  if v_new is null or v_new = v_old then
    raise exception 'stale claim was not replaced';
  end if;

  select public.renew_account_deletion_claim(
    current_setting('zelo.purge.empresa_id')::uuid,
    current_setting('zelo.purge.owner_id')::uuid,
    v_old
  ) into v_ok;
  if v_ok then raise exception 'stale token renewed after replacement'; end if;

  select public.finalize_claimed_account_deletion(
    current_setting('zelo.purge.empresa_id')::uuid,
    current_setting('zelo.purge.owner_id')::uuid,
    v_old
  ) into v_ok;
  if v_ok then raise exception 'stale token finalized after replacement'; end if;
end;
$$;

-- Finalize the primary fixture with the current token. The unchanged
-- delete_account path removes auth/profile data and writes its audit log.
do $$
declare
  v_token uuid;
  v_ok boolean;
begin
  select purge_token into v_token
  from replacement_claim
  where empresa_id = current_setting('zelo.purge.empresa_id')::uuid;

  select public.renew_account_deletion_claim(
    current_setting('zelo.purge.empresa_id')::uuid,
    current_setting('zelo.purge.owner_id')::uuid,
    v_token
  ) into v_ok;
  if not v_ok then raise exception 'final claim did not renew'; end if;

  select public.finalize_claimed_account_deletion(
    current_setting('zelo.purge.empresa_id')::uuid,
    current_setting('zelo.purge.owner_id')::uuid,
    v_token
  ) into v_ok;
  if not v_ok then raise exception 'current due claim did not finalize'; end if;
end;
$$;

reset role;

do $$
begin
  if exists (
    select 1 from auth.users
    where id = current_setting('zelo.purge.owner_id')::uuid
  ) or exists (
    select 1 from public.empresa_perfil
    where id = current_setting('zelo.purge.empresa_id')::uuid
  ) then
    raise exception 'finalizer left owner/profile behind';
  end if;

  if not exists (
    select 1 from public.account_deletion_log
    where deleted_user_id = current_setting('zelo.purge.owner_id')::uuid
      and source = 'grace-purge'
  ) then
    raise exception 'finalizer did not preserve deletion audit';
  end if;

  begin
    perform public.finalize_claimed_account_deletion(
      gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
    );
    raise exception 'postgres invoked service-only finalizer directly';
  exception when raise_exception then
    if sqlerrm <> 'ACCOUNT_DELETION_SERVICE_ROLE_REQUIRED' then raise; end if;
  end;
end;
$$;

-- Abort releases only the reactivation fence and preserves the complete
-- deletion schedule. A new begin can then be completed with an exact-token CAS.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_token uuid;
  v_ok boolean;
begin
  select replacement_token into v_token from reactivation_claim;
  select public.abort_account_deletion_reactivation(
    current_setting('zelo.purge.reactivation_empresa_id')::uuid,
    current_setting('zelo.purge.reactivation_owner_id')::uuid,
    v_token
  ) into v_ok;
  if not v_ok then raise exception 'current token did not abort'; end if;

  if not exists (
    select 1 from public.empresa_perfil
    where id = current_setting('zelo.purge.reactivation_empresa_id')::uuid
      and deletion_scheduled_at is not null
      and deletion_requested_at is not null
      and deletion_source = 'pdv'
      and deletion_reactivation_token is null
      and deletion_reactivation_started_at is null
  ) then
    raise exception 'abort changed deletion schedule or retained its fence';
  end if;

  select public.begin_account_deletion_reactivation(
    current_setting('zelo.purge.reactivation_empresa_id')::uuid,
    current_setting('zelo.purge.reactivation_owner_id')::uuid
  ) into v_token;
  select public.complete_account_deletion_reactivation(
    current_setting('zelo.purge.reactivation_empresa_id')::uuid,
    current_setting('zelo.purge.reactivation_owner_id')::uuid,
    v_token
  ) into v_ok;
  if not v_ok then raise exception 'current token did not complete'; end if;

  if not exists (
    select 1 from public.empresa_perfil
    where id = current_setting('zelo.purge.reactivation_empresa_id')::uuid
      and deletion_scheduled_at is null
      and deletion_requested_at is null
      and deletion_source is null
      and deletion_reactivation_token is null
      and deletion_reactivation_started_at is null
      and whatsmiau_instance = 'codex-reactivation-instance'
  ) then
    raise exception 'complete did not atomically clear only deletion state';
  end if;

  if public.begin_account_deletion_reactivation(
    current_setting('zelo.purge.reactivation_empresa_id')::uuid,
    current_setting('zelo.purge.reactivation_owner_id')::uuid
  ) is not null then
    raise exception 'completed account acquired a new reactivation fence';
  end if;
end;
$$;

rollback;

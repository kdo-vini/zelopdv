-- Fence account reactivation and the grace-period purge from each other, and
-- prevent duplicate workers from performing the same irreversible effects.
-- All columns are additive so old application versions continue to read rows.

begin;

alter table public.empresa_perfil
  add column deletion_purge_token uuid,
  add column deletion_purge_claimed_at timestamptz,
  add column deletion_reactivation_token uuid,
  add column deletion_reactivation_started_at timestamptz,
  add constraint empresa_perfil_deletion_purge_claim_pair_check check (
    (deletion_purge_token is null) = (deletion_purge_claimed_at is null)
    and (deletion_purge_token is null or deletion_scheduled_at is not null)
  ),
  add constraint empresa_perfil_deletion_reactivation_pair_check check (
    (deletion_reactivation_token is null) =
      (deletion_reactivation_started_at is null)
    and (
      deletion_reactivation_token is null
      or deletion_scheduled_at is not null
    )
  ),
  add constraint empresa_perfil_deletion_claims_exclusive_check check (
    deletion_purge_token is null or deletion_reactivation_token is null
  );

comment on column public.empresa_perfil.deletion_purge_token is
  'Opaque fencing token held by the account-deletion worker during final purge.';
comment on column public.empresa_perfil.deletion_purge_claimed_at is
  'Lease timestamp for deletion_purge_token; stale claims may be replaced after 30 minutes.';
comment on column public.empresa_perfil.deletion_reactivation_token is
  'Opaque fencing token held while a provider subscription is being reactivated.';
comment on column public.empresa_perfil.deletion_reactivation_started_at is
  'Start timestamp for deletion reactivation; a retry may take over after 30 minutes.';

create function public.guard_account_deletion_purge_state()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_is_privileged boolean := current_user in ('postgres', 'service_role');
  v_purge_fields_changed boolean;
  v_reactivation_fields_changed boolean;
  v_schedule_changed boolean;
  v_identity_changed boolean;
  v_instance_changed boolean;
begin
  if tg_op = 'DELETE' then
    -- delete_account runs as postgres and is the only path that may remove a
    -- claimed profile. Every externally callable role is fenced.
    if old.deletion_purge_token is not null and current_user <> 'postgres' then
      raise exception 'ACCOUNT_DELETION_PURGE_IN_PROGRESS';
    end if;
    -- A reactivation fence also blocks SECURITY DEFINER deletion paths. Unlike
    -- purge, no finalizer legitimately deletes while this token exists.
    if old.deletion_reactivation_token is not null then
      raise exception 'ACCOUNT_DELETION_REACTIVATION_IN_PROGRESS';
    end if;
    return old;
  end if;

  if (new.deletion_purge_token is null)
       <> (new.deletion_purge_claimed_at is null)
     or (new.deletion_reactivation_token is null)
       <> (new.deletion_reactivation_started_at is null)
     or (
       new.deletion_purge_token is not null
       and new.deletion_reactivation_token is not null
     )
     then
    raise exception 'ACCOUNT_DELETION_CLAIM_INVALID';
  end if;

  if new.deletion_purge_token is not null
     and new.deletion_scheduled_at is null then
    raise exception 'ACCOUNT_DELETION_PURGE_IN_PROGRESS';
  end if;
  if new.deletion_reactivation_token is not null
     and new.deletion_scheduled_at is null then
    raise exception 'ACCOUNT_DELETION_REACTIVATION_IN_PROGRESS';
  end if;

  if tg_op = 'INSERT' then
    -- Neither worker state may be manufactured as part of a normal profile
    -- insert. The service RPCs claim only pre-existing scheduled rows.
    if (new.deletion_purge_token is not null
        or new.deletion_reactivation_token is not null)
       and current_user <> 'postgres' then
      raise exception 'ACCOUNT_DELETION_CLAIM_FORBIDDEN';
    end if;
    return new;
  end if;

  v_purge_fields_changed :=
    new.deletion_purge_token is distinct from old.deletion_purge_token
    or new.deletion_purge_claimed_at is distinct from old.deletion_purge_claimed_at;
  v_reactivation_fields_changed :=
    new.deletion_reactivation_token is distinct from old.deletion_reactivation_token
    or new.deletion_reactivation_started_at is distinct from old.deletion_reactivation_started_at;
  v_schedule_changed :=
    new.deletion_scheduled_at is distinct from old.deletion_scheduled_at
    or new.deletion_requested_at is distinct from old.deletion_requested_at
    or new.deletion_source is distinct from old.deletion_source;
  v_identity_changed :=
    new.id is distinct from old.id
    or new.user_id is distinct from old.user_id;
  v_instance_changed :=
    new.whatsmiau_instance is distinct from old.whatsmiau_instance
    or new.whatsmiau_connected is distinct from old.whatsmiau_connected
    or new.whatsmiau_phone is distinct from old.whatsmiau_phone;

  if (v_purge_fields_changed or v_reactivation_fields_changed)
     and not v_is_privileged then
    raise exception 'ACCOUNT_DELETION_CLAIM_FORBIDDEN';
  end if;

  if v_identity_changed
     and (
       old.deletion_purge_token is not null
       or new.deletion_purge_token is not null
       or old.deletion_reactivation_token is not null
       or new.deletion_reactivation_token is not null
     ) then
    raise exception 'ACCOUNT_DELETION_IDENTITY_FENCED';
  end if;

  if old.deletion_purge_token is not null
     or new.deletion_purge_token is not null then
    if old.deletion_reactivation_token is not null
       or new.deletion_reactivation_token is not null then
      raise exception 'ACCOUNT_DELETION_CLAIM_INVALID';
    end if;

    if old.deletion_purge_token is null then
      -- A new purge claim never changes the scheduled account or its dedicated
      -- provider pointer, and only due rows may be claimed.
      if v_schedule_changed
         or v_identity_changed
         or v_instance_changed
         or new.deletion_scheduled_at > clock_timestamp() then
        raise exception 'ACCOUNT_DELETION_CLAIM_INVALID';
      end if;
    else
      -- Purge claims are not released in place. Successful finalization deletes
      -- the row; failures retain the token until a later stale takeover.
      if new.deletion_purge_token is null then
        raise exception 'ACCOUNT_DELETION_CLAIM_RELEASE_FORBIDDEN';
      end if;

      if v_schedule_changed then
        raise exception 'ACCOUNT_DELETION_PURGE_IN_PROGRESS';
      end if;

      if new.deletion_purge_token is distinct from old.deletion_purge_token then
        if old.deletion_purge_claimed_at is null
           or old.deletion_purge_claimed_at >=
             clock_timestamp() - interval '30 minutes' then
          raise exception 'ACCOUNT_DELETION_CLAIM_ACTIVE';
        end if;
        if v_instance_changed
           or new.deletion_purge_claimed_at <= old.deletion_purge_claimed_at then
          raise exception 'ACCOUNT_DELETION_CLAIM_INVALID';
        end if;
      elsif new.deletion_purge_claimed_at is distinct from
            old.deletion_purge_claimed_at then
        -- Renewal and instance cleanup are deliberately separate effects. This
        -- makes the worker prove ownership again before each provider action.
        if v_instance_changed
           or new.deletion_purge_claimed_at < old.deletion_purge_claimed_at then
          raise exception 'ACCOUNT_DELETION_CLAIM_INVALID';
        end if;
      elsif v_instance_changed then
        if not (
          v_is_privileged
          and old.whatsmiau_instance is not null
          and new.whatsmiau_instance is null
          and new.whatsmiau_connected is false
          and new.whatsmiau_phone is null
          and new.deletion_purge_token = old.deletion_purge_token
        ) then
          raise exception 'ACCOUNT_DELETION_INSTANCE_FENCED';
        end if;
      end if;
    end if;

    return new;
  end if;

  if old.deletion_reactivation_token is not null
     or new.deletion_reactivation_token is not null then
    if old.deletion_purge_token is not null
       or new.deletion_purge_token is not null then
      raise exception 'ACCOUNT_DELETION_CLAIM_INVALID';
    end if;

    if old.deletion_reactivation_token is null then
      -- Beginning reactivation only acquires the fence; it intentionally keeps
      -- the schedule intact until the provider confirms success.
      if v_schedule_changed or v_identity_changed or v_instance_changed then
        raise exception 'ACCOUNT_DELETION_REACTIVATION_IN_PROGRESS';
      end if;
    elsif new.deletion_reactivation_token is null then
      if v_identity_changed or v_instance_changed then
        raise exception 'ACCOUNT_DELETION_REACTIVATION_IN_PROGRESS';
      end if;

      -- Clearing the exact token has two legal shapes: abort leaves the full
      -- schedule unchanged; complete atomically clears all scheduling fields.
      if v_schedule_changed
         and not (
           new.deletion_scheduled_at is null
           and new.deletion_requested_at is null
           and new.deletion_source is null
         ) then
        raise exception 'ACCOUNT_DELETION_REACTIVATION_IN_PROGRESS';
      end if;
    elsif new.deletion_reactivation_token is distinct from
          old.deletion_reactivation_token then
      -- Unlike purge claims, a reactivation may be retried at the exact
      -- 30-minute boundary. Stripe resume is idempotent on retry.
      if old.deletion_reactivation_started_at is null
         or not (
           old.deletion_reactivation_started_at <= clock_timestamp() - interval '30 minutes'
         ) then
        raise exception 'ACCOUNT_DELETION_REACTIVATION_IN_PROGRESS';
      end if;
      if v_schedule_changed
         or v_identity_changed
         or v_instance_changed
         or new.deletion_reactivation_started_at <=
            old.deletion_reactivation_started_at then
        raise exception 'ACCOUNT_DELETION_CLAIM_INVALID';
      end if;
    else
      -- There is no renewal operation for reactivation. A live token either
      -- completes, aborts, or is replaced by a retry after it becomes stale.
      if new.deletion_reactivation_started_at is distinct from
           old.deletion_reactivation_started_at
         or v_schedule_changed
         or v_identity_changed
         or v_instance_changed then
        raise exception 'ACCOUNT_DELETION_REACTIVATION_IN_PROGRESS';
      end if;
    end if;

    return new;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_account_deletion_purge_state() from public;

create trigger guard_account_deletion_purge_state
before insert or update or delete on public.empresa_perfil
for each row execute function public.guard_account_deletion_purge_state();

create function public.claim_due_account_deletions(p_limit integer default 50)
returns table (
  empresa_id uuid,
  user_id uuid,
  deletion_scheduled_at timestamptz,
  whatsmiau_instance text,
  purge_token uuid
)
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'ACCOUNT_DELETION_SERVICE_ROLE_REQUIRED';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'ACCOUNT_DELETION_INVALID_LIMIT';
  end if;

  return query
  with candidates as materialized (
    select ep.id
    from public.empresa_perfil ep
    where ep.deletion_scheduled_at <= clock_timestamp()
      and ep.deletion_reactivation_token is null
      and (
        ep.deletion_purge_token is null
        or ep.deletion_purge_claimed_at < clock_timestamp() - interval '30 minutes'
      )
    order by (ep.deletion_purge_token is not null), ep.deletion_scheduled_at, ep.id
    for update of ep skip locked
    limit p_limit
  ), claimed as (
    update public.empresa_perfil ep
    set deletion_purge_token = gen_random_uuid(),
        deletion_purge_claimed_at = clock_timestamp()
    from candidates c
    where ep.id = c.id
      and ep.deletion_reactivation_token is null
    returning
      ep.id,
      ep.user_id,
      ep.deletion_scheduled_at,
      ep.whatsmiau_instance,
      ep.deletion_purge_token
  )
  select
    c.id,
    c.user_id,
    c.deletion_scheduled_at,
    c.whatsmiau_instance,
    c.deletion_purge_token
  from claimed c
  order by c.deletion_scheduled_at, c.id;
end;
$$;

create function public.renew_account_deletion_claim(
  p_empresa_id uuid,
  p_user_id uuid,
  p_purge_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_renewed boolean;
begin
  if current_user <> 'service_role' then
    raise exception 'ACCOUNT_DELETION_SERVICE_ROLE_REQUIRED';
  end if;

  update public.empresa_perfil ep
  set deletion_purge_claimed_at = clock_timestamp()
  where ep.id = p_empresa_id
    and ep.user_id = p_user_id
    and ep.deletion_purge_token = p_purge_token
    and ep.deletion_reactivation_token is null
    and ep.deletion_scheduled_at <= clock_timestamp()
    and ep.deletion_purge_claimed_at >= clock_timestamp() - interval '30 minutes'
  returning true into v_renewed;

  return coalesce(v_renewed, false);
end;
$$;

create function public.begin_account_deletion_reactivation(
  p_empresa_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row public.empresa_perfil%rowtype;
  v_reactivation_token uuid;
begin
  if current_user <> 'service_role' then
    raise exception 'ACCOUNT_DELETION_SERVICE_ROLE_REQUIRED';
  end if;

  select ep.*
  into v_row
  from public.empresa_perfil ep
  where ep.id = p_empresa_id
    and ep.user_id = p_user_id
  for update of ep;

  if not found or v_row.deletion_scheduled_at is null then
    return null;
  end if;
  if v_row.deletion_purge_token is not null then
    raise exception 'ACCOUNT_DELETION_PURGE_IN_PROGRESS';
  end if;
  if v_row.deletion_reactivation_token is not null
     and v_row.deletion_reactivation_started_at > clock_timestamp() - interval '30 minutes' then
    raise exception 'ACCOUNT_DELETION_REACTIVATION_IN_PROGRESS';
  end if;

  v_reactivation_token := gen_random_uuid();

  update public.empresa_perfil ep
  set deletion_reactivation_token = v_reactivation_token,
      deletion_reactivation_started_at = clock_timestamp()
  where ep.id = p_empresa_id
    and ep.user_id = p_user_id
    and ep.deletion_purge_token is null
    and ep.deletion_scheduled_at is not null;

  return v_reactivation_token;
end;
$$;

create function public.complete_account_deletion_reactivation(
  p_empresa_id uuid,
  p_user_id uuid,
  p_reactivation_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_completed boolean;
begin
  if current_user <> 'service_role' then
    raise exception 'ACCOUNT_DELETION_SERVICE_ROLE_REQUIRED';
  end if;

  update public.empresa_perfil ep
  set deletion_scheduled_at = null,
      deletion_requested_at = null,
      deletion_source = null,
      deletion_reactivation_token = null,
      deletion_reactivation_started_at = null
  where ep.id = p_empresa_id
    and ep.user_id = p_user_id
    and ep.deletion_reactivation_token = p_reactivation_token
    and ep.deletion_purge_token is null
  returning true into v_completed;

  return coalesce(v_completed, false);
end;
$$;

create function public.abort_account_deletion_reactivation(
  p_empresa_id uuid,
  p_user_id uuid,
  p_reactivation_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_aborted boolean;
begin
  if current_user <> 'service_role' then
    raise exception 'ACCOUNT_DELETION_SERVICE_ROLE_REQUIRED';
  end if;

  update public.empresa_perfil ep
  set deletion_reactivation_token = null,
      deletion_reactivation_started_at = null
  where ep.id = p_empresa_id
    and ep.user_id = p_user_id
    and ep.deletion_reactivation_token = p_reactivation_token
    and ep.deletion_purge_token is null
  returning true into v_aborted;

  return coalesce(v_aborted, false);
end;
$$;

create function public.finalize_claimed_account_deletion(
  p_empresa_id uuid,
  p_user_id uuid,
  p_purge_token uuid
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row public.empresa_perfil%rowtype;
begin
  -- In a SECURITY DEFINER function current_user is postgres. PostgreSQL keeps
  -- the caller's SET ROLE value, which PostgREST sets from the JWT role.
  if current_setting('role', true) is distinct from 'service_role' then
    raise exception 'ACCOUNT_DELETION_SERVICE_ROLE_REQUIRED';
  end if;

  select ep.*
  into v_row
  from public.empresa_perfil ep
  where ep.id = p_empresa_id
    and ep.user_id = p_user_id
  for update of ep;

  if not found
     or v_row.deletion_purge_token is distinct from p_purge_token
     or v_row.deletion_reactivation_token is not null
     or v_row.deletion_purge_claimed_at is null
     or v_row.deletion_purge_claimed_at <= clock_timestamp() - interval '30 minutes'
     or v_row.deletion_scheduled_at is null
     or v_row.deletion_scheduled_at > clock_timestamp()
     or v_row.whatsmiau_instance is not null then
    return false;
  end if;

  perform public.delete_account(p_user_id, 'grace-purge');
  return true;
end;
$$;

revoke all on function public.claim_due_account_deletions(integer) from public;
revoke execute on function public.claim_due_account_deletions(integer) from anon, authenticated;
grant execute on function public.claim_due_account_deletions(integer) to service_role;

revoke all on function public.renew_account_deletion_claim(uuid,uuid,uuid) from public;
revoke execute on function public.renew_account_deletion_claim(uuid,uuid,uuid) from anon, authenticated;
grant execute on function public.renew_account_deletion_claim(uuid,uuid,uuid) to service_role;

revoke all on function public.begin_account_deletion_reactivation(uuid,uuid) from public;
revoke execute on function public.begin_account_deletion_reactivation(uuid,uuid) from anon, authenticated;
grant execute on function public.begin_account_deletion_reactivation(uuid,uuid) to service_role;

revoke all on function public.complete_account_deletion_reactivation(uuid,uuid,uuid) from public;
revoke execute on function public.complete_account_deletion_reactivation(uuid,uuid,uuid) from anon, authenticated;
grant execute on function public.complete_account_deletion_reactivation(uuid,uuid,uuid) to service_role;

revoke all on function public.abort_account_deletion_reactivation(uuid,uuid,uuid) from public;
revoke execute on function public.abort_account_deletion_reactivation(uuid,uuid,uuid) from anon, authenticated;
grant execute on function public.abort_account_deletion_reactivation(uuid,uuid,uuid) to service_role;

revoke all on function public.finalize_claimed_account_deletion(uuid,uuid,uuid) from public;
revoke execute on function public.finalize_claimed_account_deletion(uuid,uuid,uuid) from anon, authenticated;
grant execute on function public.finalize_claimed_account_deletion(uuid,uuid,uuid) to service_role;

commit;

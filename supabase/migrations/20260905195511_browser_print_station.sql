-- Browser print station queue. Direct table access is intentionally disabled;
-- authenticated clients can only use the owner-scoped RPCs below.

create table public.zelo_print_stations (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  label text not null default 'Computador de impressão',
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, id),
  constraint zelo_print_stations_label_check
    check (length(btrim(label)) between 1 and 80)
);

create index zelo_print_stations_heartbeat_idx
  on public.zelo_print_stations (owner_user_id, enabled, last_seen_at desc);

create table public.zelo_print_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  client_job_id uuid not null,
  job_type text not null,
  payload jsonb not null,
  status text not null default 'pending',
  station_id uuid,
  claimed_at timestamptz,
  attempts integer not null default 0,
  error_code text,
  error_message text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint zelo_print_jobs_client_job_unique
    unique (owner_user_id, client_job_id),
  constraint zelo_print_jobs_type_check
    check (job_type in ('receipt', 'kitchen_order')),
  constraint zelo_print_jobs_payload_object_check
    check (jsonb_typeof(payload) = 'object'),
  constraint zelo_print_jobs_payload_size_check
    check (octet_length(payload::text) <= 262144),
  constraint zelo_print_jobs_status_check
    check (status in ('pending', 'claimed', 'spooled', 'failed', 'unknown', 'expired')),
  constraint zelo_print_jobs_attempts_check
    check (attempts >= 0)
);

create index zelo_print_jobs_claim_idx
  on public.zelo_print_jobs (owner_user_id, status, created_at)
  where status = 'pending';

create index zelo_print_jobs_expiry_idx
  on public.zelo_print_jobs (expires_at)
  where status in ('pending', 'claimed');

create index zelo_print_jobs_station_idx
  on public.zelo_print_jobs (owner_user_id, station_id, claimed_at)
  where status = 'claimed';

create index zelo_print_jobs_cleanup_idx
  on public.zelo_print_jobs (completed_at)
  where status in ('spooled', 'failed', 'unknown', 'expired');

alter table public.zelo_print_stations enable row level security;
alter table public.zelo_print_jobs enable row level security;

revoke all on table public.zelo_print_stations from public, anon, authenticated;
revoke all on table public.zelo_print_jobs from public, anon, authenticated;
grant all on table public.zelo_print_stations to service_role;
grant all on table public.zelo_print_jobs to service_role;

create or replace function public.heartbeat_zelo_print_station_v1(
  p_station_id uuid,
  p_label text,
  p_enabled boolean default true
)
returns table (
  station_id uuid,
  owner_user_id uuid,
  enabled boolean,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_owner_user_id uuid;
  v_label text := btrim(coalesce(p_label, ''));
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_station_id is null then
    raise exception 'PRINT_STATION_ID_REQUIRED' using errcode = '22023';
  end if;

  if length(v_label) not between 1 and 80 then
    raise exception 'PRINT_STATION_LABEL_INVALID' using errcode = '22023';
  end if;

  v_owner_user_id := public.get_owner_user_id(v_actor_user_id);

  if v_actor_user_id <> v_owner_user_id then
    raise exception 'PRINT_STATION_OWNER_REQUIRED' using errcode = '42501';
  end if;

  insert into public.zelo_print_stations as stations (
    owner_user_id,
    id,
    actor_user_id,
    label,
    enabled,
    last_seen_at,
    updated_at
  ) values (
    v_owner_user_id,
    p_station_id,
    v_actor_user_id,
    v_label,
    coalesce(p_enabled, true),
    now(),
    now()
  )
  on conflict on constraint zelo_print_stations_pkey do update
  set actor_user_id = excluded.actor_user_id,
      label = excluded.label,
      enabled = excluded.enabled,
      last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at;

  return query
  select stations.id, stations.owner_user_id, stations.enabled, stations.last_seen_at
  from public.zelo_print_stations as stations
  where stations.owner_user_id = v_owner_user_id
    and stations.id = p_station_id;
end;
$$;

create or replace function public.enqueue_zelo_print_job_v1(
  p_client_job_id uuid,
  p_job_type text,
  p_payload jsonb,
  p_expires_at timestamptz default (now() + interval '2 hours')
)
returns table (
  job_id uuid,
  job_status text,
  station_online boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_owner_user_id uuid;
  v_job public.zelo_print_jobs%rowtype;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_client_job_id is null then
    raise exception 'PRINT_CLIENT_JOB_ID_REQUIRED' using errcode = '22023';
  end if;

  if p_job_type is null
     or p_job_type not in ('receipt', 'kitchen_order') then
    raise exception 'PRINT_JOB_TYPE_INVALID' using errcode = '22023';
  end if;

  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 262144 then
    raise exception 'PRINT_JOB_PAYLOAD_INVALID' using errcode = '22023';
  end if;

  if p_payload->>'jobId' <> p_client_job_id::text
     or p_payload->>'type' <> p_job_type
     or p_payload->>'source' <> 'zelopdv'
     or jsonb_typeof(p_payload->'content') <> 'object' then
    raise exception 'PRINT_JOB_ENVELOPE_INVALID' using errcode = '22023';
  end if;

  if p_payload ?| array['printerId', 'printerName', 'url', 'endpoint'] then
    raise exception 'PRINT_JOB_DESTINATION_FORBIDDEN' using errcode = '22023';
  end if;

  if p_expires_at is null
     or p_expires_at <= now()
     or p_expires_at > now() + interval '2 hours 5 minutes' then
    raise exception 'PRINT_JOB_EXPIRY_INVALID' using errcode = '22023';
  end if;

  v_owner_user_id := public.get_owner_user_id(v_actor_user_id);

  insert into public.zelo_print_jobs (
    owner_user_id,
    requested_by,
    client_job_id,
    job_type,
    payload,
    expires_at
  ) values (
    v_owner_user_id,
    v_actor_user_id,
    p_client_job_id,
    p_job_type,
    p_payload,
    p_expires_at
  )
  on conflict (owner_user_id, client_job_id) do nothing;

  select jobs.*
  into v_job
  from public.zelo_print_jobs as jobs
  where jobs.owner_user_id = v_owner_user_id
    and jobs.client_job_id = p_client_job_id;

  if v_job.job_type <> p_job_type or v_job.payload <> p_payload then
    raise exception 'PRINT_JOB_IDEMPOTENCY_CONFLICT' using errcode = '23505';
  end if;

  return query
  select
    v_job.id,
    v_job.status,
    exists (
      select 1
      from public.zelo_print_stations as stations
      where stations.owner_user_id = v_owner_user_id
        and stations.enabled
        and stations.last_seen_at >= now() - interval '45 seconds'
    );
end;
$$;

create or replace function public.claim_zelo_print_jobs_v1(
  p_station_id uuid,
  p_limit integer default 10
)
returns table (
  id uuid,
  job_type text,
  payload jsonb,
  attempts integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_owner_user_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 25);
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  v_owner_user_id := public.get_owner_user_id(v_actor_user_id);

  if v_actor_user_id <> v_owner_user_id then
    raise exception 'PRINT_STATION_OWNER_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.zelo_print_stations as stations
    where stations.owner_user_id = v_owner_user_id
      and stations.id = p_station_id
      and stations.enabled
      and stations.last_seen_at >= now() - interval '45 seconds'
  ) then
    raise exception 'PRINT_STATION_OFFLINE' using errcode = '22023';
  end if;

  update public.zelo_print_jobs as jobs
  set status = 'expired',
      completed_at = now(),
      updated_at = now(),
      error_code = 'PRINT_JOB_EXPIRED',
      error_message = 'A impressão expirou antes de ser processada.'
  where jobs.owner_user_id = v_owner_user_id
    and jobs.status = 'pending'
    and jobs.expires_at <= now();

  -- A station that disappears after claiming may already have sent the job to
  -- the local agent. Mark it unknown instead of retrying and risking a duplicate.
  update public.zelo_print_jobs as jobs
  set status = 'unknown',
      completed_at = now(),
      updated_at = now(),
      error_code = 'PRINT_OUTCOME_UNKNOWN',
      error_message = 'A estação parou de responder durante a impressão.'
  where jobs.owner_user_id = v_owner_user_id
    and jobs.status = 'claimed'
    and jobs.claimed_at < now() - interval '2 minutes';

  delete from public.zelo_print_jobs as jobs
  where jobs.owner_user_id = v_owner_user_id
    and jobs.status in ('spooled', 'failed', 'unknown', 'expired')
    and jobs.completed_at < now() - interval '7 days';

  return query
  with candidates as materialized (
    select jobs.id
    from public.zelo_print_jobs as jobs
    where jobs.owner_user_id = v_owner_user_id
      and jobs.status = 'pending'
      and jobs.expires_at > now()
    order by jobs.created_at, jobs.id
    for update skip locked
    limit v_limit
  ), claimed as (
    update public.zelo_print_jobs as jobs
    set status = 'claimed',
        station_id = p_station_id,
        claimed_at = now(),
        attempts = jobs.attempts + 1,
        updated_at = now(),
        error_code = null,
        error_message = null
    from candidates
    where jobs.id = candidates.id
    returning jobs.id, jobs.job_type, jobs.payload, jobs.attempts, jobs.expires_at
  )
  select claimed.id, claimed.job_type, claimed.payload, claimed.attempts, claimed.expires_at
  from claimed;
end;
$$;

create or replace function public.finish_zelo_print_job_v1(
  p_station_id uuid,
  p_job_id uuid,
  p_outcome text,
  p_error_code text default null,
  p_error_message text default null
)
returns table (
  job_id uuid,
  job_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_owner_user_id uuid;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_outcome is null or p_outcome not in ('spooled', 'retry', 'failed', 'unknown') then
    raise exception 'PRINT_JOB_OUTCOME_INVALID' using errcode = '22023';
  end if;

  v_owner_user_id := public.get_owner_user_id(v_actor_user_id);

  if v_actor_user_id <> v_owner_user_id then
    raise exception 'PRINT_STATION_OWNER_REQUIRED' using errcode = '42501';
  end if;

  return query
  update public.zelo_print_jobs as jobs
  set status = case
        when p_outcome = 'retry' and jobs.expires_at <= now() then 'expired'
        when p_outcome = 'retry' and jobs.attempts < 3 then 'pending'
        when p_outcome = 'retry' then 'failed'
        else p_outcome
      end,
      station_id = case
        when p_outcome = 'retry' and jobs.expires_at > now() and jobs.attempts < 3 then null
        else jobs.station_id
      end,
      claimed_at = case
        when p_outcome = 'retry' and jobs.expires_at > now() and jobs.attempts < 3 then null
        else jobs.claimed_at
      end,
      completed_at = case
        when p_outcome = 'retry' and jobs.expires_at > now() and jobs.attempts < 3 then null
        else now()
      end,
      updated_at = now(),
      error_code = left(nullif(p_error_code, ''), 80),
      error_message = left(nullif(p_error_message, ''), 500)
  where jobs.owner_user_id = v_owner_user_id
    and jobs.id = p_job_id
    and jobs.status = 'claimed'
    and jobs.station_id = p_station_id
  returning jobs.id, jobs.status;

  if not found then
    raise exception 'PRINT_JOB_NOT_CLAIMED_BY_STATION' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.heartbeat_zelo_print_station_v1(uuid, text, boolean) from public, anon;
revoke all on function public.enqueue_zelo_print_job_v1(uuid, text, jsonb, timestamptz) from public, anon;
revoke all on function public.claim_zelo_print_jobs_v1(uuid, integer) from public, anon;
revoke all on function public.finish_zelo_print_job_v1(uuid, uuid, text, text, text) from public, anon;

grant execute on function public.heartbeat_zelo_print_station_v1(uuid, text, boolean) to authenticated, service_role;
grant execute on function public.enqueue_zelo_print_job_v1(uuid, text, jsonb, timestamptz) to authenticated, service_role;
grant execute on function public.claim_zelo_print_jobs_v1(uuid, integer) to authenticated, service_role;
grant execute on function public.finish_zelo_print_job_v1(uuid, uuid, text, text, text) to authenticated, service_role;

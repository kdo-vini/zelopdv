-- Avoid PL/pgSQL ambiguity between the RETURNS TABLE owner_user_id output
-- variable and the station column used as an ON CONFLICT arbiter.
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

revoke all on function public.heartbeat_zelo_print_station_v1(uuid, text, boolean) from public, anon;
grant execute on function public.heartbeat_zelo_print_station_v1(uuid, text, boolean) to authenticated, service_role;

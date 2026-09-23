-- admin_replay_ifood_event_v1 / admin_replay_ifood_command_v1 return a
-- column named status. In PL/pgSQL that name is also a variable, so the
-- unqualified `status` in the UPDATE was ambiguous and the admin replay
-- button failed before touching the row. Qualify the target table.
begin;

create or replace function public.admin_replay_ifood_event_v1(
  p_inbox_id uuid
) returns table (
  inbox_id uuid,
  event_id text,
  status text,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;
  if p_inbox_id is null then
    raise exception 'INVALID_INBOX_ID';
  end if;

  update ifood_internal.event_inbox as e
     set status = 'queued',
         attempts = 0,
         next_attempt_at = now(),
         lease_id = null,
         lease_owner = null,
         lease_until = null,
         last_error_code = null,
         last_error = null,
         dead_lettered_at = null,
         updated_at = now()
   where e.id = p_inbox_id
     and e.status in ('failed_retryable', 'dead_letter', 'processing')
   returning e.id into v_id;

  if v_id is null then
    inbox_id := null;
    event_id := null;
    status := null;
    outcome := 'not_replayable';
    return next;
    return;
  end if;

  select e.id, e.event_id, e.status
    into inbox_id, event_id, status
    from ifood_internal.event_inbox as e
   where e.id = v_id;
  outcome := 'requeued';
  return next;
end;
$$;

create or replace function public.admin_replay_ifood_command_v1(
  p_command_id uuid
) returns table (
  command_id uuid,
  status text,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;
  if p_command_id is null then
    raise exception 'INVALID_COMMAND_ID';
  end if;

  update ifood_internal.order_commands as c
     set status = 'queued',
         attempts = 0,
         next_attempt_at = now(),
         lease_id = null,
         lease_owner = null,
         lease_until = null,
         last_error_code = null,
         last_error = null,
         terminal_at = null,
         updated_at = now()
   where c.id = p_command_id
     and c.status in ('failed_retryable', 'failed_terminal', 'expired', 'sending')
   returning c.id into v_id;

  if v_id is null then
    command_id := null;
    status := null;
    outcome := 'not_replayable';
    return next;
    return;
  end if;

  select c.id, c.status
    into command_id, status
    from ifood_internal.order_commands as c
   where c.id = v_id;
  outcome := 'requeued';
  return next;
end;
$$;

revoke all on function public.admin_replay_ifood_event_v1(uuid) from public, anon, authenticated;
grant execute on function public.admin_replay_ifood_event_v1(uuid) to service_role;

revoke all on function public.admin_replay_ifood_command_v1(uuid) from public, anon, authenticated;
grant execute on function public.admin_replay_ifood_command_v1(uuid) to service_role;

commit;

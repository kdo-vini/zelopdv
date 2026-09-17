-- iFood admin operations console RPCs (Task 19).
--
-- The admin dashboard has no PostgREST exposure into `ifood_internal`
-- (same reason Task 17 needed its own RPCs) and, unlike the self-service
-- APIs, is not scoped to a single `empresa_id` — it is a cross-tenant
-- operational view for the ZeloPDV team, not the merchant owner. Every RPC
-- here still enforces the `service_role`-only ACL; "is this caller actually
-- a super admin" is checked in `admin-dashboard/src/lib/server/ifoodOperations.js`
-- before any of these RPCs are called, exactly like the existing
-- `src/routes/api/admin/billing/*` handlers in the main app.
--
-- No raw `payload` (webhook body) is ever returned — only counts, statuses
-- and timestamps, so this stays free of customer/order PII even though it
-- is a cross-tenant read.
--
-- This migration is local-only: it has never been applied to any shared
-- database.
begin;

create or replace function public.admin_ifood_connections_overview_v1()
returns table (
  connection_id uuid,
  empresa_id uuid,
  merchant_id text,
  status text,
  print_owner text,
  last_webhook_at timestamptz,
  last_poll_at timestamptz,
  last_token_at timestamptz,
  worker_heartbeat_at timestamptz,
  queued_events integer,
  dead_letter_events integer,
  queued_commands integer,
  failed_commands integer,
  unmapped_products integer,
  last_event_received_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    c.id,
    c.empresa_id,
    c.merchant_id,
    c.status,
    c.print_owner,
    c.last_webhook_at,
    c.last_poll_at,
    c.last_token_at,
    c.worker_heartbeat_at,
    coalesce(events.queued, 0)::integer,
    coalesce(events.dead_letter, 0)::integer,
    coalesce(commands.queued, 0)::integer,
    coalesce(commands.failed, 0)::integer,
    coalesce(mappings.unmapped, 0)::integer,
    events.last_received_at,
    c.created_at,
    c.updated_at
  from ifood_internal.connections as c
  left join lateral (
    select
      count(*) filter (where e.status in ('queued', 'failed_retryable', 'processing')) as queued,
      count(*) filter (where e.status = 'dead_letter') as dead_letter,
      max(e.received_at) as last_received_at
    from ifood_internal.event_inbox as e
    where e.connection_id = c.id
  ) as events on true
  left join lateral (
    select
      count(*) filter (where cmd.status in ('queued', 'failed_retryable', 'sending')) as queued,
      count(*) filter (where cmd.status = 'failed_terminal') as failed
    from ifood_internal.order_commands as cmd
    where cmd.connection_id = c.id
  ) as commands on true
  left join lateral (
    select count(*) as unmapped
    from ifood_internal.product_mappings as m
    where m.connection_id = c.id
      and m.mapping_status = 'suggested'
  ) as mappings on true
  order by c.updated_at desc;
end;
$$;

-- Kill switch: pause/resume/revoke a connection by id, addressed directly
-- (unlike the self-service `upsert_ifood_connection_v1`, which is scoped
-- by `empresa_id` and infers the target row) so the admin acts on the
-- exact row shown in the overview, never on "whichever connection this
-- empresa currently has".
create or replace function public.admin_set_ifood_connection_status_v1(
  p_connection_id uuid,
  p_status text
) returns table (
  connection_id uuid,
  merchant_id text,
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
  if p_connection_id is null then
    raise exception 'INVALID_CONNECTION_ID';
  end if;
  if p_status not in ('active', 'paused', 'revoked') then
    raise exception 'INVALID_STATUS';
  end if;

  update ifood_internal.connections
     set status = p_status,
         updated_at = now()
   where id = p_connection_id
   returning id into v_id;

  if v_id is null then
    connection_id := null;
    merchant_id := null;
    status := null;
    outcome := 'not_found';
    return next;
    return;
  end if;

  select c.id, c.merchant_id, c.status
    into connection_id, merchant_id, status
    from ifood_internal.connections as c
   where c.id = v_id;
  outcome := 'updated';
  return next;
end;
$$;

-- Replay: resets the SAME event row to a fresh, immediately claimable
-- state. Never inserts a new inbox row and never accepts a payload from
-- the caller — only an id. Attempts are reset to 0 deliberately: a manual
-- admin replay is an explicit "give this one more real chance", not a
-- silent retry the worker already exhausted.
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

  update ifood_internal.event_inbox
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
   where id = p_inbox_id
     and status in ('failed_retryable', 'dead_letter', 'processing')
   returning id into v_id;

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

-- Same replay contract as above, for the command queue.
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

  update ifood_internal.order_commands
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
   where id = p_command_id
     and status in ('failed_retryable', 'failed_terminal', 'expired', 'sending')
   returning id into v_id;

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

-- Sanitized list of replayable inbox/command rows for one connection.
-- Never returns payload bodies — only ids, types, statuses and truncated errors.
create or replace function public.admin_list_ifood_replayable_v1(
  p_connection_id uuid
) returns table (
  kind text,
  row_id uuid,
  external_ref text,
  status text,
  attempts integer,
  last_error_code text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;
  if p_connection_id is null then
    raise exception 'INVALID_CONNECTION_ID';
  end if;

  return query
  select
    'event'::text,
    e.id,
    e.event_id,
    e.status,
    e.attempts,
    e.last_error_code,
    e.updated_at
  from ifood_internal.event_inbox as e
  where e.connection_id = p_connection_id
    and e.status in ('failed_retryable', 'dead_letter', 'processing')
  union all
  select
    'command'::text,
    c.id,
    c.intent,
    c.status,
    c.attempts,
    c.last_error_code,
    c.updated_at
  from ifood_internal.order_commands as c
  where c.connection_id = p_connection_id
    and c.status in ('failed_retryable', 'failed_terminal', 'expired', 'sending')
  order by 7 desc
  limit 100;
end;
$$;

revoke all on function public.admin_ifood_connections_overview_v1() from public, anon, authenticated;
revoke all on function public.admin_set_ifood_connection_status_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_replay_ifood_event_v1(uuid) from public, anon, authenticated;
revoke all on function public.admin_replay_ifood_command_v1(uuid) from public, anon, authenticated;
revoke all on function public.admin_list_ifood_replayable_v1(uuid) from public, anon, authenticated;
grant execute on function public.admin_ifood_connections_overview_v1() to service_role;
grant execute on function public.admin_set_ifood_connection_status_v1(uuid, text) to service_role;
grant execute on function public.admin_replay_ifood_event_v1(uuid) to service_role;
grant execute on function public.admin_replay_ifood_command_v1(uuid) to service_role;
grant execute on function public.admin_list_ifood_replayable_v1(uuid) to service_role;

commit;

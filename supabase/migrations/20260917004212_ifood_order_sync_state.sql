-- Read-only, tenant-scoped iFood state for the browser order queues.
-- Private provider and command details stay inside ifood_internal.
begin;

create or replace function public.get_ifood_order_sync_state_v1(
  p_empresa_id uuid,
  p_order_ids uuid[]
) returns table (
  zelo_order_id uuid,
  external_status text,
  last_event_at timestamptz,
  connection_status text,
  command_intent text,
  command_status text,
  command_updated_at timestamptz,
  command_error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;

  if p_order_ids is not null and cardinality(p_order_ids) > 200 then
    raise exception 'TOO_MANY_ORDER_IDS';
  end if;

  if p_empresa_id is null or p_order_ids is null or cardinality(p_order_ids) = 0 then
    return;
  end if;

  return query
  select r.zelo_order_id,
         r.external_status,
         r.last_event_at,
         connection_row.status as connection_status,
         command_row.intent as command_intent,
         command_row.status as command_status,
         command_row.updated_at as command_updated_at,
         command_row.last_error_code as command_error_code
    from ifood_internal.order_refs as r
    join ifood_internal.connections as connection_row
      on connection_row.id = r.connection_id
     and connection_row.empresa_id = r.empresa_id
    left join lateral (
      select c.intent, c.status, c.updated_at, c.last_error_code
        from ifood_internal.order_commands as c
       where c.order_ref_id = r.id
         and c.connection_id = r.connection_id
         and c.empresa_id = p_empresa_id
       order by case
                  when c.status in ('queued', 'sending', 'accepted_http', 'failed_retryable')
                    then 1
                  else 0
                end desc,
                c.updated_at desc nulls last,
                c.id desc
       limit 1
    ) as command_row on true
   where r.empresa_id = p_empresa_id
     and r.zelo_order_id = any(p_order_ids);
end;
$$;

comment on function public.get_ifood_order_sync_state_v1(uuid, uuid[]) is
  'Retorna somente o estado sanitizado de sincronizacao iFood dos pedidos da empresa.';

revoke all on function public.get_ifood_order_sync_state_v1(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.get_ifood_order_sync_state_v1(uuid, uuid[]) to service_role;

commit;

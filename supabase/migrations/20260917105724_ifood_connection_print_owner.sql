-- iFood self-service connection: print responsibility RPC (Task 18).
--
-- `ifood_internal.connections.print_owner` already exists (foundation
-- migration, 2026-09-16, default 'zelo') and is already readable through
-- `get_ifood_connection_v1` (Task 17), but nothing outside `ifood_internal`
-- could write it — the setup wizard's "escolher responsável pela impressão"
-- step (design doc, section 3.1, item 6) needs exactly one write path. This
-- mirrors `upsert_ifood_connection_v1`: identity/shape enforcement and the
-- service-role ACL only, no policy (the "who may call this" decision stays
-- in `connectionService.js`, same as every other RPC in this schema).
--
-- This migration is local-only: it has never been applied to any shared
-- database.
begin;

create or replace function public.set_ifood_connection_print_owner_v1(
  p_empresa_id uuid,
  p_print_owner text
) returns table (
  connection_id uuid,
  merchant_id text,
  print_owner text,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing ifood_internal.connections;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;
  if p_empresa_id is null then
    raise exception 'INVALID_EMPRESA_ID';
  end if;
  if p_print_owner not in ('zelo', 'external') then
    raise exception 'INVALID_PRINT_OWNER';
  end if;

  select *
    into v_existing
    from ifood_internal.connections
   where empresa_id = p_empresa_id
   order by created_at desc
   limit 1;

  if v_existing.id is null then
    connection_id := null;
    merchant_id := null;
    print_owner := null;
    outcome := 'not_connected';
    return next;
    return;
  end if;

  update ifood_internal.connections
     set print_owner = p_print_owner,
         updated_at = now()
   where id = v_existing.id;

  connection_id := v_existing.id;
  merchant_id := v_existing.merchant_id;
  print_owner := p_print_owner;
  outcome := 'updated';
  return next;
end;
$$;

revoke all on function public.set_ifood_connection_print_owner_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.set_ifood_connection_print_owner_v1(uuid, text) to service_role;

commit;

-- iFood "excluir configuração": a genuinely destructive action, distinct
-- from the existing pause/resume/disconnect (which only ever flip `status`
-- and always preserve `merchant_id` -- disconnect leaves it `revoked`, which
-- still reserves the id forever so nobody else can claim it, and the same
-- empresa can always retype it to reconnect instantly).
--
-- This RPC deletes the `ifood_internal.connections` row outright. Every
-- child table (`event_inbox`, `order_refs`, `order_commands`,
-- `product_mappings`, `stock_commitments`) references `connections(id)` with
-- `on delete cascade` (see 20260916023512_ifood_mvp_foundation.sql), so this
-- also erases that merchant's command/event audit trail for this empresa --
-- an explicit, confirmed product decision (not a side effect to work around):
-- "excluir configuração" means starting over from zero, including history.
begin;

create or replace function public.delete_ifood_connection_v1(p_empresa_id uuid)
returns table (
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_count integer;
begin
  if coalesce(current_setting('role', true) = 'service_role', false) is not true then
    raise exception 'FORBIDDEN';
  end if;

  delete from ifood_internal.connections
  where empresa_id = p_empresa_id;
  get diagnostics v_deleted_count = row_count;

  return query select case when v_deleted_count > 0 then 'deleted' else 'not_found' end;
end;
$$;

revoke all on function public.delete_ifood_connection_v1(uuid) from public, anon, authenticated;
grant execute on function public.delete_ifood_connection_v1(uuid) to service_role;

commit;

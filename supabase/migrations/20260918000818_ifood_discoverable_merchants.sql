-- iFood discoverable merchants: list every merchant_id already claimed.
--
-- Self-service connect (`connectionService.js`) is about to call iFood's
-- `GET /merchant/v1.0/merchants` (centralized-auth token, already returns
-- every store that has authorized this app across ALL Zelo tenants) so an
-- owner can pick their store from a list instead of typing a merchantId
-- blind. That list has to be filtered down to stores nobody in Zelo has
-- claimed yet, and `ifood_internal` has no PostgREST exposure -- same
-- reason every other cross-cutting read in this schema needed its own
-- service-role-only RPC.
--
-- `ifood_internal.connections.merchant_id` is a plain `UNIQUE` constraint
-- with no status filter, so even a `revoked` row still owns that id
-- forever (Task 17's own upsert function relies on exactly this to reject
-- a re-claim as `merchant_taken`). This RPC mirrors that: it returns every
-- merchant_id in the table regardless of status, never just the
-- non-revoked ones, so the discoverable list can never suggest a store
-- that a write would immediately reject.
--
-- No customer/order data, no empresa_id, nothing per-tenant -- just the
-- bare ids needed to filter a list, which is why this is safe to call
-- without empresa scoping (unlike every other RPC in this schema, which is
-- scoped to a single empresa_id).
--
-- This migration is local-only: it has never been applied to any shared
-- database.
begin;

create or replace function public.list_ifood_claimed_merchant_ids_v1()
returns table (
  merchant_id text
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
  select c.merchant_id
  from ifood_internal.connections as c;
end;
$$;

revoke all on function public.list_ifood_claimed_merchant_ids_v1() from public, anon, authenticated;
grant execute on function public.list_ifood_claimed_merchant_ids_v1() to service_role;

commit;

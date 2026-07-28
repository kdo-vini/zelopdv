-- Harden the table-capability boundary created by ZeloMenu's transactional checkout.
-- The table is server-owned: browser roles must not read or mutate capabilities.

begin;

alter table public.zelomenu_table_capabilities enable row level security;

revoke all on table public.zelomenu_table_capabilities from public, anon, authenticated;
grant all on table public.zelomenu_table_capabilities to service_role;

revoke all on function public.issue_table_capability(uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.revoke_table_capability(uuid)
  from public, anon, authenticated;

grant execute on function public.issue_table_capability(uuid, uuid, uuid, text, timestamptz)
  to service_role;
grant execute on function public.revoke_table_capability(uuid)
  to service_role;

commit;

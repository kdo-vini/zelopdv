create or replace function public._migration_inspect_function(p_name text)
returns table(definition text)
language sql
security definer
set search_path = pg_catalog
as $$
  select pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = p_name
$$;
revoke all on function public._migration_inspect_function(text) from public, anon, authenticated;
grant execute on function public._migration_inspect_function(text) to service_role;

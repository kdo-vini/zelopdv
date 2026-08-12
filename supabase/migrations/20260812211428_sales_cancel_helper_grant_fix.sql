-- The project default ACL grants EXECUTE explicitly to browser roles when a
-- public function is created. Remove the anonymous RPC surface left by that
-- default while retaining authenticated execution required by RLS policies.
-- Forward-only correction; do not rewrite 20260812210856.

revoke execute on function public.vendas_actor_can_delete(bigint) from public;
revoke execute on function public.vendas_actor_can_delete(bigint) from anon;
grant execute on function public.vendas_actor_can_delete(bigint) to authenticated;
grant execute on function public.vendas_actor_can_delete(bigint) to service_role;

-- Contain two SECURITY DEFINER RPCs that have no repository consumer and
-- otherwise expose cross-tenant/auth metadata through the public Data API.
-- Keep trusted server-side execution and the existing authenticated company
-- membership flow intact.

revoke all on function public.get_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.get_user_id_by_email(text) to service_role;

revoke all on function public.saldo_caixa(bigint) from public, anon, authenticated;
grant execute on function public.saldo_caixa(bigint) to service_role;

-- The browser still uses this RPC from the legacy company-membership screen;
-- remove only anonymous execution and preserve its internal admin/owner guard.
revoke all on function public.add_empresa_membro_por_email(integer, text, text) from public, anon;
grant execute on function public.add_empresa_membro_por_email(integer, text, text) to authenticated, service_role;

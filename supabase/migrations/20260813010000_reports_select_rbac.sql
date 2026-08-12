-- Incremental RBAC containment for report-only cash-closing history.
--
-- Production verification showed that an authenticated sub-user without
-- relatorios.ver could read owner cash-closing history through the Data API.
-- The report route already gates this capability in the UI. This migration
-- moves the same check to the only report-only browser table, without
-- changing shared sales/cash operational reads.
-- Forward-only: never rewrite an applied migration.

drop policy if exists caixa_fechamentos_actor_select on public.caixa_fechamentos;
create policy caixa_fechamentos_actor_select
  on public.caixa_fechamentos
  for select
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('relatorios.ver', id_usuario)
  );

-- No anonymous browser consumer exists for financial closing history. Keep
-- service_role and authenticated table access unchanged for existing server
-- and report paths, while removing the unnecessary anonymous grant.
revoke all on table public.caixa_fechamentos from anon;

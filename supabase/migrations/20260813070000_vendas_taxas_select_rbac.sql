-- Platform fees are financial-report data. Keep the existing owner scope, but
-- require the capability already used by the two browser consumers.
-- Pre-change ACL/policy snapshot and rollback:
-- docs/operations/VENDAS-TAXAS-SELECT-RBAC-SNAPSHOT-2026-08-13.md

revoke select on table public.vendas_taxas_plataforma
from anon;

alter policy vendas_taxas_actor_select
  on public.vendas_taxas_plataforma
  to authenticated
  using (
    get_owner_user_id(auth.uid()) = id_usuario
    and (
      fiado_actor_can('caixa.ver', id_usuario)
      or fiado_actor_can('relatorios.ver', id_usuario)
    )
  );

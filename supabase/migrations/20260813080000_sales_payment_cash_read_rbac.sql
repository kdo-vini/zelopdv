-- Financial read containment for browser roles. Keep the owner scope and the
-- existing write policies; only SELECT predicates and anonymous grants change.
-- Snapshot/rollback: docs/operations/SALES-PAYMENT-CASH-READ-RBAC-SNAPSHOT-2026-08-13.md

revoke select on table
  public.vendas_pagamentos,
  public.caixa_movimentacoes
from anon;

alter policy vendas_pagamentos_actor_select
  on public.vendas_pagamentos
  to authenticated
  using (
    get_owner_user_id(auth.uid()) = id_usuario
    and (
      fiado_actor_can('pdv.acessar', id_usuario)
      or fiado_actor_can('pdv.receber', id_usuario)
      or fiado_actor_can('mesas.acessar', id_usuario)
      or fiado_actor_can('caixa.ver', id_usuario)
      or fiado_actor_can('relatorios.ver', id_usuario)
    )
  );

alter policy caixa_movs_actor_select
  on public.caixa_movimentacoes
  to authenticated
  using (
    get_owner_user_id(auth.uid()) = id_usuario
    and (
      fiado_actor_can('pdv.acessar', id_usuario)
      or fiado_actor_can('caixa.ver', id_usuario)
      or fiado_actor_can('caixa.abrir', id_usuario)
      or fiado_actor_can('caixa.fechar', id_usuario)
      or fiado_actor_can('caixa.movimentar', id_usuario)
      or fiado_actor_can('relatorios.ver', id_usuario)
    )
  );

-- Contain raw sales-history reads for browser roles while preserving every
-- currently consumed PDV, Mesa, cash, reporting and fiado capability.
-- Snapshot/rollback: docs/operations/SALES-HISTORY-READ-RBAC-SNAPSHOT-2026-08-13.md

revoke select on table
  public.vendas,
  public.vendas_itens
from anon;

alter policy vendas_actor_select
  on public.vendas
  to authenticated
  using (
    get_owner_user_id(auth.uid()) = id_usuario
    and (
      fiado_actor_can('pdv.acessar', id_usuario)
      or fiado_actor_can('pdv.vender', id_usuario)
      or fiado_actor_can('pdv.receber', id_usuario)
      or fiado_actor_can('pdv.cancelar', id_usuario)
      or fiado_actor_can('mesas.acessar', id_usuario)
      or fiado_actor_can('mesas.fechar', id_usuario)
      or fiado_actor_can('caixa.abrir', id_usuario)
      or fiado_actor_can('caixa.fechar', id_usuario)
      or fiado_actor_can('caixa.movimentar', id_usuario)
      or fiado_actor_can('caixa.ver', id_usuario)
      or fiado_actor_can('relatorios.ver', id_usuario)
      or fiado_actor_can('relatorios.exportar', id_usuario)
      or fiado_actor_can('fiado.visualizar', id_usuario)
    )
  );

alter policy vendas_itens_actor_select
  on public.vendas_itens
  to authenticated
  using (
    exists (
      select 1
      from public.vendas v
      where v.id = vendas_itens.id_venda
        and v.id_usuario = get_owner_user_id(auth.uid())
        and (
          fiado_actor_can('pdv.acessar', v.id_usuario)
          or fiado_actor_can('pdv.vender', v.id_usuario)
          or fiado_actor_can('pdv.receber', v.id_usuario)
          or fiado_actor_can('pdv.cancelar', v.id_usuario)
          or fiado_actor_can('mesas.acessar', v.id_usuario)
          or fiado_actor_can('mesas.fechar', v.id_usuario)
          or fiado_actor_can('caixa.abrir', v.id_usuario)
          or fiado_actor_can('caixa.fechar', v.id_usuario)
          or fiado_actor_can('caixa.movimentar', v.id_usuario)
          or fiado_actor_can('caixa.ver', v.id_usuario)
          or fiado_actor_can('relatorios.ver', v.id_usuario)
          or fiado_actor_can('relatorios.exportar', v.id_usuario)
          or fiado_actor_can('fiado.visualizar', v.id_usuario)
        )
    )
  );

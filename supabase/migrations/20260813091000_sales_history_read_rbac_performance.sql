-- Follow-up to 20260813090000. The initial containment called the canonical
-- permission helper once per row/capability. Resolve the same permission union
-- once per statement through an uncorrelated init plan, without adding a new
-- SECURITY DEFINER RPC. The authorization result is unchanged.

alter policy vendas_actor_select
  on public.vendas
  to authenticated
  using (
    (select get_owner_user_id(auth.uid())) = id_usuario
    and (
      (select auth.uid()) = id_usuario
      or (
        select exists (
          select 1
          from public.access_users au
          join public.access_roles ar
            on ar.id = au.role_id
           and ar.owner_user_id = au.owner_user_id
          where au.auth_user_id = auth.uid()
            and au.owner_user_id = get_owner_user_id(auth.uid())
            and au.status = 'active'
            and (
              coalesce((ar.permissions ->> 'pdv.acessar')::boolean, false)
              or coalesce((ar.permissions ->> 'pdv.vender')::boolean, false)
              or coalesce((ar.permissions ->> 'pdv.receber')::boolean, false)
              or coalesce((ar.permissions ->> 'pdv.cancelar')::boolean, false)
              or coalesce((ar.permissions ->> 'mesas.acessar')::boolean, false)
              or coalesce((ar.permissions ->> 'mesas.fechar')::boolean, false)
              or coalesce((ar.permissions ->> 'caixa.abrir')::boolean, false)
              or coalesce((ar.permissions ->> 'caixa.fechar')::boolean, false)
              or coalesce((ar.permissions ->> 'caixa.movimentar')::boolean, false)
              or coalesce((ar.permissions ->> 'caixa.ver')::boolean, false)
              or coalesce((ar.permissions ->> 'relatorios.ver')::boolean, false)
              or coalesce((ar.permissions ->> 'relatorios.exportar')::boolean, false)
              or coalesce((ar.permissions ->> 'fiado.visualizar')::boolean, false)
            )
        )
      )
    )
  );

-- The parent vendas policy is the single capability authority. Keeping only
-- the tenant/parent relationship here avoids evaluating the same capability
-- predicate twice for every item.
alter policy vendas_itens_actor_select
  on public.vendas_itens
  to authenticated
  using (
    exists (
      select 1
      from public.vendas v
      where v.id = vendas_itens.id_venda
        and v.id_usuario = (select get_owner_user_id(auth.uid()))
    )
  );

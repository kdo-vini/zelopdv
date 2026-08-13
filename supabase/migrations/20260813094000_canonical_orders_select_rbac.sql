-- Restrict canonical order reads to the two capabilities used by queue and
-- kitchen consumers. Owners retain their existing bypass. Child rows inherit
-- visibility from the already-authorized parent order.

alter policy zelo_orders_owner_select
  on public.zelo_orders
  to authenticated
  using (
    empresa_id in (
      select ep.id
      from public.empresa_perfil ep
      where ep.user_id = (select public.get_owner_user_id(auth.uid()))
    )
    and (
      (select auth.uid()) = (select public.get_owner_user_id(auth.uid()))
      or (
        select exists (
          select 1
          from public.access_users au
          join public.access_roles ar
            on ar.id = au.role_id
           and ar.owner_user_id = au.owner_user_id
          where au.auth_user_id = auth.uid()
            and au.owner_user_id = public.get_owner_user_id(auth.uid())
            and au.status = 'active'
            and (
              coalesce((ar.permissions ->> 'pedidos.acessar')::boolean, false)
              or coalesce((ar.permissions ->> 'pedidos.cozinha')::boolean, false)
            )
        )
      )
    )
  );

alter policy zelo_order_items_owner_select
  on public.zelo_order_items
  to authenticated
  using (
    exists (
      select 1
      from public.zelo_orders o
      where o.id = zelo_order_items.order_id
    )
  );

alter policy zelo_order_events_owner_select
  on public.zelo_order_events
  to authenticated
  using (
    exists (
      select 1
      from public.zelo_orders o
      where o.id = zelo_order_events.order_id
        and o.empresa_id = zelo_order_events.empresa_id
    )
  );

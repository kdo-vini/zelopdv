-- Incremental RBAC containment for partial Mesa payments.
--
-- Production snapshot and consumer/blast-radius analysis:
-- docs/operations/MESAS-PAYMENT-RBAC-SNAPSHOT-2026-08-12.md
--
-- Existing role contracts use `pdv.receber` for the regular cashier and
-- `pedidos.receber` for the canonical-order receiving path. A partial Mesa
-- payment requires both Mesa access and one of those existing receive
-- capabilities. Owners keep the existing bypass through fiado_actor_can;
-- service_role continues to bypass RLS.
-- Forward-only migration: never rewrite an applied migration.

drop policy if exists comanda_pagamentos_actor_insert on public.comanda_pagamentos;
create policy comanda_pagamentos_actor_insert
  on public.comanda_pagamentos
  for insert
  to authenticated
  with check (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('mesas.acessar', id_usuario)
    and (
      public.fiado_actor_can('pdv.receber', id_usuario)
      or public.fiado_actor_can('pedidos.receber', id_usuario)
    )
  );

drop policy if exists comanda_pagamentos_actor_update on public.comanda_pagamentos;
create policy comanda_pagamentos_actor_update
  on public.comanda_pagamentos
  for update
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('mesas.acessar', id_usuario)
    and (
      public.fiado_actor_can('pdv.receber', id_usuario)
      or public.fiado_actor_can('pedidos.receber', id_usuario)
    )
  )
  with check (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('mesas.acessar', id_usuario)
    and (
      public.fiado_actor_can('pdv.receber', id_usuario)
      or public.fiado_actor_can('pedidos.receber', id_usuario)
    )
  );

drop policy if exists comanda_pagamentos_actor_delete on public.comanda_pagamentos;
create policy comanda_pagamentos_actor_delete
  on public.comanda_pagamentos
  for delete
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('mesas.acessar', id_usuario)
    and (
      public.fiado_actor_can('pdv.receber', id_usuario)
      or public.fiado_actor_can('pedidos.receber', id_usuario)
    )
  );

drop policy if exists comanda_pagamento_itens_insert on public.comanda_pagamento_itens;
create policy comanda_pagamento_itens_insert
  on public.comanda_pagamento_itens
  for insert
  to authenticated
  with check (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('mesas.acessar', id_usuario)
    and (
      public.fiado_actor_can('pdv.receber', id_usuario)
      or public.fiado_actor_can('pedidos.receber', id_usuario)
    )
  );

drop policy if exists comanda_pagamento_itens_update on public.comanda_pagamento_itens;
create policy comanda_pagamento_itens_update
  on public.comanda_pagamento_itens
  for update
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('mesas.acessar', id_usuario)
    and (
      public.fiado_actor_can('pdv.receber', id_usuario)
      or public.fiado_actor_can('pedidos.receber', id_usuario)
    )
  )
  with check (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('mesas.acessar', id_usuario)
    and (
      public.fiado_actor_can('pdv.receber', id_usuario)
      or public.fiado_actor_can('pedidos.receber', id_usuario)
    )
  );

drop policy if exists comanda_pagamento_itens_delete on public.comanda_pagamento_itens;
create policy comanda_pagamento_itens_delete
  on public.comanda_pagamento_itens
  for delete
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('mesas.acessar', id_usuario)
    and (
      public.fiado_actor_can('pdv.receber', id_usuario)
      or public.fiado_actor_can('pedidos.receber', id_usuario)
    )
  );

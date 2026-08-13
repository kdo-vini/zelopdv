-- Keep tenant-private Mesas reads behind the existing capability matrix.
-- Owners and service-role retain their current behavior. The reports page
-- still reads closed comanda summaries through relatorios.ver.

revoke all on table
  public.mesas,
  public.comandas,
  public.comanda_itens,
  public.comanda_pagamentos,
  public.comanda_pagamento_itens
from anon;

alter policy mesas_actor_select
  on public.mesas
  using (
    get_owner_user_id(auth.uid()) = id_usuario
    and fiado_actor_can('mesas.acessar', id_usuario)
  );

alter policy comandas_actor_select
  on public.comandas
  using (
    get_owner_user_id(auth.uid()) = id_usuario
    and (
      fiado_actor_can('mesas.acessar', id_usuario)
      or fiado_actor_can('relatorios.ver', id_usuario)
    )
  );

alter policy comanda_itens_actor_select
  on public.comanda_itens
  using (
    exists (
      select 1
      from public.comandas c
      where c.id = comanda_itens.id_comanda
        and c.id_usuario = get_owner_user_id(auth.uid())
        and fiado_actor_can('mesas.acessar', c.id_usuario)
    )
  );

alter policy comanda_pagamentos_actor_select
  on public.comanda_pagamentos
  to authenticated
  using (
    get_owner_user_id(auth.uid()) = id_usuario
    and fiado_actor_can('mesas.acessar', id_usuario)
  );

alter policy comanda_pagamento_itens_select
  on public.comanda_pagamento_itens
  using (
    get_owner_user_id(auth.uid()) = id_usuario
    and fiado_actor_can('mesas.acessar', id_usuario)
  );

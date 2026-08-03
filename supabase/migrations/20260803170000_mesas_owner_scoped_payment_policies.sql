-- Mesas e fechamento: subusuarios gravam em nome do owner da assinatura.
-- As policies anteriores comparavam auth.uid() diretamente com id_usuario e
-- bloqueavam pagamentos parciais/fechamentos feitos por operadores.

begin;

drop policy if exists "Users can insert own comanda_pagamentos" on public.comanda_pagamentos;
drop policy if exists comanda_pagamentos_actor_insert on public.comanda_pagamentos;
create policy comanda_pagamentos_actor_insert
  on public.comanda_pagamentos for insert
  to authenticated
  with check (get_owner_user_id(auth.uid()) = id_usuario);

drop policy if exists usuario_gerencia_suas_vendas_insert on public.vendas;
drop policy if exists vendas_actor_insert on public.vendas;
create policy vendas_actor_insert
  on public.vendas for insert
  to authenticated
  with check (get_owner_user_id(auth.uid()) = id_usuario);

drop policy if exists itens_venda_insert on public.vendas_itens;
drop policy if exists vendas_itens_actor_insert on public.vendas_itens;
create policy vendas_itens_actor_insert
  on public.vendas_itens for insert
  to authenticated
  with check (
    exists (
      select 1
        from public.vendas v
       where v.id = id_venda
         and v.id_usuario = get_owner_user_id(auth.uid())
    )
  );

drop policy if exists vendas_pagamentos_insert on public.vendas_pagamentos;
drop policy if exists vendas_pagamentos_actor_insert on public.vendas_pagamentos;
create policy vendas_pagamentos_actor_insert
  on public.vendas_pagamentos for insert
  to authenticated
  with check (get_owner_user_id(auth.uid()) = id_usuario);

commit;

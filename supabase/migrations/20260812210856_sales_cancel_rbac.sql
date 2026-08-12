-- Sales cancellation/mutation containment: preserve sale creation and reads,
-- but require the existing pdv.cancelar capability for destructive or
-- post-creation financial edits by sub-users. The only compatibility exception
-- is the immediate rollback of an empty sale created by the current operator
-- when the Mesas close flow fails before child rows are inserted.
-- Forward-only migration. Pre-change policies, consumers, and rollback are in
-- docs/operations/SALES-CANCEL-RBAC-SNAPSHOT-2026-08-12.md.

create or replace function public.vendas_actor_can_delete(p_venda_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.vendas v
    where v.id = p_venda_id
      and (
        public.fiado_actor_can('pdv.cancelar', v.id_usuario)
        or (
          v.id_operador = (select auth.uid())
          and v.created_at >= now() - interval '15 minutes'
          and not exists (
            select 1 from public.vendas_itens vi where vi.id_venda = v.id
          )
          and not exists (
            select 1 from public.vendas_pagamentos vp where vp.id_venda = v.id
          )
          and not exists (
            select 1 from public.vendas_taxas_plataforma vt where vt.id_venda = v.id
          )
        )
      )
  );
$$;

revoke all on function public.vendas_actor_can_delete(bigint) from public;
grant execute on function public.vendas_actor_can_delete(bigint) to authenticated;

drop policy if exists vendas_actor_delete on public.vendas;
create policy vendas_actor_delete
  on public.vendas
  for delete
  to authenticated
  using (public.vendas_actor_can_delete(id));

drop policy if exists vendas_actor_update on public.vendas;
create policy vendas_actor_update
  on public.vendas
  for update
  to authenticated
  using (public.fiado_actor_can('pdv.cancelar', id_usuario))
  with check (public.fiado_actor_can('pdv.cancelar', id_usuario));

drop policy if exists vendas_itens_actor_update on public.vendas_itens;
create policy vendas_itens_actor_update
  on public.vendas_itens
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.vendas v
      where v.id = vendas_itens.id_venda
        and public.fiado_actor_can('pdv.cancelar', v.id_usuario)
    )
  )
  with check (
    exists (
      select 1
      from public.vendas v
      where v.id = vendas_itens.id_venda
        and public.fiado_actor_can('pdv.cancelar', v.id_usuario)
    )
  );

drop policy if exists vendas_itens_actor_delete on public.vendas_itens;
create policy vendas_itens_actor_delete
  on public.vendas_itens
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.vendas v
      where v.id = vendas_itens.id_venda
        and public.fiado_actor_can('pdv.cancelar', v.id_usuario)
    )
  );

drop policy if exists vendas_pagamentos_actor_update on public.vendas_pagamentos;
create policy vendas_pagamentos_actor_update
  on public.vendas_pagamentos
  for update
  to authenticated
  using (public.fiado_actor_can('pdv.cancelar', id_usuario))
  with check (public.fiado_actor_can('pdv.cancelar', id_usuario));

drop policy if exists vendas_pagamentos_actor_delete on public.vendas_pagamentos;
create policy vendas_pagamentos_actor_delete
  on public.vendas_pagamentos
  for delete
  to authenticated
  using (public.fiado_actor_can('pdv.cancelar', id_usuario));

drop policy if exists vendas_taxas_actor_delete on public.vendas_taxas_plataforma;
create policy vendas_taxas_actor_delete
  on public.vendas_taxas_plataforma
  for delete
  to authenticated
  using (public.fiado_actor_can('pdv.cancelar', id_usuario));

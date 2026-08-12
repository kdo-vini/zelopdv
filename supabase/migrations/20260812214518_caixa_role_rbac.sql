-- Incremental RBAC containment for cash-box mutations.
--
-- Production verification and consumer/blast-radius snapshot:
-- docs/operations/CAIXA-RBAC-SNAPSHOT-2026-08-12.md
--
-- Keep owner-scoped reads unchanged. Owners retain the existing behavior via
-- fiado_actor_can's owner bypass; service_role continues to bypass RLS. The
-- mutation policies below add the existing role capabilities for sub-users.
-- Forward-only migration: never rewrite an applied migration.

drop policy if exists usuario_gerencia_seus_caixas_insert on public.caixas;
drop policy if exists caixas_actor_insert on public.caixas;
create policy caixas_actor_insert
  on public.caixas
  for insert
  to authenticated
  with check (
    id_usuario = public.get_owner_user_id(auth.uid())
    and public.fiado_actor_can('caixa.abrir', id_usuario)
  );

drop policy if exists caixas_actor_update on public.caixas;
create policy caixas_actor_update
  on public.caixas
  for update
  to authenticated
  using (
    id_usuario = public.get_owner_user_id(auth.uid())
    and public.fiado_actor_can('caixa.fechar', id_usuario)
  )
  with check (
    id_usuario = public.get_owner_user_id(auth.uid())
    and public.fiado_actor_can('caixa.fechar', id_usuario)
  );

drop policy if exists caixas_actor_delete on public.caixas;
create policy caixas_actor_delete
  on public.caixas
  for delete
  to authenticated
  using (id_usuario = auth.uid());

drop policy if exists caixa_movs_actor_insert on public.caixa_movimentacoes;
create policy caixa_movs_actor_insert
  on public.caixa_movimentacoes
  for insert
  to authenticated
  with check (
    id_usuario = public.get_owner_user_id(auth.uid())
    and public.fiado_actor_can('caixa.movimentar', id_usuario)
    and exists (
      select 1
      from public.caixas c
      where c.id = caixa_movimentacoes.id_caixa
        and c.id_usuario = caixa_movimentacoes.id_usuario
        and c.data_fechamento is null
    )
  );

drop policy if exists insert_own_fechamentos on public.caixa_fechamentos;
create policy caixa_fechamentos_actor_insert
  on public.caixa_fechamentos
  for insert
  to authenticated
  with check (
    id_usuario = public.get_owner_user_id(auth.uid())
    and public.fiado_actor_can('caixa.fechar', id_usuario)
  );

-- Incremental RBAC containment for operational Mesa/comanda mutations.
--
-- Production snapshot, consumer map, and rollback procedure:
-- docs/operations/MESAS-OPERATIONAL-RBAC-SNAPSHOT-2026-08-12.md
--
-- This slice keeps owner-scoped reads and the existing browser row contracts.
-- It only adds the already-persisted Mesa capabilities to operational writes:
--   * opening a comanda: mesas.abrir_comanda
--   * editing comanda items/operational fields: mesas.editar_itens
--   * closing/receiving: mesas.fechar
--   * cancelling/releasing: mesas.cancelar
-- Owners retain the existing bypass through fiado_actor_can. service_role
-- remains outside RLS and trigger checks. Forward-only: do not rewrite an
-- applied migration.

-- Keep table grants unchanged; RLS remains the authorization boundary.

drop policy if exists mesas_actor on public.mesas;
drop policy if exists mesas_actor_select on public.mesas;
drop policy if exists mesas_actor_insert on public.mesas;
drop policy if exists mesas_actor_update on public.mesas;
drop policy if exists mesas_actor_delete on public.mesas;

create policy mesas_actor_select
  on public.mesas
  for select
  to authenticated
  using (public.get_owner_user_id(auth.uid()) = id_usuario);

create policy mesas_actor_insert
  on public.mesas
  for insert
  to authenticated
  with check (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('mesas.acessar', id_usuario)
  );

create policy mesas_actor_update
  on public.mesas
  for update
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('mesas.acessar', id_usuario)
  )
  with check (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('mesas.acessar', id_usuario)
  );

create policy mesas_actor_delete
  on public.mesas
  for delete
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('mesas.acessar', id_usuario)
  );

drop policy if exists comandas_actor on public.comandas;
drop policy if exists comandas_actor_select on public.comandas;
drop policy if exists comandas_actor_insert on public.comandas;
drop policy if exists comandas_actor_update on public.comandas;
drop policy if exists comandas_actor_delete on public.comandas;

create policy comandas_actor_select
  on public.comandas
  for select
  to authenticated
  using (public.get_owner_user_id(auth.uid()) = id_usuario);

create policy comandas_actor_insert
  on public.comandas
  for insert
  to authenticated
  with check (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('mesas.abrir_comanda', id_usuario)
  );

create policy comandas_actor_update
  on public.comandas
  for update
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('mesas.acessar', id_usuario)
  )
  with check (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('mesas.acessar', id_usuario)
  );

create policy comandas_actor_delete
  on public.comandas
  for delete
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('mesas.cancelar', id_usuario)
  );

drop policy if exists comanda_itens_actor on public.comanda_itens;
drop policy if exists comanda_itens_actor_select on public.comanda_itens;
drop policy if exists comanda_itens_actor_insert on public.comanda_itens;
drop policy if exists comanda_itens_actor_update on public.comanda_itens;
drop policy if exists comanda_itens_actor_delete on public.comanda_itens;

create policy comanda_itens_actor_select
  on public.comanda_itens
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.comandas c
      where c.id = comanda_itens.id_comanda
        and c.id_usuario = public.get_owner_user_id(auth.uid())
    )
  );

create policy comanda_itens_actor_insert
  on public.comanda_itens
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.comandas c
      where c.id = comanda_itens.id_comanda
        and c.id_usuario = public.get_owner_user_id(auth.uid())
        and public.fiado_actor_can('mesas.editar_itens', c.id_usuario)
    )
  );

create policy comanda_itens_actor_update
  on public.comanda_itens
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.comandas c
      where c.id = comanda_itens.id_comanda
        and c.id_usuario = public.get_owner_user_id(auth.uid())
        and public.fiado_actor_can('mesas.editar_itens', c.id_usuario)
    )
  )
  with check (
    exists (
      select 1
      from public.comandas c
      where c.id = comanda_itens.id_comanda
        and c.id_usuario = public.get_owner_user_id(auth.uid())
        and public.fiado_actor_can('mesas.editar_itens', c.id_usuario)
    )
  );

create policy comanda_itens_actor_delete
  on public.comanda_itens
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.comandas c
      where c.id = comanda_itens.id_comanda
        and c.id_usuario = public.get_owner_user_id(auth.uid())
        and public.fiado_actor_can('mesas.editar_itens', c.id_usuario)
    )
  );

create or replace function public.mesas_status_rbac_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_service_role text := current_setting('request.jwt.claim.role', true);
begin
  -- Anonymous requests are stopped by RLS. service_role and maintenance
  -- calls have no user claim and retain the existing bypass.
  if v_actor is null or v_service_role = 'service_role' or v_actor = old.id_usuario then
    return new;
  end if;

  if new.id_usuario is distinct from old.id_usuario then
    raise exception 'A mesa deve permanecer no tenant original.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'ocupada' then
      if not public.fiado_actor_can('mesas.abrir_comanda', old.id_usuario) then
        raise exception 'VocÃª nÃ£o tem permissÃ£o para abrir a mesa.' using errcode = '42501';
      end if;
    elsif new.status = 'fechando' then
      if not public.fiado_actor_can('mesas.fechar', old.id_usuario) then
        raise exception 'VocÃª nÃ£o tem permissÃ£o para iniciar o fechamento da mesa.' using errcode = '42501';
      end if;
    elsif new.status = 'livre' then
      if not (
        public.fiado_actor_can('mesas.fechar', old.id_usuario)
        or public.fiado_actor_can('mesas.cancelar', old.id_usuario)
      ) then
        raise exception 'VocÃª nÃ£o tem permissÃ£o para liberar a mesa.' using errcode = '42501';
      end if;
    else
      raise exception 'Status de mesa invÃ¡lido para este operador.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists mesas_status_rbac_guard on public.mesas;
create trigger mesas_status_rbac_guard
  before update on public.mesas
  for each row
  execute function public.mesas_status_rbac_guard();

create or replace function public.comandas_mutation_rbac_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_service_role text := current_setting('request.jwt.claim.role', true);
begin
  -- Anonymous requests are stopped by RLS. service_role and maintenance
  -- calls retain the existing bypass; SECURITY DEFINER browser calls still
  -- carry the authenticated actor claim and are checked below.
  if v_actor is null or v_service_role = 'service_role' or v_actor = old.id_usuario then
    return new;
  end if;

  if new.id_usuario is distinct from old.id_usuario then
    raise exception 'A comanda deve permanecer no tenant original.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if new.status in ('fechando', 'fechada') then
      if not public.fiado_actor_can('mesas.fechar', old.id_usuario) then
        raise exception 'VocÃª nÃ£o tem permissÃ£o para fechar a mesa.' using errcode = '42501';
      end if;
    elsif new.status = 'cancelada' then
      if not public.fiado_actor_can('mesas.cancelar', old.id_usuario) then
        raise exception 'VocÃª nÃ£o tem permissÃ£o para cancelar a comanda.' using errcode = '42501';
      end if;
    elsif new.status = 'aberta' then
      if not (
        public.fiado_actor_can('mesas.abrir_comanda', old.id_usuario)
        or public.fiado_actor_can('mesas.editar_itens', old.id_usuario)
      ) then
        raise exception 'VocÃª nÃ£o tem permissÃ£o para reabrir a comanda.' using errcode = '42501';
      end if;
    else
      raise exception 'Status de comanda invÃ¡lido para este operador.' using errcode = '42501';
    end if;
  end if;

  if new.id_venda is distinct from old.id_venda
     or new.fechada_em is distinct from old.fechada_em
     or new.total_calculado is distinct from old.total_calculado then
    if not public.fiado_actor_can('mesas.fechar', old.id_usuario) then
      raise exception 'VocÃª nÃ£o tem permissÃ£o para alterar o fechamento financeiro.' using errcode = '42501';
    end if;
  end if;

  if new.id_mesa is distinct from old.id_mesa
     or new.num_pessoas is distinct from old.num_pessoas
     or new.observacao is distinct from old.observacao
     or new.taxa_servico_pct is distinct from old.taxa_servico_pct
     or new.couvert_valor is distinct from old.couvert_valor
     or new.desconto is distinct from old.desconto then
    if not public.fiado_actor_can('mesas.editar_itens', old.id_usuario) then
      raise exception 'VocÃª nÃ£o tem permissÃ£o para editar a comanda.' using errcode = '42501';
    end if;
  end if;

  -- The UI stamps the current operator before close/cancel as well as while
  -- editing. Keep that audit-field update compatible with the corresponding
  -- operation capability without granting any financial field access.
  if new.id_operador is distinct from old.id_operador
     and not (
       public.fiado_actor_can('mesas.editar_itens', old.id_usuario)
       or public.fiado_actor_can('mesas.fechar', old.id_usuario)
       or public.fiado_actor_can('mesas.cancelar', old.id_usuario)
     ) then
    raise exception 'VocÃª nÃ£o tem permissÃ£o para identificar o operador da comanda.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists comandas_mutation_rbac_guard on public.comandas;
create trigger comandas_mutation_rbac_guard
  before update on public.comandas
  for each row
  execute function public.comandas_mutation_rbac_guard();

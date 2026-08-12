-- Incremental RBAC enforcement for catalog mutations.
--
-- Before this migration, catalog reads were owner-scoped but every
-- authenticated sub-user that could reach the Data API could mutate an
-- existing product/category/subcategory.  The browser page already exposes
-- this surface only to product managers; this migration makes that boundary
-- authoritative in RLS without changing catalog reads used by the POS.
--
-- Owners keep the existing CRUD contract.  Active sub-users need the
-- produtos.gerenciar permission.  Service role remains unchanged.

drop policy if exists usuario_gerencia_seus_produtos_insert on public.produtos;
drop policy if exists produtos_actor_update on public.produtos;
drop policy if exists produtos_actor_delete on public.produtos;

create policy produtos_actor_insert on public.produtos
  for insert to authenticated
  with check (
    public.get_owner_user_id((select auth.uid())) = id_usuario
    and (
      (select auth.uid()) = id_usuario
      or exists (
        select 1
        from public.access_users au
        join public.access_roles ar on ar.id = au.role_id
          and ar.owner_user_id = au.owner_user_id
        where au.auth_user_id = (select auth.uid())
          and au.owner_user_id = produtos.id_usuario
          and au.status = 'active'
          and ar.permissions @> '{"produtos.gerenciar": true}'::jsonb
      )
    )
  );

create policy produtos_actor_update on public.produtos
  for update to authenticated
  using (
    public.get_owner_user_id((select auth.uid())) = id_usuario
    and (
      (select auth.uid()) = id_usuario
      or exists (
        select 1
        from public.access_users au
        join public.access_roles ar on ar.id = au.role_id
          and ar.owner_user_id = au.owner_user_id
        where au.auth_user_id = (select auth.uid())
          and au.owner_user_id = produtos.id_usuario
          and au.status = 'active'
          and ar.permissions @> '{"produtos.gerenciar": true}'::jsonb
      )
    )
  )
  with check (
    public.get_owner_user_id((select auth.uid())) = id_usuario
    and (
      (select auth.uid()) = id_usuario
      or exists (
        select 1
        from public.access_users au
        join public.access_roles ar on ar.id = au.role_id
          and ar.owner_user_id = au.owner_user_id
        where au.auth_user_id = (select auth.uid())
          and au.owner_user_id = produtos.id_usuario
          and au.status = 'active'
          and ar.permissions @> '{"produtos.gerenciar": true}'::jsonb
      )
    )
  );

create policy produtos_actor_delete on public.produtos
  for delete to authenticated
  using (
    public.get_owner_user_id((select auth.uid())) = id_usuario
    and (
      (select auth.uid()) = id_usuario
      or exists (
        select 1
        from public.access_users au
        join public.access_roles ar on ar.id = au.role_id
          and ar.owner_user_id = au.owner_user_id
        where au.auth_user_id = (select auth.uid())
          and au.owner_user_id = produtos.id_usuario
          and au.status = 'active'
          and ar.permissions @> '{"produtos.gerenciar": true}'::jsonb
      )
    )
  );

drop policy if exists usuario_gerencia_suas_categorias_insert on public.categorias;
drop policy if exists categorias_actor_update on public.categorias;
drop policy if exists categorias_actor_delete on public.categorias;

create policy categorias_actor_insert on public.categorias
  for insert to authenticated
  with check (
    public.get_owner_user_id((select auth.uid())) = id_usuario
    and (
      (select auth.uid()) = id_usuario
      or exists (
        select 1
        from public.access_users au
        join public.access_roles ar on ar.id = au.role_id
          and ar.owner_user_id = au.owner_user_id
        where au.auth_user_id = (select auth.uid())
          and au.owner_user_id = categorias.id_usuario
          and au.status = 'active'
          and ar.permissions @> '{"produtos.gerenciar": true}'::jsonb
      )
    )
  );

create policy categorias_actor_update on public.categorias
  for update to authenticated
  using (
    public.get_owner_user_id((select auth.uid())) = id_usuario
    and (
      (select auth.uid()) = id_usuario
      or exists (
        select 1
        from public.access_users au
        join public.access_roles ar on ar.id = au.role_id
          and ar.owner_user_id = au.owner_user_id
        where au.auth_user_id = (select auth.uid())
          and au.owner_user_id = categorias.id_usuario
          and au.status = 'active'
          and ar.permissions @> '{"produtos.gerenciar": true}'::jsonb
      )
    )
  )
  with check (
    public.get_owner_user_id((select auth.uid())) = id_usuario
    and (
      (select auth.uid()) = id_usuario
      or exists (
        select 1
        from public.access_users au
        join public.access_roles ar on ar.id = au.role_id
          and ar.owner_user_id = au.owner_user_id
        where au.auth_user_id = (select auth.uid())
          and au.owner_user_id = categorias.id_usuario
          and au.status = 'active'
          and ar.permissions @> '{"produtos.gerenciar": true}'::jsonb
      )
    )
  );

create policy categorias_actor_delete on public.categorias
  for delete to authenticated
  using (
    public.get_owner_user_id((select auth.uid())) = id_usuario
    and (
      (select auth.uid()) = id_usuario
      or exists (
        select 1
        from public.access_users au
        join public.access_roles ar on ar.id = au.role_id
          and ar.owner_user_id = au.owner_user_id
        where au.auth_user_id = (select auth.uid())
          and au.owner_user_id = categorias.id_usuario
          and au.status = 'active'
          and ar.permissions @> '{"produtos.gerenciar": true}'::jsonb
      )
    )
  );

drop policy if exists subcats_insert_own on public.subcategorias;
drop policy if exists subcategorias_actor_update on public.subcategorias;
drop policy if exists subcategorias_actor_delete on public.subcategorias;

create policy subcategorias_actor_insert on public.subcategorias
  for insert to authenticated
  with check (
    public.get_owner_user_id((select auth.uid())) = id_usuario
    and (
      (select auth.uid()) = id_usuario
      or exists (
        select 1
        from public.access_users au
        join public.access_roles ar on ar.id = au.role_id
          and ar.owner_user_id = au.owner_user_id
        where au.auth_user_id = (select auth.uid())
          and au.owner_user_id = subcategorias.id_usuario
          and au.status = 'active'
          and ar.permissions @> '{"produtos.gerenciar": true}'::jsonb
      )
    )
  );

create policy subcategorias_actor_update on public.subcategorias
  for update to authenticated
  using (
    public.get_owner_user_id((select auth.uid())) = id_usuario
    and (
      (select auth.uid()) = id_usuario
      or exists (
        select 1
        from public.access_users au
        join public.access_roles ar on ar.id = au.role_id
          and ar.owner_user_id = au.owner_user_id
        where au.auth_user_id = (select auth.uid())
          and au.owner_user_id = subcategorias.id_usuario
          and au.status = 'active'
          and ar.permissions @> '{"produtos.gerenciar": true}'::jsonb
      )
    )
  )
  with check (
    public.get_owner_user_id((select auth.uid())) = id_usuario
    and (
      (select auth.uid()) = id_usuario
      or exists (
        select 1
        from public.access_users au
        join public.access_roles ar on ar.id = au.role_id
          and ar.owner_user_id = au.owner_user_id
        where au.auth_user_id = (select auth.uid())
          and au.owner_user_id = subcategorias.id_usuario
          and au.status = 'active'
          and ar.permissions @> '{"produtos.gerenciar": true}'::jsonb
      )
    )
  );

create policy subcategorias_actor_delete on public.subcategorias
  for delete to authenticated
  using (
    public.get_owner_user_id((select auth.uid())) = id_usuario
    and (
      (select auth.uid()) = id_usuario
      or exists (
        select 1
        from public.access_users au
        join public.access_roles ar on ar.id = au.role_id
          and ar.owner_user_id = au.owner_user_id
        where au.auth_user_id = (select auth.uid())
          and au.owner_user_id = subcategorias.id_usuario
          and au.status = 'active'
          and ar.permissions @> '{"produtos.gerenciar": true}'::jsonb
      )
    )
  );

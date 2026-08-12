-- Incremental RBAC containment for ZeloMenu catalog configuration.
--
-- These tables are managed from Gestão > Produtos and were owner-scoped only,
-- so a sub-user could mutate menu modifiers/publications without
-- produtos.gerenciar. Read policies remain owner-scoped for the PDV cache.
-- Forward-only: never rewrite an applied migration.

drop policy if exists zelomenu_modifier_groups_actor_insert on public.zelomenu_modifier_groups;
create policy zelomenu_modifier_groups_actor_insert
  on public.zelomenu_modifier_groups
  for insert
  to authenticated
  with check (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('produtos.gerenciar', id_usuario)
    and exists (
      select 1
      from public.produtos p
      where p.id = zelomenu_modifier_groups.id_produto
        and p.id_usuario = zelomenu_modifier_groups.id_usuario
    )
  );

drop policy if exists zelomenu_modifier_groups_actor_update on public.zelomenu_modifier_groups;
create policy zelomenu_modifier_groups_actor_update
  on public.zelomenu_modifier_groups
  for update
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('produtos.gerenciar', id_usuario)
  )
  with check (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('produtos.gerenciar', id_usuario)
    and exists (
      select 1
      from public.produtos p
      where p.id = zelomenu_modifier_groups.id_produto
        and p.id_usuario = zelomenu_modifier_groups.id_usuario
    )
  );

drop policy if exists zelomenu_modifier_groups_actor_delete on public.zelomenu_modifier_groups;
create policy zelomenu_modifier_groups_actor_delete
  on public.zelomenu_modifier_groups
  for delete
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('produtos.gerenciar', id_usuario)
  );

drop policy if exists zelomenu_modifier_options_actor_insert on public.zelomenu_modifier_options;
create policy zelomenu_modifier_options_actor_insert
  on public.zelomenu_modifier_options
  for insert
  to authenticated
  with check (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('produtos.gerenciar', id_usuario)
    and exists (
      select 1
      from public.zelomenu_modifier_groups g
      where g.id = zelomenu_modifier_options.id_grupo
        and g.id_usuario = zelomenu_modifier_options.id_usuario
    )
  );

drop policy if exists zelomenu_modifier_options_actor_update on public.zelomenu_modifier_options;
create policy zelomenu_modifier_options_actor_update
  on public.zelomenu_modifier_options
  for update
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('produtos.gerenciar', id_usuario)
  )
  with check (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('produtos.gerenciar', id_usuario)
    and exists (
      select 1
      from public.zelomenu_modifier_groups g
      where g.id = zelomenu_modifier_options.id_grupo
        and g.id_usuario = zelomenu_modifier_options.id_usuario
    )
  );

drop policy if exists zelomenu_modifier_options_actor_delete on public.zelomenu_modifier_options;
create policy zelomenu_modifier_options_actor_delete
  on public.zelomenu_modifier_options
  for delete
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('produtos.gerenciar', id_usuario)
  );

drop policy if exists zelomenu_modifier_option_products_actor_insert on public.zelomenu_modifier_option_products;
create policy zelomenu_modifier_option_products_actor_insert
  on public.zelomenu_modifier_option_products
  for insert
  to authenticated
  with check (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('produtos.gerenciar', id_usuario)
    and exists (
      select 1
      from public.zelomenu_modifier_options o
      where o.id = zelomenu_modifier_option_products.id_opcao
        and o.id_usuario = zelomenu_modifier_option_products.id_usuario
    )
    and exists (
      select 1
      from public.produtos p
      where p.id = zelomenu_modifier_option_products.id_produto
        and p.id_usuario = zelomenu_modifier_option_products.id_usuario
    )
  );

drop policy if exists zelomenu_modifier_option_products_actor_update on public.zelomenu_modifier_option_products;
create policy zelomenu_modifier_option_products_actor_update
  on public.zelomenu_modifier_option_products
  for update
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('produtos.gerenciar', id_usuario)
  )
  with check (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('produtos.gerenciar', id_usuario)
    and exists (
      select 1
      from public.zelomenu_modifier_options o
      where o.id = zelomenu_modifier_option_products.id_opcao
        and o.id_usuario = zelomenu_modifier_option_products.id_usuario
    )
    and exists (
      select 1
      from public.produtos p
      where p.id = zelomenu_modifier_option_products.id_produto
        and p.id_usuario = zelomenu_modifier_option_products.id_usuario
    )
  );

drop policy if exists zelomenu_modifier_option_products_actor_delete on public.zelomenu_modifier_option_products;
create policy zelomenu_modifier_option_products_actor_delete
  on public.zelomenu_modifier_option_products
  for delete
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('produtos.gerenciar', id_usuario)
  );

drop policy if exists zelomenu_product_publications_actor_insert on public.zelomenu_product_publications;
create policy zelomenu_product_publications_actor_insert
  on public.zelomenu_product_publications
  for insert
  to authenticated
  with check (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('produtos.gerenciar', id_usuario)
    and exists (
      select 1
      from public.produtos p
      where p.id = zelomenu_product_publications.id_produto
        and p.id_usuario = zelomenu_product_publications.id_usuario
    )
  );

drop policy if exists zelomenu_product_publications_actor_update on public.zelomenu_product_publications;
create policy zelomenu_product_publications_actor_update
  on public.zelomenu_product_publications
  for update
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('produtos.gerenciar', id_usuario)
  )
  with check (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('produtos.gerenciar', id_usuario)
    and exists (
      select 1
      from public.produtos p
      where p.id = zelomenu_product_publications.id_produto
        and p.id_usuario = zelomenu_product_publications.id_usuario
    )
  );

drop policy if exists zelomenu_product_publications_actor_delete on public.zelomenu_product_publications;
create policy zelomenu_product_publications_actor_delete
  on public.zelomenu_product_publications
  for delete
  to authenticated
  using (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and public.fiado_actor_can('produtos.gerenciar', id_usuario)
  );

-- ============================================================================
-- ZeloMenu publication layer
--
-- Defines the PDV-owned schema for public menu publication and product-linked
-- modifiers. The base catalog remains public.produtos/public.categorias.
-- This layer intentionally does not reuse produtos.ocultar_no_pdv; PDV
-- visibility and online-menu publication are separate decisions.
-- ============================================================================

create table if not exists public.zelomenu_product_publications (
  id uuid primary key default gen_random_uuid(),
  id_usuario uuid not null references auth.users(id) on delete cascade,
  id_produto bigint not null references public.produtos(id) on delete cascade,
  nome_publico text,
  descricao_publica text,
  foto_url text,
  visivel_online boolean not null default false,
  pausado_manualmente boolean not null default false,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint zelomenu_product_publications_user_product_unique
    unique (id_usuario, id_produto),
  constraint zelomenu_product_publications_order_non_negative
    check (ordem >= 0),
  constraint zelomenu_product_publications_nome_publico_not_blank
    check (nome_publico is null or length(btrim(nome_publico)) > 0),
  constraint zelomenu_product_publications_descricao_publica_not_blank
    check (descricao_publica is null or length(btrim(descricao_publica)) > 0)
);

comment on table public.zelomenu_product_publications is
  'PDV-owned overlay that controls how a base product is published in ZeloMenu.';
comment on column public.zelomenu_product_publications.visivel_online is
  'Independent online visibility flag for ZeloMenu; do not derive from produtos.ocultar_no_pdv.';
comment on column public.zelomenu_product_publications.pausado_manualmente is
  'Manual pause for the online menu without changing the base PDV product.';

create index if not exists zelomenu_product_publications_user_visible_order_idx
  on public.zelomenu_product_publications
  (id_usuario, visivel_online, pausado_manualmente, ordem, id_produto);

create index if not exists zelomenu_product_publications_product_idx
  on public.zelomenu_product_publications (id_produto);

alter table public.zelomenu_product_publications enable row level security;

drop policy if exists zelomenu_product_publications_actor_select
  on public.zelomenu_product_publications;
create policy zelomenu_product_publications_actor_select
  on public.zelomenu_product_publications
  for select
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario);

drop policy if exists zelomenu_product_publications_actor_insert
  on public.zelomenu_product_publications;
create policy zelomenu_product_publications_actor_insert
  on public.zelomenu_product_publications
  for insert
  to authenticated
  with check (
    get_owner_user_id(auth.uid()) = id_usuario
    and exists (
      select 1
      from public.produtos p
      where p.id = zelomenu_product_publications.id_produto
        and p.id_usuario = zelomenu_product_publications.id_usuario
    )
  );

drop policy if exists zelomenu_product_publications_actor_update
  on public.zelomenu_product_publications;
create policy zelomenu_product_publications_actor_update
  on public.zelomenu_product_publications
  for update
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario)
  with check (
    get_owner_user_id(auth.uid()) = id_usuario
    and exists (
      select 1
      from public.produtos p
      where p.id = zelomenu_product_publications.id_produto
        and p.id_usuario = zelomenu_product_publications.id_usuario
    )
  );

drop policy if exists zelomenu_product_publications_actor_delete
  on public.zelomenu_product_publications;
create policy zelomenu_product_publications_actor_delete
  on public.zelomenu_product_publications
  for delete
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario);

revoke all on public.zelomenu_product_publications from anon, authenticated, service_role;
grant select, insert, update, delete
  on public.zelomenu_product_publications
  to authenticated, service_role;

create table if not exists public.zelomenu_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  id_usuario uuid not null references auth.users(id) on delete cascade,
  id_produto bigint not null references public.produtos(id) on delete cascade,
  nome text not null,
  tipo text not null default 'adicional'
    check (tipo in ('adicional', 'variacao')),
  min_selecoes integer not null default 0,
  max_selecoes integer,
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint zelomenu_modifier_groups_nome_not_blank
    check (length(btrim(nome)) > 0),
  constraint zelomenu_modifier_groups_selection_bounds
    check (
      min_selecoes >= 0
      and (max_selecoes is null or max_selecoes >= greatest(min_selecoes, 1))
    ),
  constraint zelomenu_modifier_groups_order_non_negative
    check (ordem >= 0)
);

comment on table public.zelomenu_modifier_groups is
  'Product-linked modifier groups consumed first by ZeloMenu.';
comment on column public.zelomenu_modifier_groups.tipo is
  'adicional for optional add-ons; variacao for variation-style choices.';

create index if not exists zelomenu_modifier_groups_user_product_order_idx
  on public.zelomenu_modifier_groups
  (id_usuario, id_produto, ativo, ordem);

create index if not exists zelomenu_modifier_groups_product_idx
  on public.zelomenu_modifier_groups (id_produto);

alter table public.zelomenu_modifier_groups enable row level security;

drop policy if exists zelomenu_modifier_groups_actor_select
  on public.zelomenu_modifier_groups;
create policy zelomenu_modifier_groups_actor_select
  on public.zelomenu_modifier_groups
  for select
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario);

drop policy if exists zelomenu_modifier_groups_actor_insert
  on public.zelomenu_modifier_groups;
create policy zelomenu_modifier_groups_actor_insert
  on public.zelomenu_modifier_groups
  for insert
  to authenticated
  with check (
    get_owner_user_id(auth.uid()) = id_usuario
    and exists (
      select 1
      from public.produtos p
      where p.id = zelomenu_modifier_groups.id_produto
        and p.id_usuario = zelomenu_modifier_groups.id_usuario
    )
  );

drop policy if exists zelomenu_modifier_groups_actor_update
  on public.zelomenu_modifier_groups;
create policy zelomenu_modifier_groups_actor_update
  on public.zelomenu_modifier_groups
  for update
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario)
  with check (
    get_owner_user_id(auth.uid()) = id_usuario
    and exists (
      select 1
      from public.produtos p
      where p.id = zelomenu_modifier_groups.id_produto
        and p.id_usuario = zelomenu_modifier_groups.id_usuario
    )
  );

drop policy if exists zelomenu_modifier_groups_actor_delete
  on public.zelomenu_modifier_groups;
create policy zelomenu_modifier_groups_actor_delete
  on public.zelomenu_modifier_groups
  for delete
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario);

revoke all on public.zelomenu_modifier_groups from anon, authenticated, service_role;
grant select, insert, update, delete
  on public.zelomenu_modifier_groups
  to authenticated, service_role;

create table if not exists public.zelomenu_modifier_options (
  id uuid primary key default gen_random_uuid(),
  id_usuario uuid not null references auth.users(id) on delete cascade,
  id_grupo uuid not null references public.zelomenu_modifier_groups(id) on delete cascade,
  nome text not null,
  price_delta numeric(10, 2) not null default 0,
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint zelomenu_modifier_options_nome_not_blank
    check (length(btrim(nome)) > 0),
  constraint zelomenu_modifier_options_price_delta_non_negative
    check (price_delta >= 0),
  constraint zelomenu_modifier_options_order_non_negative
    check (ordem >= 0)
);

comment on table public.zelomenu_modifier_options is
  'Selectable modifier options for a product modifier group.';
comment on column public.zelomenu_modifier_options.price_delta is
  'Additional price applied on top of the base produto.preco; ZeloMenu v1 has no base-price override.';

create index if not exists zelomenu_modifier_options_group_order_idx
  on public.zelomenu_modifier_options
  (id_grupo, ativo, ordem);

create index if not exists zelomenu_modifier_options_user_idx
  on public.zelomenu_modifier_options (id_usuario);

alter table public.zelomenu_modifier_options enable row level security;

drop policy if exists zelomenu_modifier_options_actor_select
  on public.zelomenu_modifier_options;
create policy zelomenu_modifier_options_actor_select
  on public.zelomenu_modifier_options
  for select
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario);

drop policy if exists zelomenu_modifier_options_actor_insert
  on public.zelomenu_modifier_options;
create policy zelomenu_modifier_options_actor_insert
  on public.zelomenu_modifier_options
  for insert
  to authenticated
  with check (
    get_owner_user_id(auth.uid()) = id_usuario
    and exists (
      select 1
      from public.zelomenu_modifier_groups g
      where g.id = zelomenu_modifier_options.id_grupo
        and g.id_usuario = zelomenu_modifier_options.id_usuario
    )
  );

drop policy if exists zelomenu_modifier_options_actor_update
  on public.zelomenu_modifier_options;
create policy zelomenu_modifier_options_actor_update
  on public.zelomenu_modifier_options
  for update
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario)
  with check (
    get_owner_user_id(auth.uid()) = id_usuario
    and exists (
      select 1
      from public.zelomenu_modifier_groups g
      where g.id = zelomenu_modifier_options.id_grupo
        and g.id_usuario = zelomenu_modifier_options.id_usuario
    )
  );

drop policy if exists zelomenu_modifier_options_actor_delete
  on public.zelomenu_modifier_options;
create policy zelomenu_modifier_options_actor_delete
  on public.zelomenu_modifier_options
  for delete
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario);

revoke all on public.zelomenu_modifier_options from anon, authenticated, service_role;
grant select, insert, update, delete
  on public.zelomenu_modifier_options
  to authenticated, service_role;

notify pgrst, 'reload schema';

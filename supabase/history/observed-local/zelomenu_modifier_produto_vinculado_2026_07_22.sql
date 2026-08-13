-- ZeloMenu: modo de preço por grupo (somar/substituir) + opção de grupo
-- vinculada a um produto real do catálogo ("Monte sua X").
-- Spec: zelomenu/docs/superpowers/specs/2026-07-22-modifier-produto-vinculado-design.md
-- Segue exatamente o padrão de zelomenu_publication_schema_2026_06_23.sql
-- (colunas em português, constraint com sufixo _check, RLS por id_usuario).

alter table public.zelomenu_modifier_groups
  add column if not exists modo_preco text not null default 'somar';

alter table public.zelomenu_modifier_groups
  drop constraint if exists zelomenu_modifier_groups_modo_preco_check;
alter table public.zelomenu_modifier_groups
  add constraint zelomenu_modifier_groups_modo_preco_check
    check (modo_preco = any (array['somar'::text, 'substituir'::text]));

alter table public.zelomenu_modifier_groups
  drop constraint if exists zelomenu_modifier_groups_permite_quantidade_no_substituir;
-- (constraint de exclusão mútua com permite_quantidade fica na migration de
-- quantidade por opção, que também mexe em max_selecoes; ver
-- zelomenu_modifier_quantidade_opcao_2026_07_22.sql)

comment on column public.zelomenu_modifier_groups.modo_preco is
  'somar: soma ao preco base do produto. substituir: preco da opcao selecionada substitui o preco base (exige max_selecoes = 1).';

create table if not exists public.zelomenu_modifier_option_products (
  id_opcao uuid primary key references public.zelomenu_modifier_options(id) on delete cascade,
  id_usuario uuid not null references auth.users(id) on delete cascade,
  id_produto bigint not null references public.produtos(id) on delete cascade,
  price_override numeric(10, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint zelomenu_modifier_option_products_price_override_check
    check (price_override is null or price_override >= 0)
);

comment on table public.zelomenu_modifier_option_products is
  'Vincula uma zelomenu_modifier_options a um produto real do catalogo (1:1 opcional). Ausencia de linha aqui = opcao classica (nome/price_delta manuais).';
comment on column public.zelomenu_modifier_option_products.price_override is
  'Quando preenchido, substitui o preco do produto vinculado so para esta opcao (desconto de combo). Null = usa produtos.preco vigente.';

create index if not exists zelomenu_modifier_option_products_produto_idx
  on public.zelomenu_modifier_option_products (id_produto);

create index if not exists zelomenu_modifier_option_products_user_idx
  on public.zelomenu_modifier_option_products (id_usuario);

alter table public.zelomenu_modifier_option_products enable row level security;

drop policy if exists zelomenu_modifier_option_products_actor_select
  on public.zelomenu_modifier_option_products;
create policy zelomenu_modifier_option_products_actor_select
  on public.zelomenu_modifier_option_products
  for select
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario);

drop policy if exists zelomenu_modifier_option_products_actor_insert
  on public.zelomenu_modifier_option_products;
create policy zelomenu_modifier_option_products_actor_insert
  on public.zelomenu_modifier_option_products
  for insert
  to authenticated
  with check (
    get_owner_user_id(auth.uid()) = id_usuario
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

drop policy if exists zelomenu_modifier_option_products_actor_update
  on public.zelomenu_modifier_option_products;
create policy zelomenu_modifier_option_products_actor_update
  on public.zelomenu_modifier_option_products
  for update
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario)
  with check (
    get_owner_user_id(auth.uid()) = id_usuario
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

drop policy if exists zelomenu_modifier_option_products_actor_delete
  on public.zelomenu_modifier_option_products;
create policy zelomenu_modifier_option_products_actor_delete
  on public.zelomenu_modifier_option_products
  for delete
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario);

revoke all on public.zelomenu_modifier_option_products from anon, authenticated, service_role;
grant select, insert, update, delete
  on public.zelomenu_modifier_option_products
  to authenticated, service_role;

-- Forward-only bridge for the canonical ZeloMenu modifier-component contract.
--
-- The contract was introduced in the ZeloMenu stream, but the corresponding
-- migrations were not present in this repository's replay stream. Keep the
-- historical migrations immutable and reconcile the prerequisite here before
-- 20260911120000_zelomenu_canonical_pause.sql.
begin;

create table if not exists public.zelomenu_modifier_components (
  id uuid primary key default gen_random_uuid(),
  id_usuario uuid not null references auth.users(id) on delete cascade,
  nome text not null check (length(btrim(nome)) > 0),
  nome_chave text not null check (length(btrim(nome_chave)) > 0),
  pausado_manualmente boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zelomenu_modifier_components_user_key unique (id_usuario, nome_chave)
);

create index if not exists zelomenu_modifier_components_user_name_idx
  on public.zelomenu_modifier_components (id_usuario, nome_chave);

alter table public.zelomenu_modifier_option_products
  alter column id_produto drop not null;
alter table public.zelomenu_modifier_option_products
  add column if not exists id_componente uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = c.conkey[1]
     where c.conrelid = 'public.zelomenu_modifier_option_products'::regclass
       and c.contype = 'f'
       and c.confrelid = 'public.zelomenu_modifier_components'::regclass
       and a.attname = 'id_componente'
  ) then
    alter table public.zelomenu_modifier_option_products
      add constraint zelomenu_modifier_option_products_id_componente_fkey
      foreign key (id_componente)
      references public.zelomenu_modifier_components(id)
      on delete cascade;
  end if;
end;
$$;

-- Legacy rows linked to a unique product keep their product destination. An
-- option with no link, or with an empty destination from a partial rollout,
-- is assigned a reusable component keyed by normalized display name.
with unlinked as (
  select
    o.id,
    o.id_usuario,
    o.price_delta,
    btrim(regexp_replace(lower(translate(o.nome,
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇç',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOoooooUUUUuuuuCc')), '[^a-z0-9]+', ' ', 'g')) as nome_chave
  from public.zelomenu_modifier_options o
  left join public.zelomenu_modifier_option_products link
    on link.id_opcao = o.id
  where link.id_opcao is null
     or (link.id_produto is null and link.id_componente is null)
), matches as (
  select
    u.id,
    u.id_usuario,
    u.price_delta,
    min(p.id) as id_produto,
    count(p.id) as quantidade
  from unlinked u
  left join public.produtos p
    on p.id_usuario = u.id_usuario
   and btrim(regexp_replace(lower(translate(p.nome,
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇç',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOoooooUUUUuuuuCc')), '[^a-z0-9]+', ' ', 'g')) = u.nome_chave
  group by u.id, u.id_usuario, u.price_delta
)
insert into public.zelomenu_modifier_option_products (
  id_opcao, id_usuario, id_produto, price_override
)
select id, id_usuario, id_produto, price_delta
from matches
where quantidade = 1
on conflict (id_opcao) do nothing;

-- A partial rollout may have left an existing row with both destinations NULL.
-- Fill it with the same unique-product rule before creating component links.
with unlinked as (
  select
    o.id,
    o.id_usuario,
    o.price_delta,
    btrim(regexp_replace(lower(translate(o.nome,
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇç',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOoooooUUUUuuuuCc')), '[^a-z0-9]+', ' ', 'g')) as nome_chave
  from public.zelomenu_modifier_options o
  join public.zelomenu_modifier_option_products link
    on link.id_opcao = o.id
   and link.id_produto is null
   and link.id_componente is null
), matches as (
  select
    u.id,
    u.price_delta,
    min(p.id) as id_produto,
    count(p.id) as quantidade
  from unlinked u
  left join public.produtos p
    on p.id_usuario = u.id_usuario
   and btrim(regexp_replace(lower(translate(p.nome,
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇç',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOoooooUUUUuuuuCc')), '[^a-z0-9]+', ' ', 'g')) = u.nome_chave
  group by u.id, u.id_usuario, u.price_delta, u.nome_chave
)
update public.zelomenu_modifier_option_products link
   set id_produto = matches.id_produto,
       price_override = matches.price_delta,
       updated_at = now()
  from matches
 where link.id_opcao = matches.id
   and matches.quantidade = 1;

with remaining as (
  select
    o.id_usuario,
    o.nome,
    btrim(regexp_replace(lower(translate(o.nome,
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇç',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOoooooUUUUuuuuCc')), '[^a-z0-9]+', ' ', 'g')) as nome_chave
  from public.zelomenu_modifier_options o
  left join public.zelomenu_modifier_option_products link
    on link.id_opcao = o.id
  where link.id_opcao is null
     or (link.id_produto is null and link.id_componente is null)
)
insert into public.zelomenu_modifier_components (id_usuario, nome, nome_chave)
select id_usuario, min(nome), nome_chave
from remaining
group by id_usuario, nome_chave
on conflict (id_usuario, nome_chave) do nothing;

insert into public.zelomenu_modifier_option_products (
  id_opcao, id_usuario, id_componente, price_override
)
select o.id, o.id_usuario, component.id, o.price_delta
from public.zelomenu_modifier_options o
join public.zelomenu_modifier_components component
  on component.id_usuario = o.id_usuario
 and component.nome_chave = btrim(regexp_replace(lower(translate(o.nome,
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇç',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOoooooUUUUuuuuCc')), '[^a-z0-9]+', ' ', 'g'))
left join public.zelomenu_modifier_option_products link
  on link.id_opcao = o.id
where link.id_opcao is null
on conflict (id_opcao) do nothing;

-- Complete an existing empty link from a partial rollout. The insert above
-- only handles options without a link, so this update is needed before the
-- exact-destination constraint is validated.
update public.zelomenu_modifier_option_products link
   set id_componente = component.id,
       price_override = option_row.price_delta,
       updated_at = now()
  from public.zelomenu_modifier_options option_row
  join public.zelomenu_modifier_components component
    on component.id_usuario = option_row.id_usuario
   and component.nome_chave = btrim(regexp_replace(lower(translate(option_row.nome,
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇç',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOoooooUUUUuuuuCc')), '[^a-z0-9]+', ' ', 'g'))
 where link.id_opcao = option_row.id
   and link.id_produto is null
   and link.id_componente is null;

-- Move the legacy inactive flag to the canonical destination before making
-- `ativo` structural again.
update public.zelomenu_modifier_components component
   set pausado_manualmente = true,
       updated_at = now()
  from public.zelomenu_modifier_option_products link
  join public.zelomenu_modifier_options option_row
    on option_row.id = link.id_opcao
 where link.id_componente = component.id
   and option_row.ativo = false;

insert into public.zelomenu_product_publications (
  id_usuario, id_produto, visivel_online, pausado_manualmente, ordem
)
select distinct link.id_usuario, link.id_produto, false, true, 0
from public.zelomenu_modifier_option_products link
join public.zelomenu_modifier_options option_row
  on option_row.id = link.id_opcao
where link.id_produto is not null
  and option_row.ativo = false
on conflict (id_usuario, id_produto) do update
set pausado_manualmente = true,
    updated_at = now();

update public.zelomenu_modifier_options
   set ativo = true,
       updated_at = now()
 where ativo = false;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.zelomenu_modifier_option_products'::regclass
       and conname = 'zelomenu_modifier_option_products_exact_destination'
  ) then
    alter table public.zelomenu_modifier_option_products
      add constraint zelomenu_modifier_option_products_exact_destination
      check (num_nonnulls(id_produto, id_componente) = 1) not valid;
  end if;
end;
$$;

alter table public.zelomenu_modifier_option_products
  validate constraint zelomenu_modifier_option_products_exact_destination;

alter table public.zelomenu_modifier_components enable row level security;
drop policy if exists zelomenu_modifier_components_actor_select
  on public.zelomenu_modifier_components;
create policy zelomenu_modifier_components_actor_select
  on public.zelomenu_modifier_components for select
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario);

drop policy if exists zelomenu_modifier_components_actor_insert
  on public.zelomenu_modifier_components;
create policy zelomenu_modifier_components_actor_insert
  on public.zelomenu_modifier_components for insert
  to authenticated
  with check (
    get_owner_user_id(auth.uid()) = id_usuario
    and fiado_actor_can('produtos.gerenciar', id_usuario)
  );

drop policy if exists zelomenu_modifier_components_actor_update
  on public.zelomenu_modifier_components;
create policy zelomenu_modifier_components_actor_update
  on public.zelomenu_modifier_components for update
  to authenticated
  using (
    get_owner_user_id(auth.uid()) = id_usuario
    and fiado_actor_can('produtos.gerenciar', id_usuario)
  )
  with check (
    get_owner_user_id(auth.uid()) = id_usuario
    and fiado_actor_can('produtos.gerenciar', id_usuario)
  );

drop policy if exists zelomenu_modifier_components_actor_delete
  on public.zelomenu_modifier_components;
create policy zelomenu_modifier_components_actor_delete
  on public.zelomenu_modifier_components for delete
  to authenticated
  using (
    get_owner_user_id(auth.uid()) = id_usuario
    and fiado_actor_can('produtos.gerenciar', id_usuario)
  );

alter table public.zelomenu_modifier_option_products enable row level security;
drop policy if exists zelomenu_modifier_option_products_actor_insert
  on public.zelomenu_modifier_option_products;
create policy zelomenu_modifier_option_products_actor_insert
  on public.zelomenu_modifier_option_products for insert
  to authenticated
  with check (
    get_owner_user_id(auth.uid()) = id_usuario
    and fiado_actor_can('produtos.gerenciar', id_usuario)
    and exists (
      select 1 from public.zelomenu_modifier_options option_row
       where option_row.id = id_opcao
         and option_row.id_usuario = zelomenu_modifier_option_products.id_usuario
    )
    and (
      (id_produto is not null and exists (
        select 1 from public.produtos product_row
         where product_row.id = id_produto
           and product_row.id_usuario = zelomenu_modifier_option_products.id_usuario
      ))
      or
      (id_componente is not null and exists (
        select 1 from public.zelomenu_modifier_components component_row
         where component_row.id = id_componente
           and component_row.id_usuario = zelomenu_modifier_option_products.id_usuario
      ))
    )
  );

drop policy if exists zelomenu_modifier_option_products_actor_update
  on public.zelomenu_modifier_option_products;
create policy zelomenu_modifier_option_products_actor_update
  on public.zelomenu_modifier_option_products for update
  to authenticated
  using (
    get_owner_user_id(auth.uid()) = id_usuario
    and fiado_actor_can('produtos.gerenciar', id_usuario)
  )
  with check (
    get_owner_user_id(auth.uid()) = id_usuario
    and fiado_actor_can('produtos.gerenciar', id_usuario)
    and exists (
      select 1 from public.zelomenu_modifier_options option_row
       where option_row.id = id_opcao
         and option_row.id_usuario = zelomenu_modifier_option_products.id_usuario
    )
    and (
      (id_produto is not null and exists (
        select 1 from public.produtos product_row
         where product_row.id = id_produto
           and product_row.id_usuario = zelomenu_modifier_option_products.id_usuario
      ))
      or
      (id_componente is not null and exists (
        select 1 from public.zelomenu_modifier_components component_row
         where component_row.id = id_componente
           and component_row.id_usuario = zelomenu_modifier_option_products.id_usuario
      ))
    )
  );

revoke all on table public.zelomenu_modifier_components from public, anon, authenticated, service_role;
grant select, insert, update, delete
  on table public.zelomenu_modifier_components to authenticated, service_role;
grant select, insert, update, delete
  on table public.zelomenu_modifier_option_products to authenticated, service_role;

comment on table public.zelomenu_modifier_components is
  'Canonical reusable identities for modifier-only items; pause state lives on this destination.';

commit;

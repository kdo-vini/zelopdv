-- Pagamentos parciais por item no módulo Mesas.
-- Pagamentos sem itens continuam válidos: são pagamentos gerais.

begin;

alter table public.vendas_itens
  add column if not exists id_comanda_item uuid
  references public.comanda_itens(id) on delete set null;

alter table public.vendas_pagamentos
  add column if not exists id_comanda_pagamento uuid;

-- O identificador de origem é um snapshot de auditoria. Ele não recebe FK,
-- porque comanda_pagamentos é limpo após o fechamento da mesa.
alter table public.vendas_pagamentos
  drop constraint if exists vendas_pagamentos_comanda_pagamento_fk;

create table if not exists public.comanda_pagamento_itens (
  id uuid primary key default gen_random_uuid(),
  id_pagamento uuid references public.comanda_pagamentos(id) on delete set null,
  id_comanda uuid references public.comandas(id) on delete set null,
  id_comanda_item uuid not null references public.comanda_itens(id) on delete restrict,
  id_usuario uuid not null references auth.users(id) on delete cascade,
  id_venda bigint references public.vendas(id) on delete set null,
  id_venda_pagamento bigint references public.vendas_pagamentos(id) on delete set null,
  id_venda_item bigint references public.vendas_itens(id) on delete set null,
  quantidade numeric(12,3) not null check (quantidade > 0),
  preco_unitario numeric(12,2) check (preco_unitario is null or preco_unitario >= 0),
  valor numeric(12,2) not null check (valor >= 0),
  created_at timestamptz not null default now(),
  constraint comanda_pagamento_itens_unique_payment_item
    unique (id_pagamento, id_comanda_item)
);

comment on table public.comanda_pagamento_itens is
  'Atribuição auditável de quantidade de item a pagamento parcial de Mesa.';
comment on column public.comanda_pagamento_itens.id_pagamento is
  'Origem enquanto comanda_pagamentos existe; fica NULL após o cleanup.';
comment on column public.comanda_pagamento_itens.id_venda is
  'Venda gerada no fechamento da mesa.';
comment on column public.comanda_pagamento_itens.id_venda_pagamento is
  'Linha de vendas_pagamentos correspondente ao parcial.';
comment on column public.comanda_pagamento_itens.id_venda_item is
  'Linha de vendas_itens correspondente ao item da comanda.';

create index if not exists comanda_pagamento_itens_comanda_idx
  on public.comanda_pagamento_itens (id_comanda, id_comanda_item);
create index if not exists comanda_pagamento_itens_payment_idx
  on public.comanda_pagamento_itens (id_pagamento)
  where id_pagamento is not null;
create index if not exists comanda_pagamento_itens_sale_idx
  on public.comanda_pagamento_itens (id_venda, id_venda_pagamento, id_venda_item)
  where id_venda is not null;
create index if not exists vendas_pagamentos_comanda_pagamento_idx
  on public.vendas_pagamentos (id_comanda_pagamento)
  where id_comanda_pagamento is not null;
create index if not exists vendas_itens_comanda_item_idx
  on public.vendas_itens (id_comanda_item)
  where id_comanda_item is not null;

create or replace function public.comanda_pagamento_itens_fill_context()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_item_comanda uuid;
  v_payment_comanda uuid;
  v_payment_owner uuid;
begin
  select ci.id_comanda
    into v_item_comanda
    from public.comanda_itens ci
   where ci.id = new.id_comanda_item;

  if not found then
    raise exception 'Item da comanda não encontrado';
  end if;

  if new.id_comanda is null then
    new.id_comanda := v_item_comanda;
  elsif new.id_comanda <> v_item_comanda then
    raise exception 'Item e comanda não correspondem';
  end if;

  if new.id_pagamento is not null then
    select cp.id_comanda, cp.id_usuario
      into v_payment_comanda, v_payment_owner
      from public.comanda_pagamentos cp
     where cp.id = new.id_pagamento;

    if not found then
      raise exception 'Pagamento da comanda não encontrado';
    end if;
    if v_payment_comanda <> new.id_comanda then
      raise exception 'Pagamento e item não pertencem à mesma comanda';
    end if;
    if v_payment_owner <> new.id_usuario then
      raise exception 'Pagamento e atribuição não pertencem ao mesmo usuário';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.comanda_pagamento_itens_validate_quantity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_item_quantity numeric;
  v_allocated numeric;
begin
  select ci.quantidade
    into v_item_quantity
    from public.comanda_itens ci
   where ci.id = new.id_comanda_item
   for update;

  if not found then
    raise exception 'Item da comanda não encontrado';
  end if;

  select coalesce(sum(cpi.quantidade), 0)
    into v_allocated
    from public.comanda_pagamento_itens cpi
   where cpi.id_comanda_item = new.id_comanda_item
     and cpi.id <> new.id;

  if v_allocated + new.quantidade > v_item_quantity + 0.000001 then
    raise exception 'Quantidade alocada excede a quantidade do item da comanda';
  end if;

  return new;
end;
$$;

drop trigger if exists comanda_pagamento_itens_fill_context on public.comanda_pagamento_itens;
create trigger comanda_pagamento_itens_fill_context
before insert or update of id_pagamento, id_comanda, id_comanda_item, id_usuario
on public.comanda_pagamento_itens
for each row execute function public.comanda_pagamento_itens_fill_context();

drop trigger if exists comanda_pagamento_itens_validate_quantity on public.comanda_pagamento_itens;
create trigger comanda_pagamento_itens_validate_quantity
before insert or update of id_comanda_item, quantidade
on public.comanda_pagamento_itens
for each row execute function public.comanda_pagamento_itens_validate_quantity();

alter table public.comanda_pagamento_itens enable row level security;

drop policy if exists comanda_pagamento_itens_select on public.comanda_pagamento_itens;
create policy comanda_pagamento_itens_select
  on public.comanda_pagamento_itens for select
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario);

drop policy if exists comanda_pagamento_itens_insert on public.comanda_pagamento_itens;
create policy comanda_pagamento_itens_insert
  on public.comanda_pagamento_itens for insert
  to authenticated
  with check (get_owner_user_id(auth.uid()) = id_usuario);

drop policy if exists comanda_pagamento_itens_update on public.comanda_pagamento_itens;
create policy comanda_pagamento_itens_update
  on public.comanda_pagamento_itens for update
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario)
  with check (get_owner_user_id(auth.uid()) = id_usuario);

drop policy if exists comanda_pagamento_itens_delete on public.comanda_pagamento_itens;
create policy comanda_pagamento_itens_delete
  on public.comanda_pagamento_itens for delete
  to authenticated
  using (get_owner_user_id(auth.uid()) = id_usuario);

revoke all on public.comanda_pagamento_itens from anon;
grant select, insert, update, delete on public.comanda_pagamento_itens to authenticated, service_role;

commit;

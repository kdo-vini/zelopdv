-- Subcategorias por categoria
-- Tabela e RLS baseadas no padrão existente (id_usuario)

create table if not exists public.subcategorias (
  id bigint generated always as identity primary key,
  id_usuario uuid not null,
  id_categoria bigint not null references public.categorias(id) on delete cascade,
  nome text not null,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.subcategorias enable row level security;

-- Policies idempotentes
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='subcategorias' and policyname='subcats_select_own') then
    create policy subcats_select_own on public.subcategorias
      for select using (auth.uid() = id_usuario);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='subcategorias' and policyname='subcats_insert_own') then
    create policy subcats_insert_own on public.subcategorias
      for insert with check (auth.uid() = id_usuario);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='subcategorias' and policyname='subcats_update_own') then
    create policy subcats_update_own on public.subcategorias
      for update using (auth.uid() = id_usuario) with check (auth.uid() = id_usuario);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='subcategorias' and policyname='subcats_delete_own') then
    create policy subcats_delete_own on public.subcategorias
      for delete using (auth.uid() = id_usuario);
  end if;
end $$;

-- Índices úteis
create index if not exists idx_subcategorias_categoria_ordem on public.subcategorias(id_categoria, ordem asc);

-- Produtos: torna subcategoria opcional
alter table public.produtos
  add column if not exists id_subcategoria bigint references public.subcategorias(id) on delete set null;

-- Campos de fechamento de caixa para MVP
alter table public.caixas
  add column if not exists valor_fechamento numeric,
  add column if not exists diferenca_fechamento numeric;

-- Histórico de fechamento de caixa (últimos 30 dias para relatórios)
create table if not exists public.caixa_fechamentos (
  id bigint generated always as identity primary key,
  id_caixa bigint not null references public.caixas(id) on delete cascade,
  id_usuario uuid not null,
  data_fechamento timestamptz not null default now(),
  total_dinheiro numeric not null default 0,
  total_cartao numeric not null default 0,
  total_pix numeric not null default 0,
  total_geral numeric not null default 0,
  valor_inicial numeric not null default 0,
  valor_esperado_em_gaveta numeric not null default 0,
  valor_contado_em_gaveta numeric not null default 0,
  diferenca numeric not null default 0,
  quantidade_vendas integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.caixa_fechamentos enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'caixa_fechamentos' and policyname = 'select_own_fechamentos'
  ) then
    create policy select_own_fechamentos on public.caixa_fechamentos
      for select using (auth.uid() = id_usuario);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'caixa_fechamentos' and policyname = 'insert_own_fechamentos'
  ) then
    create policy insert_own_fechamentos on public.caixa_fechamentos
      for insert with check (auth.uid() = id_usuario);
  end if;
end $$;

create index if not exists idx_caixa_fechamentos_usuario_data on public.caixa_fechamentos(id_usuario, data_fechamento desc);

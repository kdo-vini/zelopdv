-- Movimentações de caixa (sangria/suprimento) para registrar retiradas e reforços de dinheiro
create table if not exists public.caixa_movimentacoes (
  id bigint generated always as identity primary key,
  id_caixa bigint not null references public.caixas(id) on delete cascade,
  id_usuario uuid not null,
  tipo text not null check (tipo in ('sangria','suprimento')),
  valor numeric not null check (valor >= 0),
  motivo text,
  created_at timestamptz not null default now()
);

alter table public.caixa_movimentacoes enable row level security;

-- Seleciona somente as próprias movimentações
create policy if not exists caixa_movs_select_own on public.caixa_movimentacoes
  for select using (auth.uid() = id_usuario);

-- Insere somente em nome próprio
create policy if not exists caixa_movs_insert_own on public.caixa_movimentacoes
  for insert with check (auth.uid() = id_usuario);

create index if not exists idx_caixa_movs_usuario_data on public.caixa_movimentacoes(id_usuario, created_at desc);

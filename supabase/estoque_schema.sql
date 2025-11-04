-- Estoque básico para MVP
-- Adiciona flags de controle de estoque nos produtos

alter table public.produtos
  add column if not exists controlar_estoque boolean not null default false,
  add column if not exists estoque_atual numeric not null default 0;

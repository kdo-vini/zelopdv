-- Planilha de precificacao em /ferramentas/precificacao: cada produto pode
-- declarar uma margem desejada (%) e ser marcado para aparecer na planilha.
-- Nao altera policies existentes nem tabelas de vendas.
alter table public.produtos
  add column if not exists margem_desejada numeric(5,2);

alter table public.produtos
  add column if not exists na_precificacao boolean not null default false;

alter table public.produtos
  drop constraint if exists produtos_margem_desejada_range;

alter table public.produtos
  add constraint produtos_margem_desejada_range
  check (margem_desejada is null or (margem_desejada >= 0 and margem_desejada < 100));

comment on column public.produtos.margem_desejada is
  'Margem desejada (%) usada pela planilha de precificacao para sugerir preco; 60 = 60%. Nula usa o padrao da UI.';

comment on column public.produtos.na_precificacao is
  'Se o produto aparece na planilha de precificacao em /ferramentas/precificacao. Desligar nao apaga o produto.';

create index if not exists produtos_na_precificacao_idx
  on public.produtos (id_usuario)
  where na_precificacao;

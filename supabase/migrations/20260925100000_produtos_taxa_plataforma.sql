-- Taxa de plataforma (iFood etc.) por produto: usada apenas pela planilha de
-- precificacao em /ferramentas/precificacao para sugerir margem/preco.
-- Nao afeta vendas, PDV ou relatorios.
alter table public.produtos
  add column if not exists taxa_plataforma numeric(5,2);

alter table public.produtos
  drop constraint if exists produtos_taxa_plataforma_range;

alter table public.produtos
  add constraint produtos_taxa_plataforma_range
  check (taxa_plataforma is null or (taxa_plataforma >= 0 and taxa_plataforma <= 35));

comment on column public.produtos.taxa_plataforma is
  'Taxa de plataforma (%) usada apenas pela planilha de precificacao em /ferramentas/precificacao para sugerir margem/preco; 12 = 12%. Nao usada por vendas, PDV ou relatorios.';

-- Custo unitário opcional usado pelo Zelinho para margem e lucro estimados.
-- Não altera snapshots históricos: o custo atual é uma referência operacional.
alter table public.produtos
  add column if not exists custo_unitario numeric(12,2);

alter table public.produtos
  drop constraint if exists produtos_custo_unitario_nonnegative;

alter table public.produtos
  add constraint produtos_custo_unitario_nonnegative
  check (custo_unitario is null or custo_unitario >= 0);

comment on column public.produtos.custo_unitario is
  'Custo unitário estimado informado pelo dono; usado em análises do Zelinho, não é snapshot histórico da venda.';

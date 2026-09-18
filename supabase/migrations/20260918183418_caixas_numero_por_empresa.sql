-- numero_caixa: contador de apresentação por empresa (id_usuario),
-- independente do id serial global de public.caixas.
-- Espelha o contrato de vendas.numero_venda (set_numero_venda).

alter table public.caixas
  add column if not exists numero_caixa integer;

-- Backfill estável: ordem cronológica de abertura; id como desempate.
with ranked as (
  select
    id,
    row_number() over (
      partition by id_usuario
      order by data_abertura asc nulls last, id asc
    ) as n
  from public.caixas
)
update public.caixas c
set numero_caixa = ranked.n
from ranked
where c.id = ranked.id
  and c.numero_caixa is null;

alter table public.caixas
  alter column numero_caixa set not null;

create unique index if not exists caixas_usuario_numero_uidx
  on public.caixas (id_usuario, numero_caixa);

create or replace function public.set_numero_caixa()
returns trigger
language plpgsql
as $$
begin
  if new.numero_caixa is not null then
    return new;
  end if;

  -- Serializa atribuição por empresa (evita colisão sob insert concorrente).
  perform pg_advisory_xact_lock(hashtextextended(new.id_usuario::text, 0));

  select coalesce(max(numero_caixa), 0) + 1
    into new.numero_caixa
  from public.caixas
  where id_usuario = new.id_usuario;

  return new;
end;
$$;

drop trigger if exists trg_set_numero_caixa on public.caixas;
create trigger trg_set_numero_caixa
  before insert on public.caixas
  for each row
  execute function public.set_numero_caixa();

comment on column public.caixas.numero_caixa is
  'Número sequencial de caixa por empresa (id_usuario), para exibição. O id continua sendo a PK global.';

revoke all on function public.set_numero_caixa() from public;
grant execute on function public.set_numero_caixa() to anon, authenticated, service_role;

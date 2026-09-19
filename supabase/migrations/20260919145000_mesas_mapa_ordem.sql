-- Custom map order for /app/mesas drag-and-drop (synced per store).
-- Backfill matches client natural sort: pure digits numeric, then named labels.

alter table public.mesas
  add column if not exists mapa_ordem integer;

with ranked as (
  select
    id,
    (row_number() over (
      partition by id_usuario
      order by
        case when trim(numero) ~ '^\d+$' then 0 else 1 end,
        case when trim(numero) ~ '^\d+$' then trim(numero)::bigint else null end nulls last,
        lower(trim(numero)),
        id
    ) - 1)::integer as mapa_ordem
  from public.mesas
)
update public.mesas m
set mapa_ordem = r.mapa_ordem
from ranked r
where m.id = r.id
  and m.mapa_ordem is null;

create index if not exists mesas_usuario_mapa_ordem_idx
  on public.mesas (id_usuario, mapa_ordem);

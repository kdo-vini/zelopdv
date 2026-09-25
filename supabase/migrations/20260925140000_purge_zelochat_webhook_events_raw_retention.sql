-- Retenção agressiva de public.zelochat_webhook_events_raw.
--
-- Motivação (Disk IO Budget, compute Nano/Free): o projeto compartilhado
-- sofreu com DELETE PostgREST grande, sem LIMIT, sobre linhas com payload
-- jsonb. O índice parcial já existe no banco vinculado:
--   zelochat_webhook_events_raw_processed_retention_idx
--   ON (processed_at, id) WHERE processed_at IS NOT NULL
-- Esta migration garante o mesmo contrato e move o purge para lotes
-- pequenos que usam esse índice (Index Scan + LIMIT), nunca um delete
-- unbounded.
--
-- Janela padrão: 3 dias para linhas já processadas (retenção agressiva,
-- alinhada com CoS). Linhas com processed_at IS NULL não são apagadas —
-- ficam para diagnóstico de stuck/in-flight. delete_account continua
-- removendo o tenant inteiro por empresa_id e não é este caminho.
--
-- Cada lote apaga no máximo p_batch_size linhas (default 500, clamp 1..2000).
-- O sweep do cron é PROCEDURE e dá COMMIT após cada lote (máx. 20) para
-- não recriar um DELETE de milhares de jsonb numa única transação.
-- Agendamento: a cada 15 minutos.

create index if not exists zelochat_webhook_events_raw_processed_retention_idx
  on public.zelochat_webhook_events_raw (processed_at, id)
  where processed_at is not null;

comment on index public.zelochat_webhook_events_raw_processed_retention_idx is
  'Retention scan for processed webhook raw rows: ORDER BY processed_at, id LIMIT n.';

create or replace function public.purge_zelochat_webhook_events_raw_batch(
  p_keep_interval interval default interval '3 days',
  p_batch_size integer default 500
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch integer;
  v_deleted integer;
begin
  if p_keep_interval is null or p_keep_interval < interval '1 day' then
    raise exception 'p_keep_interval must be at least 1 day';
  end if;

  v_batch := least(greatest(coalesce(p_batch_size, 500), 1), 2000);

  with doomed as (
    select r.id
      from public.zelochat_webhook_events_raw as r
     where r.processed_at is not null
       and r.processed_at < (clock_timestamp() - p_keep_interval)
     order by r.processed_at, r.id
     limit v_batch
     for update skip locked
  ), deleted as (
    delete from public.zelochat_webhook_events_raw as t
     using doomed
     where t.id = doomed.id
     returning t.id
  )
  select count(*)::integer into v_deleted from deleted;

  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function public.purge_zelochat_webhook_events_raw_batch(interval, integer)
  from public, anon, authenticated;
grant execute on function public.purge_zelochat_webhook_events_raw_batch(interval, integer)
  to service_role;

comment on function public.purge_zelochat_webhook_events_raw_batch(interval, integer) is
  'Deletes at most p_batch_size processed zelochat_webhook_events_raw rows older than p_keep_interval (default 3 days). Uses processed_retention_idx. service_role only. Leaves unprocessed rows alone.';

-- PROCEDURE (not FUNCTION) so each batch can COMMIT. A function wrapper
-- looping 20×500 would still be one transaction and recreate the IO spike.
create or replace procedure public.purge_zelochat_webhook_events_raw_sweep(
  p_keep_interval interval default interval '3 days',
  p_batch_size integer default 500,
  p_max_batches integer default 20
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer;
  v_i integer;
  v_deleted integer;
begin
  v_max := least(greatest(coalesce(p_max_batches, 20), 1), 20);
  for v_i in 1..v_max loop
    v_deleted := public.purge_zelochat_webhook_events_raw_batch(
      p_keep_interval,
      p_batch_size
    );
    commit;
    exit when v_deleted = 0;
  end loop;
end;
$$;

revoke all on procedure public.purge_zelochat_webhook_events_raw_sweep(interval, integer, integer)
  from public, anon, authenticated;
grant execute on procedure public.purge_zelochat_webhook_events_raw_sweep(interval, integer, integer)
  to service_role;

comment on procedure public.purge_zelochat_webhook_events_raw_sweep(interval, integer, integer) is
  'Cron entrypoint: up to 20 committed batches of purge_zelochat_webhook_events_raw_batch. service_role only.';

-- Exact duplicate btree indexes from the 20260813 baseline (pg_get_indexdef
-- keys match; none are UNIQUE or partial). Keep one name of each pair.
create or replace function pg_temp.assert_and_drop_duplicate_index(
  p_keep text,
  p_drop text
)
returns void
language plpgsql
as $$
declare
  keep_reg regclass;
  drop_reg regclass;
  keep_def text;
  drop_def text;
  norm_keep text;
  norm_drop text;
begin
  keep_reg := to_regclass(p_keep);
  drop_reg := to_regclass(p_drop);

  if drop_reg is null then
    raise notice 'skip drop % — already absent', p_drop;
    return;
  end if;

  if keep_reg is null then
    raise exception 'refusing to drop % because keep index % is missing', p_drop, p_keep;
  end if;

  keep_def := pg_get_indexdef(keep_reg);
  drop_def := pg_get_indexdef(drop_reg);

  if keep_def ~* '^CREATE UNIQUE INDEX' or drop_def ~* '^CREATE UNIQUE INDEX' then
    raise exception 'refusing unique index drop: % / %', keep_def, drop_def;
  end if;

  norm_keep := regexp_replace(keep_def, '^CREATE INDEX \S+ ON ', '');
  norm_drop := regexp_replace(drop_def, '^CREATE INDEX \S+ ON ', '');

  if norm_keep is distinct from norm_drop then
    raise exception 'indexes are not exact duplicates: % vs %', keep_def, drop_def;
  end if;

  execute format('drop index if exists %s', p_drop);
end;
$$;

select pg_temp.assert_and_drop_duplicate_index(
  'public.caixa_fechamentos_usuario_data_idx',
  'public.idx_caixa_fechamentos_usuario_data'
);
select pg_temp.assert_and_drop_duplicate_index(
  'public.idx_caixa_movimentacoes_caixa',
  'public.idx_movimentacoes_id_caixa'
);
select pg_temp.assert_and_drop_duplicate_index(
  'public.idx_vendas_caixa',
  'public.idx_vendas_id_caixa'
);
select pg_temp.assert_and_drop_duplicate_index(
  'public.idx_vendas_itens_venda',
  'public.vendas_itens_venda_idx'
);
select pg_temp.assert_and_drop_duplicate_index(
  'public.idx_vendas_pagamentos_venda',
  'public.idx_pagamentos_id_venda'
);
select pg_temp.assert_and_drop_duplicate_index(
  'public.idx_vendas_pagamentos_venda',
  'public.vendas_pagamentos_venda_idx'
);

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron is required to schedule zelochat webhook retention purge';
  end if;

  perform cron.unschedule(j.jobid)
    from cron.job j
   where j.jobname = 'purge-zelochat-webhook-events-raw';

  perform cron.schedule(
    'purge-zelochat-webhook-events-raw',
    '*/15 * * * *',
    $cron$call public.purge_zelochat_webhook_events_raw_sweep();$cron$
  );
end
$$;

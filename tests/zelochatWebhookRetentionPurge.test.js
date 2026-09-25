import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve('supabase/migrations/20260925140000_purge_zelochat_webhook_events_raw_retention.sql'),
  'utf8',
).replace(/\r\n/g, '\n').toLowerCase();

describe('zelochat webhook raw retention purge', () => {
  it('keeps deletes small, indexed, and service_role only', () => {
    expect(migration).toContain(
      'create index if not exists zelochat_webhook_events_raw_processed_retention_idx',
    );
    expect(migration).toContain('on public.zelochat_webhook_events_raw (processed_at, id)');
    expect(migration).toContain('where processed_at is not null');

    expect(migration).toContain('function public.purge_zelochat_webhook_events_raw_batch');
    expect(migration).toContain("interval '3 days'");
    expect(migration).toContain('p_batch_size integer default 500');
    expect(migration).toContain('least(greatest(coalesce(p_batch_size, 500), 1), 2000)');
    expect(migration).toContain('order by r.processed_at, r.id');
    expect(migration).toContain('limit v_batch');
    expect(migration).toContain('processed_at is not null');
    expect(migration).toContain('security definer');
    expect(migration).toContain("set search_path = ''");

    expect(migration).toContain(
      'revoke all on function public.purge_zelochat_webhook_events_raw_batch(interval, integer)',
    );
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain(
      'grant execute on function public.purge_zelochat_webhook_events_raw_batch(interval, integer)',
    );
    expect(migration).toContain('to service_role');
  });

  it('does not delete unprocessed rows and commits sweep batches separately', () => {
    expect(migration).toMatch(/processed_at is null não são apagadas|leaves unprocessed rows alone/);
    expect(migration).not.toMatch(
      /delete from public\.zelochat_webhook_events_raw[\s\S]{0,200}processed_at is null/,
    );

    expect(migration).toContain('procedure public.purge_zelochat_webhook_events_raw_sweep');
    expect(migration).toContain('p_max_batches integer default 20');
    expect(migration).toContain('least(greatest(coalesce(p_max_batches, 20), 1), 20)');
    expect(migration).toContain('commit;');
    expect(migration).toContain(
      'revoke all on procedure public.purge_zelochat_webhook_events_raw_sweep(interval, integer, integer)',
    );

    expect(migration).toContain("jobname = 'purge-zelochat-webhook-events-raw'");
    expect(migration).toContain('cron.unschedule');
    expect(migration).toContain('cron.schedule');
    expect(migration).toContain("'*/15 * * * *'");
    expect(migration).toContain('call public.purge_zelochat_webhook_events_raw_sweep()');
  });

  it('drops only verified exact-duplicate btree indexes', () => {
    expect(migration).toContain('pg_get_indexdef');
    expect(migration).toContain('refusing unique index drop');
    expect(migration).toContain('indexes are not exact duplicates');
    expect(migration).toContain('public.idx_caixa_fechamentos_usuario_data');
    expect(migration).toContain('public.idx_movimentacoes_id_caixa');
    expect(migration).toContain('public.idx_vendas_id_caixa');
    expect(migration).toContain('public.vendas_itens_venda_idx');
    expect(migration).toContain('public.idx_pagamentos_id_venda');
    expect(migration).toContain('public.vendas_pagamentos_venda_idx');
    expect(migration).toContain('public.caixa_fechamentos_usuario_data_idx');
    expect(migration).toContain('public.idx_caixa_movimentacoes_caixa');
    expect(migration).toContain('public.idx_vendas_caixa');
    expect(migration).toContain('public.idx_vendas_itens_venda');
    expect(migration).toContain('public.idx_vendas_pagamentos_venda');
  });
});

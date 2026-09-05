begin;

set local statement_timeout = '10s';

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (
      select user_id
      from public.empresa_perfil
      where lower(coalesce(nome_exibicao, '')) like '%degust%'
      order by id
      limit 1
    ),
    'role', 'authenticated'
  )::text,
  true
);

set local role authenticated;

select *
from public.heartbeat_zelo_print_station_v1(
  '5b47a1b1-c6ed-44c8-ac58-cd57fe72159e',
  'Verificação descartável',
  true
);

select *
from public.enqueue_zelo_print_job_v1(
  'a4cbcb36-e1b4-4a45-b676-4b8874082dde',
  'receipt',
  jsonb_build_object(
    'jobId', 'a4cbcb36-e1b4-4a45-b676-4b8874082dde',
    'source', 'zelopdv',
    'type', 'receipt',
    'content', jsonb_build_object('format', 'raw_escpos_base64', 'base64', 'AA==')
  ),
  now() + interval '2 hours'
);

-- A segunda chamada deve devolver o mesmo trabalho, sem duplicar.
select *
from public.enqueue_zelo_print_job_v1(
  'a4cbcb36-e1b4-4a45-b676-4b8874082dde',
  'receipt',
  jsonb_build_object(
    'jobId', 'a4cbcb36-e1b4-4a45-b676-4b8874082dde',
    'source', 'zelopdv',
    'type', 'receipt',
    'content', jsonb_build_object('format', 'raw_escpos_base64', 'base64', 'AA==')
  ),
  now() + interval '2 hours'
);

select finished.*
from public.claim_zelo_print_jobs_v1(
  '5b47a1b1-c6ed-44c8-ac58-cd57fe72159e',
  1
) as claimed
cross join lateral public.finish_zelo_print_job_v1(
  '5b47a1b1-c6ed-44c8-ac58-cd57fe72159e',
  claimed.id,
  'spooled',
  null,
  null
) as finished;

rollback;

-- Runtime contract for the cash-closing schema/function boundary.
-- Safe against a shared database: every fixture and write is rolled back.

begin;

do $cash_closing_hotfix$
declare
  v_owner uuid;
  v_caixa integer;
  v_result jsonb;
begin
  select u.id
  into v_owner
  from auth.users u
  where not exists (
    select 1
    from public.caixas c
    where c.id_usuario = u.id
      and c.data_fechamento is null
  )
  order by u.created_at
  limit 1;

  if v_owner is null then
    raise exception 'No isolated owner available for cash-closing smoke';
  end if;

  insert into public.caixas (id_usuario, valor_inicial)
  values (v_owner, 0)
  returning id into v_caixa;

  v_result := offline_internal.close_caixa(
    v_owner,
    jsonb_build_object(
      'payload', jsonb_build_object(
        'id_caixa', v_caixa,
        'valor_contado_em_gaveta', 0
      ),
      'operationId', 'cash-closing-schema-contract',
      'occurredAt', now()
    ),
    false
  );

  if not exists (
    select 1
    from public.caixa_fechamentos f
    where f.id_caixa = v_caixa
      and f.totais_pagamento = '{}'::jsonb
      and f.total_geral = 0
      and f.valor_contado_em_gaveta = 0
  ) then
    raise exception 'Cash-closing snapshot was not persisted: %', v_result;
  end if;
end
$cash_closing_hotfix$;

rollback;

select 'cash-closing schema contract passed' as result;

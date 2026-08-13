-- Contain the confirmed fiado cancellation side-effect bypass.
--
-- Production snapshot before this migration:
--   fiado_estornar_venda(bigint) was SECURITY DEFINER, search_path=public,
--   owned by postgres, and executable only by postgres/authenticated/service_role.
-- The function already scoped the sale to get_owner_user_id(auth.uid()), but an
-- active sub-user did not need pdv.cancelar before the balance and ledger writes.

create or replace function public.fiado_estornar_venda(p_id_venda bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_venda public.vendas%rowtype;
  v_valor numeric(12,2) := 0;
  v_saldo numeric(12,2);
begin
  if v_actor is null then
    raise exception 'Não autenticado.' using errcode = '28000';
  end if;

  v_owner := public.get_owner_user_id(v_actor);

  select *
    into v_venda
    from public.vendas
   where id = p_id_venda
     and id_usuario = v_owner
   for update;

  if not found or v_venda.id_cliente is null then
    return jsonb_build_object('valor_estornado', 0);
  end if;

  if not public.fiado_actor_can('pdv.cancelar', v_owner) then
    raise exception 'Sem permissão para cancelar esta venda.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
      from public.fiado_lancamentos
     where id_venda = p_id_venda
       and natureza = 'estorno_venda'
  ) then
    return jsonb_build_object('idempotent', true, 'valor_estornado', 0);
  end if;

  if v_venda.forma_pagamento = 'fiado' then
    v_valor := coalesce(v_venda.valor_total, 0);
  elsif v_venda.forma_pagamento = 'multiplo' then
    select coalesce(sum(valor), 0)
      into v_valor
      from public.vendas_pagamentos
     where id_venda = p_id_venda
       and forma_pagamento = 'fiado';
  end if;

  if v_valor <= 0 then
    return jsonb_build_object('valor_estornado', 0);
  end if;

  update public.pessoas
     set saldo_fiado = coalesce(saldo_fiado, 0) - v_valor
   where id = v_venda.id_cliente
     and id_usuario = v_owner
  returning saldo_fiado into v_saldo;

  insert into public.fiado_lancamentos (
    id_usuario,
    id_pessoa,
    id_venda,
    id_operador,
    natureza,
    valor,
    descricao,
    idempotency_key
  ) values (
    v_owner,
    v_venda.id_cliente,
    p_id_venda,
    v_actor,
    'estorno_venda',
    -v_valor,
    'Estorno da venda ' || coalesce(v_venda.numero_venda::text, p_id_venda::text),
    'estorno-venda:' || p_id_venda
  );

  return jsonb_build_object('valor_estornado', v_valor, 'saldo_atual', v_saldo);
end;
$$;

alter function public.fiado_estornar_venda(bigint) owner to postgres;
revoke all on function public.fiado_estornar_venda(bigint) from public;
revoke execute on function public.fiado_estornar_venda(bigint) from anon;
grant execute on function public.fiado_estornar_venda(bigint) to authenticated, service_role;

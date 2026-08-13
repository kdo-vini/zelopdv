-- Forward-only hardening for the discount trigger.
--
-- The Mesa exception is valid for the direct INSERT used by Mesa closing. An
-- UPDATE must never create the exception by changing tipo_pedido and
-- valor_desconto together on an existing sale.

create or replace function public.vendas_discount_rbac_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_claim_role text := current_setting('request.jwt.claim.role', true);
  v_requires_discount_permission boolean;
begin
  if v_claim_role = 'service_role' then
    return new;
  end if;

  if coalesce(new.valor_desconto, 0) <= 0 then
    return new;
  end if;

  if v_actor is null then
    raise exception 'Usuario nao autenticado' using errcode = '28000';
  end if;

  v_owner := public.get_owner_user_id(v_actor);

  -- SECURITY DEFINER POS/offline calls run as postgres and must always check
  -- pdv.desconto. Only the authenticated Mesa INSERT path gets the exception.
  v_requires_discount_permission :=
    current_user = 'postgres'
    or tg_op = 'UPDATE'
    or coalesce(new.tipo_pedido, 'retirada') <> 'mesa';

  if v_requires_discount_permission
     and not public.fiado_actor_can('pdv.desconto', v_owner) then
    raise exception 'Voce nao tem permissao para aplicar desconto.' using errcode = '42501';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';

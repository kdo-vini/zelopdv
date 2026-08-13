-- Contain positive POS discounts at the database boundary.
--
-- Before this migration, pdv.desconto was enforced only by the browser. A
-- sub-user with pdv.vender + pdv.receber could insert a discounted row into
-- public.vendas directly or through criar_venda_completa(jsonb).
-- Forward-only: never rewrite an applied migration.

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
  -- service_role/maintenance paths retain their existing bypass.
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

  -- Mesa closing is a separate direct-authenticated insert authorized by
  -- mesas.fechar. The SECURITY DEFINER POS/offline RPC always runs as
  -- postgres, so a forged tipo_pedido='mesa' cannot bypass pdv.desconto.
  v_requires_discount_permission :=
    current_user = 'postgres'
    or coalesce(new.tipo_pedido, 'retirada') <> 'mesa';

  if v_requires_discount_permission
     and not public.fiado_actor_can('pdv.desconto', v_owner) then
    raise exception 'Voce nao tem permissao para aplicar desconto.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists vendas_discount_rbac_guard on public.vendas;
create trigger vendas_discount_rbac_guard
  before insert or update of valor_desconto on public.vendas
  for each row
  execute function public.vendas_discount_rbac_guard();

revoke all on function public.vendas_discount_rbac_guard() from public, anon;
grant execute on function public.vendas_discount_rbac_guard() to authenticated, service_role;

notify pgrst, 'reload schema';

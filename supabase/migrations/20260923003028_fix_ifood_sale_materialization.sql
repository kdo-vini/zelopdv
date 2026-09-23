-- The iFood sale RPC uses an empty search_path. Its INSERT invokes the
-- numbering trigger, whose unqualified vendas reference then fails to resolve.
-- Repair the trigger before replaying delivered orders that missed a sale.
begin;

create or replace function public.set_numero_venda()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select coalesce(max(v.numero_venda), 0) + 1
    into new.numero_venda
    from public.vendas as v
   where v.id_usuario = new.id_usuario;
  return new;
end;
$$;

-- The RPC is service-role-only. Reconcile Bem Servido's missed sales only;
-- the RPC and unique index protect against duplicates.
set local role service_role;
do $$
declare
  v_order record;
  v_outcome text;
begin
  for v_order in
    select r.merchant_id, r.external_order_id
      from ifood_internal.order_refs as r
      join public.zelo_orders as zo on zo.id = r.zelo_order_id
     join public.empresa_perfil as ep on ep.id = r.empresa_id
     where r.merchant_id = 'd848b8aa-da9f-4003-9461-5c21ff47ec31'
       and zo.source = 'ifood'
       and zo.status = 'delivered'
       and not exists (
         select 1 from public.vendas as v
          where v.id_usuario = ep.user_id
            and v.client_sale_id = 'zelo-order:' || zo.id::text
       )
     order by zo.closed_at nulls last, zo.id
  loop
    select m.outcome into v_outcome
      from public.materialize_ifood_sale_v1(v_order.merchant_id, v_order.external_order_id) as m;
    if v_outcome not in ('materialized', 'already_exists') or v_outcome is null then
      raise exception 'iFood sale reconciliation failed: %', v_outcome;
    end if;
  end loop;
end;
$$;

commit;

-- Keep the financial close compatible with the current ZeloMenu snapshots.
-- ZeloMenu stores payment as `declaredMethod` and fulfillment as `type`,
-- while early PDV clients sent `method` and `mode`.
create or replace function public.close_zelo_order(
  p_order_id uuid,
  p_expected_revision integer,
  p_payment jsonb,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  o public.zelo_orders;
  v_sale jsonb;
  v_sale_payload jsonb;
begin
  select * into o from public.zelo_orders where id=p_order_id for update;
  if not found then raise exception using errcode='ZL404',message='ORDER_NOT_FOUND'; end if;

  if auth.role()<>'service_role' then
    if p_actor_id is null then p_actor_id:=auth.uid();
    elsif p_actor_id is distinct from auth.uid() then raise exception using errcode='42501',message='FORGED_ACTOR'; end if;
    if not public.zelo_order_has_permission(o.empresa_id,'pedidos.receber') then
      raise exception using errcode='42501',message='ORDER_PERMISSION_DENIED',detail='pedidos.receber';
    end if;
  end if;

  if o.revision<>p_expected_revision then raise exception using errcode='ZL409',message='REVISION_CONFLICT'; end if;
  if o.sale_id is not null then return public.zelo_order_result(o)||jsonb_build_object('idempotent',true); end if;
  if o.status not in ('ready','out_for_delivery') then raise exception using errcode='ZL409',message='INVALID_ORDER_TRANSITION'; end if;

  v_sale_payload:=coalesce(p_payment,'{}')||jsonb_build_object(
    'client_sale_id','zelo-order:'||o.id,
    'valor_total',o.total,
    'forma_pagamento',coalesce(
      nullif(nullif(p_payment->>'forma_pagamento',''),'outro'),
      nullif(nullif(p_payment->>'formaPagamento',''),'outro'),
      nullif(o.payment->>'declaredMethod',''),
      nullif(o.payment->>'method',''),
      'outro'
    ),
    'tipo_pedido',case when coalesce(o.fulfillment->>'mode',o.fulfillment->>'type')='delivery'
      then 'delivery' else 'retirada' end,
    'taxa_entrega',o.delivery_fee,
    'itens',(select coalesce(jsonb_agg(jsonb_build_object(
      'id_produto',i.product_id,
      'nome_produto_na_venda',i.name,
      'preco_unitario_na_venda',i.unit_price,
      'quantidade',i.quantity
    ) order by i.position),'[]'::jsonb)
      from public.zelo_order_items i where i.order_id=o.id),
    -- Stock was committed during accept; an empty list prevents a second
    -- decrement in the sale RPC.
    'estoque','[]'::jsonb
  );

  v_sale:=public.criar_venda_completa(v_sale_payload);
  update public.zelo_orders set sale_id=(v_sale->>'id')::bigint where id=o.id;
  return public.transition_zelo_order(
    o.id,
    o.revision,
    'deliver',
    p_actor_id,
    jsonb_build_object('saleId',v_sale->>'id')
  );
end $$;

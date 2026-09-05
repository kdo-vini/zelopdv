begin;

-- Durable receipts are not writable through the Data API. Every write enters
-- through an authenticated, tenant- and capability-checked command below.
create schema if not exists offline_internal;
revoke all on schema offline_internal from public,anon,authenticated;
create table public.offline_devices (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null check(length(device_id) between 1 and 200),
  registered_by uuid not null, registered_at timestamptz not null default now(),
  primary key(owner_user_id,device_id)
);
create table public.offline_settings (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false, primary_device_id text,
  updated_at timestamptz not null default now()
);
create table public.offline_operations (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  operation_id text not null, device_id text not null, operator_id uuid not null,
  synced_by uuid not null, operation_type text not null, entity_id text not null,
  envelope jsonb not null, status text not null check(status in ('applying','applied','needs_review','rejected')),
  result jsonb, received_at timestamptz not null default now(), applied_at timestamptz,
  transaction_id bigint not null default txid_current(),
  primary key(owner_user_id,operation_id)
);
create index offline_operations_review on public.offline_operations(owner_user_id,status,received_at);
create table offline_internal.entity_aliases (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null, local_id text not null, remote_id text not null,
  primary key(owner_user_id,entity_type,local_id)
);
create table public.offline_reconciliations (
  id uuid primary key default gen_random_uuid(),owner_user_id uuid not null references auth.users(id) on delete cascade,
  operation_id text not null, actor_id uuid not null, action text not null,note text not null,
  created_at timestamptz not null default now(),unique(owner_user_id,operation_id)
);
alter table public.offline_devices enable row level security;
alter table public.offline_settings enable row level security;
alter table public.offline_operations enable row level security;
alter table public.offline_reconciliations enable row level security;
alter table offline_internal.entity_aliases enable row level security;
revoke all on public.offline_devices,public.offline_settings,public.offline_operations,public.offline_reconciliations from public,anon,authenticated;
grant select on public.offline_devices,public.offline_settings,public.offline_operations,public.offline_reconciliations to authenticated;
create policy offline_devices_read on public.offline_devices for select to authenticated using(owner_user_id=public.get_owner_user_id(auth.uid()));
create policy offline_settings_read on public.offline_settings for select to authenticated using(owner_user_id=public.get_owner_user_id(auth.uid()));
create policy offline_operations_read on public.offline_operations for select to authenticated using(owner_user_id=auth.uid() or (owner_user_id=public.get_owner_user_id(auth.uid()) and operator_id=auth.uid()));
create policy offline_reconciliations_read on public.offline_reconciliations for select to authenticated using(owner_user_id=auth.uid());

alter table public.comandas add column offline_revision bigint not null default 0;
alter table public.caixas add column client_operation_id text;
alter table public.caixa_movimentacoes add column client_operation_id text;
create unique index caixas_offline_intent on public.caixas(id_usuario,client_operation_id) where client_operation_id is not null;
create unique index caixa_movimentacoes_offline_intent on public.caixa_movimentacoes(id_usuario,client_operation_id) where client_operation_id is not null;
create table public.offline_stock_divergences (
  id bigint generated always as identity primary key,owner_user_id uuid not null references auth.users(id) on delete cascade,
  operation_id text not null,entity_type text not null,entity_id integer not null,
  previous_quantity numeric not null,resulting_quantity numeric not null,created_at timestamptz not null default now()
);
create table public.offline_caixa_adjustments (
  id bigint generated always as identity primary key,owner_user_id uuid not null references auth.users(id) on delete cascade,
  id_caixa integer not null references public.caixas(id) on delete cascade,operation_id text not null,
  snapshot jsonb not null,created_at timestamptz not null default now(),unique(owner_user_id,id_caixa,operation_id)
);
create table public.offline_pending_receipts (
  owner_user_id uuid not null references auth.users(id) on delete cascade,operation_id text not null,line_number integer not null,
  id_caixa integer references public.caixas(id) on delete set null,forma_pagamento text not null,valor numeric not null check(valor>0),id_pessoa uuid,
  state text not null default 'pending' check(state in ('pending','recognized','duplicate','refunded')),
  created_at timestamptz not null default now(),primary key(owner_user_id,operation_id,line_number)
);
alter table public.offline_pending_receipts enable row level security;
revoke all on public.offline_pending_receipts from public,anon,authenticated;
grant select on public.offline_pending_receipts to authenticated;
create policy offline_pending_receipts_read on public.offline_pending_receipts for select to authenticated using(owner_user_id=public.get_owner_user_id(auth.uid()) and (public.fiado_actor_can('caixa.ver',owner_user_id) or public.fiado_actor_can('caixa.fechar',owner_user_id)));
alter table public.offline_stock_divergences enable row level security;
alter table public.offline_caixa_adjustments enable row level security;
revoke all on public.offline_stock_divergences,public.offline_caixa_adjustments from public,anon,authenticated;
grant select on public.offline_stock_divergences,public.offline_caixa_adjustments to authenticated;
create policy offline_stock_divergences_read on public.offline_stock_divergences for select to authenticated using(owner_user_id=auth.uid());
create policy offline_caixa_adjustments_read on public.offline_caixa_adjustments for select to authenticated using(owner_user_id=public.get_owner_user_id(auth.uid()) and (public.fiado_actor_can('caixa.ver',owner_user_id) or public.fiado_actor_can('caixa.fechar',owner_user_id)));

-- Only these private clones may settle already-collected offline sales below
-- zero. Ordinary RPCs retain their stock predicates. The guard additionally
-- requires a live receipt in this exact transaction, impossible to forge via RLS.
create function offline_internal.negative_stock_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare before_qty numeric; after_qty numeric; op_id text;
begin
  if tg_table_name='categorias' then before_qty:=old.estoque_compartilhado_atual; after_qty:=new.estoque_compartilhado_atual;
  else before_qty:=old.estoque_atual; after_qty:=new.estoque_atual; end if;
  if after_qty<0 and after_qty<coalesce(before_qty,0) then
    select operation_id into op_id from public.offline_operations where owner_user_id=new.id_usuario and synced_by=auth.uid() and status='applying' and transaction_id=txid_current() limit 1;
    if op_id is null then raise exception 'Estoque insuficiente.' using errcode='23514'; end if;
    insert into public.offline_stock_divergences(owner_user_id,operation_id,entity_type,entity_id,previous_quantity,resulting_quantity)
      values(new.id_usuario,op_id,tg_table_name,new.id,coalesce(before_qty,0),after_qty);
  end if;
  return new;
end $$;
alter table public.categorias drop constraint categorias_estoque_compartilhado_atual_nonnegative;
create trigger offline_negative_stock before insert or update of estoque_compartilhado_atual on public.categorias for each row execute function offline_internal.negative_stock_guard();
create trigger offline_negative_stock before update of estoque_atual on public.produtos for each row execute function offline_internal.negative_stock_guard();
do $clone$
declare source text; signature text; name text; quantity text;
begin
  foreach signature in array array['public.criar_venda_completa(jsonb)','public.comanda_aplicar_delta_item(uuid,integer,integer,numeric,jsonb,jsonb)','public.comanda_garantir_estoque_baixado(uuid)'] loop
    source:=pg_get_functiondef(signature::regprocedure); name:=split_part(split_part(signature,'(',1),'.',2);
    source:=replace(source,'FUNCTION public.'||name,'FUNCTION offline_internal.'||name);
    quantity:=case when name='criar_venda_completa' then 'v_linha.qtd' else 'v_stock.quantidade' end;
    if position('and coalesce(estoque_atual, 0) >= '||quantity in source)=0 or position('and coalesce(estoque_compartilhado_atual, 0) >= '||quantity in source)=0 then raise exception 'Offline clone stock predicate drift: %',signature; end if;
    source:=replace(source,'and coalesce(estoque_atual, 0) >= '||quantity,'');
    source:=replace(source,'and coalesce(estoque_compartilhado_atual, 0) >= '||quantity,'');
    if name='criar_venda_completa' then
      if position('and data_fechamento is null;' in source)=0 then raise exception 'Offline caixa selection drift'; end if;
      source:=replace(source,'and data_fechamento is null;',';');
    elsif name='comanda_aplicar_delta_item' then
      if position('v_unit_price,p_delta<0)' in source)=0 then raise exception 'Offline pizza resolver drift'; end if;
      source:=replace(source,'v_unit_price,p_delta<0)','v_unit_price,true)');
      if position('p_pizza jsonb DEFAULT NULL::jsonb)' in source)=0 or position('and pizza is not distinct from v_pizza' in source)=0 then raise exception 'Offline item identity drift'; end if;
      source:=replace(source,'p_pizza jsonb DEFAULT NULL::jsonb)','p_pizza jsonb DEFAULT NULL::jsonb, p_local_item_id uuid DEFAULT NULL::uuid, p_observacao text DEFAULT NULL::text)');
      source:=replace(source,'and pizza is not distinct from v_pizza','and pizza is not distinct from v_pizza and (p_local_item_id is null or id=p_local_item_id)');
      source:=replace(source,'id_comanda, id_produto, quantidade, preco_unitario, observacao,','id, id_comanda, id_produto, quantidade, preco_unitario, observacao,');
      source:=replace(source,'p_id_comanda, p_id_produto, v_qtd_delta, v_unit_price, null,','coalesce(p_local_item_id,gen_random_uuid()), p_id_comanda, p_id_produto, v_qtd_delta, v_unit_price, p_observacao,');
    end if;
    execute source;
  end loop;
end $clone$;
-- Revision follows legacy writes too, so an older online client cannot silently
-- overwrite an offline close. Child mutations take the comanda row lock first.
create function offline_internal.bump_comanda_revision() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_table_name='comandas' then new.offline_revision:=old.offline_revision+1; return new; end if;
  if tg_op='DELETE' then update public.comandas set offline_revision=offline_revision+1 where id=old.id_comanda; return old; end if;
  update public.comandas set offline_revision=offline_revision+1 where id=new.id_comanda; return new;
end $$;


create trigger offline_comanda_revision before update on public.comandas for each row execute function offline_internal.bump_comanda_revision();
create trigger offline_item_revision before insert or update or delete on public.comanda_itens for each row execute function offline_internal.bump_comanda_revision();
create trigger offline_payment_revision before insert or update or delete on public.comanda_pagamentos for each row execute function offline_internal.bump_comanda_revision();

create function offline_internal.actor_owner() returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); owner_id uuid;
begin
  if actor is null then raise exception 'Autenticação necessária.' using errcode='28000'; end if;
  owner_id:=public.get_owner_user_id(actor);
  if owner_id=actor and exists(select 1 from public.access_users where auth_user_id=actor and owner_user_id<>actor and status<>'active')
    and not exists(select 1 from public.subscriptions where user_id=actor) then raise exception 'Operador inativo.' using errcode='42501'; end if;
  return owner_id;
end $$;
create function public.offline_bootstrap_v1(p_device_id text,p_action text default 'read') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id uuid:=offline_internal.actor_owner(); settings public.offline_settings%rowtype; permissions jsonb; registered boolean;
  subscription public.subscriptions%rowtype; entitled boolean;
begin
  if p_device_id is null or length(p_device_id) not between 1 and 200 or p_action not in ('read','register','set_primary','enable','disable') then raise exception 'Aparelho ou ação inválida.'; end if;
  select * into subscription from public.subscriptions where user_id=owner_id order by updated_at desc nulls last,id limit 1;
  entitled:=coalesce(subscription.manually_extended_until>now() or (subscription.status in ('active','trialing') and (subscription.current_period_end is null or subscription.current_period_end>now())),false);
  if p_action not in ('read','disable') and not entitled then raise exception 'Assinatura ativa necessária para preparar o aparelho.' using errcode='42501'; end if;
  if p_action in ('set_primary','enable','disable') and auth.uid()<>owner_id then raise exception 'Somente o titular pode configurar o offline.' using errcode='42501'; end if;
  if p_action<>'read' then
    if not (public.fiado_actor_can('pdv.acessar',owner_id) or public.fiado_actor_can('mesas.acessar',owner_id)) then raise exception 'Sem acesso operacional.' using errcode='42501'; end if;
    insert into public.offline_devices(owner_user_id,device_id,registered_by) values(owner_id,p_device_id,auth.uid()) on conflict do nothing;
    insert into public.offline_settings(owner_user_id) values(owner_id) on conflict do nothing;
    if p_action='set_primary' then update public.offline_settings set primary_device_id=p_device_id,enabled=true,updated_at=now() where owner_user_id=owner_id; end if;
    if p_action in ('enable','disable') then update public.offline_settings set enabled=(p_action='enable'),updated_at=now() where owner_user_id=owner_id; end if;
  end if;
  select * into settings from public.offline_settings where owner_user_id=owner_id;
  select exists(select 1 from public.offline_devices where owner_user_id=owner_id and device_id=p_device_id) into registered;
  select r.permissions into permissions from public.access_users u join public.access_roles r on r.id=u.role_id and r.owner_user_id=owner_id where u.auth_user_id=auth.uid() and u.owner_user_id=owner_id and u.status='active';
  return jsonb_build_object('available',true,'enabled',coalesce(settings.enabled,false) and registered and entitled,'registered',registered,'subscriptionActive',entitled,'hasMesasAccess',coalesce(subscription.has_mesas_addon,false),
    'deviceId',p_device_id,'ownerUserId',owner_id,'operatorId',auth.uid(),'isPrimaryDevice',settings.primary_device_id=p_device_id,
    'primaryDeviceId',settings.primary_device_id,'permissions',permissions,'isOwner',auth.uid()=owner_id,'schemaVersion',1,
    'validatedAt',now(),'expiresAt',now()+interval '7 days');
end $$;

create function offline_internal.resolve_id(p_owner uuid,p_type text,p_id text) returns text language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select remote_id from offline_internal.entity_aliases where owner_user_id=p_owner and entity_type=p_type and local_id=p_id),p_id)
$$;

-- Per-payment fiado identity avoids assigning every partial to the last person.
alter table public.vendas_pagamentos add column if not exists id_pessoa uuid references public.pessoas(id) on delete set null;
alter table public.vendas_pagamentos add column if not exists id_caixa integer references public.caixas(id) on delete set null;
alter table public.comanda_pagamentos add column if not exists id_caixa integer references public.caixas(id) on delete set null;
create or replace function public.fiado_registrar_debito_pagamento_venda() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare sale public.vendas%rowtype; person uuid;
begin
  if new.forma_pagamento<>'fiado' or coalesce(new.valor,0)<=0 then return new; end if;
  select * into sale from public.vendas where id=new.id_venda;
  person:=coalesce(new.id_pessoa,sale.id_cliente);
  if person is null or not exists(select 1 from public.pessoas where id=person and id_usuario=sale.id_usuario) then raise exception 'Pagamento fiado exige cliente da loja.' using errcode='23514'; end if;
  insert into public.fiado_lancamentos(id_usuario,id_pessoa,id_venda,id_caixa,natureza,valor,descricao,idempotency_key,created_at)
    values(sale.id_usuario,person,sale.id,sale.id_caixa,'debito_venda',new.valor,'Parcela fiado da venda','venda-pagamento-fiado:'||new.id,coalesce(sale.created_at,now()))
    on conflict(id_usuario,idempotency_key) where idempotency_key is not null do nothing;
  return new;
end $$;

create function offline_internal.close_mesa(p_owner uuid,p_operation jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p jsonb:=p_operation->'payload'; c public.comandas%rowtype; subtotal numeric; total numeric; paid numeric;
  sale_id bigint; sale_number integer; pay jsonb; payments jsonb; payment_id bigint; forma text; caixa_id integer; person uuid; items_count integer; affected_cash integer;
begin
  select * into c from public.comandas where id=(p->>'comandaId')::uuid and id_usuario=p_owner for update;
  if not found or c.status<>'aberta' then raise exception 'COMANDA_CLOSED_OR_MISSING'; end if;
  if p_operation->>'baseRevision' is null or (p_operation->>'baseRevision')::bigint<>c.offline_revision then raise exception 'COMANDA_REVISION_CONFLICT'; end if;
  caixa_id:=offline_internal.resolve_id(p_owner,'caixa',p->>'id_caixa')::integer;
  perform 1 from public.caixas where id=caixa_id and id_usuario=p_owner for update;
  if not found then raise exception 'CAIXA_RECONCILIATION_REQUIRED'; end if;
  perform offline_internal.comanda_garantir_estoque_baixado(c.id);
  select count(*),round(sum(quantidade*preco_unitario),2) into items_count,subtotal from public.comanda_itens where id_comanda=c.id;
  if items_count=0 then raise exception 'Comanda vazia.'; end if;
  total:=round(greatest(0,subtotal+coalesce(c.couvert_valor,0)-coalesce(c.desconto,0))*(1+coalesce(c.taxa_servico_pct,0)/100),2);
  select coalesce(jsonb_agg(jsonb_build_object('forma_pagamento',forma_pagamento,'valor',valor,'id_pessoa',id_pessoa,'partialId',id,'id_caixa',id_caixa)),'[]')
    into payments from public.comanda_pagamentos where id_comanda=c.id and id_usuario=p_owner;
  if jsonb_typeof(coalesce(p->'payments','[]'))<>'array' then raise exception 'Pagamentos inválidos.'; end if;
  payments:=payments||coalesce((select jsonb_agg(jsonb_build_object('forma_pagamento',np->'forma_pagamento','valor',np->'valor','id_pessoa',np->'id_pessoa')) from jsonb_array_elements(coalesce(p->'payments','[]')) np),'[]');
  select coalesce(sum((v->>'valor')::numeric),0) into paid from jsonb_array_elements(payments) v;
  if paid<>total or exists(select 1 from jsonb_array_elements(payments) v where coalesce((v->>'valor')::numeric,0)<=0 or nullif(v->>'forma_pagamento','') is null) then raise exception 'PAYMENT_TOTAL_CONFLICT'; end if;
  select case when count(distinct v->>'forma_pagamento')=1 then min(v->>'forma_pagamento') else 'multiplo' end into forma from jsonb_array_elements(payments) v;
  select case when count(distinct v->>'id_pessoa')=1 then min(v->>'id_pessoa')::uuid else null end into person from jsonb_array_elements(payments) v where v->>'forma_pagamento'='fiado';
  -- Start multiplo so INSERT sale's legacy fiado trigger cannot double debit;
  -- all actual payments create their own ledger row before final header update.
  insert into public.vendas(id_usuario,id_operador,id_caixa,id_cliente,client_sale_id,valor_total,forma_pagamento,valor_recebido,valor_troco,valor_desconto,tipo_pedido,taxa_entrega,created_at)
    values(p_owner,auth.uid(),caixa_id,person,'mesa-close:'||c.id,total,'multiplo',nullif(p->>'valor_recebido','')::numeric,coalesce((p->>'valor_troco')::numeric,0),c.desconto,'mesa',0,(p_operation->>'occurredAt')::timestamptz)
    returning id,numero_venda into sale_id,sale_number;
  insert into public.vendas_itens(id_usuario,id_venda,id_comanda_item,id_produto,quantidade,nome_produto_na_venda,preco_unitario_na_venda,modifiers,pizza)
    select p_owner,sale_id,i.id,i.id_produto,greatest(1,round(i.quantidade)::integer),coalesce(i.nome_produto_na_venda,pr.nome,''),i.preco_unitario,i.modifiers,i.pizza
    from public.comanda_itens i left join public.produtos pr on pr.id=i.id_produto and pr.id_usuario=p_owner where i.id_comanda=c.id;
  for pay in select * from jsonb_array_elements(payments) loop
    if pay->>'forma_pagamento'='fiado' then
      perform 1 from public.pessoas where id=(pay->>'id_pessoa')::uuid and id_usuario=p_owner for update;
      if not found then raise exception 'Cliente fiado inválido.'; end if;
    end if;
    insert into public.vendas_pagamentos(id_venda,id_usuario,forma_pagamento,valor,id_comanda_pagamento,id_pessoa,id_caixa)
      values(sale_id,p_owner,pay->>'forma_pagamento',(pay->>'valor')::numeric,nullif(pay->>'partialId','')::uuid,nullif(pay->>'id_pessoa','')::uuid,case when pay->>'partialId' is not null then coalesce((pay->>'id_caixa')::integer,caixa_id) else caixa_id end) returning id into payment_id;
    if pay->>'forma_pagamento'='fiado' then update public.pessoas set saldo_fiado=coalesce(saldo_fiado,0)+(pay->>'valor')::numeric where id=(pay->>'id_pessoa')::uuid and id_usuario=p_owner; end if;
    if pay->>'partialId' is not null then
      update public.comanda_pagamento_itens a set id_venda=sale_id,id_venda_pagamento=payment_id,id_venda_item=i.id
        from public.vendas_itens i where a.id_pagamento=(pay->>'partialId')::uuid and a.id_usuario=p_owner and i.id_venda=sale_id and i.id_comanda_item=a.id_comanda_item;
      if exists(select 1 from public.comanda_pagamento_itens where id_pagamento=(pay->>'partialId')::uuid and id_venda_item is null) then raise exception 'PAYMENT_ALLOCATION_CONFLICT'; end if;
    end if;
  end loop;
  update public.vendas set forma_pagamento=forma where id=sale_id;
  delete from public.comanda_pagamentos where id_comanda=c.id and id_usuario=p_owner;
  update public.comandas set status='fechada',fechada_em=(p_operation->>'occurredAt')::timestamptz,id_venda=sale_id,total_calculado=total,id_operador=auth.uid() where id=c.id;
  update public.mesas set status='livre' where id=c.id_mesa and id_usuario=p_owner;
  for affected_cash in select distinct vp.id_caixa from public.vendas_pagamentos vp join public.caixas cx on cx.id=vp.id_caixa where vp.id_venda=sale_id and cx.data_fechamento is not null loop
    perform offline_internal.close_caixa(p_owner,p_operation||jsonb_build_object('payload',jsonb_build_object('id_caixa',affected_cash,'valor_contado_em_gaveta',(select valor_fechamento from public.caixas where id=affected_cash))),true);
  end loop;
  return jsonb_build_object('id',sale_id,'numero_venda',sale_number,'comandaId',c.id,'id_caixa',caixa_id,'valor_total',total);
end $$;

create function offline_internal.close_caixa(p_owner uuid,p_operation jsonb,p_allow_adjustment boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p jsonb:=p_operation->'payload'; c public.caixas%rowtype; counted numeric:=(p->>'valor_contado_em_gaveta')::numeric;
  totals jsonb; gross numeric; expected numeric; movements numeric; cash numeric; card numeric; qty integer; unresolved numeric; closed_at timestamptz:=(p_operation->>'occurredAt')::timestamptz;
begin
  select * into c from public.caixas where id=offline_internal.resolve_id(p_owner,'caixa',p->>'id_caixa')::integer and id_usuario=p_owner for update;
  if not found or (c.data_fechamento is not null and not p_allow_adjustment) then raise exception 'CAIXA_CLOSED_OR_MISSING'; end if;
  if counted is null or counted<0 then raise exception 'Contagem inválida.'; end if;
  select coalesce(jsonb_object_agg(forma,valor),'{}') into totals from (
    select forma,sum(valor) valor from (
      select vp.forma_pagamento forma,vp.valor from public.vendas_pagamentos vp join public.vendas v on v.id=vp.id_venda where coalesce(vp.id_caixa,v.id_caixa)=c.id and v.id_usuario=p_owner
      union all select pp.forma_pagamento,pp.valor from public.comanda_pagamentos pp where pp.id_caixa=c.id and pp.id_usuario=p_owner
      union all select pr.forma_pagamento,pr.valor from public.offline_pending_receipts pr where pr.id_caixa=c.id and pr.owner_user_id=p_owner and (pr.state='pending' or (pr.state='refunded' and pr.forma_pagamento='dinheiro'))
      union all select v.forma_pagamento,case when v.forma_pagamento='dinheiro' then greatest(0,coalesce(nullif(v.valor_recebido,0),v.valor_total)-coalesce(v.valor_troco,0)) else v.valor_total end
      from public.vendas v where v.id_caixa=c.id and v.id_usuario=p_owner and v.forma_pagamento<>'multiplo' and not exists(select 1 from public.vendas_pagamentos vp where vp.id_venda=v.id)
    ) all_payments group by forma
  ) grouped;
  select coalesce(sum(value::numeric),0) into gross from jsonb_each_text(totals);
  select coalesce(sum(valor),0) into unresolved from public.offline_pending_receipts where id_caixa=c.id and owner_user_id=p_owner and forma_pagamento<>'fiado' and (state='pending' or (state='refunded' and forma_pagamento='dinheiro'));
  gross:=gross-unresolved;
  select count(*) into qty from public.vendas where id_caixa=c.id and id_usuario=p_owner;
  select coalesce(sum(case when tipo='suprimento' then valor else -valor end),0) into movements from public.caixa_movimentacoes where id_caixa=c.id and id_usuario=p_owner;
  cash:=coalesce((totals->>'dinheiro')::numeric,0); card:=coalesce((totals->>'cartao')::numeric,0)+coalesce((totals->>'cartao_debito')::numeric,0)+coalesce((totals->>'cartao_credito')::numeric,0);
  expected:=c.valor_inicial+cash+movements;
  if c.data_fechamento is not null then
    insert into public.offline_caixa_adjustments(owner_user_id,id_caixa,operation_id,snapshot)
      values(p_owner,c.id,p_operation->>'operationId',jsonb_build_object('valor_esperado_em_gaveta',expected,'valor_contado_em_gaveta',c.valor_fechamento,'diferenca',c.valor_fechamento-expected,'totais_pagamento',totals,'quantidade_vendas',qty,'total_geral',gross-coalesce((totals->>'fiado')::numeric,0),'recebimentos_a_conferir',unresolved)) on conflict do nothing;
  else
    insert into public.caixa_fechamentos(id_caixa,id_usuario,id_operador,data_fechamento,total_dinheiro,total_cartao,total_pix,totais_pagamento,total_geral,valor_inicial,valor_esperado_em_gaveta,valor_contado_em_gaveta,diferenca,quantidade_vendas)
    values(c.id,p_owner,auth.uid(),closed_at,cash,card,coalesce((totals->>'pix')::numeric,0),totals,gross-coalesce((totals->>'fiado')::numeric,0),c.valor_inicial,expected,counted,counted-expected,qty);
    update public.caixas set data_fechamento=closed_at,valor_fechamento=counted,diferenca_fechamento=counted-expected where id=c.id;
  end if;
  return jsonb_build_object('id',c.id,'valor_esperado_em_gaveta',expected,'valor_contado_em_gaveta',counted,'diferenca',counted-expected,'totais_pagamento',totals,'recebimentos_a_conferir',unresolved);
end $$;

create function offline_internal.preserve_received_conflict(p_owner uuid,p_operation jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare payments jsonb; pay jsonb; n integer:=0; caixa_id integer; p jsonb:=p_operation->'payload';
begin
  if p_operation->>'type'='mesa.close' then payments:=coalesce(p->'payments','[]');
  elsif p_operation->>'type'='mesa.payment.add' then payments:=jsonb_build_array(p);
  elsif p_operation->>'type'='sale.create' then
    if p->>'forma_pagamento'='multiplo' then
      select coalesce(jsonb_agg(pay||jsonb_build_object('id_pessoa',coalesce(pay->'id_pessoa',p->'id_cliente'))),'[]') into payments from jsonb_array_elements(coalesce(p->'pagamentos','[]')) pay;
    else payments:=jsonb_build_array(jsonb_build_object('forma_pagamento',p->>'forma_pagamento','valor',p->'valor_total','id_pessoa',p->'id_cliente')); end if;
  else return; end if;
  if jsonb_typeof(payments)<>'array' then return; end if;
  caixa_id:=offline_internal.resolve_id(p_owner,'caixa',p->>'id_caixa')::integer;
  if not exists(select 1 from public.caixas where id=caixa_id and id_usuario=p_owner) then caixa_id:=null; end if;
  perform pg_advisory_xact_lock(hashtextextended('offline-caixa:'||p_owner,0));
  for pay in select * from jsonb_array_elements(payments) loop
    n:=n+1;
    if (pay->>'valor')::numeric>0 and nullif(pay->>'forma_pagamento','') is not null then
      insert into public.offline_pending_receipts(owner_user_id,operation_id,line_number,id_caixa,forma_pagamento,valor,id_pessoa)
        values(p_owner,p_operation->>'operationId',n,caixa_id,pay->>'forma_pagamento',(pay->>'valor')::numeric,nullif(pay->>'id_pessoa','')::uuid) on conflict do nothing;
    end if;
  end loop;
  if exists(select 1 from public.caixas where id=caixa_id and data_fechamento is not null) then
    perform offline_internal.close_caixa(p_owner,p_operation||jsonb_build_object('payload',jsonb_build_object('id_caixa',caixa_id,'valor_contado_em_gaveta',(select valor_fechamento from public.caixas where id=caixa_id))),true);
  end if;
exception when invalid_text_representation or numeric_value_out_of_range then
  -- Malformed incoming amounts remain in the immutable envelope for support;
  -- they cannot be turned into money by guessing a value.
  return;
end $$;

create function offline_internal.dispatch(p_owner uuid,p_operation jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p jsonb:=p_operation->'payload'; kind text:=p_operation->>'type'; c public.comandas%rowtype;
  m public.mesas%rowtype; item public.comanda_itens%rowtype; v_result jsonb; remote_id text; local_id text;
  caixa_id integer; item_id uuid; payment_id uuid; a jsonb; count_alloc numeric; total_alloc numeric; caps text[]; cap text;
begin
  caps:=case kind
    when 'sale.create' then array['pdv.vender','pdv.receber']
    when 'caixa.open' then array['caixa.abrir'] when 'caixa.move' then array['caixa.movimentar'] when 'caixa.close' then array['caixa.fechar']
    when 'mesa.open' then array['mesas.acessar','mesas.abrir_comanda']
    when 'mesa.item.add' then array['mesas.acessar','mesas.editar_itens'] when 'mesa.item.delta' then array['mesas.acessar','mesas.editar_itens']
    when 'mesa.update' then array['mesas.acessar','mesas.editar_itens'] when 'mesa.transfer' then array['mesas.acessar','mesas.editar_itens']
    when 'mesa.cancel' then array['mesas.acessar','mesas.cancelar']
    when 'mesa.payment.add' then array['mesas.acessar'] when 'mesa.payment.remove' then array['mesas.acessar']
    when 'mesa.close' then array['mesas.acessar','mesas.fechar'] else null end;
  if caps is null then raise exception 'Unsupported offline operation.' using errcode='22023'; end if;
  foreach cap in array caps loop
    if not public.fiado_actor_can(cap,p_owner) then raise exception 'Permissão necessária: %',cap using errcode='42501'; end if;
  end loop;
  if kind in ('mesa.payment.add','mesa.payment.remove','mesa.close') and not (public.fiado_actor_can('pdv.receber',p_owner) or public.fiado_actor_can('pedidos.receber',p_owner)) then raise exception 'Recebimento não autorizado.' using errcode='42501'; end if;
  if kind like 'caixa.%' and not exists(select 1 from public.offline_settings where owner_user_id=p_owner and primary_device_id=p_operation->>'deviceId') then raise exception 'CAIXA_PRIMARY_DEVICE_REQUIRED'; end if;
  if kind in ('sale.create','caixa.open','caixa.move','caixa.close','mesa.close','mesa.payment.add','mesa.payment.remove') then
    -- Shared with close/open across operators; avoids a queued sale racing close.
    perform pg_advisory_xact_lock(hashtextextended('offline-caixa:'||p_owner,0));
  end if;
  if kind='sale.create' then
    if nullif(p->>'client_sale_id','') is not null and p->>'client_sale_id'<>p_operation->>'operationId' then raise exception 'SALE_OPERATION_ID_MISMATCH' using errcode='22023'; end if;
    caixa_id:=offline_internal.resolve_id(p_owner,'caixa',p->>'id_caixa')::integer;
    if caixa_id is null or not exists(select 1 from public.caixas where id=caixa_id and id_usuario=p_owner) then raise exception 'CAIXA_RECONCILIATION_REQUIRED'; end if;
    p:=p||jsonb_build_object('id_caixa',caixa_id,'client_sale_id',coalesce(nullif(p->>'client_sale_id',''),p_operation->>'operationId'),'created_at',p_operation->>'occurredAt','pizza_offline',true);
    v_result:=offline_internal.criar_venda_completa(p);
    if coalesce((v_result->>'idempotent')::boolean,false)=false and exists(select 1 from public.caixas where id=caixa_id and data_fechamento is not null) then
      perform offline_internal.close_caixa(p_owner,p_operation||jsonb_build_object('payload',jsonb_build_object('id_caixa',caixa_id,'valor_contado_em_gaveta',(select valor_fechamento from public.caixas where id=caixa_id))),true);
      v_result:=v_result||jsonb_build_object('cashAdjustment',true);
    end if;
    return v_result;
  elsif kind='caixa.open' then
    if exists(select 1 from public.caixas where id_usuario=p_owner and data_fechamento is null) then raise exception 'CAIXA_ALREADY_OPEN'; end if;
    if (p->>'valor_inicial')::numeric<0 or p->>'valor_inicial' is null then raise exception 'Valor inicial inválido.'; end if;
    insert into public.caixas(id_usuario,id_operador,valor_inicial,data_abertura,client_operation_id) values(p_owner,auth.uid(),(p->>'valor_inicial')::numeric,(p_operation->>'occurredAt')::timestamptz,p_operation->>'operationId') returning id into caixa_id;
    insert into offline_internal.entity_aliases values(p_owner,'caixa',p_operation->>'entityId',caixa_id::text);
    return jsonb_build_object('id',caixa_id,'localId',p_operation->>'entityId');
  elsif kind='caixa.move' then
    caixa_id:=offline_internal.resolve_id(p_owner,'caixa',p->>'id_caixa')::integer;
    if not exists(select 1 from public.caixas where id=caixa_id and id_usuario=p_owner and data_fechamento is null) then raise exception 'CAIXA_CLOSED_OR_MISSING'; end if;
    if coalesce((p->>'valor')::numeric,0)<=0 or p->>'tipo' not in ('sangria','suprimento') then raise exception 'Movimentação inválida.'; end if;
    insert into public.caixa_movimentacoes(id_caixa,id_usuario,id_operador,tipo,valor,motivo,created_at,client_operation_id)
      values(caixa_id,p_owner,auth.uid(),p->>'tipo',(p->>'valor')::numeric,p->>'motivo',(p_operation->>'occurredAt')::timestamptz,p_operation->>'operationId') returning id::text into remote_id;
    return jsonb_build_object('id',remote_id,'id_caixa',caixa_id);
  elsif kind='caixa.close' then return offline_internal.close_caixa(p_owner,p_operation);
  elsif kind='mesa.close' then return offline_internal.close_mesa(p_owner,p_operation);
  elsif kind='mesa.open' then
    select * into m from public.mesas where id=(p->>'mesaId')::uuid and id_usuario=p_owner and ativa is true for update;
    if not found or exists(select 1 from public.comandas where id_mesa=m.id and status='aberta') then raise exception 'MESA_ALREADY_OCCUPIED_OR_MISSING'; end if;
    insert into public.comandas(id,id_mesa,id_usuario,id_operador,num_pessoas,observacao,aberta_em)
      values((p->>'comandaId')::uuid,m.id,p_owner,auth.uid(),coalesce((p->>'num_pessoas')::integer,1),p->>'observacao',(p_operation->>'occurredAt')::timestamptz);
    update public.mesas set status='ocupada' where id=m.id;
    return jsonb_build_object('comandaId',p->>'comandaId','id',p->>'comandaId','revision',0);
  end if;

  select * into c from public.comandas where id=(p->>'comandaId')::uuid and id_usuario=p_owner for update;
  if not found or c.status<>'aberta' then raise exception 'COMANDA_CLOSED_OR_MISSING'; end if;
  if kind not in ('mesa.item.add','mesa.payment.add') and (p_operation->>'baseRevision' is null or (p_operation->>'baseRevision')::bigint<>c.offline_revision) then raise exception 'COMANDA_REVISION_CONFLICT'; end if;
  if kind in ('mesa.item.add','mesa.item.delta') then
    item_id:=nullif(offline_internal.resolve_id(p_owner,'item',p->>'itemId'),'')::uuid;
    if coalesce((p->>'delta')::integer,0)=0 or (kind='mesa.item.add' and (p->>'delta')::integer<1) then raise exception 'Quantidade inválida.'; end if;
    if kind='mesa.item.delta' and p->>'itemId' is not null then
      item_id:=offline_internal.resolve_id(p_owner,'item',p->>'itemId')::uuid;
      select * into item from public.comanda_itens where id=item_id and id_comanda=c.id;
      if not found then raise exception 'ITEM_NOT_FOUND'; end if;
      if (p->>'delta')::integer<0 then
        select coalesce(sum(quantidade),0) into count_alloc from public.comanda_pagamento_itens where id_comanda_item=item.id;
        if item.quantidade+(p->>'delta')::integer<count_alloc then raise exception 'ITEM_ALREADY_PAID'; end if;
      end if;
      p:=p||jsonb_build_object('produtoId',item.id_produto,'precoUnitario',item.preco_unitario,'modifiers',item.modifiers,'pizza',item.pizza);
    end if;
    perform offline_internal.comanda_aplicar_delta_item(c.id,(p->>'produtoId')::integer,(p->>'delta')::integer,(p->>'precoUnitario')::numeric,coalesce(p->'modifiers','[]'),nullif(p->'pizza','null'),item_id,p->>'observacao');
    select id into item_id from public.comanda_itens where id_comanda=c.id and id_produto=(p->>'produtoId')::integer and modifiers=coalesce(p->'modifiers','[]')
      and (item_id is null or id=item_id)
      and (pizza is not distinct from nullif(p->'pizza','null') or (pizza->>'revision'=p#>>'{pizza,revision}' and pizza->>'sizeId'=p#>>'{pizza,sizeId}' and pizza->'flavorIds'=p#>'{pizza,flavorIds}')) limit 1;
    if kind='mesa.item.add' and item_id is not null and p->>'itemId' is not null then
      insert into offline_internal.entity_aliases values(p_owner,'item',p->>'itemId',item_id::text) on conflict do nothing;
    end if;
    v_result:=jsonb_build_object('itemId',item_id,'comandaId',c.id);
  elsif kind='mesa.payment.add' then
    payment_id:=(p->>'paymentId')::uuid;
    caixa_id:=offline_internal.resolve_id(p_owner,'caixa',p->>'id_caixa')::integer;
    if caixa_id is null or not exists(select 1 from public.caixas where id=caixa_id and id_usuario=p_owner) then raise exception 'CAIXA_RECONCILIATION_REQUIRED'; end if;
    if coalesce((p->>'valor')::numeric,0)<=0 or nullif(p->>'forma_pagamento','') is null then raise exception 'Pagamento inválido.'; end if;
    if p->>'forma_pagamento'='fiado' and not exists(select 1 from public.pessoas where id=(p->>'id_pessoa')::uuid and id_usuario=p_owner) then raise exception 'Cliente fiado inválido.'; end if;
    insert into public.comanda_pagamentos(id,id_comanda,id_usuario,forma_pagamento,valor,id_pessoa,observacao,created_at,id_caixa)
      values(payment_id,c.id,p_owner,p->>'forma_pagamento',(p->>'valor')::numeric,nullif(p->>'id_pessoa','')::uuid,p->>'observacao',(p_operation->>'occurredAt')::timestamptz,caixa_id);
    total_alloc:=0;
    for a in select * from jsonb_array_elements(coalesce(p->'allocations','[]')) loop
      item_id:=offline_internal.resolve_id(p_owner,'item',a->>'itemId')::uuid;
      select * into item from public.comanda_itens where id=item_id and id_comanda=c.id for update;
      if not found then raise exception 'PAYMENT_ITEM_NOT_FOUND'; end if;
      select coalesce(sum(quantidade),0) into count_alloc from public.comanda_pagamento_itens where id_comanda_item=item_id;
      if coalesce((a->>'quantidade')::numeric,0)<=0 or count_alloc+(a->>'quantidade')::numeric>item.quantidade then raise exception 'ITEM_ALREADY_PAID'; end if;
      if round((a->>'quantidade')::numeric*item.preco_unitario,2)<>(a->>'valor')::numeric then raise exception 'PAYMENT_ALLOCATION_PRICE_CONFLICT'; end if;
      insert into public.comanda_pagamento_itens(id_pagamento,id_comanda,id_comanda_item,id_usuario,quantidade,preco_unitario,valor)
        values(payment_id,c.id,item_id,p_owner,(a->>'quantidade')::numeric,item.preco_unitario,(a->>'valor')::numeric);
      total_alloc:=total_alloc+(a->>'valor')::numeric;
    end loop;
    if jsonb_array_length(coalesce(p->'allocations','[]'))>0 and total_alloc<>(p->>'valor')::numeric then raise exception 'PAYMENT_ALLOCATION_TOTAL_CONFLICT'; end if;
    if exists(select 1 from public.caixas where id=caixa_id and data_fechamento is not null) then
      perform offline_internal.close_caixa(p_owner,p_operation||jsonb_build_object('payload',jsonb_build_object('id_caixa',caixa_id,'valor_contado_em_gaveta',(select valor_fechamento from public.caixas where id=caixa_id))),true);
    end if;
    v_result:=jsonb_build_object('paymentId',payment_id,'comandaId',c.id);
  elsif kind='mesa.payment.remove' then
    select id_caixa into caixa_id from public.comanda_pagamentos where id=(p->>'paymentId')::uuid and id_comanda=c.id and id_usuario=p_owner;
    delete from public.comanda_pagamento_itens where id_pagamento=(p->>'paymentId')::uuid and id_comanda=c.id and id_usuario=p_owner;
    delete from public.comanda_pagamentos where id=(p->>'paymentId')::uuid and id_comanda=c.id and id_usuario=p_owner;
    if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
    if exists(select 1 from public.caixas where id=caixa_id and data_fechamento is not null) then
      perform offline_internal.close_caixa(p_owner,p_operation||jsonb_build_object('payload',jsonb_build_object('id_caixa',caixa_id,'valor_contado_em_gaveta',(select valor_fechamento from public.caixas where id=caixa_id))),true);
    end if;
    v_result:=jsonb_build_object('paymentId',p->>'paymentId','comandaId',c.id);
  elsif kind='mesa.update' then
    if jsonb_typeof(p->'changes') is distinct from 'object' then raise exception 'Alteração inválida.'; end if;
    if exists(select 1 from jsonb_object_keys(p->'changes') k where k not in ('num_pessoas','observacao','taxa_servico_pct','couvert_valor','desconto')) then raise exception 'Campo inválido.'; end if;
    if coalesce((p#>>'{changes,num_pessoas}')::integer,1)<1 or coalesce((p#>>'{changes,taxa_servico_pct}')::numeric,0) not between 0 and 100
      or coalesce((p#>>'{changes,couvert_valor}')::numeric,0)<0 or coalesce((p#>>'{changes,desconto}')::numeric,0)<0 then raise exception 'Valores da comanda inválidos.'; end if;
    if p#>>'{changes,desconto}' is not null and not public.fiado_actor_can('pdv.desconto',p_owner) then raise exception 'Desconto não autorizado.' using errcode='42501'; end if;
    update public.comandas set num_pessoas=coalesce((p#>>'{changes,num_pessoas}')::integer,num_pessoas),observacao=case when p->'changes'?'observacao' then p#>>'{changes,observacao}' else observacao end,
      taxa_servico_pct=coalesce((p#>>'{changes,taxa_servico_pct}')::numeric,taxa_servico_pct),couvert_valor=coalesce((p#>>'{changes,couvert_valor}')::numeric,couvert_valor),desconto=coalesce((p#>>'{changes,desconto}')::numeric,desconto) where id=c.id;
    v_result:=jsonb_build_object('comandaId',c.id);
  elsif kind='mesa.cancel' then
    if exists(select 1 from public.comanda_pagamentos where id_comanda=c.id) then raise exception 'PAYMENTS_REQUIRE_RECONCILIATION'; end if;
    perform public.comanda_cancelar_com_estoque(c.id);
    v_result:=jsonb_build_object('comandaId',c.id);
  elsif kind='mesa.transfer' then
    select * into m from public.mesas where id=(p->>'mesaId')::uuid and id_usuario=p_owner and ativa is true for update;
    if not found or exists(select 1 from public.comandas where id_mesa=m.id and status='aberta') then raise exception 'MESA_ALREADY_OCCUPIED_OR_MISSING'; end if;
    update public.comandas set id_mesa=m.id where id=c.id;
    update public.mesas set status='livre' where id=c.id_mesa and id_usuario=p_owner;
    update public.mesas set status='ocupada' where id=m.id;
    v_result:=jsonb_build_object('comandaId',c.id,'mesaId',m.id);
  end if;
  return v_result||jsonb_build_object('revision',(select offline_revision from public.comandas where id=c.id));
end $$;

create function public.apply_offline_operation_v1(p_operation jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id uuid:=offline_internal.actor_owner(); op_id text:=p_operation->>'operationId'; receipt public.offline_operations%rowtype;
  canonical jsonb; v_result jsonb; result_status text; error_code text; message text; origin_operator uuid;
begin
  if p_operation->>'schemaVersion' is distinct from '1' or op_id is null or length(op_id) not between 1 and 200
    or jsonb_typeof(p_operation->'payload')<>'object' or jsonb_typeof(p_operation->'dependencies')<>'array'
    or p_operation->>'deviceId' is null or p_operation->>'entityId' is null or p_operation->>'occurredAt' is null then raise exception 'Operação inválida.' using errcode='22023'; end if;
  origin_operator:=nullif(p_operation->>'operatorId','')::uuid;
  if p_operation->>'ownerUserId' is distinct from owner_id::text or origin_operator is null
    or (origin_operator<>auth.uid() and auth.uid()<>owner_id) then raise exception 'Origem não autorizada.' using errcode='42501'; end if;
  if not exists(select 1 from public.offline_devices where owner_user_id=owner_id and device_id=p_operation->>'deviceId') then raise exception 'Aparelho não preparado.' using errcode='42501'; end if;
  -- Compare canonical JSONB itself, not a caller-supplied digest. Field order
  -- and formatting do not matter; altered type, entity or payload does.
  canonical:=jsonb_build_object('operationId',op_id,'type',p_operation->'type','deviceId',p_operation->'deviceId','operatorId',p_operation->'operatorId',
    'entityType',p_operation->'entityType','entityId',p_operation->'entityId','sequence',p_operation->'sequence','dependencies',p_operation->'dependencies',
    'baseRevision',p_operation->'baseRevision','occurredAt',p_operation->'occurredAt','payload',p_operation->'payload');
  perform pg_advisory_xact_lock(hashtextextended('offline-operation:'||owner_id||':'||op_id,0));
  select * into receipt from public.offline_operations where owner_user_id=owner_id and operation_id=op_id for update;
  if found then
    if receipt.envelope<>canonical then raise exception 'OPERATION_CONTENT_MISMATCH' using errcode='22023'; end if;
    return jsonb_build_object('operationId',op_id,'status',case when receipt.status='applied' then 'already_applied' else receipt.status end,'result',receipt.result);
  end if;
  if exists(select 1 from jsonb_array_elements_text(p_operation->'dependencies') d where not exists(select 1 from public.offline_operations where owner_user_id=owner_id and operation_id=d and status='applied')) then raise exception 'Dependência ainda não sincronizada.' using errcode='40001'; end if;
  insert into public.offline_operations(owner_user_id,operation_id,device_id,operator_id,synced_by,operation_type,entity_id,envelope,status)
    values(owner_id,op_id,p_operation->>'deviceId',origin_operator,auth.uid(),p_operation->>'type',p_operation->>'entityId',canonical,'applying');
  begin
    if origin_operator<>auth.uid() then
      v_result:=jsonb_build_object('code','OPERATOR_RECONCILIATION_REQUIRED','error','O titular deve conferir o registro recuperado de outro operador.'); result_status:='needs_review';
    else v_result:=offline_internal.dispatch(owner_id,p_operation); result_status:='applied'; end if;
  exception when check_violation or foreign_key_violation or unique_violation or invalid_text_representation or numeric_value_out_of_range or raise_exception or insufficient_privilege then
    get stacked diagnostics error_code=returned_sqlstate,message=message_text;
    result_status:=case when error_code='42501' then 'rejected' else 'needs_review' end;
    v_result:=jsonb_build_object('code',error_code,'error',message);
  end;
  if result_status='needs_review' then perform offline_internal.preserve_received_conflict(owner_id,p_operation); end if;
  update public.offline_operations set status=result_status,result=v_result,applied_at=case when result_status='applied' then now() end where owner_user_id=owner_id and operation_id=op_id;
  return jsonb_build_object('operationId',op_id,'status',result_status,'result',v_result);
end $$;

create function public.reconcile_offline_operation_v1(p_operation_id text,p_action text,p_note text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id uuid:=offline_internal.actor_owner(); receipt public.offline_operations%rowtype; v_result jsonb; decision public.offline_reconciliations%rowtype;
  caixa_id integer; total numeric; cash numeric; payments jsonb; fiados jsonb; person uuid; forma text; sale_payload jsonb; refund_id bigint;
begin
  if auth.uid()<>owner_id then raise exception 'Somente o titular pode conferir.' using errcode='42501'; end if;
  if p_action not in ('record_duplicate','retry','record_additional_sale','record_refund') or p_note is null or length(trim(p_note))<5 or length(p_note)>2000 then raise exception 'Decisão inválida.'; end if;
  select * into receipt from public.offline_operations where owner_user_id=owner_id and operation_id=p_operation_id for update;
  if not found then raise exception 'Operação não aguarda conferência.'; end if;
  select * into decision from public.offline_reconciliations where owner_user_id=owner_id and operation_id=p_operation_id;
  if found then
    if decision.action<>p_action or decision.note<>p_note then raise exception 'RECONCILIATION_CONTENT_MISMATCH'; end if;
    return jsonb_build_object('operationId',p_operation_id,'status','already_applied','result',receipt.result);
  end if;
  if receipt.status not in ('needs_review','rejected') then raise exception 'Operação não aguarda conferência.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('offline-caixa:'||owner_id,0));
  perform 1 from public.offline_pending_receipts where owner_user_id=owner_id and operation_id=p_operation_id for update;
  update public.offline_operations set status='applying',transaction_id=txid_current(),synced_by=auth.uid() where owner_user_id=owner_id and operation_id=p_operation_id;
  if p_action='retry' then
    update public.offline_pending_receipts set state='recognized' where owner_user_id=owner_id and operation_id=p_operation_id;
    v_result:=offline_internal.dispatch(owner_id,receipt.envelope||jsonb_build_object('ownerUserId',owner_id,'schemaVersion',1));
  elsif p_action in ('record_additional_sale','record_refund') then
    select min(id_caixa),sum(valor),coalesce(sum(valor) filter(where forma_pagamento='dinheiro'),0),
      jsonb_agg(jsonb_build_object('forma_pagamento',forma_pagamento,'valor',valor)),
      coalesce(jsonb_agg(jsonb_build_object('id_pessoa',id_pessoa,'valor',valor)) filter(where forma_pagamento='fiado'),'[]'),
      case when count(distinct forma_pagamento)=1 then min(forma_pagamento) else 'multiplo' end
      into caixa_id,total,cash,payments,fiados,forma from public.offline_pending_receipts where owner_user_id=owner_id and operation_id=p_operation_id and state='pending';
    if caixa_id is null or total is null or total<=0 then raise exception 'Não há recebimento com turno identificado para esta decisão.'; end if;
    if exists(select 1 from public.offline_pending_receipts where owner_user_id=owner_id and operation_id=p_operation_id and (id_caixa is null or id_caixa<>caixa_id)) then raise exception 'Confira a atribuição do turno antes de concluir.'; end if;
    if p_action='record_additional_sale' then
      if (select count(distinct id_pessoa) from public.offline_pending_receipts where owner_user_id=owner_id and operation_id=p_operation_id and forma_pagamento='fiado')>1 then raise exception 'Confira separadamente os clientes de fiado deste recebimento.'; end if;
      select min(id_pessoa::text)::uuid into person from public.offline_pending_receipts where owner_user_id=owner_id and operation_id=p_operation_id and forma_pagamento='fiado';
      if jsonb_array_length(fiados)>0 and not exists(select 1 from public.pessoas where id=person and id_usuario=owner_id) then raise exception 'Cliente fiado inválido.'; end if;
      sale_payload:=jsonb_build_object('client_sale_id','reconciled-additional:'||p_operation_id,'id_caixa',caixa_id,'id_cliente',person,'valor_total',total,
        'forma_pagamento','multiplo','valor_recebido',cash,'valor_troco',0,'tipo_pedido','mesa','created_at',receipt.envelope->>'occurredAt',
        'itens',jsonb_build_array(jsonb_build_object('nome','Consumo adicional conferido — '||p_note,'quantidade',1,'preco',total)),
        'pagamentos',payments,'fiados',fiados);
      v_result:=offline_internal.criar_venda_completa(sale_payload);
      update public.vendas set forma_pagamento=forma where id=(v_result->>'id')::bigint and id_usuario=owner_id;
      update public.offline_pending_receipts set state='recognized' where owner_user_id=owner_id and operation_id=p_operation_id;
      v_result:=v_result||jsonb_build_object('reconciled',true,'action',p_action);
    else
      if jsonb_array_length(fiados)>0 then raise exception 'Fiado é dívida, não dinheiro devolvido. Confira o registro de dívida.'; end if;
      update public.offline_pending_receipts set state='refunded' where owner_user_id=owner_id and operation_id=p_operation_id;
      if cash>0 then insert into public.caixa_movimentacoes(id_caixa,id_usuario,id_operador,tipo,valor,motivo,client_operation_id)
        values(caixa_id,owner_id,auth.uid(),'sangria',cash,'Devolução já realizada, conferida: '||p_note,'refund:'||p_operation_id) returning id into refund_id; end if;
      v_result:=jsonb_build_object('reconciled',true,'action',p_action,'valor',total,'id_caixa',caixa_id,'refundMovementId',refund_id,'refundClientOperationId','refund:'||p_operation_id);
    end if;
  else
    -- No automatic financial write: the owner explicitly attests a repeated
    -- record, preserved alongside the original payload and audit note.
    v_result:=jsonb_build_object('reconciled',true,'action',p_action);
    update public.offline_pending_receipts set state='duplicate' where owner_user_id=owner_id and operation_id=p_operation_id;
  end if;
  v_result:=v_result||jsonb_build_object('reconciliationAction',p_action,'reconciled',true,'valor',coalesce(total,(select sum(valor) from public.offline_pending_receipts where owner_user_id=owner_id and operation_id=p_operation_id)),
    'payments',coalesce(payments,(select jsonb_agg(jsonb_build_object('forma_pagamento',forma_pagamento,'valor',valor)) from public.offline_pending_receipts where owner_user_id=owner_id and operation_id=p_operation_id)));
  for caixa_id in select distinct r.id_caixa from public.offline_pending_receipts r join public.caixas c on c.id=r.id_caixa where r.owner_user_id=owner_id and r.operation_id=p_operation_id and c.data_fechamento is not null loop
    perform offline_internal.close_caixa(owner_id,receipt.envelope||jsonb_build_object('operationId','reconcile:'||p_operation_id,'payload',jsonb_build_object('id_caixa',caixa_id,'valor_contado_em_gaveta',(select valor_fechamento from public.caixas where id=caixa_id))),true);
  end loop;
  insert into public.offline_reconciliations(owner_user_id,operation_id,actor_id,action,note) values(owner_id,p_operation_id,auth.uid(),p_action,p_note);
  update public.offline_operations set status='applied',result=v_result,applied_at=now(),synced_by=auth.uid() where owner_user_id=owner_id and operation_id=p_operation_id;
  return jsonb_build_object('operationId',p_operation_id,'status','applied','result',v_result);
end $$;

-- Recognize only the verified atomic Mesa closing context without granting
-- PDV sale permissions to a Mesa-only cashier.
do $guard$
declare source text;
begin
  source:=pg_get_functiondef('public.vendas_insert_rbac_guard()'::regprocedure);
  if position('if current_user = ''postgres'' then' in source)=0 then raise exception 'Sale RBAC guard drift'; end if;
  source:=replace(source,'if current_user = ''postgres'' then',$code$
  if new.tipo_pedido='mesa' and exists(select 1 from public.offline_operations where owner_user_id=v_owner and synced_by=auth.uid() and transaction_id=txid_current() and status='applying' and operation_type='mesa.close') then
    if not public.fiado_actor_can('mesas.fechar',v_owner) then raise exception 'Fechamento não autorizado.' using errcode='42501'; end if;
  elsif current_user = 'postgres' then
  $code$);
  execute source;
end $guard$;

create function public.apply_online_close_v1(p_kind text,p_payload jsonb,p_client_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id uuid:=offline_internal.actor_owner(); op jsonb; receipt public.offline_operations%rowtype; v_result jsonb; op_id text:='online:'||p_client_id;
begin
  if p_kind not in ('mesa.close','caixa.close') or p_client_id is null or length(p_client_id) not between 1 and 180 or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Fechamento inválido.' using errcode='22023'; end if;
  if not public.fiado_actor_can(case when p_kind='mesa.close' then 'mesas.fechar' else 'caixa.fechar' end,owner_id) then raise exception 'Fechamento não autorizado.' using errcode='42501'; end if;
  if p_kind='mesa.close' and (not public.fiado_actor_can('mesas.acessar',owner_id) or not (public.fiado_actor_can('pdv.receber',owner_id) or public.fiado_actor_can('pedidos.receber',owner_id))) then raise exception 'Recebimento não autorizado.' using errcode='42501'; end if;
  op:=jsonb_build_object('operationId',op_id,'type',p_kind,'deviceId','online','operatorId',auth.uid(),'ownerUserId',owner_id,
    'baseRevision',p_payload->'baseRevision','occurredAt',coalesce(p_payload->>'occurredAt',now()::text),'payload',p_payload);
  perform pg_advisory_xact_lock(hashtextextended('offline-operation:'||owner_id||':'||op_id,0));
  select * into receipt from public.offline_operations where owner_user_id=owner_id and operation_id=op_id for update;
  if found then
    if receipt.envelope->'payload'<>p_payload or receipt.operation_type<>p_kind then raise exception 'OPERATION_CONTENT_MISMATCH' using errcode='22023'; end if;
    return jsonb_build_object('result',receipt.result,'idempotent',true,'status','already_applied');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('offline-caixa:'||owner_id,0));
  insert into public.offline_operations(owner_user_id,operation_id,device_id,operator_id,synced_by,operation_type,entity_id,envelope,status)
    values(owner_id,op_id,'online',auth.uid(),auth.uid(),p_kind,coalesce(p_payload->>'comandaId',p_payload->>'id_caixa'),op,'applying');
  if p_kind='mesa.close' then v_result:=offline_internal.close_mesa(owner_id,op); else v_result:=offline_internal.close_caixa(owner_id,op); end if;
  update public.offline_operations set status='applied',result=v_result,applied_at=now() where owner_user_id=owner_id and operation_id=op_id;
  return jsonb_build_object('result',v_result,'idempotent',false,'status','applied');
end $$;
revoke all on function public.apply_online_close_v1(text,jsonb,text) from public,anon;
grant execute on function public.apply_online_close_v1(text,jsonb,text) to authenticated;
revoke all on all functions in schema offline_internal from public,anon,authenticated;
revoke all on function public.offline_bootstrap_v1(text,text),public.apply_offline_operation_v1(jsonb),public.reconcile_offline_operation_v1(text,text,text) from public,anon;
grant execute on function public.offline_bootstrap_v1(text,text),public.apply_offline_operation_v1(jsonb),public.reconcile_offline_operation_v1(text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;

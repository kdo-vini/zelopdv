-- Disposable PostgreSQL only. Test identities and all writes roll back.
begin;
create temporary table offline_fixture(owner_id uuid,other_id uuid,operator_id uuid,role_id uuid,mesa_id uuid,comanda_id uuid,item_id uuid,payment_id uuid,person_id uuid,op jsonb,result jsonb) on commit drop;
insert into offline_fixture values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,null);
grant select,update on offline_fixture to authenticated,service_role;
insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 select id,'offline-'||id||'@invalid.local','authenticated','authenticated','{}','{}',now(),now()
 from offline_fixture f cross join lateral(values(f.owner_id),(f.other_id),(f.operator_id)) a(id);
insert into public.access_roles(id,owner_user_id,name,permissions) select role_id,owner_id,'Mesa cashier','{"mesas.acessar":true,"mesas.fechar":true,"pdv.receber":true}' from offline_fixture;
insert into public.access_users(owner_user_id,auth_user_id,email,role_id,status) select owner_id,operator_id,'offline-op@invalid.local',role_id,'active' from offline_fixture;
insert into public.produtos(id,id_usuario,nome,preco,controlar_estoque,estoque_atual) select 912701,owner_id,'Offline test',10,true,1 from offline_fixture;
insert into public.mesas(id,id_usuario,numero) select mesa_id,owner_id,912701 from offline_fixture;
insert into public.pessoas(id,id_usuario,nome,saldo_fiado) select person_id,owner_id,'Fiado test',0 from offline_fixture;
insert into public.subscriptions(user_id,status,has_mesas_addon,current_period_end) select owner_id,'active',true,now()+interval '30 days' from offline_fixture;
create function pg_temp.offline_assert(condition boolean,message text) returns void language plpgsql as $$ begin if condition is distinct from true then raise exception 'OFFLINE ASSERT: %',message; end if; end $$;
create function pg_temp.offline_op(op_id text,kind text,payload jsonb,revision bigint default null) returns jsonb language sql as $$
  select jsonb_build_object('operationId',op_id,'schemaVersion',1,'type',kind,'deviceId','device-fixture','operatorId',auth.uid(),'ownerUserId',owner_id,'entityType','mesa','entityId',coalesce(payload->>'comandaId',payload->>'id_caixa',op_id),'sequence',1,'dependencies','[]'::jsonb,'baseRevision',revision,'occurredAt','2026-09-05T12:00:00Z','payload',payload) from offline_fixture
$$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true) from offline_fixture;
select pg_temp.offline_assert((public.offline_bootstrap_v1('device-fixture','read')->>'enabled')::boolean=false,'unprepared disabled');
select public.offline_bootstrap_v1('device-fixture','set_primary');
update offline_fixture set op=pg_temp.offline_op('cash-local','caixa.open','{"valor_inicial":20}');
update offline_fixture set result=public.apply_offline_operation_v1(op);
select pg_temp.offline_assert(result->>'status'='applied','open cash applied: '||result::text) from offline_fixture;
select pg_temp.offline_assert(public.apply_offline_operation_v1(op)->>'status'='already_applied','open retry dedup') from offline_fixture;
update offline_fixture set op=pg_temp.offline_op('sale-local','sale.create',jsonb_build_object('id_caixa','cash-local','valor_total',20,'forma_pagamento','dinheiro','valor_recebido',20,'itens',jsonb_build_array(jsonb_build_object('id_produto',912701,'nome','Offline test','quantidade',2,'preco',10)),'estoque','[{"id_produto":912701,"quantidade":2}]'::jsonb));
update offline_fixture set result=public.apply_offline_operation_v1(op);
select pg_temp.offline_assert(result->>'status'='applied','sale applied below stock: '||result::text) from offline_fixture;
select pg_temp.offline_assert(public.apply_offline_operation_v1(op)->>'status'='already_applied','sale retry dedup') from offline_fixture;
select pg_temp.offline_assert((select estoque_atual from public.produtos where id=912701)=-1,'negative stock once');
select pg_temp.offline_assert((select count(*) from public.offline_stock_divergences)=1,'stock divergence durable');
do $$ begin
  begin perform public.apply_offline_operation_v1((select op from offline_fixture)||'{"ownerUserId":"00000000-0000-0000-0000-000000000000"}'); raise exception 'Owner spoof accepted';
  exception when insufficient_privilege then null; end;
  begin perform public.apply_offline_operation_v1((select op from offline_fixture)||'{"payload":{"valor_total":999}}'); raise exception 'Content mismatch accepted';
  exception when invalid_parameter_value then null; end;
end $$;

-- Mesa stock and payments stay atomic; stale close and incomplete payment do
-- not insert a sale, and a second intent cannot duplicate the same closure.
update offline_fixture set result=public.apply_offline_operation_v1(pg_temp.offline_op('mesa-open','mesa.open',jsonb_build_object('mesaId',mesa_id,'comandaId',comanda_id)));
select pg_temp.offline_assert(result->>'status'='applied','mesa open: '||result::text) from offline_fixture;
update offline_fixture set result=public.apply_offline_operation_v1(pg_temp.offline_op('item-add','mesa.item.add',jsonb_build_object('comandaId',comanda_id,'produtoId',912701,'itemId',item_id,'delta',2,'precoUnitario',10,'modifiers','[]'::jsonb)));
select pg_temp.offline_assert(result->>'status'='applied','mesa item: '||result::text) from offline_fixture;
update offline_fixture set result=public.apply_offline_operation_v1(pg_temp.offline_op('payment-add','mesa.payment.add',jsonb_build_object('comandaId',comanda_id,'paymentId',payment_id,'id_caixa','cash-local','forma_pagamento','dinheiro','valor',10,'allocations',jsonb_build_array(jsonb_build_object('itemId',item_id,'quantidade',1,'valor',10)))));
select pg_temp.offline_assert(result->>'status'='applied','partial allocation: '||result::text) from offline_fixture;
update offline_fixture set result=public.apply_offline_operation_v1(pg_temp.offline_op('bad-close','mesa.close',jsonb_build_object('comandaId',comanda_id,'id_caixa','cash-local','payments','[]'::jsonb),(select offline_revision from public.comandas where id=offline_fixture.comanda_id)));
select pg_temp.offline_assert(result->>'status'='needs_review','underpaid close safely retained: '||result::text) from offline_fixture;
select pg_temp.offline_assert((select count(*) from public.vendas)=1,'failed close no partial sale');
update offline_fixture set op=pg_temp.offline_op('good-close','mesa.close',jsonb_build_object('comandaId',comanda_id,'id_caixa','cash-local','payments',jsonb_build_array(jsonb_build_object('forma_pagamento','fiado','valor',10,'id_pessoa',person_id))),(select offline_revision from public.comandas where id=offline_fixture.comanda_id));
update offline_fixture set result=public.apply_offline_operation_v1(op);
select pg_temp.offline_assert(result->>'status'='applied','atomic mesa close: '||result::text) from offline_fixture;
select pg_temp.offline_assert(public.apply_offline_operation_v1(op)->>'status'='already_applied','mesa close retry dedup') from offline_fixture;
select pg_temp.offline_assert((select estoque_atual from public.produtos where id=912701)=-3,'mesa close no second stock debit');
select pg_temp.offline_assert((select saldo_fiado from public.pessoas where id=offline_fixture.person_id)=10,'fiado balance once') from offline_fixture;
select pg_temp.offline_assert((select count(*) from public.fiado_lancamentos)=1,'fiado ledger once');
select pg_temp.offline_assert((select count(*) from public.comanda_pagamento_itens where id_venda_item is not null and id_venda_pagamento is not null)=1,'allocation preserved');

-- Closing history stays immutable; late sale produces a new adjustment bound
-- to its original local turn, never the next open cash box.
update offline_fixture set result=public.apply_offline_operation_v1(pg_temp.offline_op('cash-close','caixa.close','{"id_caixa":"cash-local","valor_contado_em_gaveta":50}'));
select pg_temp.offline_assert(result->>'status'='applied','cash close: '||result::text) from offline_fixture;
update offline_fixture set result=public.apply_offline_operation_v1(pg_temp.offline_op('late-sale','sale.create','{"id_caixa":"cash-local","valor_total":5,"forma_pagamento":"dinheiro","valor_recebido":5,"itens":[{"nome":"Avulso","quantidade":1,"preco":5}]}'));
select pg_temp.offline_assert(result->>'status'='applied','late sale: '||result::text) from offline_fixture;
select pg_temp.offline_assert((select count(*) from public.caixa_fechamentos)=1,'original history unchanged');
select pg_temp.offline_assert((select count(*) from public.offline_caixa_adjustments)=1,'late adjustment retained');
select pg_temp.offline_assert((select total_dinheiro from public.caixa_fechamentos)=30,'original cash totals unchanged');
select pg_temp.offline_assert((select (snapshot#>>'{totais_pagamento,dinheiro}')::numeric from public.offline_caixa_adjustments)=35,'late cash totals correct');

-- Cross-turn partials retain their cash origin, including after conversion.
update offline_fixture set result=public.apply_offline_operation_v1(pg_temp.offline_op('cash-two','caixa.open','{"valor_inicial":0}'));
update offline_fixture set comanda_id=gen_random_uuid(),item_id=gen_random_uuid(),payment_id=gen_random_uuid();
update offline_fixture set result=public.apply_offline_operation_v1(pg_temp.offline_op('mesa-two','mesa.open',jsonb_build_object('mesaId',mesa_id,'comandaId',comanda_id)));
update offline_fixture set result=public.apply_offline_operation_v1(pg_temp.offline_op('item-two','mesa.item.add',jsonb_build_object('comandaId',comanda_id,'produtoId',912701,'itemId',item_id,'delta',2,'precoUnitario',10,'modifiers','[]'::jsonb)));
update offline_fixture set result=public.apply_offline_operation_v1(pg_temp.offline_op('partial-two','mesa.payment.add',jsonb_build_object('comandaId',comanda_id,'paymentId',payment_id,'id_caixa','cash-two','forma_pagamento','dinheiro','valor',10)));
select pg_temp.offline_assert(result->>'status'='applied','cross-turn partial: '||result::text) from offline_fixture;
update offline_fixture set result=public.apply_offline_operation_v1(pg_temp.offline_op('close-two','caixa.close','{"id_caixa":"cash-two","valor_contado_em_gaveta":10}'));
select pg_temp.offline_assert((result#>>'{result,totais_pagamento,dinheiro}')::numeric=10,'partial counted before sale exists') from offline_fixture;
update offline_fixture set result=public.apply_offline_operation_v1(pg_temp.offline_op('cash-three','caixa.open','{"valor_inicial":0}'));
update offline_fixture set op=jsonb_build_object('comandaId',comanda_id,'id_caixa',(result#>>'{result,id}')::integer,'payments','[{"forma_pagamento":"pix","valor":10}]'::jsonb,'baseRevision',(select offline_revision from public.comandas where id=offline_fixture.comanda_id));
-- Mesa-only cashier closes online without PDV sell or offline registration.
reset role;
update public.access_roles set permissions='{"mesas.acessar":true,"mesas.fechar":true}' where id=(select role_id from offline_fixture);
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',operator_id)::text,true) from offline_fixture;
do $$ begin
  begin perform public.apply_online_close_v1('mesa.close',(select op from offline_fixture),'forbidden-close'); raise exception 'Close-only role collected payment'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true) from offline_fixture;
reset role;
update public.access_roles set permissions='{"mesas.acessar":true,"mesas.fechar":true,"pedidos.receber":true}' where id=(select role_id from offline_fixture);
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',operator_id)::text,true) from offline_fixture;
update offline_fixture set result=public.apply_online_close_v1('mesa.close',op,'online-mesa-two');
select pg_temp.offline_assert(result->>'status'='applied','mesa-only online closer: '||result::text) from offline_fixture;
select pg_temp.offline_assert(public.apply_online_close_v1('mesa.close',op,'online-mesa-two')->>'status'='already_applied','online response lost retry') from offline_fixture;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true) from offline_fixture;
select pg_temp.offline_assert((select (snapshot#>>'{totais_pagamento,dinheiro}')::numeric from public.offline_caixa_adjustments where operation_id='online:online-mesa-two')=10,'partial conversion retains old turn');

-- Retry of the same reconciliation returns its first result, including owner
-- recovery of an operation declared by a now-unavailable operator.
update offline_fixture set op=pg_temp.offline_op('recovered','sale.create','{"id_caixa":"cash-three","valor_total":1,"forma_pagamento":"dinheiro","valor_recebido":1,"itens":[{"nome":"Recuperado","quantidade":1,"preco":1}]}')||jsonb_build_object('operatorId',operator_id);
update offline_fixture set result=public.apply_offline_operation_v1(op);
select pg_temp.offline_assert(result->>'status'='needs_review','other operator requires owner decision') from offline_fixture;
update offline_fixture set result=public.reconcile_offline_operation_v1('recovered','retry','Titular conferiu o recebimento original');
select pg_temp.offline_assert(result->>'status'='applied','owner recovery applies') from offline_fixture;
select pg_temp.offline_assert(public.reconcile_offline_operation_v1('recovered','retry','Titular conferiu o recebimento original')->>'status'='already_applied','reconcile lost response');
select pg_temp.offline_assert((select operator_id from public.offline_operations where operation_id='recovered')=offline_fixture.operator_id,'original operator preserved') from offline_fixture;
update offline_fixture set result=public.apply_offline_operation_v1(pg_temp.offline_op('extra-receipt','mesa.payment.add',jsonb_build_object('comandaId',comanda_id,'paymentId',gen_random_uuid(),'id_caixa','cash-three','forma_pagamento','dinheiro','valor',4)));
select pg_temp.offline_assert(result->>'status'='needs_review','closed mesa receipt held') from offline_fixture;
select pg_temp.offline_assert((select sum(valor) from public.offline_pending_receipts where state='pending')=4,'received amount preserved without revenue');
update offline_fixture set result=public.reconcile_offline_operation_v1('extra-receipt','record_additional_sale','Consumo adicional entregue e recebido');
select pg_temp.offline_assert(result->>'status'='applied','additional consumption sale: '||result::text) from offline_fixture;
select pg_temp.offline_assert((select count(*) from public.vendas where client_sale_id='reconciled-additional:extra-receipt')=1,'additional receipt recognized once');
select pg_temp.offline_assert(public.reconcile_offline_operation_v1('extra-receipt','record_additional_sale','Consumo adicional entregue e recebido')->>'status'='already_applied','additional-sale lost response');
update offline_fixture set result=public.apply_offline_operation_v1(pg_temp.offline_op('refund-receipt','mesa.payment.add',jsonb_build_object('comandaId',comanda_id,'paymentId',gen_random_uuid(),'id_caixa','cash-three','forma_pagamento','dinheiro','valor',3)));
update offline_fixture set result=public.reconcile_offline_operation_v1('refund-receipt','record_refund','Dinheiro já devolvido ao cliente');
select pg_temp.offline_assert(result->>'status'='applied','manual refund recorded') from offline_fixture;
select pg_temp.offline_assert(public.reconcile_offline_operation_v1('refund-receipt','record_refund','Dinheiro já devolvido ao cliente')->>'status'='already_applied','refund lost response');
select pg_temp.offline_assert((select sum(valor) from public.caixa_movimentacoes where tipo='sangria')=3,'refund cash exits once');
update offline_fixture set result=public.apply_offline_operation_v1(pg_temp.offline_op('sale-conflict','sale.create','{"id_caixa":"cash-three","valor_total":2,"forma_pagamento":"pix","itens":[{"id_produto":99999999,"nome":"Produto removido","quantidade":1,"preco":2}]}'));
select pg_temp.offline_assert(result->>'status'='needs_review','sale product conflict retained') from offline_fixture;
select pg_temp.offline_assert((select sum(valor) from public.offline_pending_receipts where operation_id='sale-conflict' and state='pending')=2,'sale conflict physical receipt conserved');
update offline_fixture set result=public.reconcile_offline_operation_v1('sale-conflict','record_refund','Pix já devolvido externamente e conferido');
select pg_temp.offline_assert(result->>'status'='applied','noncash refund recorded') from offline_fixture;
select pg_temp.offline_assert((select sum(valor) from public.caixa_movimentacoes where tipo='sangria')=3,'noncash refund does not change cash');
-- Private offline clone keeps pizza history and consumes prepared stock once.
insert into public.produtos(id,id_usuario,nome,preco,controlar_estoque,estoque_atual)
  select 912702,owner_id,'Pizza offline',0,false,0 from offline_fixture union all select 912703,owner_id,'Disco',2,true,0 from offline_fixture;
update offline_fixture set op=public.save_pizza_config(912702,null,'{"version":1,"pricingMode":"highest","sizes":[{"id":"large","name":"Grande","maxFlavors":2,"active":true,"stockProductId":912703}],"flavors":[{"id":"a","name":"Queijo","active":true,"prices":{"large":40}},{"id":"b","name":"Frango","active":true,"prices":{"large":50}}]}');
update offline_fixture set op=pg_temp.offline_op('pizza-offline','sale.create',jsonb_build_object('id_caixa','cash-three','valor_total',50,'forma_pagamento','dinheiro','valor_recebido',50,'itens',jsonb_build_array(jsonb_build_object('id_produto',912702,'nome','Pizza offline','quantidade',1,'preco',50,'pizza',jsonb_build_object('revision',op->>'revision','sizeId','large','flavorIds',jsonb_build_array('a','b')),'modifiers','[]'::jsonb))));
update offline_fixture set result=public.apply_offline_operation_v1(op);
select pg_temp.offline_assert(result->>'status'='applied','offline pizza: '||result::text) from offline_fixture;
select pg_temp.offline_assert(public.apply_offline_operation_v1(op)->>'status'='already_applied','pizza retry once') from offline_fixture;
select pg_temp.offline_assert((select estoque_atual from public.produtos where id=912703)=-1,'prepared pizza stock below zero once');
do $$ begin
  begin perform public.reconcile_offline_operation_v1('recovered','record_duplicate','Outra decisão conflitante'); raise exception 'Changed decision accepted'; exception when raise_exception then if sqlerrm='Changed decision accepted' then raise; end if; end;
  begin update public.offline_operations set status='applied'; raise exception 'Receipt forged'; exception when insufficient_privilege then null; end;
  begin update public.produtos set estoque_atual=-999 where id=912701; raise exception 'Direct negative stock bypass'; exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',other_id)::text,true) from offline_fixture;
select pg_temp.offline_assert((select count(*) from public.offline_operations)=0,'other tenant cannot read receipts');
reset role;
rollback;

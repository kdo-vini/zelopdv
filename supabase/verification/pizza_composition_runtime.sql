-- Run only through scripts/verify-supabase-baseline.ps1 on disposable PostgreSQL.
begin;
do $$ begin
  if to_regprocedure('public.save_pizza_config(integer,uuid,jsonb)') is null then
    raise exception 'Pizza configuration RPC missing';
  end if;
end $$;
create temporary table pizza_fixture(owner_id uuid,other_id uuid,empresa_id uuid,mesa_id uuid,comanda_id uuid,
  config jsonb,snapshot jsonb,modifiers jsonb,order_id uuid,sale_id bigint) on commit drop;
insert into pizza_fixture(owner_id,other_id,empresa_id,mesa_id,comanda_id)
values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
alter table pizza_fixture add column operator_id uuid default gen_random_uuid(),add column role_id uuid default gen_random_uuid();
grant select,update on pizza_fixture to authenticated,service_role;
insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'pizza-'||id||'@invalid.local','authenticated','authenticated','{}','{}',now(),now()
from pizza_fixture f cross join lateral(values(f.owner_id),(f.other_id),(f.operator_id)) a(id);
insert into public.access_roles(id,owner_user_id,name,permissions)
select role_id,owner_id,'Pizza catalog manager','{"produtos.gerenciar":true}' from pizza_fixture;
insert into public.access_users(owner_user_id,auth_user_id,email,role_id,status)
select owner_id,operator_id,'pizza-manager-'||operator_id||'@invalid.local',role_id,'active' from pizza_fixture;
insert into public.empresa_perfil(id,user_id,nome_exibicao) select empresa_id,owner_id,'Pizza fixture' from pizza_fixture;
insert into public.caixas(id,id_usuario,valor_inicial) select 912301,owner_id,0 from pizza_fixture;
insert into public.produtos(id,id_usuario,nome,preco,controlar_estoque,estoque_atual)
select 912301,owner_id,'Pizza tradicional',0,false,0 from pizza_fixture
union all select 912302,owner_id,'Disco grande',5,true,20 from pizza_fixture
union all select 912303,owner_id,'Borda',8,true,20 from pizza_fixture
union all select 912304,other_id,'Outra loja',10,true,20 from pizza_fixture;
insert into public.mesas(id,id_usuario,numero) select mesa_id,owner_id,912301 from pizza_fixture;
insert into public.comandas(id,id_mesa,id_usuario) select comanda_id,mesa_id,owner_id from pizza_fixture;
insert into public.zelomenu_modifier_groups(id,id_usuario,id_produto,nome,min_selecoes,max_selecoes)
select 'd3400000-0000-4000-8000-000000000001',owner_id,912301,'Borda',0,1 from pizza_fixture;
insert into public.zelomenu_modifier_options(id,id_usuario,id_grupo,nome,price_delta)
select 'd3400000-0000-4000-8000-000000000002',owner_id,'d3400000-0000-4000-8000-000000000001','Borda',8 from pizza_fixture;
insert into public.zelomenu_modifier_option_products(id_opcao,id_usuario,id_produto)
select 'd3400000-0000-4000-8000-000000000002',owner_id,912303 from pizza_fixture;
update pizza_fixture set config='{"version":1,"pricingMode":"highest","sizes":[{"id":"large","name":"Grande","maxFlavors":4,"active":true,"stockProductId":912302}],"flavors":[{"id":"a","name":"Calabresa","active":true,"prices":{"large":40}},{"id":"b","name":"Portuguesa","active":true,"prices":{"large":60}},{"id":"c","name":"Queijo","active":true,"prices":{"large":50.01}},{"id":"d","name":"Frango","active":true,"prices":{"large":45}}]}';
create function pg_temp.pizza_assert(condition boolean,message text) returns void language plpgsql as $$ begin if condition is distinct from true then raise exception 'PIZZA ASSERT: %',message; end if; end $$;
create function pg_temp.pizza_expect_error(query text,expected text) returns void language plpgsql as $$
declare caught text;
begin
  begin execute query; exception when others then caught:=sqlerrm; end;
  if caught is null or caught not like '%'||expected||'%' then raise exception 'Expected %, got %',expected,coalesce(caught,'success'); end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true) from pizza_fixture;
update pizza_fixture set config=public.save_pizza_config(912301,null,config);
select pg_temp.pizza_assert((select tipo_produto='pizza' from public.produtos where id=912301),'RPC converts draft');
select pg_temp.pizza_expect_error('select public.save_pizza_config(912301,null,config) from pizza_fixture','PIZZA_REVISION_CONFLICT');
select pg_temp.pizza_expect_error('update public.produtos set pizza_config=jsonb_set(pizza_config,''{revision}'',to_jsonb(gen_random_uuid()::text)) where id=912301','PIZZA_USE_CONFIG_RPC');
select pg_temp.pizza_expect_error('update public.produtos set controlar_estoque=true where id=912301','PIZZA_STOCK_SOURCE_CONFLICT');
select pg_temp.pizza_expect_error('update public.zelomenu_modifier_option_products set id_produto=912301 where id_opcao=''d3400000-0000-4000-8000-000000000002''','PIZZA_CANNOT_BE_MODIFIER');
select pg_temp.pizza_expect_error('update public.zelomenu_modifier_groups set modo_preco=''substituir'' where id_produto=912301','PIZZA_REPLACEMENT_GROUP_UNSUPPORTED');
select pg_temp.pizza_expect_error('select public.save_pizza_config(912301,(config->>''revision'')::uuid,jsonb_set(config,''{sizes,0,stockProductId}'',''912304'')) from pizza_fixture','PIZZA_STOCK_PRODUCT_INVALID');

select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',operator_id)::text,true) from pizza_fixture;
update pizza_fixture set config=public.save_pizza_config(912301,(config->>'revision')::uuid,config);
reset role;
update public.access_users set status='blocked' where auth_user_id=(select operator_id from pizza_fixture);
set local role authenticated;
select pg_temp.pizza_expect_error('select public.save_pizza_config(912301,(config->>''revision'')::uuid,config) from pizza_fixture','PIZZA_PERMISSION_DENIED');
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',other_id)::text,true) from pizza_fixture;
select pg_temp.pizza_expect_error('select public.save_pizza_config(912301,(config->>''revision'')::uuid,config) from pizza_fixture','PIZZA_PERMISSION_DENIED');
select pg_temp.pizza_assert((select count(*)=0 from public.pizza_config_revisions),'other tenant cannot read revisions');
reset role;

-- Pure database resolver cases, run as database owner because helper is private.
update pizza_fixture set snapshot=public.resolve_pizza_item(912301,owner_id,jsonb_build_object('revision',config->>'revision','sizeId','large','flavorIds',jsonb_build_array('b','a')),'[]',60,false);
select pg_temp.pizza_assert(snapshot->>'baseUnitPrice'='60' and snapshot#>>'{flavors,0,id}'='a' and snapshot#>>'{flavors,1,denominator}'='2','highest/equal parts/sorted snapshot') from pizza_fixture;
select pg_temp.pizza_expect_error('select public.resolve_pizza_item(912301,owner_id,null,''[]'',0,false) from pizza_fixture','PIZZA_SELECTION_REQUIRED');
select pg_temp.pizza_expect_error('select public.resolve_pizza_item(912301,owner_id,jsonb_set(snapshot,''{flavorIds}'',''["a","a"]''),''[]'',40,false) from pizza_fixture','PIZZA_FLAVORS_INVALID');
select pg_temp.pizza_expect_error('select public.resolve_pizza_item(912301,owner_id,snapshot,''[]'',1,false) from pizza_fixture','PIZZA_PRICE_MISMATCH');
update pizza_fixture set modifiers='[{"groupId":"d3400000-0000-4000-8000-000000000001","groupName":"Borda","selectedOptions":[{"optionId":"d3400000-0000-4000-8000-000000000002","optionName":"Borda","priceDelta":8,"quantity":1,"linkedProductId":912303}]}]';
select public.resolve_pizza_item(912301,owner_id,snapshot,modifiers,68,false) from pizza_fixture;
select pg_temp.pizza_assert((select sum(quantidade)=2 and count(*)=2 from public.comanda_modifier_stock_requirements(912301,f.modifiers,1,f.snapshot)),'size and extra consume once, no parent/flavor') from pizza_fixture f;

-- Offline revision stays valid after extra prices and the store rule change.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true) from pizza_fixture;
update public.produtos set preco=10 where id=912303;
select public.save_pizza_pricing_mode('average');
reset role;
select pg_temp.pizza_expect_error('select public.resolve_pizza_item(912301,owner_id,snapshot,modifiers,68,false) from pizza_fixture','PIZZA_REVISION_CONFLICT');
select public.resolve_pizza_item(912301,owner_id,snapshot,modifiers,68,true) from pizza_fixture;
select pg_temp.pizza_assert((public.resolve_pizza_item(912301,owner_id,jsonb_build_object('revision',p.pizza_config->>'revision','sizeId','large','flavorIds',jsonb_build_array('a','b','c')),'[]',50,false)->>'baseUnitPrice')::numeric=50,'thirds round once') from pizza_fixture f cross join public.produtos p where p.id=912301;
select pg_temp.pizza_assert((public.resolve_pizza_item(912301,owner_id,jsonb_build_object('revision',p.pizza_config->>'revision','sizeId','large','flavorIds',jsonb_build_array('a','b','c','d')),'[]',48.75,false)->>'baseUnitPrice')::numeric=48.75,'four flavors') from pizza_fixture f cross join public.produtos p where p.id=912301;

create function pg_temp.pizza_sale_payload() returns jsonb language sql as $$
select jsonb_build_object('client_sale_id','pizza-offline-fixture','pizza_offline',true,'id_caixa',912301,'valor_total',68,'forma_pagamento','dinheiro',
 'itens',jsonb_build_array(jsonb_build_object('id_produto',912301,'nome','Pizza tradicional','quantidade',1,'preco',68,'pizza',snapshot,'modifiers',modifiers)),
 'estoque','[]'::jsonb) from pizza_fixture;
$$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true) from pizza_fixture;
update pizza_fixture set sale_id=(public.criar_venda_completa(pg_temp.pizza_sale_payload())->>'id')::bigint;
select pg_temp.pizza_assert((public.criar_venda_completa(pg_temp.pizza_sale_payload())->>'id')::bigint=sale_id,'offline retry same sale') from pizza_fixture;
reset role;
select pg_temp.pizza_assert((select estoque_atual=19 from public.produtos where id=912302) and (select estoque_atual=19 from public.produtos where id=912303),'server reconstructs offline stock despite empty client stock');
select pg_temp.pizza_assert((select pizza=snapshot from public.vendas_itens where id_venda=sale_id),'sale preserves full composition') from pizza_fixture;

-- Comanda uses the new current revision; decrement/cancel uses its history.
update pizza_fixture f set snapshot=public.resolve_pizza_item(912301,f.owner_id,jsonb_build_object('revision',p.pizza_config->>'revision','sizeId','large','flavorIds',jsonb_build_array('a','b')),'[]',50,false),modifiers='[]' from public.produtos p where p.id=912301;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true) from pizza_fixture;
select public.comanda_aplicar_delta_item(comanda_id,912301,2,50,'[]',snapshot) from pizza_fixture;
select public.comanda_aplicar_delta_item(comanda_id,912301,-1,50,'[]',snapshot) from pizza_fixture;
reset role;
select pg_temp.pizza_assert((select estoque_atual=18 from public.produtos where id=912302),'comanda delta reserves prepared size');
set local role authenticated;
select public.comanda_cancelar_com_estoque(comanda_id) from pizza_fixture;
reset role;
select pg_temp.pizza_assert((select estoque_atual=19 from public.produtos where id=912302),'comanda cancel restores prepared size');

-- Public creation, acceptance, cancellation and financial conversion.
set local role service_role;
select set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
update pizza_fixture set order_id=(public.create_zelo_order(null,null,'pizza-order-fixture',jsonb_build_object(
 'empresaId',empresa_id,'source','zelomenu','customer','{}'::jsonb,'fulfillment','{"type":"retirada"}'::jsonb,'payment','{"method":"pix"}'::jsonb,
 'pricing',jsonb_build_object('subtotal',50,'deliveryFee',0,'discount',0),
 'cart',jsonb_build_object('items',jsonb_build_array(jsonb_build_object('productId',912301,'productName','Pizza tradicional','unitPrice',50,'quantity',1,'lineTotal',50,'pizza',snapshot,'modifiers','[]'::jsonb)))))->>'orderId')::uuid;
select public.transition_zelo_order(order_id,(select revision from public.zelo_orders where id=f.order_id),'accept',null,'{}') from pizza_fixture f;
reset role;
select pg_temp.pizza_assert((select estoque_atual=18 from public.produtos where id=912302),'order acceptance consumes size once');
set local role service_role;
select public.transition_zelo_order(order_id,(select revision from public.zelo_orders where id=f.order_id),'cancel',null,'{}') from pizza_fixture f;
reset role;
select pg_temp.pizza_assert((select estoque_atual=19 from public.produtos where id=912302),'order cancel restores size once');
set local role service_role;
select public.ensure_zelo_order_sale(order_id,now()) from pizza_fixture;
reset role;
select pg_temp.pizza_assert((select count(*)=1 from public.vendas_itens vi join public.vendas v on v.id=vi.id_venda where v.client_sale_id='zelo-order:'||f.order_id and vi.pizza=f.snapshot),'automatic sale conversion preserves pizza') from pizza_fixture f;
select pg_temp.pizza_assert(not has_function_privilege('anon','public.save_pizza_config(integer,uuid,jsonb)','execute') and not has_function_privilege('authenticated','public.pizza_publish_config(integer,jsonb)','execute'),'RPC ACL');

-- Distinct choices and option quantities have separate limits.
update public.zelomenu_modifier_groups set permite_quantidade=true,min_selecoes=1,max_selecoes=2,minimo_total_quantidade=3,maximo_total_quantidade=3 where id_produto=912301;
update pizza_fixture f set config=p.pizza_config,modifiers='[{"groupId":"d3400000-0000-4000-8000-000000000001","selectedOptions":[{"optionId":"d3400000-0000-4000-8000-000000000002","priceDelta":10,"quantity":3}]}]' from public.produtos p where p.id=912301;
select public.resolve_pizza_item(912301,owner_id,jsonb_build_object('revision',config->>'revision','sizeId','large','flavorIds',jsonb_build_array('a','b')),modifiers,80,false) from pizza_fixture;
select pg_temp.pizza_expect_error('select public.resolve_pizza_item(912301,owner_id,jsonb_build_object(''revision'',config->>''revision'',''sizeId'',''large'',''flavorIds'',jsonb_build_array(''a'',''b'')),jsonb_set(modifiers,''{0,selectedOptions,0,quantity}'',''2''),70,false) from pizza_fixture','PIZZA_MODIFIER_TOTAL_QUANTITY_INVALID');
update public.zelomenu_modifier_groups set permite_quantidade=false,min_selecoes=0,max_selecoes=1,minimo_total_quantidade=0,maximo_total_quantidade=null where id_produto=912301;

-- Reserved category bucket survives subsequent stock mode/category edits.
insert into public.categorias(id,id_usuario,nome,controlar_estoque_compartilhado,estoque_compartilhado_atual)
select 912301,owner_id,'Prepared pizzas shared',true,10 from pizza_fixture;
update public.produtos set id_categoria=912301 where id=912302;
update pizza_fixture f set snapshot=public.resolve_pizza_item(912301,f.owner_id,jsonb_build_object('revision',p.pizza_config->>'revision','sizeId','large','flavorIds',jsonb_build_array('a','b')),'[]',50,false),comanda_id=gen_random_uuid(),modifiers='[]' from public.produtos p where p.id=912301;
insert into public.comandas(id,id_mesa,id_usuario) select comanda_id,mesa_id,owner_id from pizza_fixture;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true) from pizza_fixture;
select public.comanda_aplicar_delta_item(comanda_id,912301,1,50,'[]',snapshot) from pizza_fixture;
reset role;
select pg_temp.pizza_assert((select estoque_compartilhado_atual=9 from public.categorias where id=912301),'shared category reserves once');
update public.categorias set controlar_estoque_compartilhado=false where id=912301;
update public.produtos set id_categoria=null where id=912302;
-- A previously saved mesa item can still be sent to the kitchen after edits.
set local role service_role;
select public.create_zelo_order(null,null,'pizza-historical-kitchen',jsonb_build_object(
 'empresaId',empresa_id,'source','mesa','fulfillment',jsonb_build_object('type','mesa','comandaItemId',(select id from public.comanda_itens where id_comanda=f.comanda_id)),
 'pricing',jsonb_build_object('subtotal',50,'deliveryFee',0,'discount',0),'cart',jsonb_build_object('items',jsonb_build_array(jsonb_build_object('productId',912301,'productName','Pizza tradicional','unitPrice',50,'quantity',1,'lineTotal',50,'pizza',snapshot,'modifiers','[]'::jsonb))))) from pizza_fixture f;
reset role;
set local role authenticated;
select public.comanda_cancelar_com_estoque(comanda_id) from pizza_fixture;
reset role;
select pg_temp.pizza_assert((select estoque_compartilhado_atual=10 from public.categorias where id=912301) and (select estoque_atual=19 from public.produtos where id=912302),'cancel uses historical category bucket despite changed settings');
-- A complete accepted -> preparing -> ready -> payment lifecycle keeps one
-- pizza line and never consumes inventory a second time at payment.
update pizza_fixture f set snapshot=public.resolve_pizza_item(912301,f.owner_id,jsonb_build_object('revision',p.pizza_config->>'revision','sizeId','large','flavorIds',jsonb_build_array('a','b'),'notes',' sem cebola '),'[]',50,false) from public.produtos p where p.id=912301;
select pg_temp.pizza_assert(snapshot->>'notes'='sem cebola','notes trimmed and preserved') from pizza_fixture;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update pizza_fixture set order_id=(public.create_zelo_order(null,null,'pizza-closed-order',jsonb_build_object(
 'empresaId',empresa_id,'source','zelomenu','customer','{}'::jsonb,'fulfillment','{"type":"retirada"}'::jsonb,'payment','{"method":"pix"}'::jsonb,
 'pricing',jsonb_build_object('subtotal',50,'deliveryFee',0,'discount',0),
 'cart',jsonb_build_object('items',jsonb_build_array(jsonb_build_object('productId',912301,'productName','Pizza tradicional','unitPrice',50,'quantity',1,'lineTotal',50,'pizza',snapshot,'modifiers','[]'::jsonb)))))->>'orderId')::uuid;
select public.transition_zelo_order(order_id,(select revision from public.zelo_orders where id=f.order_id),'accept',null,'{}') from pizza_fixture f;
select public.transition_zelo_order(order_id,(select revision from public.zelo_orders where id=f.order_id),'start_preparing',null,'{}') from pizza_fixture f;
select public.transition_zelo_order(order_id,(select revision from public.zelo_orders where id=f.order_id),'mark_ready',null,'{}') from pizza_fixture f;
reset role;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true) from pizza_fixture;
select public.close_zelo_order(order_id,(select revision from public.zelo_orders where id=f.order_id),'{"forma_pagamento":"pix"}',null) from pizza_fixture f;
reset role;
select pg_temp.pizza_assert((select estoque_atual=18 from public.produtos where id=912302),'financial closure does not double stock');
select pg_temp.pizza_assert((select count(*)=1 from public.vendas_itens vi join public.vendas v on v.id=vi.id_venda where v.client_sale_id='zelo-order:'||f.order_id and vi.pizza=f.snapshot),'financial closure retains one composed pizza line') from pizza_fixture f;
select pg_temp.pizza_expect_error('delete from public.produtos where id=912301','PIZZA_ARCHIVE_REQUIRED');
select pg_temp.pizza_expect_error('delete from public.produtos where id=912302','PIZZA_ARCHIVE_REQUIRED');
set local role authenticated;
update pizza_fixture f set config=public.save_pizza_config(912301,(p.pizza_config->>'revision')::uuid,p.pizza_config||'{"archived":true}') from public.produtos p where p.id=912301;
reset role;
select pg_temp.pizza_assert((select ocultar_no_pdv and (pizza_config->>'archived')::boolean from public.produtos where id=912301),'archive hides product atomically');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.delete_account(owner_id,'pizza-disposable-test') from pizza_fixture;
reset role;
select pg_temp.pizza_assert(not exists(select 1 from auth.users where id=(select owner_id from pizza_fixture)) and not exists(select 1 from public.pizza_config_revisions where owner_user_id=(select owner_id from pizza_fixture)),'account purge cascades pizza history');
select 'PIZZA_RUNTIME_VERIFIED' as result;
rollback;

-- VERIFICATION ONLY. Never a schema migration. Seeds synthetic rows, calls
-- the real order-transition RPCs, asserts results, rolls back everything.
-- Run with: supabase db query --linked -f .ai/migrations/verification/zelo_order_sub_item_attribution_2026_07_22_verify.sql
begin;

create temp table zltest_state (name text primary key, id_val bigint, uuid_val uuid);

-- ===== SETUP =====
do $$
declare
  v_empresa_id uuid; v_user_id uuid; v_cat_normal int; v_cat_shared int;
  v_container int; v_penne int; v_bacon int;
  v_mod_group uuid := gen_random_uuid();
  v_opt_penne uuid := gen_random_uuid(); v_opt_bacon uuid := gen_random_uuid();
  v_opt_classic uuid := gen_random_uuid();
begin
  select id, user_id into v_empresa_id, v_user_id from public.empresa_perfil limit 1;
  if v_empresa_id is null then raise exception 'NO_EMPRESA_FOUND_FOR_TEST'; end if;

  insert into public.categorias(id_usuario,nome,controlar_estoque_compartilhado,estoque_compartilhado_atual)
    values (v_user_id,'ZLTEST cat normal',false,0) returning id into v_cat_normal;
  insert into public.categorias(id_usuario,nome,controlar_estoque_compartilhado,estoque_compartilhado_atual)
    values (v_user_id,'ZLTEST cat compartilhada',true,50) returning id into v_cat_shared;
  insert into public.produtos(id_usuario,id_categoria,nome,preco,controlar_estoque,estoque_atual)
    values (v_user_id,v_cat_normal,'ZLTEST Monte sua Massa',0,false,0) returning id into v_container;
  insert into public.produtos(id_usuario,id_categoria,nome,preco,controlar_estoque,estoque_atual)
    values (v_user_id,v_cat_shared,'ZLTEST Penne',32,true,10) returning id into v_penne;
  insert into public.produtos(id_usuario,id_categoria,nome,preco,controlar_estoque,estoque_atual)
    values (v_user_id,v_cat_normal,'ZLTEST Bacon extra',5,true,5) returning id into v_bacon;

  insert into public.zelomenu_modifier_groups(id,id_usuario,id_produto,nome)
    values (v_mod_group,v_user_id,v_container,'ZLTEST test group');
  insert into public.zelomenu_modifier_options(id,id_usuario,id_grupo,nome,price_delta,ativo,ordem,created_at,updated_at)
    values (v_opt_penne,v_user_id,v_mod_group,'Penne',32,true,0,now(),now()),
           (v_opt_bacon,v_user_id,v_mod_group,'Bacon xtra',5,true,1,now(),now()),
           (v_opt_classic,v_user_id,v_mod_group,'Queijo extra',3,true,2,now(),now());
  insert into public.zelomenu_modifier_option_products(id_opcao,id_usuario,id_produto)
    values (v_opt_penne,v_user_id,v_penne),(v_opt_bacon,v_user_id,v_bacon);

  insert into zltest_state values
    ('empresa_id',null,v_empresa_id),('user_id',null,v_user_id),
    ('cat_normal',v_cat_normal,null),('cat_shared',v_cat_shared,null),
    ('container',v_container,null),('penne',v_penne,null),('bacon',v_bacon,null),
    ('opt_penne',null,v_opt_penne),('opt_bacon',null,v_opt_bacon),
    ('opt_classic',null,v_opt_classic);
  raise notice 'Setup OK';
end $$;

-- Set auth context: criar_venda_completa (called inside close_zelo_order)
-- needs auth.uid() to return a real user_id.
do $$
declare v_uid uuid := (select uuid_val from zltest_state where name='user_id');
begin
  perform set_config('request.jwt.claims',
    '{"sub":"' || v_uid || '","role":"service_role"}', false);
end $$;

-- ===== Scenario 1: no modifiers =====
savepoint sc1;
do $$
declare
  v_empresa_id uuid := (select uuid_val from zltest_state where name='empresa_id');
  v_container int := (select id_val from zltest_state where name='container');
  v_order_id uuid; v_result jsonb;
begin
  insert into public.zelo_orders(empresa_id,source,status,idempotency_key,customer,subtotal,delivery_fee,discount,total)
    values (v_empresa_id,'zelomenu','pending_review','zltest-s1-'||gen_random_uuid(),'{"name":"T"}'::jsonb,20,0,0,20) returning id into v_order_id;
  insert into public.zelo_order_items(order_id,product_id,name,unit_price,quantity,subtotal,modifiers,position)
    values (v_order_id,v_container,'ZLTEST sem mod',20,1,20,'[]'::jsonb,0);
  v_result := public.accept_zelo_order(v_order_id, 1);
  raise notice 'PASS: Scenario 1 (baseline, no modifiers)';
end $$;
rollback to savepoint sc1;

-- ===== Scenario 2: Bacon (priceDelta=5,qty=1), container 25 =====
savepoint sc2;
do $$
declare
  v_empresa_id uuid := (select uuid_val from zltest_state where name='empresa_id');
  v_container int := (select id_val from zltest_state where name='container');
  v_bacon int := (select id_val from zltest_state where name='bacon');
  v_opt_bacon uuid := (select uuid_val from zltest_state where name='opt_bacon');
  v_order_id uuid; v_result jsonb;
begin
  insert into public.zelo_orders(empresa_id,source,status,idempotency_key,customer,subtotal,delivery_fee,discount,total)
    values (v_empresa_id,'zelomenu','pending_review','zltest-s2-'||gen_random_uuid(),'{"name":"T"}'::jsonb,25,0,0,25) returning id into v_order_id;
  insert into public.zelo_order_items(order_id,product_id,name,unit_price,quantity,subtotal,modifiers,position)
    values (v_order_id,v_container,'ZLTEST Massa',25,1,25,
      jsonb_build_array(jsonb_build_object('groupId',gen_random_uuid(),'groupName','Bacon','kind','adicionar',
        'selectedOptions',jsonb_build_array(jsonb_build_object('optionId',v_opt_bacon,'optionName','Bacon','priceDelta',5,'quantity',1)))),0);
  v_result := public.accept_zelo_order(v_order_id, 1);
  if (select estoque_atual from public.produtos where id=v_bacon) <> 4 then
    raise exception 'S2_FAIL: bacon stock should be 4, got %', (select estoque_atual from public.produtos where id=v_bacon); end if;
  v_result := public.transition_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'start_preparing');
  v_result := public.transition_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'mark_ready');
  v_result := public.close_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'{}'::jsonb);
  if not exists (select 1 from public.vendas_itens where id_venda=(select sale_id from public.zelo_orders where id=v_order_id) and id_produto=v_container and preco_unitario_na_venda=20 and quantidade=1) then
    raise exception 'S2_FAIL: container line should be price 20, qty 1'; end if;
  if not exists (select 1 from public.vendas_itens where id_venda=(select sale_id from public.zelo_orders where id=v_order_id) and id_produto=v_bacon and preco_unitario_na_venda=5 and quantidade=1) then
    raise exception 'S2_FAIL: bacon line missing (price 5, qty 1)'; end if;
  raise notice 'PASS: Scenario 2 (somar Bacon, container 20 + Bacon 5)';
end $$;
rollback to savepoint sc2;

-- ===== Scenario 3: Penne (priceDelta=32), container 32, shared stock 50->49 =====
savepoint sc3;
do $$
declare
  v_empresa_id uuid := (select uuid_val from zltest_state where name='empresa_id');
  v_container int := (select id_val from zltest_state where name='container');
  v_cat_shared int := (select id_val from zltest_state where name='cat_shared');
  v_penne int := (select id_val from zltest_state where name='penne');
  v_opt_penne uuid := (select uuid_val from zltest_state where name='opt_penne');
  v_order_id uuid; v_result jsonb;
begin
  insert into public.zelo_orders(empresa_id,source,status,idempotency_key,customer,subtotal,delivery_fee,discount,total)
    values (v_empresa_id,'zelomenu','pending_review','zltest-s3-'||gen_random_uuid(),'{"name":"T"}'::jsonb,32,0,0,32) returning id into v_order_id;
  insert into public.zelo_order_items(order_id,product_id,name,unit_price,quantity,subtotal,modifiers,position)
    values (v_order_id,v_container,'ZLTEST Massa',32,1,32,
      jsonb_build_array(jsonb_build_object('groupId',gen_random_uuid(),'groupName','Massa','kind','variacao',
        'selectedOptions',jsonb_build_array(jsonb_build_object('optionId',v_opt_penne,'optionName','Penne','priceDelta',32,'quantity',1)))),0);
  v_result := public.accept_zelo_order(v_order_id, 1);
  if (select coalesce(estoque_compartilhado_atual,0) from public.categorias where id=v_cat_shared) <> 49 then
    raise exception 'S3_FAIL: shared cat stock should be 49, got %',
      (select coalesce(estoque_compartilhado_atual,0) from public.categorias where id=v_cat_shared); end if;
  v_result := public.transition_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'start_preparing');
  v_result := public.transition_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'mark_ready');
  v_result := public.close_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'{}'::jsonb);
  if not exists (select 1 from public.vendas_itens where id_venda=(select sale_id from public.zelo_orders where id=v_order_id) and id_produto=v_penne and preco_unitario_na_venda=32 and quantidade=1) then
    raise exception 'S3_FAIL: vendas_itens missing Penne line'; end if;
  if not exists (select 1 from public.vendas_itens where id_venda=(select sale_id from public.zelo_orders where id=v_order_id) and id_produto=v_container and preco_unitario_na_venda=0) then
    raise exception 'S3_FAIL: container line should be price 0'; end if;
  raise notice 'PASS: Scenario 3 (substituir Penne)';
end $$;
rollback to savepoint sc3;

-- ===== Scenario 4: Penne (32) + Bacon (5) =====
savepoint sc4;
do $$
declare
  v_empresa_id uuid := (select uuid_val from zltest_state where name='empresa_id');
  v_container int := (select id_val from zltest_state where name='container');
  v_bacon int := (select id_val from zltest_state where name='bacon');
  v_cat_shared int := (select id_val from zltest_state where name='cat_shared');
  v_penne int := (select id_val from zltest_state where name='penne');
  v_opt_penne uuid := (select uuid_val from zltest_state where name='opt_penne');
  v_opt_bacon uuid := (select uuid_val from zltest_state where name='opt_bacon');
  v_order_id uuid; v_result jsonb;
begin
  insert into public.zelo_orders(empresa_id,source,status,idempotency_key,customer,subtotal,delivery_fee,discount,total)
    values (v_empresa_id,'zelomenu','pending_review','zltest-s4-'||gen_random_uuid(),'{"name":"T"}'::jsonb,37,0,0,37) returning id into v_order_id;
  insert into public.zelo_order_items(order_id,product_id,name,unit_price,quantity,subtotal,modifiers,position)
    values (v_order_id,v_container,'ZLTEST Massa',37,1,37,
      jsonb_build_array(
        jsonb_build_object('groupId',gen_random_uuid(),'groupName','Massa','kind','variacao',
          'selectedOptions',jsonb_build_array(jsonb_build_object('optionId',v_opt_penne,'optionName','Penne','priceDelta',32,'quantity',1))),
        jsonb_build_object('groupId',gen_random_uuid(),'groupName','Bacon','kind','adicionar',
          'selectedOptions',jsonb_build_array(jsonb_build_object('optionId',v_opt_bacon,'optionName','Bacon','priceDelta',5,'quantity',1)))
      ),0);
  v_result := public.accept_zelo_order(v_order_id, 1);
  if (select coalesce(estoque_compartilhado_atual,0) from public.categorias where id=v_cat_shared) <> 49 then
    raise exception 'S4_FAIL: shared cat stock should be 49'; end if;
  if (select estoque_atual from public.produtos where id=v_bacon) <> 4 then
    raise exception 'S4_FAIL: bacon stock should be 4'; end if;
  v_result := public.transition_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'start_preparing');
  v_result := public.transition_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'mark_ready');
  v_result := public.close_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'{}'::jsonb);
  if not exists (select 1 from public.vendas_itens where id_venda=(select sale_id from public.zelo_orders where id=v_order_id) and id_produto=v_container and preco_unitario_na_venda=0) then raise exception 'S4_FAIL: container price 0'; end if;
  if not exists (select 1 from public.vendas_itens where id_venda=(select sale_id from public.zelo_orders where id=v_order_id) and id_produto=v_penne and preco_unitario_na_venda=32 and quantidade=1) then raise exception 'S4_FAIL: missing Penne'; end if;
  if not exists (select 1 from public.vendas_itens where id_venda=(select sale_id from public.zelo_orders where id=v_order_id) and id_produto=v_bacon and preco_unitario_na_venda=5 and quantidade=1) then raise exception 'S4_FAIL: missing Bacon'; end if;
  raise notice 'PASS: Scenario 4 (Penne + Bacon, 3 lines)';
end $$;
rollback to savepoint sc4;

-- ===== Scenario 5: Bacon quantity=3, container 35 (20+15) =====
savepoint sc5;
do $$
declare
  v_empresa_id uuid := (select uuid_val from zltest_state where name='empresa_id');
  v_container int := (select id_val from zltest_state where name='container');
  v_bacon int := (select id_val from zltest_state where name='bacon');
  v_opt_bacon uuid := (select uuid_val from zltest_state where name='opt_bacon');
  v_order_id uuid; v_result jsonb;
begin
  insert into public.zelo_orders(empresa_id,source,status,idempotency_key,customer,subtotal,delivery_fee,discount,total)
    values (v_empresa_id,'zelomenu','pending_review','zltest-s5-'||gen_random_uuid(),'{"name":"T"}'::jsonb,35,0,0,35) returning id into v_order_id;
  insert into public.zelo_order_items(order_id,product_id,name,unit_price,quantity,subtotal,modifiers,position)
    values (v_order_id,v_container,'ZLTEST Massa',35,1,35,
      jsonb_build_array(jsonb_build_object('groupId',gen_random_uuid(),'groupName','Bacon','kind','adicionar',
        'selectedOptions',jsonb_build_array(jsonb_build_object('optionId',v_opt_bacon,'optionName','Bacon','priceDelta',5,'quantity',3)))),0);
  v_result := public.accept_zelo_order(v_order_id, 1);
  if (select estoque_atual from public.produtos where id=v_bacon) <> 2 then raise exception 'S5_FAIL: bacon stock 2, got %',(select estoque_atual from public.produtos where id=v_bacon); end if;
  v_result := public.transition_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'start_preparing');
  v_result := public.transition_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'mark_ready');
  v_result := public.close_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'{}'::jsonb);
  if not exists (select 1 from public.vendas_itens where id_venda=(select sale_id from public.zelo_orders where id=v_order_id) and id_produto=v_bacon and preco_unitario_na_venda=5 and quantidade=3) then raise exception 'S5_FAIL: Bacon line should be price 5, qty 3'; end if;
  if not exists (select 1 from public.vendas_itens where id_venda=(select sale_id from public.zelo_orders where id=v_order_id) and id_produto=v_container and preco_unitario_na_venda=20 and quantidade=1) then raise exception 'S5_FAIL: container line should be price 20, qty 1'; end if;
  raise notice 'PASS: Scenario 5 (Bacon qty=3, unit price 5)';
end $$;
rollback to savepoint sc5;

-- ===== Scenario 6: Penne order qty=2, shared stock 50->48 =====
savepoint sc6;
do $$
declare
  v_empresa_id uuid := (select uuid_val from zltest_state where name='empresa_id');
  v_container int := (select id_val from zltest_state where name='container');
  v_cat_shared int := (select id_val from zltest_state where name='cat_shared');
  v_penne int := (select id_val from zltest_state where name='penne');
  v_opt_penne uuid := (select uuid_val from zltest_state where name='opt_penne');
  v_order_id uuid; v_result jsonb;
begin
  insert into public.zelo_orders(empresa_id,source,status,idempotency_key,customer,subtotal,delivery_fee,discount,total)
    values (v_empresa_id,'zelomenu','pending_review','zltest-s6-'||gen_random_uuid(),'{"name":"T"}'::jsonb,64,0,0,64) returning id into v_order_id;
  insert into public.zelo_order_items(order_id,product_id,name,unit_price,quantity,subtotal,modifiers,position)
    values (v_order_id,v_container,'ZLTEST Massa',32,2,64,
      jsonb_build_array(jsonb_build_object('groupId',gen_random_uuid(),'groupName','Massa','kind','variacao',
        'selectedOptions',jsonb_build_array(jsonb_build_object('optionId',v_opt_penne,'optionName','Penne','priceDelta',32,'quantity',1)))),0);
  v_result := public.accept_zelo_order(v_order_id, 1);
  if (select coalesce(estoque_compartilhado_atual,0) from public.categorias where id=v_cat_shared) <> 48 then
    raise exception 'S6_FAIL: shared cat stock should be 48, got %',(select coalesce(estoque_compartilhado_atual,0) from public.categorias where id=v_cat_shared); end if;
  v_result := public.transition_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'start_preparing');
  v_result := public.transition_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'mark_ready');
  v_result := public.close_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'{}'::jsonb);
  if not exists (select 1 from public.vendas_itens where id_venda=(select sale_id from public.zelo_orders where id=v_order_id) and id_produto=v_penne and preco_unitario_na_venda=32 and quantidade=2) then raise exception 'S6_FAIL: Penne line should be price 32, qty 2'; end if;
  if not exists (select 1 from public.vendas_itens where id_venda=(select sale_id from public.zelo_orders where id=v_order_id) and id_produto=v_container and preco_unitario_na_venda=0) then raise exception 'S6_FAIL: container line should be price 0'; end if;
  raise notice 'PASS: Scenario 6 (order qty=2, shared stock 50->48)';
end $$;
rollback to savepoint sc6;

-- ===== Scenario 7: 55 Penne (exceeds 50 shared stock) blocks accept =====
savepoint sc7;
do $$
declare
  v_empresa_id uuid := (select uuid_val from zltest_state where name='empresa_id');
  v_container int := (select id_val from zltest_state where name='container');
  v_opt_penne uuid := (select uuid_val from zltest_state where name='opt_penne');
  v_order_id uuid; v_result jsonb;
begin
  insert into public.zelo_orders(empresa_id,source,status,idempotency_key,customer,subtotal,delivery_fee,discount,total)
    values (v_empresa_id,'zelomenu','pending_review','zltest-s7-'||gen_random_uuid(),'{"name":"T"}'::jsonb,1760,0,0,1760) returning id into v_order_id;
  insert into public.zelo_order_items(order_id,product_id,name,unit_price,quantity,subtotal,modifiers,position)
    values (v_order_id,v_container,'ZLTEST Massa',32,55,1760,
      jsonb_build_array(jsonb_build_object('groupId',gen_random_uuid(),'groupName','Massa','kind','variacao',
        'selectedOptions',jsonb_build_array(jsonb_build_object('optionId',v_opt_penne,'optionName','Penne','priceDelta',32,'quantity',1)))),0);
  begin
    v_result := public.accept_zelo_order(v_order_id, 1);
    raise exception 'S7_FAIL: expected PRODUCT_STOCK_EXCEEDED, accept succeeded';
  exception when others then
    if sqlstate <> 'ZL409' then raise exception 'S7_FAIL: expected ZL409, got %', sqlstate; end if;
    raise notice 'PASS: Scenario 7 (stock blocks accept)';
  end;
end $$;
rollback to savepoint sc7;

-- ===== Scenario 8: accept then cancel, stock restored =====
savepoint sc8;
do $$
declare
  v_empresa_id uuid := (select uuid_val from zltest_state where name='empresa_id');
  v_container int := (select id_val from zltest_state where name='container');
  v_cat_shared int := (select id_val from zltest_state where name='cat_shared');
  v_penne int := (select id_val from zltest_state where name='penne');
  v_opt_penne uuid := (select uuid_val from zltest_state where name='opt_penne');
  v_order_id uuid; v_result jsonb;
begin
  insert into public.zelo_orders(empresa_id,source,status,idempotency_key,customer,subtotal,delivery_fee,discount,total)
    values (v_empresa_id,'zelomenu','pending_review','zltest-s8-'||gen_random_uuid(),'{"name":"T"}'::jsonb,32,0,0,32) returning id into v_order_id;
  insert into public.zelo_order_items(order_id,product_id,name,unit_price,quantity,subtotal,modifiers,position)
    values (v_order_id,v_container,'ZLTEST Massa',32,1,32,
      jsonb_build_array(jsonb_build_object('groupId',gen_random_uuid(),'groupName','Massa','kind','variacao',
        'selectedOptions',jsonb_build_array(jsonb_build_object('optionId',v_opt_penne,'optionName','Penne','priceDelta',32,'quantity',1)))),0);
  v_result := public.accept_zelo_order(v_order_id, 1);
  if (select coalesce(estoque_compartilhado_atual,0) from public.categorias where id=v_cat_shared) <> 49 then
    raise exception 'S8_FAIL: shared cat should be 49 after accept, got %',
      (select coalesce(estoque_compartilhado_atual,0) from public.categorias where id=v_cat_shared); end if;
  v_result := public.transition_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'cancel');
  if (select coalesce(estoque_compartilhado_atual,0) from public.categorias where id=v_cat_shared) <> 50 then
    raise exception 'S8_FAIL: shared cat should be 50 after cancel restore, got %',
      (select coalesce(estoque_compartilhado_atual,0) from public.categorias where id=v_cat_shared); end if;
  if (select stock_released_at from public.zelo_orders where id=v_order_id) is null then
    raise exception 'S8_FAIL: stock_released_at should be set after cancel'; end if;
  raise notice 'PASS: Scenario 8 (accept then cancel, stock restored)';
end $$;
rollback to savepoint sc8;

-- ===== Scenario 9: malformed optionId 'not-a-real-uuid' =====
savepoint sc9;
do $$
declare
  v_empresa_id uuid := (select uuid_val from zltest_state where name='empresa_id');
  v_container int := (select id_val from zltest_state where name='container');
  v_order_id uuid; v_result jsonb;
begin
  insert into public.zelo_orders(empresa_id,source,status,idempotency_key,customer,subtotal,delivery_fee,discount,total)
    values (v_empresa_id,'zelomenu','pending_review','zltest-s9-'||gen_random_uuid(),'{"name":"T"}'::jsonb,25,0,0,25) returning id into v_order_id;
  insert into public.zelo_order_items(order_id,product_id,name,unit_price,quantity,subtotal,modifiers,position)
    values (v_order_id,v_container,'ZLTEST Massa',25,1,25,
      jsonb_build_array(jsonb_build_object('groupId',gen_random_uuid(),'groupName','Algo','kind','adicionar',
        'selectedOptions',jsonb_build_array(jsonb_build_object('optionId','not-a-real-uuid','optionName','Legacy','priceDelta',5,'quantity',1)))),0);
  v_result := public.accept_zelo_order(v_order_id, 1);
  v_result := public.transition_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'start_preparing');
  v_result := public.transition_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'mark_ready');
  v_result := public.close_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'{}'::jsonb);
  if (select count(*) from public.vendas_itens where id_venda=(select sale_id from public.zelo_orders where id=v_order_id)) <> 1 then
    raise exception 'S9_FAIL: expected 1 line, got %',(select count(*) from public.vendas_itens where id_venda=(select sale_id from public.zelo_orders where id=v_order_id)); end if;
  if not exists (select 1 from public.vendas_itens where id_venda=(select sale_id from public.zelo_orders where id=v_order_id) and id_produto=v_container and preco_unitario_na_venda=25) then
    raise exception 'S9_FAIL: container line should be full price 25'; end if;
  raise notice 'PASS: Scenario 9 (malformed optionId, no crash, price 25)';
end $$;
rollback to savepoint sc9;

-- ===== Scenario 10: linked Penne (32) + classic option (3, no row in option_products) =====
savepoint sc10;
do $$
declare
  v_empresa_id uuid := (select uuid_val from zltest_state where name='empresa_id');
  v_container int := (select id_val from zltest_state where name='container');
  v_cat_shared int := (select id_val from zltest_state where name='cat_shared');
  v_penne int := (select id_val from zltest_state where name='penne');
  v_opt_penne uuid := (select uuid_val from zltest_state where name='opt_penne');
  v_opt_classic uuid := (select uuid_val from zltest_state where name='opt_classic');
  v_order_id uuid; v_result jsonb;
begin
  insert into public.zelo_orders(empresa_id,source,status,idempotency_key,customer,subtotal,delivery_fee,discount,total)
    values (v_empresa_id,'zelomenu','pending_review','zltest-s10-'||gen_random_uuid(),'{"name":"T"}'::jsonb,35,0,0,35) returning id into v_order_id;
  insert into public.zelo_order_items(order_id,product_id,name,unit_price,quantity,subtotal,modifiers,position)
    values (v_order_id,v_container,'ZLTEST Massa',35,1,35,
      jsonb_build_array(jsonb_build_object('groupId',gen_random_uuid(),'groupName','Massa','kind','variacao',
        'selectedOptions',jsonb_build_array(
          jsonb_build_object('optionId',v_opt_penne,'optionName','Penne','priceDelta',32,'quantity',1),
          jsonb_build_object('optionId',v_opt_classic,'optionName','Queijo','priceDelta',3,'quantity',1)))),0);
  v_result := public.accept_zelo_order(v_order_id, 1);
  if (select coalesce(estoque_compartilhado_atual,0) from public.categorias where id=v_cat_shared) <> 49 then
    raise exception 'S10_FAIL: shared cat stock should be 49, got %',
      (select coalesce(estoque_compartilhado_atual,0) from public.categorias where id=v_cat_shared); end if;
  v_result := public.transition_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'start_preparing');
  v_result := public.transition_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'mark_ready');
  v_result := public.close_zelo_order(v_order_id,(select revision from public.zelo_orders where id=v_order_id),'{}'::jsonb);
  if (select count(*) from public.vendas_itens where id_venda=(select sale_id from public.zelo_orders where id=v_order_id)) <> 2 then
    raise exception 'S10_FAIL: expected 2 lines, got %',(select count(*) from public.vendas_itens where id_venda=(select sale_id from public.zelo_orders where id=v_order_id)); end if;
  if not exists (select 1 from public.vendas_itens where id_venda=(select sale_id from public.zelo_orders where id=v_order_id) and id_produto=v_penne and preco_unitario_na_venda=32 and quantidade=1) then raise exception 'S10_FAIL: missing Penne line'; end if;
  if not exists (select 1 from public.vendas_itens where id_venda=(select sale_id from public.zelo_orders where id=v_order_id) and id_produto=v_container and preco_unitario_na_venda=3) then raise exception 'S10_FAIL: container should be price 3 (35-32)'; end if;
  raise notice 'PASS: Scenario 10 (linked+classic, container 3, 2 lines)';
end $$;
rollback to savepoint sc10;

do $$ begin raise notice 'ALL SCENARIOS PASSED'; end $$;
select 'ALL SCENARIOS PASSED'::text as result;
rollback;

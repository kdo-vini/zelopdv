-- Disposable baseline harness only. Fixtures roll back; never run against live.
begin;
create temporary table sale_actor_fixture (
  owner_id uuid, allowed_id uuid, denied_id uuid, allowed_role uuid, denied_role uuid,
  person_id uuid, caixa_id integer, category_id integer, individual_id integer, shared_id integer
) on commit drop;
insert into sale_actor_fixture values (
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), -912001, -912002, -912003, -912004
);
grant select on sale_actor_fixture to authenticated, service_role;

insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select actor, 'sale-actor-' || actor::text || '@invalid.local', 'authenticated','authenticated','{}','{}',now(),now()
from sale_actor_fixture f cross join lateral(values(f.owner_id),(f.allowed_id),(f.denied_id)) a(actor);
insert into public.access_roles(id,owner_user_id,name,permissions)
select allowed_role,owner_id,'Sale authorized','{"pdv.acessar":true,"pdv.vender":true,"pdv.receber":true,"fiado.vender":true}'::jsonb from sale_actor_fixture
union all select denied_role,owner_id,'Sale denied','{"pdv.acessar":true}'::jsonb from sale_actor_fixture;
insert into public.access_users(owner_user_id,auth_user_id,email,role_id,status)
select owner_id,allowed_id,'sale-allowed-' || allowed_id::text || '@invalid.local',allowed_role,'active' from sale_actor_fixture
union all select owner_id,denied_id,'sale-denied-' || denied_id::text || '@invalid.local',denied_role,'active' from sale_actor_fixture;
insert into public.caixas(id,id_usuario,valor_inicial) select caixa_id,owner_id,0 from sale_actor_fixture;
insert into public.categorias(id,id_usuario,nome,controlar_estoque_compartilhado,estoque_compartilhado_atual)
select category_id,owner_id,'Shared fixture',true,20 from sale_actor_fixture;
insert into public.produtos(id,id_usuario,id_categoria,nome,preco,controlar_estoque,estoque_atual)
select individual_id,owner_id,null,'Individual fixture',5,true,20 from sale_actor_fixture
union all select shared_id,owner_id,category_id,'Shared fixture item',5,false,0 from sale_actor_fixture;
insert into public.pessoas(id,id_usuario,nome,saldo_fiado) select person_id,owner_id,'Fiado fixture',100 from sale_actor_fixture;

create temporary table sale_actor_results(scenario text primary key,result jsonb) on commit drop;
grant select,insert on sale_actor_results to authenticated, service_role;
create function pg_temp.sale_payload(intent text,fiado boolean) returns jsonb language sql as $$
  select jsonb_build_object(
    'client_sale_id',intent,'id_caixa',caixa_id,'id_cliente',case when fiado then person_id else null end,
    'id_usuario',denied_id,'id_operador',denied_id,
    'forma_pagamento',case when fiado then 'fiado' else 'dinheiro' end,'valor_total',20,
    'itens',jsonb_build_array(
      jsonb_build_object('id_produto',individual_id,'quantidade',2,'nome','Individual fixture','preco',5),
      jsonb_build_object('id_produto',shared_id,'quantidade',2,'nome','Shared fixture item','preco',5)),
    'estoque',jsonb_build_array(jsonb_build_object('id_produto',individual_id,'quantidade',2),jsonb_build_object('id_produto',shared_id,'quantidade',2)),
    'fiados',case when fiado then jsonb_build_array(jsonb_build_object('id_pessoa',person_id,'valor',20)) else '[]'::jsonb end
  ) from sale_actor_fixture;
$$;
create function pg_temp.try_sale(payload jsonb) returns jsonb language plpgsql as $$
begin
  return public.criar_venda_completa(payload);
exception when others then
  return jsonb_build_object('sqlstate',sqlstate,'error',sqlerrm);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true) from sale_actor_fixture;
insert into sale_actor_results values('owner_fiado',pg_temp.try_sale(pg_temp.sale_payload('probe-owner-fiado',true)));
insert into sale_actor_results values('owner_fiado_retry',pg_temp.try_sale(pg_temp.sale_payload('probe-owner-fiado',true)));

select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',allowed_id)::text,true) from sale_actor_fixture;
insert into sale_actor_results values('sub_fiado',pg_temp.try_sale(pg_temp.sale_payload('probe-sub-fiado',true)));
insert into sale_actor_results values('sub_fiado_retry',pg_temp.try_sale(pg_temp.sale_payload('probe-sub-fiado',true)));
insert into sale_actor_results values('sub_cash',pg_temp.try_sale(pg_temp.sale_payload('probe-sub-cash',false)));
insert into sale_actor_results values('sub_cash_retry',pg_temp.try_sale(pg_temp.sale_payload('probe-sub-cash',false)));

select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true) from sale_actor_fixture;
insert into sale_actor_results values('owner_retry_sub_cash',pg_temp.try_sale(pg_temp.sale_payload('probe-sub-cash',false)));

select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',denied_id)::text,true) from sale_actor_fixture;
insert into sale_actor_results values('denied_cash',pg_temp.try_sale(pg_temp.sale_payload('probe-denied',false)));
reset role;

-- Print all observations before failing, so a single regression does not hide others.
select 'SALE_ACTOR_OBSERVATION',r.scenario,r.result,
  v.id_usuario=f.owner_id as correct_owner,v.id_operador=case when r.scenario like 'owner_fiado%' then f.owner_id else f.allowed_id end as correct_operator,
  v.id_caixa=f.caixa_id as correct_caixa
from sale_actor_results r cross join sale_actor_fixture f
left join public.vendas v on v.id=(r.result->>'id')::bigint order by r.scenario;
select 'SALE_ACTOR_BALANCES',p.estoque_atual,c.estoque_compartilhado_atual,person.saldo_fiado,
  (select count(*) from public.vendas where client_sale_id like 'probe-%' and id_usuario in(f.owner_id,f.allowed_id,f.denied_id)) as sale_count
from sale_actor_fixture f join public.produtos p on p.id=f.individual_id
join public.categorias c on c.id=f.category_id join public.pessoas person on person.id=f.person_id;

do $$
declare f sale_actor_fixture%rowtype; r jsonb; failures text[] := '{}';
begin
  select * into f from sale_actor_fixture;
  for r in select result from sale_actor_results where scenario <> 'denied_cash' loop
    if r->>'id' is null then failures := array_append(failures,'authorized sale returned error: ' || r::text); end if;
  end loop;
  if exists(select 1 from sale_actor_results a join public.vendas v on v.id=(a.result->>'id')::bigint
    where a.scenario <> 'denied_cash' and (v.id_usuario is distinct from f.owner_id or v.id_caixa is distinct from f.caixa_id)) then
    failures := array_append(failures,'sale owner/caixa differ from authenticated tenant');
  end if;
  if exists(select 1 from sale_actor_results a join public.vendas v on v.id=(a.result->>'id')::bigint
    where a.scenario in('sub_cash','sub_fiado') and v.id_operador is distinct from f.allowed_id) then
    failures := array_append(failures,'authenticated operator not recorded');
  end if;
  if (select result->>'id' from sale_actor_results where scenario='sub_cash') is distinct from
     (select result->>'id' from sale_actor_results where scenario='owner_retry_sub_cash') then
    failures := array_append(failures,'same tenant intent replayed by owner created another sale');
  end if;
  if (select result->>'sqlstate' from sale_actor_results where scenario='denied_cash') is distinct from '42501' then
    failures := array_append(failures,'subuser without sale capabilities was not denied');
  end if;
  if (select estoque_atual from public.produtos where id=f.individual_id) <> 14
    or (select estoque_compartilhado_atual from public.categorias where id=f.category_id) <> 14 then
    failures := array_append(failures,'three unique authorized sales did not debit individual/shared stock once each');
  end if;
  if (select saldo_fiado from public.pessoas where id=f.person_id) <> 140 then
    failures := array_append(failures,'owner and authorized subuser fiado did not debit customer once each');
  end if;
  if (select count(*) from public.vendas where client_sale_id like 'probe-%' and id_usuario in(f.owner_id,f.allowed_id,f.denied_id)) <> 3 then
    failures := array_append(failures,'sale count differs from three authorized intentions');
  end if;
  if array_length(failures,1)>0 then raise exception 'SALE_ACTOR_FAILURES: %',array_to_string(failures,'; '); end if;
  raise notice 'SALE_ACTOR_PASS owner, authorized/denied subuser, individual/shared stock, fiado, operator and cross-actor replay';
end;
$$;

-- Revocation must be checked before returning an existing tenant sale.
update public.access_roles set permissions = '{"pdv.acessar":true,"pdv.vender":true}'
where id = (select allowed_role from sale_actor_fixture);
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',allowed_id)::text,true) from sale_actor_fixture;
insert into sale_actor_results values('revoked_replay',pg_temp.try_sale(pg_temp.sale_payload('probe-sub-cash',false)));
reset role;

-- Keep service-role behavior with an actor, and the existing unauthenticated
-- rejection without one. No extra sale is created by these replay checks.
set local role service_role;
select set_config('request.jwt.claims',jsonb_build_object('role','service_role','sub',denied_id)::text,true) from sale_actor_fixture;
insert into sale_actor_results values('service_replay',pg_temp.try_sale(pg_temp.sale_payload('probe-sub-cash',false)));
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into sale_actor_results values('service_no_actor',pg_temp.try_sale(pg_temp.sale_payload('probe-service-no-actor',false)));

-- Simulate pre-fix history without invoking the new RPC. Keep the access link
-- but disable it, proving the guard does not forget historical ownership.
insert into public.vendas(id_usuario,client_sale_id,valor_total,forma_pagamento)
select allowed_id,'legacy-sale-intent',20,'dinheiro' from sale_actor_fixture;
reset role;
update public.access_users set status = 'blocked'
where auth_user_id = (select allowed_id from sale_actor_fixture);
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true) from sale_actor_fixture;
insert into sale_actor_results values('legacy_owner_replay',pg_temp.try_sale(pg_temp.sale_payload('legacy-sale-intent',false)));
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',allowed_id)::text,true) from sale_actor_fixture;
insert into sale_actor_results values('blocked_actor_legacy_replay',pg_temp.try_sale(pg_temp.sale_payload('legacy-sale-intent',false)));
insert into sale_actor_results values('blocked_actor_new_sale',pg_temp.try_sale(pg_temp.sale_payload('blocked-new-intent',false)));
reset role;

do $$
declare f sale_actor_fixture%rowtype;
begin
  select * into f from sale_actor_fixture;
  if (select result->>'sqlstate' from sale_actor_results where scenario='revoked_replay') is distinct from '42501' then
    raise exception 'replay bypassed revoked sale/receive permission';
  end if;
  if (select result->>'id' from sale_actor_results where scenario='service_replay') is distinct from
     (select result->>'id' from sale_actor_results where scenario='sub_cash') then
    raise exception 'service actor bypass or tenant replay changed';
  end if;
  if (select result->>'sqlstate' from sale_actor_results where scenario='service_no_actor') is distinct from '28000' then
    raise exception 'service without authenticated actor unexpectedly accepted';
  end if;
  if (select result->>'error' from sale_actor_results where scenario='legacy_owner_replay') is distinct from 'SALE_LEGACY_OWNER_RECONCILIATION_REQUIRED'
    or (select count(*) from public.vendas where client_sale_id='legacy-sale-intent' and id_usuario=f.allowed_id) <> 1
    or exists(select 1 from public.vendas where client_sale_id='legacy-sale-intent' and id_usuario=f.owner_id) then
    raise exception 'legacy intention was duplicated, reassigned or not rejected';
  end if;
  if exists(select 1 from sale_actor_results where scenario like 'blocked_actor_%' and result->>'sqlstate' is distinct from '42501')
    or exists(select 1 from public.vendas where client_sale_id='blocked-new-intent' and id_usuario in(f.owner_id,f.allowed_id)) then
    raise exception 'blocked operator became own tenant, replayed legacy history or created a sale';
  end if;
  if has_function_privilege('anon','public.criar_venda_completa(jsonb)','EXECUTE')
    or not has_function_privilege('authenticated','public.criar_venda_completa(jsonb)','EXECUTE')
    or not has_function_privilege('service_role','public.criar_venda_completa(jsonb)','EXECUTE') then
    raise exception 'sale RPC ACL changed';
  end if;
  if (select estoque_atual from public.produtos where id=f.individual_id) <> 14
    or (select estoque_compartilhado_atual from public.categorias where id=f.category_id) <> 14
    or (select saldo_fiado from public.pessoas where id=f.person_id) <> 140 then
    raise exception 'rejected/replayed sale changed stock or fiado';
  end if;
  raise notice 'SALE_ACTOR_GUARDS_PASS forged identity ignored, permission before replay, service/ACL preserved, inactive operator denied replay/new sale, legacy history blocked without mutation';
end;
$$;

-- A former operator may also own a legitimate separate subscription. Preserve
-- that account but resolve every sale/cash register/stock effect to itself.
insert into public.subscriptions(user_id,status,current_period_end)
select allowed_id,'canceled',now()-interval '1 day' from sale_actor_fixture;
insert into public.caixas(id,id_usuario,valor_inicial)
select -912005,allowed_id,0 from sale_actor_fixture;
insert into public.produtos(id,id_usuario,nome,preco,controlar_estoque,estoque_atual)
select -912006,allowed_id,'Own account item',10,true,10 from sale_actor_fixture;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',allowed_id)::text,true) from sale_actor_fixture;
insert into sale_actor_results
select 'former_operator_own_sale',pg_temp.try_sale(jsonb_build_object(
  'client_sale_id','former-operator-own-intent','id_caixa',caixa_id,'id_usuario',owner_id,'id_operador',owner_id,
  'forma_pagamento','dinheiro','valor_total',20,
  'itens',jsonb_build_array(jsonb_build_object('id_produto',-912006,'quantidade',2,'nome','Own account item','preco',10)),
  'estoque',jsonb_build_array(jsonb_build_object('id_produto',-912006,'quantidade',2),jsonb_build_object('id_produto',individual_id,'quantidade',2))
)) from sale_actor_fixture;
insert into sale_actor_results values('former_operator_own_retry',pg_temp.try_sale('{"client_sale_id":"former-operator-own-intent"}'));
reset role;
do $$
declare f sale_actor_fixture%rowtype; sale_id bigint;
begin
  select * into f from sale_actor_fixture;
  select (result->>'id')::bigint into sale_id from sale_actor_results where scenario='former_operator_own_sale';
  if sale_id is null or not exists(select 1 from public.vendas where id=sale_id
    and id_usuario=f.allowed_id and id_operador=f.allowed_id and id_caixa=-912005) then
    raise exception 'former operator own subscription did not resolve its own sale/operator/cash register';
  end if;
  if (select result->>'id' from sale_actor_results where scenario='former_operator_own_retry') is distinct from sale_id::text
    or (select estoque_atual from public.produtos where id=-912006) <> 8
    or (select estoque_atual from public.produtos where id=f.individual_id) <> 14
    or (select estoque_compartilhado_atual from public.categorias where id=f.category_id) <> 14
    or (select saldo_fiado from public.pessoas where id=f.person_id) <> 140 then
    raise exception 'former operator crossed back into old tenant or replayed its own stock debit';
  end if;
  raise notice 'SALE_ACTOR_OWN_SUBSCRIPTION_PASS legitimate separate owner, own stock/cash register, old tenant unchanged; no new entitlement rule';
end;
$$;
rollback;

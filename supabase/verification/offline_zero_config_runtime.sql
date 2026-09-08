-- Disposable PostgreSQL only. Test identities and all writes roll back.
-- Covers 20260907150000: store-level offline defaults to enabled, and any
-- operator with caixa capability can claim primary-device status as a side
-- effect of an online caixa action, with no owner-only setup screen.
begin;
create temporary table zc_fixture(owner_id uuid,cashier_id uuid,reader_id uuid,cashier_role uuid,reader_role uuid) on commit drop;
insert into zc_fixture values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
grant select,update on zc_fixture to authenticated;
insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 select id,'zc-'||id||'@invalid.local','authenticated','authenticated','{}','{}',now(),now()
 from zc_fixture f cross join lateral(values(f.owner_id),(f.cashier_id),(f.reader_id)) a(id);
insert into public.access_roles(id,owner_user_id,name,permissions) select cashier_role,owner_id,'Cashier','{"pdv.acessar":true,"caixa.abrir":true,"caixa.fechar":true}' from zc_fixture;
insert into public.access_roles(id,owner_user_id,name,permissions) select reader_role,owner_id,'Reader','{"pdv.acessar":true}' from zc_fixture;
insert into public.access_users(owner_user_id,auth_user_id,email,role_id,status) select owner_id,cashier_id,'zc-cashier@invalid.local',cashier_role,'active' from zc_fixture;
insert into public.access_users(owner_user_id,auth_user_id,email,role_id,status) select owner_id,reader_id,'zc-reader@invalid.local',reader_role,'active' from zc_fixture;
insert into public.subscriptions(user_id,status,current_period_end) select owner_id,'active',now()+interval '30 days' from zc_fixture;
create function pg_temp.zc_assert(condition boolean,message text) returns void language plpgsql as $$ begin if condition is distinct from true then raise exception 'ZERO-CONFIG ASSERT: %',message; end if; end $$;

-- A brand-new store has no offline_settings row until the first register;
-- that first row must land enabled, with nobody having flipped a switch.
select pg_temp.zc_assert(not exists(select 1 from public.offline_settings where owner_user_id=f.owner_id),'no settings row before any device registers') from zc_fixture f;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true) from zc_fixture;
select public.offline_bootstrap_v1('owner-device','register');
select pg_temp.zc_assert((select enabled from public.offline_settings where owner_user_id=f.owner_id),'store defaults to offline-enabled on first register') from zc_fixture f;

-- The cashier claims primary status purely by having caixa capability; no
-- owner action, no 'set_primary' call, ever happened for this device.
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',cashier_id)::text,true) from zc_fixture;
select pg_temp.zc_assert((public.offline_bootstrap_v1('cashier-device','register')->>'registered')::boolean,'cashier device registers');
select pg_temp.zc_assert((public.offline_bootstrap_v1('cashier-device','claim_primary')->>'isPrimaryDevice')::boolean,'cashier claims primary with no owner setup step');
select pg_temp.zc_assert((select primary_device_id from public.offline_settings where owner_user_id=f.owner_id)='cashier-device','primary_device_id actually moved') from zc_fixture f;

-- A reader without any caixa capability cannot claim it — claim_primary
-- needs the same authority the online caixa action itself required.
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',reader_id)::text,true) from zc_fixture;
select pg_temp.zc_assert((public.offline_bootstrap_v1('reader-device','register')->>'registered')::boolean,'reader device registers');
do $$ begin
  begin perform public.offline_bootstrap_v1('reader-device','claim_primary'); raise exception 'Reader claimed primary without caixa capability';
  exception when insufficient_privilege then null; end;
end $$;
select pg_temp.zc_assert((select primary_device_id from public.offline_settings where owner_user_id=f.owner_id)='cashier-device','primary device unchanged by rejected reader claim') from zc_fixture f;

-- The owner's explicit kill switch still wins: claim_primary never
-- re-enables a store the owner turned off, it just quietly no-ops.
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true) from zc_fixture;
select public.offline_bootstrap_v1('owner-device','disable');
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',cashier_id)::text,true) from zc_fixture;
select public.offline_bootstrap_v1('cashier-device','claim_primary');
select pg_temp.zc_assert(not (select enabled from public.offline_settings where owner_user_id=f.owner_id),'claim_primary never re-enables a store the owner disabled') from zc_fixture f;
select pg_temp.zc_assert((select primary_device_id from public.offline_settings where owner_user_id=f.owner_id)='cashier-device','primary_device_id untouched, not cleared, while disabled') from zc_fixture f;

reset role;
rollback;

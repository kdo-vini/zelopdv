-- Transactional runtime verification for CRM links on canonical orders.
-- All fixtures are rolled back; no production or persistent test IDs are used.

begin;

create temporary table customer_order_links_fixture (
  owner_id uuid not null,
  other_owner_id uuid not null,
  empresa_id uuid not null,
  pessoa_id uuid not null,
  other_tenant_pessoa_id uuid not null,
  nonzero_pessoa_id uuid not null,
  delete_pessoa_id uuid not null,
  legacy_order_id uuid,
  linked_order_id uuid,
  delete_order_id uuid,
  snapshot jsonb
) on commit drop;

grant select on customer_order_links_fixture to authenticated;
grant select, update on customer_order_links_fixture to service_role;

insert into customer_order_links_fixture (
  owner_id, other_owner_id, empresa_id, pessoa_id,
  other_tenant_pessoa_id, nonzero_pessoa_id, delete_pessoa_id
)
values (
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
);

insert into auth.users (
  id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select actor_id,
       'codex-order-links-' || actor_id::text || '@invalid.local',
       'authenticated', 'authenticated', '{}', '{}', now(), now()
  from customer_order_links_fixture f
 cross join lateral (values (f.owner_id), (f.other_owner_id)) actors(actor_id);

insert into public.empresa_perfil (id, user_id, nome_exibicao)
select empresa_id, owner_id, 'Empresa de verificação CRM'
  from customer_order_links_fixture;

insert into public.pessoas (id, id_usuario, nome, tipo, saldo_fiado)
select pessoa_id, owner_id, 'Cliente vinculado', 'cliente', 0 from customer_order_links_fixture
union all
select other_tenant_pessoa_id, other_owner_id, 'Cliente de outro tenant', 'cliente', 0 from customer_order_links_fixture
union all
select nonzero_pessoa_id, owner_id, 'Cliente com saldo', 'cliente', 10 from customer_order_links_fixture
union all
select delete_pessoa_id, owner_id, 'Cliente a excluir', 'cliente', 0 from customer_order_links_fixture;

do $$
begin
  if to_regprocedure('public.create_zelo_order(uuid,integer,text,jsonb)') is not null then
    raise exception 'legacy four-argument create_zelo_order overload still exists';
  end if;
  if to_regprocedure('public.create_zelo_order(uuid,integer,text,jsonb,uuid)') is null then
    raise exception 'canonical five-argument create_zelo_order is missing';
  end if;
  if not has_function_privilege(
    'service_role', 'public.create_zelo_order(uuid,integer,text,jsonb,uuid)', 'execute'
  ) or has_function_privilege(
    'authenticated', 'public.create_zelo_order(uuid,integer,text,jsonb,uuid)', 'execute'
  ) then
    raise exception 'create_zelo_order grants changed';
  end if;
  if not has_function_privilege(
    'authenticated', 'public.fiado_excluir_pessoa(uuid)', 'execute'
  ) or has_function_privilege(
    'anon', 'public.fiado_excluir_pessoa(uuid)', 'execute'
  ) then
    raise exception 'fiado_excluir_pessoa grants changed';
  end if;
end;
$$;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

do $$
declare
  f customer_order_links_fixture%rowtype;
  v_snapshot jsonb;
  legacy_result jsonb;
  linked_result jsonb;
  wrong_result jsonb;
  linked_customer jsonb;
begin
  select * into f from customer_order_links_fixture;
  v_snapshot := jsonb_build_object(
    'empresaId', f.empresa_id,
    'source', 'manual',
    'customer', jsonb_build_object('name', 'Snapshot imutável', 'phone', '5511999999999'),
    'fulfillment', jsonb_build_object('type', 'pickup'),
    'payment', jsonb_build_object('method', 'cash'),
    'pricing', jsonb_build_object('subtotal', 0, 'deliveryFee', 0, 'discount', 0),
    'cart', jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
      'productId', '', 'productName', 'Produto de verificação', 'unitPrice', 0,
      'quantity', 1, 'lineTotal', 0, 'position', 0
    )))
  );

  -- A legacy four-argument RPC resolves through p_pessoa_id DEFAULT NULL.
  legacy_result := public.create_zelo_order(
    null, 1, 'codex-order-links-legacy', v_snapshot
  );
  -- A new five-argument RPC stores the live CRM link.
  linked_result := public.create_zelo_order(
    null, 1, 'codex-order-links-linked', v_snapshot, f.pessoa_id
  );

  if legacy_result->>'orderId' is null or linked_result->>'orderId' is null then
    raise exception 'four/five argument order calls did not resolve: % / %', legacy_result, linked_result;
  end if;

  select id into f.legacy_order_id from public.zelo_orders
   where id = (legacy_result->>'orderId')::uuid and pessoa_id is null;
  select id, customer into f.linked_order_id, linked_customer from public.zelo_orders
   where id = (linked_result->>'orderId')::uuid and pessoa_id = f.pessoa_id;
  if f.legacy_order_id is null or f.linked_order_id is null
     or linked_customer is distinct from v_snapshot->'customer' then
    raise exception 'order link or customer snapshot contract failed';
  end if;

  begin
    perform public.create_zelo_order(
      null, 1, 'codex-order-links-wrong-tenant', v_snapshot, f.other_tenant_pessoa_id
    );
    raise exception 'cross-tenant pessoa was accepted';
  exception when sqlstate 'ZL404' then
    null;
  end;

  update customer_order_links_fixture
     set legacy_order_id = f.legacy_order_id,
         linked_order_id = f.linked_order_id,
         snapshot = v_snapshot;
end;
$$;

-- The FK is ON DELETE SET NULL; the immutable customer snapshot survives.
delete from public.pessoas
 where id = (select pessoa_id from customer_order_links_fixture);

do $$
declare
  f customer_order_links_fixture%rowtype;
  remaining_link uuid;
  retained_snapshot jsonb;
begin
  select * into f from customer_order_links_fixture;
  select pessoa_id, customer into remaining_link, retained_snapshot
    from public.zelo_orders where id = f.linked_order_id;
  if remaining_link is not null or retained_snapshot is distinct from f.snapshot->'customer' then
    raise exception 'ON DELETE SET NULL did not preserve the order snapshot';
  end if;
end;
$$;

-- fiado_excluir_pessoa blocks non-zero balances without changing the person.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', (select owner_id from customer_order_links_fixture))::text,
  true
);

do $$
begin
  begin
    perform public.fiado_excluir_pessoa((select nonzero_pessoa_id from customer_order_links_fixture));
    raise exception 'non-zero fiado balance was accepted for deletion';
  exception when sqlstate '23514' then
    null;
  end;
  if not exists (
    select 1 from public.pessoas
     where id = (select nonzero_pessoa_id from customer_order_links_fixture)
       and saldo_fiado = 10
  ) then
    raise exception 'non-zero balance fixture was changed';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

do $$
declare
  f customer_order_links_fixture%rowtype;
  snapshot jsonb;
  order_result jsonb;
  sale_id bigint;
  ledger_id bigint;
begin
  select * into f from customer_order_links_fixture;
  snapshot := jsonb_build_object(
    'empresaId', f.empresa_id,
    'source', 'manual',
    'customer', jsonb_build_object('name', 'Histórico preservado', 'phone', '5511888888888'),
    'pricing', jsonb_build_object('subtotal', 0, 'deliveryFee', 0, 'discount', 0),
    'cart', jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
      'productName', 'Produto histórico', 'unitPrice', 0, 'quantity', 1, 'lineTotal', 0
    )))
  );
  insert into public.vendas (
    id_usuario, valor_total, forma_pagamento, numero_venda, id_pessoa, id_cliente
  ) values (
    f.owner_id, 25, 'dinheiro', floor(random() * 1000000)::integer, f.delete_pessoa_id, f.delete_pessoa_id
  ) returning id into sale_id;
  insert into public.fiado_lancamentos (
    id_usuario, id_pessoa, natureza, valor, descricao
  ) values (
    f.owner_id, f.delete_pessoa_id, 'debito_venda', 25, 'Lançamento preservado'
  ) returning id into ledger_id;
  order_result := public.create_zelo_order(
    null, 1, 'codex-order-links-delete', snapshot, f.delete_pessoa_id
  );
  update customer_order_links_fixture
     set delete_order_id = (order_result->>'orderId')::uuid;
  if sale_id is null or ledger_id is null then
    raise exception 'historical fixtures were not created';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', (select owner_id from customer_order_links_fixture))::text,
  true
);

select public.fiado_excluir_pessoa((select delete_pessoa_id from customer_order_links_fixture));

do $$
declare
  f customer_order_links_fixture%rowtype;
  linked_sales integer;
  linked_ledger integer;
  linked_orders integer;
  retained_customer jsonb;
begin
  select * into f from customer_order_links_fixture;
  select count(*) into linked_sales from public.vendas
   where id_usuario = f.owner_id and (id_pessoa = f.delete_pessoa_id or id_cliente = f.delete_pessoa_id);
  select count(*) into linked_ledger from public.fiado_lancamentos
   where id_usuario = f.owner_id and id_pessoa = f.delete_pessoa_id;
  select count(*) into linked_orders from public.zelo_orders
   where id = f.delete_order_id and pessoa_id is not null;
  select customer into retained_customer from public.zelo_orders where id = f.delete_order_id;
  if exists (select 1 from public.pessoas where id = f.delete_pessoa_id)
     or linked_sales <> 0 or linked_ledger <> 0 or linked_orders <> 0
     or retained_customer is distinct from jsonb_build_object('name', 'Histórico preservado', 'phone', '5511888888888') then
    raise exception 'zero-balance deletion did not unlink only live references';
  end if;
  if not exists (select 1 from public.vendas where id_usuario = f.owner_id and valor_total = 25 and id_pessoa is null and id_cliente is null)
     or not exists (select 1 from public.fiado_lancamentos where id_usuario = f.owner_id and descricao = 'Lançamento preservado' and id_pessoa is null) then
    raise exception 'sales or fiado ledger history was deleted';
  end if;
end;
$$;

rollback;

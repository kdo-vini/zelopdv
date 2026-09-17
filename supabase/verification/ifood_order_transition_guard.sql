-- Transactional verification for the transition_zelo_order/close_zelo_order
-- iFood source guard. All fixtures are rolled back; this never targets the
-- linked project. Not executed in this session (no local Docker/Postgres
-- harness available); code-reviewed against the migration it exercises.
begin;

create temporary table ifood_transition_guard_fixture (
  empresa_a uuid not null,
  owner_a uuid not null,
  connection_a uuid not null
) on commit drop;

insert into ifood_transition_guard_fixture (empresa_a, owner_a, connection_a)
values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select owner_a, 'codex-ifood-transition-guard-' || owner_a::text || '@invalid.local',
       'authenticated', 'authenticated', '{}', '{}', now(), now()
  from ifood_transition_guard_fixture;

insert into public.empresa_perfil (id, user_id, nome_exibicao)
select empresa_a, owner_a, 'iFood transition guard verification A' from ifood_transition_guard_fixture;

grant select on ifood_transition_guard_fixture to service_role;

set local role service_role;

insert into ifood_internal.connections (id, empresa_id, merchant_id, status)
select connection_a, empresa_a, 'merchant-transition-guard', 'active'
  from ifood_transition_guard_fixture;

-- 1) An iFood-sourced order: transition_zelo_order and close_zelo_order both
-- refuse it immediately, before any permission/revision/status logic runs.
do $$
declare
  v_order_id uuid;
  v_empresa uuid;
begin
  select empresa_a into v_empresa from ifood_transition_guard_fixture;

  insert into public.zelo_orders (empresa_id, source, status, total, revision)
  values (v_empresa, 'ifood', 'ready', 27.00, 1)
  returning id into v_order_id;

  begin
    perform public.transition_zelo_order(v_order_id, 1, 'dispatch');
    raise exception 'transition_zelo_order accepted an iFood order';
  exception
    when others then
      if sqlerrm <> 'IFOOD_ORDER_REQUIRES_COMMAND' then
        raise exception 'unexpected error from transition_zelo_order: %', sqlerrm;
      end if;
  end;

  begin
    perform public.close_zelo_order(v_order_id, 1, '{}'::jsonb);
    raise exception 'close_zelo_order accepted an iFood order';
  exception
    when others then
      if sqlerrm <> 'IFOOD_ORDER_REQUIRES_COMMAND' then
        raise exception 'unexpected error from close_zelo_order: %', sqlerrm;
      end if;
  end;

  -- Order must be untouched: no status change, no sale.
  perform 1 from public.zelo_orders
   where id = v_order_id and status = 'ready' and sale_id is null and revision = 1;
  if not found then
    raise exception 'iFood order was mutated despite the guard';
  end if;
end;
$$;

-- 2) A non-iFood order (manual) still transitions and closes normally: the
-- guard must not touch any other source.
do $$
declare
  v_order_id uuid;
  v_item_id uuid;
  v_empresa uuid;
  v_owner uuid;
  v_result jsonb;
begin
  select empresa_a, owner_a into v_empresa, v_owner from ifood_transition_guard_fixture;

  insert into public.zelo_orders (empresa_id, source, status, total, revision)
  values (v_empresa, 'manual', 'pending_review', 27.00, 1)
  returning id into v_order_id;

  insert into public.zelo_order_items (order_id, name, unit_price, quantity, position)
  values (v_order_id, 'Item avulso', 27.00, 1, 1);

  v_result := public.transition_zelo_order(v_order_id, 1, 'accept', v_owner);
  if (v_result->>'status') is distinct from 'accepted' then
    raise exception 'manual order failed to accept: %', v_result;
  end if;

  v_result := public.transition_zelo_order(v_order_id, 2, 'start_preparing', v_owner);
  v_result := public.transition_zelo_order(v_order_id, 3, 'mark_ready', v_owner);
  if (v_result->>'status') is distinct from 'ready' then
    raise exception 'manual order failed to reach ready: %', v_result;
  end if;

  v_result := public.close_zelo_order(v_order_id, 4, '{}'::jsonb, v_owner);
  if (v_result->>'status') is distinct from 'delivered' then
    raise exception 'manual order failed to close: %', v_result;
  end if;

  perform 1 from public.zelo_orders where id = v_order_id and sale_id is not null;
  if not found then
    raise exception 'manual order close did not materialize a sale';
  end if;
end;
$$;

-- 3) mesa orders keep their own, pre-existing guard (unchanged by this migration).
do $$
declare
  v_order_id uuid;
  v_empresa uuid;
begin
  select empresa_a into v_empresa from ifood_transition_guard_fixture;

  insert into public.zelo_orders (empresa_id, source, status, total, revision)
  values (v_empresa, 'mesa', 'ready', 27.00, 1)
  returning id into v_order_id;

  begin
    perform public.close_zelo_order(v_order_id, 1, '{}'::jsonb);
    raise exception 'close_zelo_order accepted a mesa order';
  exception
    when others then
      if sqlerrm <> 'MESA_ORDER_FINANCIAL_CLOSE_NOT_ALLOWED' then
        raise exception 'unexpected error from close_zelo_order for mesa: %', sqlerrm;
      end if;
  end;
end;
$$;

rollback;

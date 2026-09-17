-- Enqueue iFood confirm/cancel from canonical accept/reject/cancel BEFORE
-- transition_zelo_order flips public.zelo_orders.status.
--
-- Why this exists: enqueue_ifood_order_command_v1 confirms only while
-- status = pending_review, and cancel only while the order is non-terminal.
-- Flipping first makes confirm invalid_transition. The previous wrappers
-- only wrote zelo_order_outbox (order.accept / order.reject) and never
-- called the iFood command RPC.
--
-- Intents: accept → confirm; reject/cancel → cancel with cancellationCode
-- (default 501, Developers "Problemas de sistema").
--
-- enqueue_ifood_order_command_v1 is service_role-gated via
-- current_setting('role'). These SECURITY DEFINER wrappers run as postgres,
-- so they SET LOCAL ROLE service_role and/or set_config('role','service_role',true)
-- only around the enqueue call. The command insert and the status update
-- share the caller transaction: a later exception rolls the command back.
--
-- transition_zelo_order is patched in place (pg_get_functiondef) so the
-- pizza stock body from 20260905144329 is preserved. Do not replace that
-- function from the 20260813 baseline.
--
-- Fail-closed. No secrets. Forward only.
begin;

create or replace function public.enqueue_ifood_command_for_canonical_action_v1(
  p_order_id uuid,
  p_expected_revision integer,
  p_action text,
  p_detail jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.zelo_orders;
  v_action text;
  v_intent text;
  v_payload jsonb := '{}'::jsonb;
  v_code text;
  v_reason text;
  v_prev_role text;
  v_outcome text;
  v_command_status text;
  v_idempotency_key text;
begin
  if p_order_id is null or p_expected_revision is null or nullif(btrim(coalesce(p_action, '')), '') is null then
    raise exception 'INVALID_COMMAND_ARGUMENTS';
  end if;

  v_action := lower(btrim(p_action));
  if v_action not in ('accept', 'reject', 'cancel') then
    return;
  end if;

  select zo.*
    into v_order
    from public.zelo_orders as zo
   where zo.id = p_order_id
   for update;

  if not found then
    raise exception using errcode = 'ZL404', message = 'ORDER_NOT_FOUND';
  end if;

  if v_order.source is distinct from 'ifood' then
    return;
  end if;

  if v_order.revision <> p_expected_revision then
    raise exception using errcode = 'ZL409', message = 'REVISION_CONFLICT';
  end if;

  v_intent := case v_action
    when 'accept' then 'confirm'
    else 'cancel'
  end;

  if v_intent = 'cancel' then
    v_code := nullif(btrim(coalesce(p_detail->>'cancellationCode', '')), '');
    if v_code is null then
      v_code := '501';
    end if;
    v_reason := left(btrim(coalesce(p_detail->>'reason', '')), 250);
    v_payload := jsonb_build_object('cancellationCode', v_code)
      || case
           when v_reason <> '' then jsonb_build_object('reason', v_reason)
           else '{}'::jsonb
         end;
  end if;

  v_idempotency_key := 'ifood:command:v1:'
    || v_order.empresa_id::text || ':'
    || v_order.id::text || ':'
    || v_intent || ':'
    || p_expected_revision::text;

  -- Enqueue checks current_setting('role') = 'service_role', not auth.role().
  -- Elevate only for this call; restore the GUC afterwards. SET LOCAL ROLE
  -- is preferred when the definer can assume service_role; set_config is
  -- the fallback that still satisfies the gate.
  v_prev_role := current_setting('role', true);
  perform set_config('role', 'service_role', true);
  begin
    execute 'set local role service_role';
  exception
    when insufficient_privilege then
      null;
  end;

  select q.outcome, q.status
    into v_outcome, v_command_status
    from public.enqueue_ifood_order_command_v1(
      v_order.empresa_id,
      v_order.id,
      v_intent,
      p_expected_revision,
      v_payload,
      v_idempotency_key
    ) as q;

  begin
    execute 'set local role postgres';
  exception
    when others then
      null;
  end;
  if v_prev_role is not null then
    perform set_config('role', v_prev_role, true);
  end if;

  if v_outcome in ('queued', 'requeued', 'duplicate') then
    return;
  end if;

  if v_outcome = 'not_found' then
    raise exception using errcode = 'ZL404', message = 'IFOOD_ORDER_REF_NOT_FOUND';
  elsif v_outcome = 'revision_conflict' then
    raise exception using errcode = 'ZL409', message = 'REVISION_CONFLICT';
  elsif v_outcome = 'connection_unavailable' then
    raise exception using errcode = 'ZL409', message = 'IFOOD_CONNECTION_UNAVAILABLE';
  elsif v_outcome = 'invalid_transition' then
    raise exception using errcode = 'ZL409', message = 'IFOOD_INVALID_COMMAND_TRANSITION';
  elsif v_outcome = 'invalid_payload' then
    raise exception using errcode = 'ZL409', message = 'IFOOD_INVALID_COMMAND_PAYLOAD';
  else
    raise exception using
      errcode = 'ZL500',
      message = 'IFOOD_COMMAND_ENQUEUE_FAILED',
      detail = coalesce(v_outcome, 'unknown') || '/' || coalesce(v_command_status, '');
  end if;
end;
$$;

comment on function public.enqueue_ifood_command_for_canonical_action_v1(uuid, integer, text, jsonb) is
  'Enfileira confirm/cancel iFood (service_role) antes da transicao canonica; no-op se source <> ifood.';

revoke all on function public.enqueue_ifood_command_for_canonical_action_v1(uuid, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.enqueue_ifood_command_for_canonical_action_v1(uuid, integer, text, jsonb)
  to postgres, service_role;

create or replace function public.accept_zelo_order(
  p_order_id uuid,
  p_expected_revision integer,
  p_actor_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
begin
  perform public.enqueue_ifood_command_for_canonical_action_v1(
    p_order_id, p_expected_revision, 'accept', '{}'::jsonb
  );
  return public.transition_zelo_order(
    p_order_id, p_expected_revision, 'accept', p_actor_id, '{}'::jsonb
  );
end;
$$;

create or replace function public.reject_zelo_order(
  p_order_id uuid,
  p_expected_revision integer,
  p_actor_id uuid default null,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_detail jsonb;
begin
  v_detail := jsonb_build_object('reason', left(coalesce(p_reason, ''), 500));
  perform public.enqueue_ifood_command_for_canonical_action_v1(
    p_order_id, p_expected_revision, 'reject', v_detail
  );
  return public.transition_zelo_order(
    p_order_id, p_expected_revision, 'reject', p_actor_id, v_detail
  );
end;
$$;

revoke all on function public.accept_zelo_order(uuid, integer, uuid) from public;
grant execute on function public.accept_zelo_order(uuid, integer, uuid) to authenticated, service_role;
revoke all on function public.reject_zelo_order(uuid, integer, uuid, text) from public;
grant execute on function public.reject_zelo_order(uuid, integer, uuid, text) to authenticated, service_role;

-- Patch cancel/accept/reject inside transition without replacing the pizza
-- stock body. The helper is idempotent (duplicate = success), so accept/
-- reject wrappers that enqueue and then call transition do not double-insert.
do $patch$
declare
  f text;
  patched text;
  marker text := 'enqueue_ifood_command_for_canonical_action_v1';
  needle text := 'message=''REVISION_CONFLICT''; end if;';
  insertion text := $n$message='REVISION_CONFLICT'; end if;
  if o.source = 'ifood' and p_action in ('accept', 'reject', 'cancel') then
    perform public.enqueue_ifood_command_for_canonical_action_v1(p_order_id, p_expected_revision, p_action, coalesce(p_detail, '{}'::jsonb));
  end if;$n$;
begin
  select pg_get_functiondef('public.transition_zelo_order(uuid,integer,text,uuid,jsonb)'::regprocedure)
    into f;
  if f is null then
    raise exception 'PRECONDITION_FAILED: transition_zelo_order is missing';
  end if;
  if position(marker in f) > 0 then
    return;
  end if;
  if position(needle in f) = 0 then
    raise exception 'PRECONDITION_FAILED: transition_zelo_order REVISION_CONFLICT marker not found';
  end if;
  patched := replace(f, needle, insertion);
  if position(marker in patched) = 0 then
    raise exception 'PRECONDITION_FAILED: failed to patch transition_zelo_order for iFood enqueue';
  end if;
  execute patched;
end
$patch$;

commit;

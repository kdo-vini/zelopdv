-- Opaque confirmation tokens for WhatsApp-originated canonical orders.
-- Raw tokens belong exclusively to the calling server and are never persisted.
begin;

do $$
begin
  if to_regclass('public.zelomenu_cart_sessions') is null
     or to_regclass('public.zelo_orders') is null then
    raise exception 'PRECONDITION_FAILED: canonical WhatsApp ordering dependencies are missing';
  end if;
  if to_regprocedure('public.create_zelo_order(uuid,integer,text,jsonb,uuid)') is null then
    raise exception 'PRECONDITION_FAILED: current create_zelo_order signature is missing';
  end if;
end
$$;

create table if not exists public.zelomenu_whatsapp_confirmation_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  empresa_id uuid not null references public.empresa_perfil(id) on delete cascade,
  session_id uuid not null references public.zelomenu_cart_sessions(id) on delete cascade,
  source_ref text not null,
  revision integer not null check (revision > 0),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint zelomenu_whatsapp_confirmation_tokens_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint zelomenu_whatsapp_confirmation_tokens_source_ref_check
    check (length(trim(source_ref)) > 0),
  constraint zelomenu_whatsapp_confirmation_tokens_expiry_check
    check (expires_at > created_at)
);

comment on table public.zelomenu_whatsapp_confirmation_tokens is
  'Tokens opacos por hash SHA-256 para confirmação server-only de carrinhos whatsapp_order; token bruto não é persistido.';
comment on column public.zelomenu_whatsapp_confirmation_tokens.invalidated_at is
  'Permite ao servidor invalidar o resumo anterior antes de emitir token substituto para a mesma sessão.';

-- A substituição é uma operação server-side: invalida o token vivo e insere o
-- próximo na mesma transação. O índice impede dois resumos simultaneamente ativos.
create unique index if not exists zelomenu_whatsapp_confirmation_tokens_one_live_session_idx
  on public.zelomenu_whatsapp_confirmation_tokens (session_id)
  where consumed_at is null and invalidated_at is null;

create index if not exists zelomenu_whatsapp_confirmation_tokens_binding_idx
  on public.zelomenu_whatsapp_confirmation_tokens (empresa_id, source_ref, session_id, revision);

create index if not exists zelomenu_whatsapp_confirmation_tokens_cleanup_idx
  on public.zelomenu_whatsapp_confirmation_tokens (expires_at)
  where consumed_at is null and invalidated_at is null;

alter table public.zelomenu_whatsapp_confirmation_tokens enable row level security;
revoke all on table public.zelomenu_whatsapp_confirmation_tokens from public, anon, authenticated;
grant all on table public.zelomenu_whatsapp_confirmation_tokens to service_role;

-- A revalidação completa de catálogo e preço ocorre no ZeloMenu imediatamente
-- antes desta RPC. create_zelo_order continua sendo a fronteira canônica de
-- sessão/snapshot e não ganha uma segunda validação de catálogo neste SQL.
create or replace function public.confirm_whatsapp_zelo_order(
  p_token_hash text,
  p_empresa_id uuid,
  p_source_ref text,
  p_expected_revision integer,
  p_idempotency_key text,
  p_pessoa_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_service_role boolean := coalesce(current_setting('role', true) = 'service_role', false);
  v_token public.zelomenu_whatsapp_confirmation_tokens;
  s public.zelomenu_cart_sessions;
  v_order public.zelo_orders;
  v_result jsonb;
begin
  if not v_service_role then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if nullif(trim(p_token_hash), '') is null
     or p_empresa_id is null
     or nullif(trim(p_source_ref), '') is null
     or p_expected_revision is null
     or p_expected_revision <= 0 then
    raise exception using errcode = 'ZL400', message = 'CONFIRMATION_TOKEN_BINDING_INVALID';
  end if;

  -- Lock token first and then its one session. Concurrent confirmations for
  -- different tokens may serialize on the session but cannot create two orders.
  select * into v_token
    from public.zelomenu_whatsapp_confirmation_tokens
   where token_hash = lower(p_token_hash)
   for update;
  if not found then
    raise exception using errcode = 'ZL404', message = 'CONFIRMATION_TOKEN_NOT_FOUND';
  end if;

  select * into s
    from public.zelomenu_cart_sessions
   where id = v_token.session_id
   for update;
  if not found then
    raise exception using errcode = 'ZL404', message = 'CONFIRMATION_SESSION_NOT_FOUND';
  end if;

  if s.context <> 'whatsapp_order' then
    raise exception using errcode = 'ZL400', message = 'CONFIRMATION_SESSION_CONTEXT_INVALID';
  end if;
  if v_token.empresa_id <> p_empresa_id
     or s.empresa_id <> p_empresa_id
     or v_token.source_ref <> p_source_ref
     or s.source_ref <> p_source_ref then
    raise exception using errcode = 'ZL403', message = 'CONFIRMATION_TOKEN_BINDING_MISMATCH';
  end if;
  if v_token.revision <> p_expected_revision
     or s.revision <> p_expected_revision then
    raise exception using errcode = 'ZL409', message = 'CONFIRMATION_TOKEN_REVISION_CONFLICT';
  end if;

  -- A retry of an already consumed token is deterministic and cannot create a
  -- second order, even if the token would be expired by the time of retry.
  if v_token.consumed_at is not null then
    select * into v_order
      from public.zelo_orders
     where zelomenu_session_id = v_token.session_id
     order by created_at
     limit 1;
    if found then
      return jsonb_build_object(
        'orderId', v_order.id,
        'orderStatus', v_order.status,
        'sessionState', case v_order.status when 'pending_payment' then 'confirmed_waiting_payment' else 'confirmed_waiting_review' end,
        'alreadyConfirmed', true,
        'revision', v_order.revision
      );
    end if;
    raise exception using errcode = 'ZL409', message = 'CONFIRMATION_TOKEN_CONSUMED';
  end if;
  if v_token.invalidated_at is not null then
    raise exception using errcode = 'ZL409', message = 'CONFIRMATION_TOKEN_INVALIDATED';
  end if;
  if v_token.expires_at <= now() then
    raise exception using errcode = 'ZL410', message = 'CONFIRMATION_TOKEN_EXPIRED';
  end if;

  v_result := public.create_zelo_order(
    v_token.session_id,
    p_expected_revision,
    p_idempotency_key,
    '{}'::jsonb,
    p_pessoa_id
  );

  update public.zelomenu_whatsapp_confirmation_tokens
     set consumed_at = now()
   where id = v_token.id
     and consumed_at is null;

  return v_result;
end
$$;

comment on function public.confirm_whatsapp_zelo_order(text, uuid, text, integer, text, uuid) is
  'Confirma token WhatsApp server-only pelo create_zelo_order canônico; revalidação completa de catálogo e preço ocorre no ZeloMenu antes da RPC.';

revoke all on function public.confirm_whatsapp_zelo_order(text, uuid, text, integer, text, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_whatsapp_zelo_order(text, uuid, text, integer, text, uuid)
  to service_role;

commit;

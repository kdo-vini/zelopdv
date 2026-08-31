-- Multi-replica idempotency for deterministic WhatsApp confirmation-token hashes.
-- Keep the established lock order: cart session first, then token rows.
create or replace function public.issue_whatsapp_zelo_confirmation_token(
  p_token_hash text,
  p_empresa_id uuid,
  p_source_ref text,
  p_session_id uuid,
  p_expected_revision integer,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_service_role boolean := coalesce(current_setting('role', true) = 'service_role', false);
  s public.zelomenu_cart_sessions;
  v_token public.zelomenu_whatsapp_confirmation_tokens;
begin
  if not v_service_role then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if nullif(trim(p_token_hash), '') is null
     or lower(p_token_hash) !~ '^[0-9a-f]{64}$'
     or p_empresa_id is null
     or nullif(trim(p_source_ref), '') is null
     or p_session_id is null
     or p_expected_revision is null
     or p_expected_revision <= 0
     or p_expires_at is null
     or p_expires_at <= now() then
    raise exception using errcode = 'ZL400', message = 'CONFIRMATION_TOKEN_ISSUANCE_INVALID';
  end if;

  -- First lock in the universal order. It serializes duplicate emissions for
  -- a session before touching the unique token hash.
  select * into s
    from public.zelomenu_cart_sessions
   where id = p_session_id
   for update;
  if not found then
    raise exception using errcode = 'ZL404', message = 'CONFIRMATION_SESSION_NOT_FOUND';
  end if;
  if s.context <> 'whatsapp_order' then
    raise exception using errcode = 'ZL400', message = 'CONFIRMATION_SESSION_CONTEXT_INVALID';
  end if;
  if s.state <> 'cart_open' then
    raise exception using errcode = 'ZL409', message = 'CONFIRMATION_SESSION_NOT_OPEN';
  end if;
  if s.empresa_id <> p_empresa_id or s.source_ref <> p_source_ref then
    raise exception using errcode = 'ZL403', message = 'CONFIRMATION_TOKEN_BINDING_MISMATCH';
  end if;
  if s.revision <> p_expected_revision then
    raise exception using errcode = 'ZL409', message = 'CONFIRMATION_TOKEN_REVISION_CONFLICT';
  end if;

  -- A deterministic hash can be replayed by two ZeloMenu replicas. Returning
  -- the one live, exactly-bound row avoids invalidating it or leaking a raw
  -- unique_violation. A non-live row is never resurrected.
  select * into v_token
    from public.zelomenu_whatsapp_confirmation_tokens
   where token_hash = lower(p_token_hash)
   for update;
  if found then
    if v_token.empresa_id = p_empresa_id
       and v_token.session_id = s.id
       and v_token.source_ref = p_source_ref
       and v_token.revision = p_expected_revision
       and v_token.consumed_at is null
       and v_token.invalidated_at is null
       and v_token.expires_at > now() then
      return jsonb_build_object(
        'tokenId', v_token.id,
        'sessionId', v_token.session_id,
        'revision', v_token.revision,
        'expiresAt', v_token.expires_at
      );
    end if;
    if v_token.empresa_id = p_empresa_id
       and v_token.session_id = s.id
       and v_token.source_ref = p_source_ref
       and v_token.revision = p_expected_revision then
      raise exception using errcode = 'ZL409', message = 'CONFIRMATION_TOKEN_REISSUE_REQUIRES_NEW_REVISION';
    end if;
    raise exception using errcode = 'ZL409', message = 'CONFIRMATION_TOKEN_HASH_REUSE_CONFLICT';
  end if;

  begin
    -- Expired rows are intentionally invalidated when a *different* current
    -- summary is issued, so the one-live-token index remains usable. Keeping
    -- this inside the subtransaction rolls it back if another binding wins the
    -- global hash uniqueness race.
    update public.zelomenu_whatsapp_confirmation_tokens
       set invalidated_at = now()
     where session_id = s.id
       and consumed_at is null
       and invalidated_at is null;
    insert into public.zelomenu_whatsapp_confirmation_tokens (
      token_hash, empresa_id, session_id, source_ref, revision, expires_at
    ) values (
      lower(p_token_hash), p_empresa_id, s.id, p_source_ref, p_expected_revision, p_expires_at
    )
    returning * into v_token;
  exception when unique_violation then
    -- A concurrent request from another session used this opaque hash. Read
    -- the winner after its commit and return only an exact live binding.
    select * into v_token
      from public.zelomenu_whatsapp_confirmation_tokens
     where token_hash = lower(p_token_hash)
     for update;
    if found
       and v_token.empresa_id = p_empresa_id
       and v_token.session_id = s.id
       and v_token.source_ref = p_source_ref
       and v_token.revision = p_expected_revision
       and v_token.consumed_at is null
       and v_token.invalidated_at is null
       and v_token.expires_at > now() then
      return jsonb_build_object(
        'tokenId', v_token.id,
        'sessionId', v_token.session_id,
        'revision', v_token.revision,
        'expiresAt', v_token.expires_at
      );
    end if;
    if found
       and v_token.empresa_id = p_empresa_id
       and v_token.session_id = s.id
       and v_token.source_ref = p_source_ref
       and v_token.revision = p_expected_revision then
      raise exception using errcode = 'ZL409', message = 'CONFIRMATION_TOKEN_REISSUE_REQUIRES_NEW_REVISION';
    end if;
    raise exception using errcode = 'ZL409', message = 'CONFIRMATION_TOKEN_HASH_REUSE_CONFLICT';
  end;

  return jsonb_build_object(
    'tokenId', v_token.id,
    'sessionId', v_token.session_id,
    'revision', v_token.revision,
    'expiresAt', v_token.expires_at
  );
end
$$;

comment on function public.issue_whatsapp_zelo_confirmation_token(text, uuid, text, uuid, integer, timestamptz) is
  'Emite/substitui token SHA-256 server-only para sessão whatsapp_order; replay do mesmo hash e binding vivo devolve o mesmo token, e hash não-vivo exige novo resumo/revisão.';

revoke all on function public.issue_whatsapp_zelo_confirmation_token(text, uuid, text, uuid, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.issue_whatsapp_zelo_confirmation_token(text, uuid, text, uuid, integer, timestamptz)
  to service_role;

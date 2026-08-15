-- Repair the dead service_role bypass in the remaining RBAC trigger guards.
--
-- Same root cause as INC-2026-08-14-01: PostgREST stopped populating the
-- legacy per-claim GUCs (request.jwt.claim.*) in v9 and Supabase only sets
-- request.jwt.claims, so current_setting('request.jwt.claim.role', true) is
-- always NULL. These four guards store it as text instead of boolean, so they
-- never suffered the NULL-predicate collapse that took Mesas down; the effect
-- is narrower but still wrong: the documented service_role bypass never fires.
--
--   * public.mesas_status_rbac_guard        (20260812233000)
--   * public.comandas_mutation_rbac_guard   (20260812233000)
--   * public.vendas_insert_rbac_guard       (20260813000000)
--   * public.vendas_discount_rbac_guard     (20260813031000, latest body)
--
-- For the two Mesa guards this is a no-op in practice, because a service_role
-- request has no JWT sub and is already short-circuited by `v_actor is null`.
-- For the two vendas guards it is a latent outage: the moment a server-side
-- route creates a sale or a discount with the service key, the guard falls
-- through to `v_actor is null` and raises 'Usuario nao autenticado' (28000).
-- No route does that today, which is why it has not fired yet.
--
-- Detection now matches 20260813095000 and 20260814200000:
-- coalesce(current_setting('role', true) = 'service_role', false). SECURITY
-- DEFINER switches current_user to postgres but preserves the caller's SET
-- ROLE, which PostgREST derives from the JWT. This deliberately does NOT open
-- the SECURITY DEFINER path in vendas_insert_rbac_guard: an authenticated
-- browser call into criar_venda_completa still reports role 'authenticated',
-- so current_user = 'postgres' keeps requiring pdv.vender + pdv.receber.
-- The legacy GUC stays as a fallback for maintenance sessions that set it.
--
-- Also repairs double-encoded UTF-8 in the Mesa guard messages. The applied
-- bodies store "Voce nao tem permissao" with every accented character encoded
-- twice (e.g. 0xC3 0x83 0xC2 0xAA where a single 'e-circumflex' belongs), and
-- that reaches the operator's toast verbatim. They are rewritten in the ASCII
-- form already used by every other message in this area. This file is
-- deliberately ASCII-only so the defect cannot be reintroduced here.
--
-- No capability, policy, trigger binding or grant changes.
-- Forward-only: never rewrite an applied migration.

create or replace function public.mesas_status_rbac_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_service boolean := coalesce(current_setting('role', true) = 'service_role', false)
                    or coalesce(current_setting('request.jwt.claim.role', true) = 'service_role', false);
begin
  -- Anonymous requests are stopped by RLS. service_role and maintenance
  -- calls have no user claim and retain the existing bypass.
  if v_actor is null or v_service or v_actor = old.id_usuario then
    return new;
  end if;

  if new.id_usuario is distinct from old.id_usuario then
    raise exception 'A mesa deve permanecer no tenant original.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'ocupada' then
      if not public.fiado_actor_can('mesas.abrir_comanda', old.id_usuario) then
        raise exception 'Voce nao tem permissao para abrir a mesa.' using errcode = '42501';
      end if;
    elsif new.status = 'fechando' then
      if not public.fiado_actor_can('mesas.fechar', old.id_usuario) then
        raise exception 'Voce nao tem permissao para iniciar o fechamento da mesa.' using errcode = '42501';
      end if;
    elsif new.status = 'livre' then
      if not (
        public.fiado_actor_can('mesas.fechar', old.id_usuario)
        or public.fiado_actor_can('mesas.cancelar', old.id_usuario)
      ) then
        raise exception 'Voce nao tem permissao para liberar a mesa.' using errcode = '42501';
      end if;
    else
      raise exception 'Status de mesa invalido para este operador.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.comandas_mutation_rbac_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_service boolean := coalesce(current_setting('role', true) = 'service_role', false)
                    or coalesce(current_setting('request.jwt.claim.role', true) = 'service_role', false);
begin
  -- Anonymous requests are stopped by RLS. service_role and maintenance
  -- calls retain the existing bypass; SECURITY DEFINER browser calls still
  -- carry the authenticated actor claim and are checked below.
  if v_actor is null or v_service or v_actor = old.id_usuario then
    return new;
  end if;

  if new.id_usuario is distinct from old.id_usuario then
    raise exception 'A comanda deve permanecer no tenant original.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if new.status in ('fechando', 'fechada') then
      if not public.fiado_actor_can('mesas.fechar', old.id_usuario) then
        raise exception 'Voce nao tem permissao para fechar a mesa.' using errcode = '42501';
      end if;
    elsif new.status = 'cancelada' then
      if not public.fiado_actor_can('mesas.cancelar', old.id_usuario) then
        raise exception 'Voce nao tem permissao para cancelar a comanda.' using errcode = '42501';
      end if;
    elsif new.status = 'aberta' then
      if not (
        public.fiado_actor_can('mesas.abrir_comanda', old.id_usuario)
        or public.fiado_actor_can('mesas.editar_itens', old.id_usuario)
      ) then
        raise exception 'Voce nao tem permissao para reabrir a comanda.' using errcode = '42501';
      end if;
    else
      raise exception 'Status de comanda invalido para este operador.' using errcode = '42501';
    end if;
  end if;

  if new.id_venda is distinct from old.id_venda
     or new.fechada_em is distinct from old.fechada_em
     or new.total_calculado is distinct from old.total_calculado then
    if not public.fiado_actor_can('mesas.fechar', old.id_usuario) then
      raise exception 'Voce nao tem permissao para alterar o fechamento financeiro.' using errcode = '42501';
    end if;
  end if;

  if new.id_mesa is distinct from old.id_mesa
     or new.num_pessoas is distinct from old.num_pessoas
     or new.observacao is distinct from old.observacao
     or new.taxa_servico_pct is distinct from old.taxa_servico_pct
     or new.couvert_valor is distinct from old.couvert_valor
     or new.desconto is distinct from old.desconto then
    if not public.fiado_actor_can('mesas.editar_itens', old.id_usuario) then
      raise exception 'Voce nao tem permissao para editar a comanda.' using errcode = '42501';
    end if;
  end if;

  -- The UI stamps the current operator before close/cancel as well as while
  -- editing. Keep that audit-field update compatible with the corresponding
  -- operation capability without granting any financial field access.
  if new.id_operador is distinct from old.id_operador
     and not (
       public.fiado_actor_can('mesas.editar_itens', old.id_usuario)
       or public.fiado_actor_can('mesas.fechar', old.id_usuario)
       or public.fiado_actor_can('mesas.cancelar', old.id_usuario)
     ) then
    raise exception 'Voce nao tem permissao para identificar o operador da comanda.' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.vendas_insert_rbac_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_service boolean := coalesce(current_setting('role', true) = 'service_role', false)
                    or coalesce(current_setting('request.jwt.claim.role', true) = 'service_role', false);
begin
  -- service_role/maintenance paths retain their existing bypass.
  if v_service then
    return new;
  end if;

  if v_actor is null then
    raise exception 'Usuario nao autenticado' using errcode = '28000';
  end if;

  v_owner := public.get_owner_user_id(v_actor);

  -- criar_venda_completa is SECURITY DEFINER and therefore reaches this
  -- trigger as its postgres function owner. A Mesa close uses direct browser
  -- inserts as authenticated and is authorized by mesas.fechar instead.
  if current_user = 'postgres' then
    if not (
      public.fiado_actor_can('pdv.vender', v_owner)
      and public.fiado_actor_can('pdv.receber', v_owner)
    ) then
      raise exception 'Voce nao tem permissao para registrar vendas no PDV.' using errcode = '42501';
    end if;
  elsif new.tipo_pedido = 'mesa' then
    if not public.fiado_actor_can('mesas.fechar', v_owner) then
      raise exception 'Voce nao tem permissao para fechar a mesa.' using errcode = '42501';
    end if;
  elsif not (
    public.fiado_actor_can('pdv.vender', v_owner)
    and public.fiado_actor_can('pdv.receber', v_owner)
  ) then
    raise exception 'Voce nao tem permissao para registrar vendas no PDV.' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.vendas_discount_rbac_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_service boolean := coalesce(current_setting('role', true) = 'service_role', false)
                    or coalesce(current_setting('request.jwt.claim.role', true) = 'service_role', false);
  v_requires_discount_permission boolean;
begin
  if v_service then
    return new;
  end if;

  if coalesce(new.valor_desconto, 0) <= 0 then
    return new;
  end if;

  if v_actor is null then
    raise exception 'Usuario nao autenticado' using errcode = '28000';
  end if;

  v_owner := public.get_owner_user_id(v_actor);

  -- SECURITY DEFINER POS/offline calls run as postgres and must always check
  -- pdv.desconto. Only the authenticated Mesa INSERT path gets the exception.
  v_requires_discount_permission :=
    current_user = 'postgres'
    or tg_op = 'UPDATE'
    or coalesce(new.tipo_pedido, 'retirada') <> 'mesa';

  if v_requires_discount_permission
     and not public.fiado_actor_can('pdv.desconto', v_owner) then
    raise exception 'Voce nao tem permissao para aplicar desconto.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.vendas_discount_rbac_guard() from public, anon;
grant execute on function public.vendas_discount_rbac_guard() to authenticated, service_role;

notify pgrst, 'reload schema';

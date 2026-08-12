-- Incremental RBAC containment for browser-created sales.
--
-- Production verification before this migration showed that:
--   * criar_venda_completa(jsonb) was callable by authenticated sub-users
--     without pdv.vender or pdv.receber;
--   * the owner-scoped vendas INSERT policy allowed the same bypass through
--     direct Data API inserts;
--   * Mesa closing inserts a venda directly and must remain available to an
--     operator with mesas.fechar.
--
-- The trigger is deliberately narrow. It distinguishes the SECURITY DEFINER
-- POS/offline RPC (current_user = postgres) from the direct Mesa-close path,
-- keeps service-role/maintenance behavior unchanged, and does not rewrite the
-- existing sale RPC body or its argument contract.
-- Forward-only: never rewrite an applied migration.

create or replace function public.vendas_insert_rbac_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_claim_role text := current_setting('request.jwt.claim.role', true);
begin
  -- service_role/maintenance paths retain their existing bypass.
  if v_claim_role = 'service_role' then
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

drop trigger if exists vendas_insert_rbac_guard on public.vendas;
create trigger vendas_insert_rbac_guard
  before insert on public.vendas
  for each row
  execute function public.vendas_insert_rbac_guard();

-- Keep the INSERT policies aligned with the trigger so a direct Data API
-- caller cannot bypass the same capability decision on child rows. Mesa
-- closing is the only browser path that creates a venda directly without the
-- POS capability pair.
drop policy if exists vendas_actor_insert on public.vendas;
create policy vendas_actor_insert
  on public.vendas
  for insert
  to authenticated
  with check (
    public.get_owner_user_id(auth.uid()) = id_usuario
    and (
      (
        public.fiado_actor_can('pdv.vender', id_usuario)
        and public.fiado_actor_can('pdv.receber', id_usuario)
      )
      or (
        tipo_pedido = 'mesa'
        and public.fiado_actor_can('mesas.fechar', id_usuario)
      )
    )
  );

drop policy if exists vendas_itens_actor_insert on public.vendas_itens;
create policy vendas_itens_actor_insert
  on public.vendas_itens
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.vendas v
      where v.id = vendas_itens.id_venda
        and v.id_usuario = public.get_owner_user_id(auth.uid())
        and (
          (
            public.fiado_actor_can('pdv.vender', v.id_usuario)
            and public.fiado_actor_can('pdv.receber', v.id_usuario)
          )
          or (
            v.tipo_pedido = 'mesa'
            and public.fiado_actor_can('mesas.fechar', v.id_usuario)
          )
        )
    )
  );

drop policy if exists vendas_pagamentos_actor_insert on public.vendas_pagamentos;
create policy vendas_pagamentos_actor_insert
  on public.vendas_pagamentos
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.vendas v
      where v.id = vendas_pagamentos.id_venda
        and v.id_usuario = public.get_owner_user_id(auth.uid())
        and (
          (
            public.fiado_actor_can('pdv.vender', v.id_usuario)
            and public.fiado_actor_can('pdv.receber', v.id_usuario)
          )
          or (
            v.tipo_pedido = 'mesa'
            and public.fiado_actor_can('mesas.fechar', v.id_usuario)
          )
        )
    )
    and id_usuario = public.get_owner_user_id(auth.uid())
  );

drop policy if exists vendas_taxas_plataforma_insert_own on public.vendas_taxas_plataforma;
create policy vendas_taxas_plataforma_insert_own
  on public.vendas_taxas_plataforma
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.vendas v
      where v.id = vendas_taxas_plataforma.id_venda
        and v.id_usuario = public.get_owner_user_id(auth.uid())
        and public.fiado_actor_can('pdv.vender', v.id_usuario)
        and public.fiado_actor_can('pdv.receber', v.id_usuario)
    )
    and id_usuario = public.get_owner_user_id(auth.uid())
  );

-- Anonymous callers never have a valid auth.uid() for this authenticated
-- browser/offline RPC. Keep the existing authenticated/service-role contract.
revoke all on function public.criar_venda_completa(jsonb) from public, anon;
grant execute on function public.criar_venda_completa(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';

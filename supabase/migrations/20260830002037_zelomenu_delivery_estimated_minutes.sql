-- ZeloMenu: prazo manual e único exibido para pedidos de delivery.
-- A configuração permanece opcional para não alterar lojas já ativas.
alter table public.empresa_perfil
  add column if not exists zelomenu_delivery_estimated_minutes integer;

alter table public.empresa_perfil
  drop constraint if exists empresa_perfil_zelomenu_delivery_estimated_minutes_check;

alter table public.empresa_perfil
  add constraint empresa_perfil_zelomenu_delivery_estimated_minutes_check
  check (
    zelomenu_delivery_estimated_minutes is null
    or zelomenu_delivery_estimated_minutes between 1 and 1440
  );

comment on column public.empresa_perfil.zelomenu_delivery_estimated_minutes is
  'Prazo único de delivery do ZeloMenu, em minutos. Nulo não exibe prazo ao cliente.';

-- Mantém a RPC de cinco parâmetros para instâncias que ainda estejam na versão
-- anterior do ZeloMenu e cria uma sobrecarga para a nova configuração. A chamada
-- interna reutiliza toda a validação, versionamento de preço e atualização atômica
-- das faixas já existentes.
create or replace function public.save_zelomenu_delivery_settings(
  p_empresa_id uuid,
  p_enabled boolean,
  p_address jsonb,
  p_ranges jsonb,
  p_pricing_rules jsonb,
  p_estimated_delivery_minutes integer
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_estimated_delivery_minutes is not null
     and (p_estimated_delivery_minutes < 1 or p_estimated_delivery_minutes > 1440) then
    raise exception using errcode = 'ZL400', message = 'DELIVERY_ESTIMATED_MINUTES_INVALID';
  end if;

  perform public.save_zelomenu_delivery_settings(
    p_empresa_id,
    p_enabled,
    p_address,
    p_ranges,
    p_pricing_rules
  );

  update public.empresa_perfil
     set zelomenu_delivery_estimated_minutes = p_estimated_delivery_minutes
   where id = p_empresa_id;
end;
$$;

revoke all on function public.save_zelomenu_delivery_settings(uuid, boolean, jsonb, jsonb, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.save_zelomenu_delivery_settings(uuid, boolean, jsonb, jsonb, jsonb, integer)
  to service_role;

notify pgrst, 'reload schema';

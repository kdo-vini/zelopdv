-- ============================================================================
-- ZeloMenu — sync de status PDV -> ZeloChat (ZLM-301, metade B do bidirecional)
--
-- Quando um `pedido` vinculado a um pedido do ZeloChat (zelochat_order_id não
-- nulo) muda de status na cozinha/PDV, refletimos no `zelochat_orders` ligado.
-- A metade A (Chat -> PDV) é feita em código no backend do ZeloChat.
--
-- SEGURO por construção:
--  - só age quando `zelochat_order_id` não é nulo (pedidos do ZeloMenu) — esses
--    só existem quando o flag ZELOMENU_PEDIDOS_SYNC está ligado na materialização,
--    então o trigger é no-op até o sync ser deliberadamente habilitado;
--  - FORWARD-ONLY: nunca regride o status no ZeloChat (usa um rank ordinal);
--  - mapeia só 'pronto'->'ready' e 'fechado'->'delivered'. 'aberto' não sincroniza
--    (evita regressão). Nenhum efeito financeiro; só atualiza o status do pedido ligado.
-- Aditivo: pedidos sem zelochat_order_id (balcão/comanda comuns) saem na primeira linha.
-- ============================================================================

create or replace function public.zelomenu_sync_order_status_from_pedido()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_status text;
  new_rank int;
begin
  if new.zelochat_order_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  target_status := case new.status
    when 'pronto' then 'ready'
    when 'fechado' then 'delivered'
    else null
  end;
  if target_status is null then
    return new;
  end if;

  -- rank: pending < preparing < ready < out_for_delivery < delivered
  new_rank := case target_status
    when 'ready' then 2
    when 'delivered' then 4
    else -1
  end;

  update public.zelochat_orders z
     set status = target_status
   where z.id = new.zelochat_order_id
     and (case z.status
            when 'pending' then 0
            when 'preparing' then 1
            when 'ready' then 2
            when 'out_for_delivery' then 3
            when 'delivered' then 4
            else -1
          end) < new_rank;

  return new;
end;
$$;

revoke all on function public.zelomenu_sync_order_status_from_pedido() from public, anon;

drop trigger if exists zelomenu_sync_order_status_from_pedido_trg on public.pedidos;
create trigger zelomenu_sync_order_status_from_pedido_trg
  after insert or update of status on public.pedidos
  for each row
  execute function public.zelomenu_sync_order_status_from_pedido();

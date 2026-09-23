-- The public menu already collects notes per cart item. The canonical order
-- stores only order-level observations, so retain the item labels for kitchen.
create or replace function public.mesa_qr_item_observations()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  item_notes text;
begin
  if new.source <> 'mesa' or new.zelomenu_session_id is null then
    return new;
  end if;

  select string_agg(
    coalesce(nullif(btrim(item->>'productName'), ''), 'Produto')
      || case when coalesce((item->>'quantity')::integer, 1) > 1
        then ' (' || (item->>'quantity') || 'x)' else '' end
      || ': ' || btrim(item->>'notes'),
    E'\n' order by position
  ) into item_notes
  from public.zelomenu_cart_sessions s,
       jsonb_array_elements(coalesce(s.cart_snapshot->'items', '[]'::jsonb))
         with ordinality as lines(item, position)
  where s.id = new.zelomenu_session_id
    and nullif(btrim(item->>'notes'), '') is not null;

  if item_notes is not null then
    new.observations := concat_ws(E'\n', nullif(btrim(new.observations), ''), item_notes);
  end if;
  return new;
end;
$$;

drop trigger if exists mesa_qr_item_observations on public.zelo_orders;
create trigger mesa_qr_item_observations
before insert on public.zelo_orders
for each row execute function public.mesa_qr_item_observations();

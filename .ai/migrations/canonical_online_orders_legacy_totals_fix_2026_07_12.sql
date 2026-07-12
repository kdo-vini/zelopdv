-- Reconstructs line totals for legacy ZeloChat rows, whose JSON stored only
-- product labels and quantities. The canonical order total remains the source
-- of truth; rounding residue is assigned to the final line deterministically.
begin;

with ranked as (
  select i.id, i.order_id, i.quantity, o.subtotal order_subtotal,
    row_number() over(partition by i.order_id order by i.position,i.id) rn,
    count(*) over(partition by i.order_id) line_count,
    sum(i.quantity) over(partition by i.order_id) total_quantity
  from public.zelo_order_items i
  join public.zelo_orders o on o.id=i.order_id
  where o.legacy_zelochat_order_id is not null
), allocated as (
  select r.*,
    case when rn=line_count then
      order_subtotal-coalesce(sum(round(order_subtotal*quantity/nullif(total_quantity,0),2))
        over(partition by order_id order by rn rows between unbounded preceding and 1 preceding),0)
    else round(order_subtotal*quantity/nullif(total_quantity,0),2) end line_subtotal
  from ranked r
)
update public.zelo_order_items i set
  subtotal=a.line_subtotal,
  unit_price=round(a.line_subtotal/nullif(a.quantity,0),2)
from allocated a where a.id=i.id
  and exists(select 1 from public.zelo_orders o where o.id=i.order_id
    and o.legacy_zelochat_order_id is not null)
  and (select coalesce(sum(x.subtotal),0) from public.zelo_order_items x where x.order_id=i.order_id)
      is distinct from a.order_subtotal;

do $$ begin
  if exists(
    select 1 from public.zelo_orders o
    where o.legacy_zelochat_order_id is not null
      and (select coalesce(sum(i.subtotal),0) from public.zelo_order_items i where i.order_id=o.id) <> o.subtotal
  ) then raise exception 'CANONICAL_LEGACY_ITEM_TOTAL_MISMATCH'; end if;
end $$;

commit;

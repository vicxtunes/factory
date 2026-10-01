-- Fix: the order boards (/dashboard/orders, /factory, /display) read
-- recent_order_items (20261001130000_board_cutoff_and_stats.sql), and their
-- shared select asks for offer:item_offer (20261001170000_discounts.sql).
-- That computed field was only defined for order_items rows, so the boards'
-- query failed: "column recent_order_items.item_offer does not exist".

-- recent_order_items froze order_items' columns when it was created; re-run
-- it so it also has list_unit_price and discount_id (added by discounts).
create or replace view recent_order_items with (security_invoker = true) as
select oi.*
from order_items oi
where oi.order_id in (
  select o.id
  from orders o
  where greatest(o.created_at, o.cancelled_at) >= now() - interval '30 days'
     or (o.cancelled_at is null and exists (
           select 1 from order_items x
           where x.order_id = o.id and x.production_status <> 'completed'))
     or exists (
           select 1 from order_items x
           where x.order_id = o.id and x.updated_at >= now() - interval '30 days')
);

grant select on recent_order_items to anon, authenticated;

-- The same computed field as item_offer(order_items), for the view's rows:
-- the item's catalog price, discounted as of when its order was placed.
create or replace function item_offer(i recent_order_items)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select discount_offer(
    i.product_id,
    coalesce((select price from product_variants where id = i.variant_id), (select price from products where id = i.product_id)),
    (select created_at from orders where id = i.order_id)
  );
$$;

grant execute on function item_offer(recent_order_items) to anon, authenticated;

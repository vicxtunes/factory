-- Line discounts: a manager takes a percent or a fixed amount off one line of
-- an order (see lib/orders/pricing.ts). It applies on top of the line's
-- catalog price, campaign discount included (20261001170000_discounts.sql).
--
-- The discount is stored as kind + value, not as a price, so the line's price
-- is still worked out from the catalog like any other line. When the order is
-- invoiced, invoice_set_lines fixes the discounted price into unit_price and
-- keeps the catalog list price, so the invoice and Accounts show the discount
-- with no change here. After that the line discount can't change.

alter table order_items
  add column line_discount_kind text check (line_discount_kind in ('percent', 'amount')),
  add column line_discount_value bigint,
  add constraint order_items_line_discount_pair
    check ((line_discount_kind is null) = (line_discount_value is null)),
  add constraint order_items_line_discount_range
    check (line_discount_value is null
           or (line_discount_value > 0 and (line_discount_kind <> 'percent' or line_discount_value <= 100)));

-- recent_order_items froze order_items' columns when it was created; re-run it
-- so the boards' shared select finds the new ones (it broke prod once).
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

/**
 * One unit's price after a line discount (same arithmetic as discount_offer
 * and lib/discounts/core/rules.ts's discountedPrice): whole units, never below 0.
 */
create or replace function line_discounted_price(p_price bigint, p_kind text, p_value bigint)
returns bigint
language sql
immutable
as $$
  select case
           when p_kind is null then p_price
           when p_kind = 'percent' then greatest(round(p_price * (100 - p_value) / 100.0), 0)::bigint
           else greatest(p_price - p_value, 0)
         end;
$$;

/**
 * Gives (p_kind/p_value) or removes (p_kind null) one line's discount and
 * returns the line's new unit price. If the order already has a stored price
 * (quoted_price: a quote, a manual amount, or the wallet's snapshot), it moves
 * by the change in the line's total so the amount to pay follows; the wallet's
 * guard still refuses a price below what's been paid (WALLET:price_below_paid).
 */
create or replace function order_item_set_discount(p_item uuid, p_kind text, p_value bigint)
returns bigint
language plpgsql
as $$
declare
  v_item order_items;
  v_order orders;
  v_base bigint;
  v_old bigint;
  v_new bigint;
begin
  if (p_kind is null) <> (p_value is null)
     or (p_kind is not null and (p_kind not in ('percent', 'amount') or p_value <= 0 or (p_kind = 'percent' and p_value > 100))) then
    raise exception 'LINE_DISCOUNT:invalid';
  end if;

  select * into v_item from order_items where id = p_item;
  if not found then
    raise exception 'LINE_DISCOUNT:not_found';
  end if;
  select * into v_order from orders where id = v_item.order_id for update;
  if v_order.cancelled_at is not null then
    raise exception 'LINE_DISCOUNT:cancelled';
  end if;
  if exists (select 1 from invoices where order_id = v_order.id) then
    raise exception 'LINE_DISCOUNT:invoiced';
  end if;

  -- The catalog price the line would have without a line discount.
  v_base := coalesce(
    (item_offer(v_item)->>'price')::bigint,
    round(coalesce((select price from product_variants where id = v_item.variant_id),
                   (select price from products where id = v_item.product_id)))::bigint);
  if v_base is null then
    raise exception 'LINE_DISCOUNT:no_price';
  end if;

  v_old := line_discounted_price(v_base, v_item.line_discount_kind, v_item.line_discount_value);
  v_new := line_discounted_price(v_base, p_kind, p_value);

  update order_items set line_discount_kind = p_kind, line_discount_value = p_value where id = p_item;
  if v_order.quoted_price is not null and v_new <> v_old then
    update orders set quoted_price = greatest(quoted_price + (v_new - v_old) * v_item.qty, 0) where id = v_order.id;
  end if;
  return v_new;
end;
$$;

revoke all on function order_item_set_discount(uuid, text, bigint) from public, anon, authenticated;

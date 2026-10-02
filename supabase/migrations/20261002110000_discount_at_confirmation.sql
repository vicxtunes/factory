-- Discounts are agreed before an order is confirmed (in Order Approvals, or
-- in the staff order form for orders staff create). Once the order is
-- confirmed (approval_status = 'approved'), a line that has no discount
-- can't get one; an existing one can still be changed or removed until the
-- order is invoiced. Everything else is as in 20261002100000_line_discounts.sql.

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
  if v_order.approval_status = 'approved' and v_item.line_discount_kind is null and p_kind is not null then
    raise exception 'LINE_DISCOUNT:confirmed';
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

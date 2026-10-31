-- Discounts on products priced on a call (photo books with no catalog price).
--
-- Before: a discount takes its % off the catalog price, so a product with no
-- price (and no priced sizes) never showed or got one. Now:
--
--   1. pending_offer(products): the running public discount on such a
--      product, without prices ({discountId, name, kind, value}), so the
--      showroom can show its badge ("−60%").
--   2. The price the receptionist agrees on the call is kept on the line as
--      its list price (order_items.list_unit_price, set by the
--      setAgreedUnitPrice action), and item_offer takes the discount off it
--      like a catalog price: the catalog's price first, else that one.
--   3. order_item_set_discount prices a line discount from it too.
--
-- invoice_set_lines already keeps an existing list_unit_price, and Accounts
-- counts list − agreed as the discount, so invoices and Accounts follow.

create or replace function pending_offer(p products)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('discountId', d.id, 'name', d.name, 'kind', d.kind, 'value', d.value)
    from discounts d
   where p.price is null
     and not exists (select 1 from product_variants v where v.product_id = p.id and v.active and v.price is not null)
     and d.tenant_id = (select id from tenants where is_default)
     and d.code is null
     and d.starts_at <= now()
     and (d.ends_at is null or now() < d.ends_at)
     and (d.applies_to = 'all'
          or exists (select 1 from discount_products dp where dp.discount_id = d.id and dp.product_id = p.id))
   -- No price to compare yet: the largest percent, else the largest amount.
   order by d.kind = 'percent' desc, d.value desc, d.starts_at, d.id
   limit 1;
$$;

grant execute on function pending_offer(products) to anon, authenticated;

-- As in 20261129110000_promo_codes.sql, with the agreed price as the last fallback.
create or replace function item_offer(i order_items)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'discountId', d.id, 'name', d.name, 'kind', d.kind, 'value', d.value,
           'listPrice', round(lp.price)::bigint, 'price', o.price)
    from (select coalesce((select price from product_variants where id = i.variant_id),
                          (select price from products where id = i.product_id),
                          i.list_unit_price) as price,
                 ord.created_at as at,
                 ord.promo_discount_id as promo
            from orders ord
           where ord.id = i.order_id) lp
    join discounts d
      on d.tenant_id = (select id from tenants where is_default)
     and d.starts_at <= lp.at
     and (d.ends_at is null or lp.at < d.ends_at)
     and (d.code is null or d.id = lp.promo)
    cross join lateral (
      select greatest(
               case d.kind
                 when 'percent' then round(round(lp.price) * (100 - d.value) / 100.0)
                 else round(lp.price) - d.value
               end,
               0)::bigint as price
    ) o
   where i.product_id is not null
     and lp.price > 0
     and (d.applies_to = 'all'
          or exists (select 1 from discount_products dp where dp.discount_id = d.id and dp.product_id = i.product_id))
   order by o.price, d.starts_at, d.id
   limit 1;
$$;

create or replace function item_offer(i recent_order_items)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'discountId', d.id, 'name', d.name, 'kind', d.kind, 'value', d.value,
           'listPrice', round(lp.price)::bigint, 'price', o.price)
    from (select coalesce((select price from product_variants where id = i.variant_id),
                          (select price from products where id = i.product_id),
                          i.list_unit_price) as price,
                 ord.created_at as at,
                 ord.promo_discount_id as promo
            from orders ord
           where ord.id = i.order_id) lp
    join discounts d
      on d.tenant_id = (select id from tenants where is_default)
     and d.starts_at <= lp.at
     and (d.ends_at is null or lp.at < d.ends_at)
     and (d.code is null or d.id = lp.promo)
    cross join lateral (
      select greatest(
               case d.kind
                 when 'percent' then round(round(lp.price) * (100 - d.value) / 100.0)
                 else round(lp.price) - d.value
               end,
               0)::bigint as price
    ) o
   where i.product_id is not null
     and lp.price > 0
     and (d.applies_to = 'all'
          or exists (select 1 from discount_products dp where dp.discount_id = d.id and dp.product_id = i.product_id))
   order by o.price, d.starts_at, d.id
   limit 1;
$$;

-- As in 20261002110000_discount_at_confirmation.sql, with the agreed price as the last fallback.
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

  -- The price the line would have without a line discount.
  v_base := coalesce(
    (item_offer(v_item)->>'price')::bigint,
    round(coalesce((select price from product_variants where id = v_item.variant_id),
                   (select price from products where id = v_item.product_id),
                   v_item.list_unit_price))::bigint);
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

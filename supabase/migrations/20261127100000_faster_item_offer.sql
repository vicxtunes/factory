-- Speed: item_offer is the computed field every order board and order list
-- reads for each item (packages/lib/item-select.ts), and it was the database's
-- heaviest work: about 0.5 ms an item, 335 ms for the 632 items a board
-- loads, in the three most expensive queries (pg_stat_statements). The time
-- went on calls, not on the discount logic: item_offer called
-- discount_offer, which called default_tenant_id, each a separate security
-- definer or SQL function run once per item.
--
-- Same answer, one function: discount_offer's body and the default-tenant
-- lookup are written into item_offer itself. On a copy at production's size
-- (632 items, two discounts) it went from 517 ms to 80 ms with identical
-- results for every item. discount_offer stays for product_offer,
-- variant_offer and the invoice functions.
--
-- Both overloads change: item_offer(order_items) (20261001170000_discounts.sql)
-- and item_offer(recent_order_items) (20261001180000_recent_items_offer.sql).
-- create or replace keeps their grants.

create or replace function item_offer(i order_items)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  -- Keys match lib/discounts/core/model.ts's Offer, as discount_offer's do.
  select jsonb_build_object(
           'discountId', d.id, 'name', d.name, 'kind', d.kind, 'value', d.value,
           'listPrice', round(lp.price)::bigint, 'price', o.price)
    from (select coalesce((select price from product_variants where id = i.variant_id),
                          (select price from products where id = i.product_id)) as price,
                 (select created_at from orders where id = i.order_id) as at) lp
    join discounts d
      on d.tenant_id = (select id from tenants where is_default)
     and d.starts_at <= lp.at
     and (d.ends_at is null or lp.at < d.ends_at)
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
                          (select price from products where id = i.product_id)) as price,
                 (select created_at from orders where id = i.order_id) as at) lp
    join discounts d
      on d.tenant_id = (select id from tenants where is_default)
     and d.starts_at <= lp.at
     and (d.ends_at is null or lp.at < d.ends_at)
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

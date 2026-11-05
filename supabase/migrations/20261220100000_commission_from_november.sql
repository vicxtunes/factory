-- Commission starts on 1 November 2026 (Kampala).
--
-- Orders in an agent's name earn commission (orders.commission_eligible). Since
-- 20261217100000_no_discounts_on_agent_orders.sql every new one is marked; the
-- ones tagged from 1 November until then weren't, so they earned nothing.
--
--   1. orders.offers_kept: those older orders keep the running discount or
--      promo code they were placed with, so no client's agreed price changes.
--      item_offer skips commission orders unless this is set.
--   2. Those orders are marked, get their commission row and a rate per line
--      (the agent's own, else the category's, else nothing, as
--      agent_item_placed does) and are worked out now. Agents hear about any
--      credited amount through agent_commissions_untold as usual.
--
-- Orders tagged before 1 November still earn nothing.

alter table orders add column offers_kept boolean not null default false;

-- As in 20261217100000_no_discounts_on_agent_orders.sql, letting offers_kept orders keep theirs.
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
           where ord.id = i.order_id
             and (not ord.commission_eligible or ord.offers_kept)) lp
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
           where ord.id = i.order_id
             and (not ord.commission_eligible or ord.offers_kept)) lp
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

-- The orders to bring in.
create temporary table november_agent_orders on commit drop as
  select id, agent_id
    from orders
   where agent_id is not null
     and not commission_eligible
     and created_at >= timestamptz '2026-11-01 00:00:00+03';

update orders o
   set commission_eligible = true,
       offers_kept = true
  from november_agent_orders n
 where o.id = n.id;

insert into agent_commissions (order_id, agent_id)
select id, agent_id from november_agent_orders
on conflict (order_id) do nothing;

insert into agent_commission_lines (order_item_id, order_id, rate)
select i.id,
       i.order_id,
       coalesce((select rate_override from agents where id = n.agent_id),
                (select rate from commission_rates where category_id = i.category_id),
                0)
  from order_items i
  join november_agent_orders n on n.id = i.order_id
on conflict (order_item_id) do nothing;

-- Prints how many orders were brought in.
select count(agent_commission_evaluate_safely(id)) as orders_brought_in from november_agent_orders;

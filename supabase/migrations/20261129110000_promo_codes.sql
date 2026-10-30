-- Promo codes (Black November): a discount with a code applies only to orders
-- placed with that code, never to the public price list. Otherwise it is an
-- ordinary discount (20261001170000_discounts.sql): percent or amount, all or
-- chosen products, a start and an optional end, and when several apply to a
-- line the lowest price wins (a code never stacks on the running discount).
-- Optionally limited to a number of orders.

alter table discounts
  add column code text,
  add column max_uses integer check (max_uses is null or max_uses > 0),
  add constraint discounts_code_format check (code is null or code ~ '^[A-Z0-9]{3,20}$'),
  add constraint discounts_uses_need_code check (max_uses is null or code is not null);

-- One discount per code (per tenant), ended ones included, so an old code
-- can't quietly come back with a different deal.
create unique index discounts_code_unique on discounts (tenant_id, code) where code is not null;

alter table orders add column promo_discount_id uuid references discounts (id) on delete set null;
create index orders_promo_discount_idx on orders (promo_discount_id) where promo_discount_id is not null;

-- As before, plus: the code and its limit can't change once it has started.
create or replace function discounts_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.starts_at <= now() then
      raise exception 'DISCOUNT:started' using hint = 'End it instead of deleting it.';
    end if;
    return old;
  end if;

  if old.starts_at <= now() then
    if (new.name, new.kind, new.value, new.applies_to, new.starts_at, new.tenant_id, new.code, new.max_uses)
       is distinct from (old.name, old.kind, old.value, old.applies_to, old.starts_at, old.tenant_id, old.code, old.max_uses) then
      raise exception 'DISCOUNT:started';
    end if;
    if new.ends_at is distinct from old.ends_at
       and (new.ends_at is null or new.ends_at < now() - interval '1 minute'
            or (old.ends_at is not null and new.ends_at > old.ends_at)) then
      raise exception 'DISCOUNT:invalid_end';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop function discount_create(uuid, text, text, bigint, text, uuid[], timestamptz, timestamptz, text, text);

create or replace function discount_create(
  p_tenant uuid,
  p_name text,
  p_kind text,
  p_value bigint,
  p_applies_to text,
  p_product_ids uuid[],
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_code text,
  p_max_uses integer,
  p_actor_id text,
  p_actor_name text
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if p_applies_to = 'products' and coalesce(cardinality(p_product_ids), 0) = 0 then
    raise exception 'DISCOUNT:no_products';
  end if;
  if p_code is not null and exists (select 1 from discounts where tenant_id = p_tenant and code = p_code) then
    raise exception 'DISCOUNT:code_taken';
  end if;

  insert into discounts (tenant_id, name, kind, value, applies_to, starts_at, ends_at, code, max_uses, created_by_id, created_by_name)
  values (p_tenant, trim(p_name), p_kind, p_value, p_applies_to, coalesce(p_starts_at, now()), p_ends_at, p_code, p_max_uses, p_actor_id, p_actor_name)
  returning id into v_id;

  if p_applies_to = 'products' then
    insert into discount_products (discount_id, product_id)
    select v_id, unnest(p_product_ids);
  end if;
  return v_id;
end;
$$;

revoke all on function discount_create(uuid, text, text, bigint, text, uuid[], timestamptz, timestamptz, text, integer, text, text)
  from public, anon, authenticated;

-- The public price (showroom, order form): discounts without a code only.
create or replace function discount_offer(p_product uuid, p_list_price numeric, p_at timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'discountId', d.id, 'name', d.name, 'kind', d.kind, 'value', d.value,
           'listPrice', round(p_list_price)::bigint, 'price', o.price)
    from discounts d
    cross join lateral (
      select greatest(
               case d.kind
                 when 'percent' then round(round(p_list_price) * (100 - d.value) / 100.0)
                 else round(p_list_price) - d.value
               end,
               0)::bigint as price
    ) o
   where p_product is not null
     and p_list_price is not null
     and p_list_price > 0
     and d.tenant_id = default_tenant_id()
     and d.code is null
     and d.starts_at <= p_at
     and (d.ends_at is null or p_at < d.ends_at)
     and (d.applies_to = 'all'
          or exists (select 1 from discount_products dp where dp.discount_id = d.id and dp.product_id = p_product))
   order by o.price, d.starts_at, d.id
   limit 1;
$$;

-- An order line: the discounts running when its order was placed, plus the
-- order's own promo code (as in 20261127100000_faster_item_offer.sql).
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
                          (select price from products where id = i.product_id)) as price,
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
                          (select price from products where id = i.product_id)) as price,
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

/**
 * Puts a promo code on a just-placed order: the code must have been running
 * when the order was placed and, if limited, have uses left. Locks the
 * discount so two orders can't take its last use.
 */
create or replace function promo_code_apply(p_order uuid, p_discount uuid)
returns void
language plpgsql
as $$
declare
  v_discount discounts;
  v_at timestamptz;
begin
  select * into v_discount from discounts where id = p_discount and code is not null for update;
  select created_at into v_at from orders where id = p_order;
  if v_discount.id is null or v_at is null then
    raise exception 'DISCOUNT:code_unknown';
  end if;
  if not (v_discount.starts_at <= v_at and (v_discount.ends_at is null or v_at < v_discount.ends_at)) then
    raise exception 'DISCOUNT:code_not_running';
  end if;
  if v_discount.max_uses is not null
     and (select count(*) from orders where promo_discount_id = p_discount and id <> p_order) >= v_discount.max_uses then
    raise exception 'DISCOUNT:code_used_up';
  end if;
  update orders set promo_discount_id = p_discount where id = p_order;
end;
$$;

revoke all on function promo_code_apply(uuid, uuid) from public, anon, authenticated;

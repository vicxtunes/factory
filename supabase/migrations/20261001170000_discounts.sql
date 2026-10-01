-- Discounts (see lib/discounts/README.md).
--
-- A discount takes a percent or a fixed amount off the catalog price of every
-- product, or of chosen products, between a start and an optional end.
--
-- The rules live HERE, in one function (discount_offer), so every screen
-- that shows a catalog price agrees: the showroom and order form read it
-- through product_offer / variant_offer, and everything priced from an
-- order item (estimates, pro forma, invoice drafts, "amount to pay") reads
-- it through item_offer. An order gets the discount that was running when
-- it was PLACED, not when it's invoiced.
--
-- Once a discount has started it can't be edited, only ended early (a
-- trigger enforces this), so an order always keeps the discount it was
-- placed under. To change a running discount, end it and create a new one.
--
-- Tenant-aware: new tables carry tenant_id (see lib/tenancy/README.md).

create table discounts (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default default_tenant_id() references tenants (id),
  name             text not null check (nullif(trim(name), '') is not null),
  kind             text not null check (kind in ('percent', 'amount')),
  -- percent: 1–100. amount: whole units of the tenant's currency off each unit.
  value            bigint not null check (value > 0),
  applies_to       text not null check (applies_to in ('all', 'products')),
  starts_at        timestamptz not null default now(),
  -- Null = runs until ended.
  ends_at          timestamptz,
  created_by_id    text,
  created_by_name  text not null,
  -- Who ended it early, if anyone.
  ended_by_name    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint discounts_percent_range check (kind <> 'percent' or value <= 100),
  constraint discounts_ends_after_start check (ends_at is null or ends_at > starts_at)
);

create index discounts_tenant_window_idx on discounts (tenant_id, starts_at, ends_at);

create table discount_products (
  discount_id  uuid not null references discounts (id) on delete cascade,
  product_id   uuid not null references products (id) on delete cascade,
  primary key (discount_id, product_id)
);

create index discount_products_product_idx on discount_products (product_id);

-- Service-role only for writes and listing; the price functions below are the
-- only way anyone else sees a discount.
alter table discounts enable row level security;
alter table discount_products enable row level security;

-- ---------------------------------------------------------------------------
-- Once started, a discount is fixed: only ending it early is allowed.
-- ---------------------------------------------------------------------------

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
    if (new.name, new.kind, new.value, new.applies_to, new.starts_at, new.tenant_id)
       is distinct from (old.name, old.kind, old.value, old.applies_to, old.starts_at, old.tenant_id) then
      raise exception 'DISCOUNT:started';
    end if;
    -- Ending: only earlier than planned, and never in the past.
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

create trigger discounts_guard
  before update or delete on discounts
  for each row execute function discounts_guard();

create or replace function discount_products_guard()
returns trigger
language plpgsql
as $$
declare
  v_discount uuid := coalesce(new.discount_id, old.discount_id);
begin
  -- A discount being deleted (not started yet) takes its rows with it.
  if tg_op = 'DELETE' and not exists (select 1 from discounts where id = v_discount) then
    return old;
  end if;
  -- Products can be set while the discount is scheduled, or in the same
  -- transaction that creates it (created_at = now() = this transaction's start).
  if exists (select 1 from discounts where id = v_discount and starts_at <= now() and created_at <> now()) then
    raise exception 'DISCOUNT:started';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger discount_products_guard
  before insert or update or delete on discount_products
  for each row execute function discount_products_guard();

/**
 * Creates a discount and, for applies_to = 'products', its product list, in
 * one transaction (the products can't be changed once it has started).
 * Returns the new id. Ending early is a plain update of ends_at; a scheduled
 * discount that hasn't started can simply be deleted.
 */
create or replace function discount_create(
  p_tenant uuid,
  p_name text,
  p_kind text,
  p_value bigint,
  p_applies_to text,
  p_product_ids uuid[],
  p_starts_at timestamptz,
  p_ends_at timestamptz,
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

  insert into discounts (tenant_id, name, kind, value, applies_to, starts_at, ends_at, created_by_id, created_by_name)
  values (p_tenant, trim(p_name), p_kind, p_value, p_applies_to, coalesce(p_starts_at, now()), p_ends_at, p_actor_id, p_actor_name)
  returning id into v_id;

  if p_applies_to = 'products' then
    insert into discount_products (discount_id, product_id)
    select v_id, unnest(p_product_ids);
  end if;
  return v_id;
end;
$$;

revoke all on function discount_create(uuid, text, text, bigint, text, uuid[], timestamptz, timestamptz, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The rule
-- ---------------------------------------------------------------------------

/**
 * The best discount for one unit of a product at a moment, as
 * { discountId, name, kind, value, listPrice, price }, or null when none applies.
 *
 * A discount applies if it covers the product (all products, or this one)
 * and was running at that moment: starts_at <= at < ends_at. When several
 * apply, the lowest price wins (they never stack). Prices are whole units,
 * never below zero.
 */
create or replace function discount_offer(p_product uuid, p_list_price numeric, p_at timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  -- Keys match lib/discounts/core/model.ts's Offer, so code reads it as-is.
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
     -- Products have no tenant_id yet, so they're the default tenant's; when
     -- they get one, compare with the product's tenant here.
     and d.tenant_id = default_tenant_id()
     and d.starts_at <= p_at
     and (d.ends_at is null or p_at < d.ends_at)
     and (d.applies_to = 'all'
          or exists (select 1 from discount_products dp where dp.discount_id = d.id and dp.product_id = p_product))
   order by o.price, d.starts_at, d.id
   limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Computed fields: PostgREST selects these like columns (offer:product_offer).
-- Security definer so anyone who can see a product or item can see its price
-- without being able to read the discounts table itself.
-- ---------------------------------------------------------------------------

-- What the product costs right now, discounted (for the showroom and order form).
create or replace function product_offer(p products)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select discount_offer(p.id, p.price, now());
$$;

-- A variant's own price overrides its product's (see ProductVariant.price).
create or replace function variant_offer(v product_variants)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select discount_offer(v.product_id, coalesce(v.price, (select price from products where id = v.product_id)), now());
$$;

-- An order item's catalog price, discounted as of when its order was placed.
create or replace function item_offer(i order_items)
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

revoke all on function discount_offer(uuid, numeric, timestamptz) from public, anon, authenticated;
grant execute on function product_offer(products) to anon, authenticated;
grant execute on function variant_offer(product_variants) to anon, authenticated;
grant execute on function item_offer(order_items) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Invoices remember the list price and discount of each line
-- ---------------------------------------------------------------------------

alter table order_items
  add column list_unit_price bigint check (list_unit_price is null or list_unit_price >= 0),
  add column discount_id uuid references discounts (id) on delete set null;

/**
 * As before (20260927110000_invoices.sql), plus: the first time a line is
 * priced, it keeps its catalog list price and the discount it was placed
 * under, so a line's discount (list − agreed price) stays right after the
 * catalog changes or the discount ends.
 */
create or replace function invoice_set_lines(p_order uuid, p_lines jsonb)
returns bigint
language plpgsql
as $$
declare
  v_missing int;
  v_total bigint;
begin
  perform 1 from orders where id = p_order for update;
  if not found then
    raise exception 'INVOICE:order_not_found';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_lines) l
    where (l->>'unit_price') is null
       or (l->>'unit_price')::numeric < 0
       or (l->>'unit_price')::numeric <> trunc((l->>'unit_price')::numeric)
  ) then
    raise exception 'INVOICE:invalid_price';
  end if;

  select count(*) into v_missing
    from order_items i
   where i.order_id = p_order
     and not exists (select 1 from jsonb_array_elements(p_lines) l where (l->>'item_id')::uuid = i.id);
  if v_missing > 0 then
    raise exception 'INVOICE:lines_incomplete';
  end if;

  update order_items i
     set unit_price = (l->>'unit_price')::bigint,
         unit = coalesce(nullif(trim(l->>'unit'), ''), i.unit),
         list_unit_price = coalesce(
           i.list_unit_price,
           round(coalesce((select price from product_variants where id = i.variant_id),
                          (select price from products where id = i.product_id)))::bigint),
         discount_id = coalesce(i.discount_id, (item_offer(i)->>'discountId')::uuid)
    from jsonb_array_elements(p_lines) l
   where i.order_id = p_order
     and i.id = (l->>'item_id')::uuid;

  select coalesce(sum(unit_price * qty), 0) into v_total from order_items where order_id = p_order;
  update orders set quoted_price = v_total where id = p_order;
  return v_total;
end;
$$;

revoke all on function invoice_set_lines(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Accounts: a sale's discount is Σ max(list − agreed, 0) × qty over its lines
-- ---------------------------------------------------------------------------

create or replace view accounting_sale_documents with (security_invoker = true) as
select
  default_tenant_id()                          as tenant_id,
  inv.id,
  inv.invoice_no                               as number,
  inv.issued_at,
  inv.due_date,
  o.id                                         as order_id,
  o.order_no,
  o.client_id                                  as customer_id,
  coalesce(c.name, o.client_name)              as customer_name,
  coalesce(round(o.quoted_price)::bigint, 0)   as total,
  coalesce(
    (select sum(greatest(i.list_unit_price - i.unit_price, 0) * i.qty)
       from order_items i
      where i.order_id = o.id and i.list_unit_price is not null and i.unit_price is not null),
    0
  )::bigint                                    as discount,
  wallet_order_paid(o.id)                      as paid,
  o.cancelled_at is not null                   as cancelled,
  coalesce(
    (select string_agg(i.product, ', ' order by i.created_at) from order_items i where i.order_id = o.id),
    ''
  )                                            as products
from invoices inv
join orders o on o.id = inv.order_id
left join clients c on c.id = o.client_id;

revoke all on accounting_sale_documents from public, anon, authenticated;

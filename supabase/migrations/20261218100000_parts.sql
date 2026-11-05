-- Parts: one model for everything production buys or makes, and what each
-- product is made of (packages/lib/production/core/parts.ts).
--
-- A material becomes a part: bought (stock and price from purchases, as
-- before) or made from other parts (part_lines, any depth; no stock of its
-- own). A part may be sold on its own (product_id: its price is that
-- product's, everywhere) and may belong to one product only
-- (owner_product_id; null: shared). Each product has its own setup: its lines
-- (part_lines.product_id) and how it's priced (products.pricing: 'fixed', the
-- catalog's price per size, or 'parts', its parts' client prices added up).
--
-- Replaces recipes (recipe_lines) and sheet prices (sheet_prices,
-- sheet_materials), cleared by 20261218090000_clear_materials.sql for a clean
-- start. Those tables and their functions are left, empty and unused, so the
-- previous app release still runs on a rollback.

-- --- Parts ------------------------------------------------------------------

alter table materials
  add column made             boolean not null default false,
  add column client_price     bigint check (client_price >= 0),
  add column product_id       uuid unique references products (id) on delete set null,
  add column owner_product_id uuid references products (id) on delete set null;

comment on column materials.made is 'Made from other parts (part_lines.part_of); no purchases or stock of its own.';
comment on column materials.client_price is 'What the client pays for one in a product priced by its parts; null: not charged on its own (a made part: its parts'' prices).';
comment on column materials.product_id is 'Sold on its own as this catalog product: its price is the client price, everywhere.';
comment on column materials.owner_product_id is 'Only this product uses it; null: shared by any product.';

-- Shared parts' names are unique; a product's own parts only among themselves.
drop index materials_name_key;
create unique index materials_name_key on materials (tenant_id, coalesce(owner_product_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(name)));

alter table products
  add column pricing text not null default 'fixed' check (pricing in ('fixed', 'parts'));

comment on column products.pricing is 'fixed: the catalog price per size; parts: the client prices of its setup''s parts added up (part_lines).';

-- One line of a product's setup (product_id) or of a made part (part_of).
create table part_lines (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default default_tenant_id() references tenants (id),
  product_id     uuid references products (id) on delete cascade,
  part_of        uuid references materials (id) on delete cascade,
  -- Product lines only: just this size.
  variant_id     uuid references product_variants (id) on delete cascade,
  part_id        uuid references materials (id) on delete restrict,
  -- The part the order chose in this detail (e.g. Packaging), by name.
  chosen_detail  text check (trim(chosen_detail) <> ''),
  qty            numeric(12, 3) check (qty > 0),
  -- × this number detail of the order (e.g. NOS).
  per_detail     text check (trim(per_detail) <> ''),
  -- Only when the order's detail is this value (Lamination = Matt).
  when_detail    text check (trim(when_detail) <> ''),
  when_value     text,
  -- An other cost: a fixed amount per one.
  label          text,
  amount         bigint check (amount >= 0),
  sort_order     integer not null default 0,
  constraint part_lines_owner check (num_nonnulls(product_id, part_of) = 1),
  constraint part_lines_size check (variant_id is null or product_id is not null),
  constraint part_lines_when check ((when_detail is null) = (when_value is null)),
  constraint part_lines_shape check (
       (part_id is not null and chosen_detail is null and qty is not null and label is null and amount is null)
    or (part_id is null and chosen_detail is not null and qty is not null and label is null and amount is null)
    or (part_id is null and chosen_detail is null and qty is null and per_detail is null
        and nullif(trim(label), '') is not null and amount is not null)
  )
);

create index part_lines_product_idx on part_lines (product_id, sort_order) where product_id is not null;
create index part_lines_part_of_idx on part_lines (part_of, sort_order) where part_of is not null;
create index part_lines_part_idx on part_lines (part_id) where part_id is not null;

-- Every saved version of a setup: who changed it, when, and to what.
create table part_setup_history (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default default_tenant_id() references tenants (id),
  product_id  uuid references products (id) on delete cascade,
  part_id     uuid references materials (id) on delete cascade,
  pricing     text,
  lines       jsonb not null,
  actor_id    text,
  actor_name  text not null,
  created_at  timestamptz not null default now()
);

create trigger part_setup_history_append_only before update or delete on part_setup_history
  for each row execute function money_history_append_only();

-- A made part has no stock: nothing is bought, counted or used of it directly.
create or replace function parts_no_stock_for_made()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from materials where id = new.material_id and made) then
    raise exception 'PRODUCTION:made_part';
  end if;
  return new;
end;
$$;

create trigger material_movements_bought_only before insert on material_movements
  for each row execute function parts_no_stock_for_made();

-- A part with stock history stays bought; a part with lines stays made; a part
-- is given to one product only when it's added.
create or replace function parts_check_change()
returns trigger
language plpgsql
as $$
begin
  if new.made and not old.made and exists (select 1 from material_movements where material_id = new.id) then
    raise exception 'PRODUCTION:has_stock';
  end if;
  if not new.made and old.made and exists (select 1 from part_lines where part_of = new.id) then
    raise exception 'PRODUCTION:has_lines';
  end if;
  if new.owner_product_id is not null and new.owner_product_id is distinct from old.owner_product_id then
    raise exception 'PRODUCTION:owner_fixed';
  end if;
  return new;
end;
$$;

create trigger materials_check_change before update on materials
  for each row execute function parts_check_change();

-- Each part with its stock (the sum of its movements) and that stock's value.
drop view production_materials;
create view production_materials with (security_invoker = true) as
select
  m.id, m.tenant_id, m.name, m.unit, m.kind, m.unit_cost, m.active, m.created_at,
  m.made, m.client_price, m.product_id, m.owner_product_id,
  p.name                                            as product_name,
  round(p.price)::bigint                            as product_price,
  coalesce(s.stock, 0)                              as stock,
  round(coalesce(s.stock, 0) * m.unit_cost)::bigint as stock_value
from materials m
left join products p on p.id = m.product_id
left join (select material_id, sum(qty) as stock from material_movements group by material_id) s
  on s.material_id = m.id;

-- --- Order details ----------------------------------------------------------

-- A detail's key: lower case, without a trailing note in brackets, so
-- "NOS (Number of Sheets)" and the older "NOS" match. As detailKey().
create or replace function parts_detail_key(p_name text)
returns text
language sql
immutable
as $$
  select lower(trim(regexp_replace(coalesce(p_name, ''), '\s*\(.*\)\s*$', '')));
$$;

-- An order's detail by name, trimmed; null when it has none. As detailText().
create or replace function parts_detail_text(p_attributes jsonb, p_name text)
returns text
language sql
immutable
as $$
  select nullif(trim(e.value), '')
    from jsonb_each_text(coalesce(p_attributes, '{}'::jsonb)) e
   where parts_detail_key(e.key) = parts_detail_key(p_name)
   order by e.key collate "C"
   limit 1;
$$;

-- A number detail ("40", "1,200 pages" → 40, 1200); 0 when missing. As detailAmount().
create or replace function parts_detail_number(p_attributes jsonb, p_name text)
returns numeric
language sql
immutable
as $$
  select coalesce(nullif(substring(replace(coalesce(parts_detail_text(p_attributes, p_name), ''), ',', '') from '^\s*([0-9]+(?:\.[0-9]+)?)'), '')::numeric, 0);
$$;

-- Whether a line counts for an order: its size, and its condition. As applies().
create or replace function parts_line_applies(p_line part_lines, p_variant uuid, p_attributes jsonb)
returns boolean
language sql
immutable
as $$
  select (p_line.variant_id is null or p_line.variant_id = p_variant)
     and (p_line.when_detail is null
          or lower(coalesce(parts_detail_text(p_attributes, p_line.when_detail), '')) = lower(trim(coalesce(p_line.when_value, ''))));
$$;

-- How many a line takes: qty × its number detail (1 for an other cost). As lineQty().
create or replace function parts_line_times(p_line part_lines, p_attributes jsonb)
returns numeric
language sql
immutable
as $$
  select case when p_line.label is not null then 1
              else coalesce(p_line.qty, 1) * case when p_line.per_detail is null then 1 else parts_detail_number(p_attributes, p_line.per_detail) end
         end;
$$;

-- The part an order chose by name ("Box A"), among the parts p_product may use:
-- a part sold on its own by its product's name, else by its own. As chosen().
create or replace function parts_chosen(p_attributes jsonb, p_detail text, p_product uuid)
returns uuid
language sql
stable
as $$
  with value as (select lower(parts_detail_text(p_attributes, p_detail)) as v),
  usable as (
    select m.id, m.name, p.name as product_name, m.created_at
      from materials m left join products p on p.id = m.product_id
     where m.active and (m.owner_product_id is null or m.owner_product_id = p_product)
  )
  select id from (
    select u.id, 1 as rank, u.created_at from usable u, value where value.v is not null and lower(trim(u.product_name)) = value.v
    union all
    select u.id, 2, u.created_at from usable u, value where value.v is not null and lower(trim(u.name)) = value.v
  ) found
  order by rank, created_at
  limit 1;
$$;

-- What one unit of a product uses for an order, down to the bought parts, and
-- its other costs: {lines: [{material_id, qty}], other}. The same walk as
-- PartsCatalog.evaluate() (stops at 20 deep, and never goes into a part twice
-- on one path).
create or replace function parts_usage(p_product uuid, p_variant uuid, p_attributes jsonb)
returns jsonb
language sql
stable
as $$
  with recursive walk (part_id, amount, times, path, owner) as (
    select coalesce(l.part_id, case when l.chosen_detail is not null then parts_chosen(p_attributes, l.chosen_detail, p_product) end),
           l.amount,
           parts_line_times(l, p_attributes),
           array[]::uuid[],
           p_product
      from part_lines l
     where l.product_id = p_product and parts_line_applies(l, p_variant, p_attributes)
    union all
    select coalesce(c.part_id, case when c.chosen_detail is not null then parts_chosen(p_attributes, c.chosen_detail, m.owner_product_id) end),
           c.amount,
           w.times * parts_line_times(c, p_attributes),
           w.path || w.part_id,
           m.owner_product_id
      from walk w
      join materials m on m.id = w.part_id and m.made
      join part_lines c on c.part_of = w.part_id
     where not (w.part_id = any (w.path))
       and cardinality(w.path) < 20
       and parts_line_applies(c, null, p_attributes)
  )
  select jsonb_build_object(
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object('material_id', u.part_id, 'qty', u.qty))
        from (select w.part_id, sum(w.times) as qty
                from walk w join materials m on m.id = w.part_id and not m.made
               group by w.part_id having sum(w.times) > 0) u), '[]'::jsonb),
    'other', coalesce((select round(sum(w.amount * w.times)) from walk w where w.part_id is null and w.amount is not null), 0)
  );
$$;

-- Records what an item used, by itself, from its product's setup, as if it
-- went exactly to plan. Nothing happens when the item already has a live
-- record or its product isn't set up. Matches ProductSetup.usage().
create or replace function production_auto_record(p_item uuid)
returns uuid
language plpgsql
as $$
declare
  v_item order_items;
  v_tenant uuid := default_tenant_id();
  v_usage jsonb;
  v_lines jsonb;
  v_other bigint;
begin
  select * into v_item from order_items where id = p_item;
  if not found or v_item.product_id is null then return null; end if;
  if exists (select 1 from production_records where order_item_id = p_item and voided_at is null) then return null; end if;
  if not exists (select 1 from part_lines where product_id = v_item.product_id) then return null; end if;

  v_usage := parts_usage(v_item.product_id, v_item.variant_id, v_item.attributes);
  select coalesce(jsonb_agg(jsonb_build_object('material_id', l->>'material_id', 'expected_qty', q, 'actual_qty', q)), '[]'::jsonb)
    into v_lines
    from (select l, round((l->>'qty')::numeric * v_item.qty, 3) as q from jsonb_array_elements(v_usage->'lines') l) x
   where q > 0;
  v_other := (v_usage->>'other')::bigint * v_item.qty;
  if jsonb_array_length(v_lines) = 0 and v_other = 0 then return null; end if;

  return production_record_usage(v_tenant, p_item, v_lines, v_other, null, null, 'Automatic, from the setup', true);
end;
$$;

-- --- Saving -----------------------------------------------------------------

-- Checks lines and puts them under a product (p_product) or a made part
-- (p_part). p_lines: [{variant_id?, part_id?, chosen_detail?, qty?,
-- per_detail?, when_detail?, when_value?, label?, amount?}, …] in order. A
-- line may use a shared part or one of the owner's own.
create or replace function parts_put_lines(p_tenant uuid, p_product uuid, p_part uuid, p_owner uuid, p_lines jsonb)
returns void
language plpgsql
as $$
declare
  v_line jsonb;
  v_i integer := 0;
begin
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    if (v_line->>'variant_id') is not null
       and (p_product is null or not exists (select 1 from product_variants where id = (v_line->>'variant_id')::uuid and product_id = p_product)) then
      raise exception 'PRODUCTION:wrong_size';
    end if;
    if (v_line->>'part_id') is not null
       and not exists (select 1 from materials where id = (v_line->>'part_id')::uuid and tenant_id = p_tenant
                         and (owner_product_id is null or owner_product_id = p_owner)) then
      raise exception 'PRODUCTION:no_material';
    end if;
    insert into part_lines (tenant_id, product_id, part_of, variant_id, part_id, chosen_detail, qty, per_detail, when_detail, when_value, label, amount, sort_order)
    values (p_tenant, p_product, p_part,
            (v_line->>'variant_id')::uuid, (v_line->>'part_id')::uuid, nullif(trim(v_line->>'chosen_detail'), ''),
            (v_line->>'qty')::numeric, nullif(trim(v_line->>'per_detail'), ''),
            nullif(trim(v_line->>'when_detail'), ''), nullif(trim(v_line->>'when_value'), ''),
            nullif(trim(v_line->>'label'), ''), (v_line->>'amount')::bigint, v_i);
    v_i := v_i + 1;
  end loop;
end;
$$;

-- Replaces a product's setup (every size) and how it's priced, as one version.
create or replace function parts_save_product(p_tenant uuid, p_product uuid, p_pricing text, p_lines jsonb, p_actor_id text, p_actor_name text)
returns void
language plpgsql
as $$
begin
  perform 1 from products where id = p_product for update;
  if not found then raise exception 'PRODUCTION:no_product'; end if;
  -- An order's price is the catalog's first (item_offer, invoices), so a
  -- product priced by its parts has none, as photo books always had.
  if p_pricing = 'parts' and (exists (select 1 from products where id = p_product and price is not null)
                              or exists (select 1 from product_variants where product_id = p_product and price is not null)) then
    raise exception 'PRODUCTION:has_catalog_price';
  end if;
  delete from part_lines where product_id = p_product and tenant_id = p_tenant;
  perform parts_put_lines(p_tenant, p_product, null, p_product, p_lines);
  update products set pricing = p_pricing where id = p_product;
  insert into part_setup_history (tenant_id, product_id, pricing, lines, actor_id, actor_name)
  values (p_tenant, p_product, p_pricing, coalesce(p_lines, '[]'::jsonb), p_actor_id, p_actor_name);
end;
$$;

-- Replaces what a made part is made of, as one version. It may never end up
-- inside itself, at any depth.
create or replace function parts_save_part(p_tenant uuid, p_part uuid, p_lines jsonb, p_actor_id text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_part materials;
begin
  select * into v_part from materials where id = p_part and tenant_id = p_tenant for update;
  if not found then raise exception 'PRODUCTION:no_material'; end if;
  if not v_part.made then raise exception 'PRODUCTION:not_made'; end if;
  delete from part_lines where part_of = p_part;
  perform parts_put_lines(p_tenant, null, p_part, v_part.owner_product_id, p_lines);
  if exists (
    with recursive inside (id, depth) as (
      select part_id, 1 from part_lines where part_of = p_part and part_id is not null
      union
      select l.part_id, i.depth + 1 from inside i join part_lines l on l.part_of = i.id where l.part_id is not null and i.depth < 50
    )
    select 1 from inside where id = p_part
  ) then
    raise exception 'PRODUCTION:loop';
  end if;
  insert into part_setup_history (tenant_id, part_id, lines, actor_id, actor_name)
  values (p_tenant, p_part, coalesce(p_lines, '[]'::jsonb), p_actor_id, p_actor_name);
end;
$$;

-- Starts a product's setup from another's: its pricing and lines. Lines for a
-- size go to the size of the same name (others are left out, and counted in the
-- result). The other product's own parts it uses become shared, since two
-- products now use them; returns how many lines were left out.
create or replace function parts_copy_setup(p_tenant uuid, p_from uuid, p_to uuid, p_actor_id text, p_actor_name text)
returns integer
language plpgsql
as $$
declare
  v_lines jsonb;
  v_left_out integer;
begin
  perform 1 from products where id = p_to for update;
  if not found then raise exception 'PRODUCTION:no_product'; end if;
  if p_from = p_to then raise exception 'PRODUCTION:same_product'; end if;

  with recursive used (id) as (
    select part_id from part_lines where product_id = p_from and part_id is not null
    union
    select l.part_id from used u join part_lines l on l.part_of = u.id where l.part_id is not null
  )
  update materials set owner_product_id = null
   where owner_product_id = p_from and id in (select id from used);

  select coalesce(jsonb_agg(jsonb_build_object(
           'variant_id', tv.id, 'part_id', l.part_id, 'chosen_detail', l.chosen_detail, 'qty', l.qty,
           'per_detail', l.per_detail, 'when_detail', l.when_detail, 'when_value', l.when_value,
           'label', l.label, 'amount', l.amount) order by l.sort_order) filter (where l.variant_id is null or tv.id is not null), '[]'::jsonb),
         count(*) filter (where l.variant_id is not null and tv.id is null)
    into v_lines, v_left_out
    from part_lines l
    left join product_variants fv on fv.id = l.variant_id
    left join product_variants tv on tv.product_id = p_to and lower(trim(tv.name)) = lower(trim(fv.name))
   where l.product_id = p_from;

  perform parts_save_product(p_tenant, p_to, (select pricing from products where id = p_from), v_lines, p_actor_id, p_actor_name);
  return v_left_out;
end;
$$;

alter table part_lines enable row level security;
alter table part_setup_history enable row level security;
revoke all on part_lines, part_setup_history from anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'parts_no_stock_for_made()', 'parts_check_change()', 'parts_detail_key(text)', 'parts_detail_text(jsonb, text)',
    'parts_detail_number(jsonb, text)', 'parts_line_applies(part_lines, uuid, jsonb)', 'parts_line_times(part_lines, jsonb)',
    'parts_chosen(jsonb, text, uuid)', 'parts_usage(uuid, uuid, jsonb)', 'parts_put_lines(uuid, uuid, uuid, uuid, jsonb)',
    'parts_save_product(uuid, uuid, text, jsonb, text, text)', 'parts_save_part(uuid, uuid, jsonb, text, text)',
    'parts_copy_setup(uuid, uuid, uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

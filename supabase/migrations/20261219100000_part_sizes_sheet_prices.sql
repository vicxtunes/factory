-- Parts record cost only; a photo book's client price is the catalog's
-- (owner's decision, 2026-11-05).
--
-- 1. A part has a size (one of the order form's sizes: PVC 12x12 and PVC 10x10
--    are two parts named PVC), and a line can use "the order's size": the part
--    of that name in the size the order chose. Parts no longer carry a client
--    price.
-- 2. A product priced per sheet (photo books) has a price per sheet for each
--    size in the catalog (product_sheet_prices, set by the boss): an order comes
--    to that × its number of sheets + the chosen packaging's catalog price. Such
--    a product has no catalog price of its own (that would win on invoices).
--    How a product is priced follows from that, so products.pricing goes.

-- --- Sizes ------------------------------------------------------------------

drop view production_materials;

alter table materials
  drop column client_price,
  add column size text check (trim(size) <> '');

comment on column materials.size is 'One of the order form''s sizes (12x12); a line with by_order_size uses the part of its name in the order''s size.';

drop index materials_name_key;
create unique index materials_name_key on materials (
  tenant_id, coalesce(owner_product_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(name)), lower(trim(coalesce(size, '')))
);

create view production_materials with (security_invoker = true) as
select
  m.id, m.tenant_id, m.name, m.unit, m.kind, m.unit_cost, m.active, m.created_at,
  m.made, m.size, m.product_id, m.owner_product_id,
  p.name                                            as product_name,
  round(p.price)::bigint                            as product_price,
  coalesce(s.stock, 0)                              as stock,
  round(coalesce(s.stock, 0) * m.unit_cost)::bigint as stock_value
from materials m
left join products p on p.id = m.product_id
left join (select material_id, sum(qty) as stock from material_movements group by material_id) s
  on s.material_id = m.id;

alter table part_lines
  add column by_order_size boolean not null default false,
  add constraint part_lines_by_size check (not by_order_size or part_id is not null);

comment on column part_lines.by_order_size is 'Uses the part of part_id''s name in the size the order chose (its Size detail, else its size variant).';

-- The size an order chose: its Size detail, else its size variant's name. As orderSize().
create or replace function parts_order_size(p_attributes jsonb, p_variant uuid)
returns text
language sql
stable
as $$
  select coalesce(parts_detail_text(p_attributes, 'Size'), (select trim(name) from product_variants where id = p_variant));
$$;

-- A line's part for an order: the part itself, the one of its name in the
-- order's size, or the one the order chose by name. As PartsCatalog.resolve().
create or replace function parts_line_part(p_line part_lines, p_attributes jsonb, p_variant uuid, p_owner uuid)
returns uuid
language sql
stable
as $$
  select case
    when p_line.chosen_detail is not null then parts_chosen(p_attributes, p_line.chosen_detail, p_owner)
    when p_line.by_order_size then (
      select m.id
        from materials m, materials named
       where named.id = p_line.part_id
         and lower(trim(m.name)) = lower(trim(named.name))
         and lower(trim(m.size)) = lower(parts_order_size(p_attributes, p_variant))
         and (m.owner_product_id is null or m.owner_product_id = p_owner)
       order by m.active desc, m.created_at
       limit 1)
    else p_line.part_id
  end;
$$;

create or replace function parts_usage(p_product uuid, p_variant uuid, p_attributes jsonb)
returns jsonb
language sql
stable
as $$
  with recursive walk (part_id, amount, times, path, owner) as (
    select parts_line_part(l, p_attributes, p_variant, p_product),
           l.amount,
           parts_line_times(l, p_attributes),
           array[]::uuid[],
           p_product
      from part_lines l
     where l.product_id = p_product and parts_line_applies(l, p_variant, p_attributes)
    union all
    select parts_line_part(c, p_attributes, p_variant, m.owner_product_id),
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
    insert into part_lines (tenant_id, product_id, part_of, variant_id, part_id, by_order_size, chosen_detail, qty, per_detail, when_detail, when_value, label, amount, sort_order)
    values (p_tenant, p_product, p_part,
            (v_line->>'variant_id')::uuid, (v_line->>'part_id')::uuid, coalesce((v_line->>'by_order_size')::boolean, false),
            nullif(trim(v_line->>'chosen_detail'), ''),
            (v_line->>'qty')::numeric, nullif(trim(v_line->>'per_detail'), ''),
            nullif(trim(v_line->>'when_detail'), ''), nullif(trim(v_line->>'when_value'), ''),
            nullif(trim(v_line->>'label'), ''), (v_line->>'amount')::bigint, v_i);
    v_i := v_i + 1;
  end loop;
end;
$$;

-- --- How a product is priced ----------------------------------------------

alter table products drop column pricing;

drop function parts_copy_setup(uuid, uuid, uuid, text, text);
drop function parts_save_product(uuid, uuid, text, jsonb, text, text);

-- Replaces a product's setup (what it's made of, every size) as one version.
create or replace function parts_save_product(p_tenant uuid, p_product uuid, p_lines jsonb, p_actor_id text, p_actor_name text)
returns void
language plpgsql
as $$
begin
  perform 1 from products where id = p_product for update;
  if not found then raise exception 'PRODUCTION:no_product'; end if;
  delete from part_lines where product_id = p_product and tenant_id = p_tenant;
  perform parts_put_lines(p_tenant, p_product, null, p_product, p_lines);
  insert into part_setup_history (tenant_id, product_id, lines, actor_id, actor_name)
  values (p_tenant, p_product, coalesce(p_lines, '[]'::jsonb), p_actor_id, p_actor_name);
end;
$$;

-- Starts a product's setup from another's lines. Lines for a size go to the
-- size of the same name (others are left out, and counted in the result). The
-- other product's own parts it uses become shared. Prices are the catalog's
-- and aren't copied.
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
  -- A line by the order's size can use any part of that name: share them all.
  update materials m set owner_product_id = null
   where m.owner_product_id = p_from
     and exists (select 1 from part_lines l join materials named on named.id = l.part_id
                  where l.product_id = p_from and l.by_order_size and lower(trim(named.name)) = lower(trim(m.name)));

  select coalesce(jsonb_agg(jsonb_build_object(
           'variant_id', tv.id, 'part_id', l.part_id, 'by_order_size', l.by_order_size, 'chosen_detail', l.chosen_detail, 'qty', l.qty,
           'per_detail', l.per_detail, 'when_detail', l.when_detail, 'when_value', l.when_value,
           'label', l.label, 'amount', l.amount) order by l.sort_order) filter (where l.variant_id is null or tv.id is not null), '[]'::jsonb),
         count(*) filter (where l.variant_id is not null and tv.id is null)
    into v_lines, v_left_out
    from part_lines l
    left join product_variants fv on fv.id = l.variant_id
    left join product_variants tv on tv.product_id = p_to and lower(trim(tv.name)) = lower(trim(fv.name))
   where l.product_id = p_from;

  perform parts_save_product(p_tenant, p_to, v_lines, p_actor_id, p_actor_name);
  return v_left_out;
end;
$$;

-- A photo book's price per sheet, for each size of the order form. Set by the
-- boss in the catalog; packages/lib/production/core/parts.ts (PerSheet) prices
-- orders from it.
create table product_sheet_prices (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products (id) on delete cascade,
  size        text not null check (trim(size) <> ''),
  price       bigint not null check (price >= 0),
  updated_at  timestamptz not null default now()
);

create unique index product_sheet_prices_key on product_sheet_prices (product_id, lower(trim(size)));

-- Sets (p_price) or clears (null) one size's price per sheet. A product priced
-- per sheet has no catalog price of its own, which would win on invoices.
create or replace function product_set_sheet_price(p_product uuid, p_size text, p_price bigint)
returns void
language plpgsql
as $$
begin
  perform 1 from products where id = p_product for update;
  if not found then raise exception 'PRODUCTION:no_product'; end if;
  if p_price is null then
    delete from product_sheet_prices where product_id = p_product and lower(trim(size)) = lower(trim(p_size));
    return;
  end if;
  if exists (select 1 from products where id = p_product and price is not null)
     or exists (select 1 from product_variants where product_id = p_product and price is not null) then
    raise exception 'PRODUCTION:has_catalog_price';
  end if;
  insert into product_sheet_prices (product_id, size, price)
  values (p_product, trim(p_size), p_price)
  on conflict (product_id, lower(trim(size))) do update set price = excluded.price, size = excluded.size, updated_at = now();
end;
$$;

alter table product_sheet_prices enable row level security;
revoke all on product_sheet_prices from anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'parts_order_size(jsonb, uuid)', 'parts_line_part(part_lines, jsonb, uuid, uuid)', 'parts_usage(uuid, uuid, jsonb)',
    'parts_put_lines(uuid, uuid, uuid, uuid, jsonb)', 'parts_save_product(uuid, uuid, jsonb, text, text)',
    'parts_copy_setup(uuid, uuid, uuid, text, text)', 'product_set_sheet_price(uuid, text, bigint)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

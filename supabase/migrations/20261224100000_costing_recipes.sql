-- Costing the owner's way (owner's prototype, 2026-11-06; packages/lib/production/core/recipes.ts).
--
-- Parts, setups and a photo book's price per sheet are dropped, with the 4 parts
-- set up so far. In their place:
--
-- 1. A material costs one amount, an amount for each size, or is built from
--    other materials (each a quantity × its cost, or a total for each size). It
--    can have a selling price too (one, or for each size), used by photo books
--    priced from their materials.
-- 2. A product's recipe: a material × a quantity, × the number of sheets (photo
--    books only), only for some sizes and only when the order chose something.
-- 3. A photo book's price comes from its recipe automatically, as the boss
--    chooses: from the margin (one for all photo books, or its own), or from its
--    materials' selling prices. Add-ons (Lamination, Packaging) are catalog
--    products: their catalog price, and their own recipe's cost.
--
-- Stock is left for now: nothing comes off stock automatically any more. The
-- purchase, stock and usage tables stay as they are. Back up first.

do $$
begin
  if exists (select 1 from material_purchases) then
    raise exception 'Purchases have been recorded: they are money records, so materials are not cleared. Void and review them first.';
  end if;
end;
$$;

-- --- The clean start --------------------------------------------------------

drop trigger order_items_auto_usage on order_items;
drop function production_auto_record_on_status();
drop function production_auto_record(uuid);

alter table material_movements disable trigger material_movements_append_only;
alter table production_record_lines disable trigger production_record_lines_append_only;
alter table production_records disable trigger production_records_void_only;

delete from material_movements;
delete from production_record_lines;
delete from production_records;

alter table material_movements enable trigger material_movements_append_only;
alter table production_record_lines enable trigger production_record_lines_append_only;
alter table production_records enable trigger production_records_void_only;

drop function parts_add(uuid, jsonb, jsonb, jsonb, text, text);
drop function parts_copy_setup(uuid, uuid, uuid, text, text);
drop function parts_save_part(uuid, uuid, jsonb, text, text);
drop function parts_save_product(uuid, uuid, jsonb, text, text);
drop function parts_put_lines(uuid, uuid, uuid, uuid, jsonb);
drop function parts_usage(uuid, uuid, jsonb);
drop function parts_line_part(part_lines, jsonb, uuid, uuid);
drop function parts_line_times(part_lines, jsonb);
drop function parts_line_applies(part_lines, uuid, jsonb);
drop function parts_chosen(jsonb, text, uuid);
drop function parts_order_size(jsonb, uuid);
drop function parts_detail_number(jsonb, text);
drop function parts_detail_text(jsonb, text);
drop function parts_detail_key(text);
drop function product_set_sheet_price(uuid, text, bigint);
drop function sheet_save(uuid, jsonb, jsonb, text, text);
drop function sheet_book_quote(uuid, jsonb);
drop function sheet_packaging(jsonb);
drop function sheet_detail(jsonb, text);
drop function production_save_recipe(uuid, uuid, jsonb);

drop table part_setup_history;
drop table part_lines;
drop table product_sheet_prices;
drop table sheet_price_history;
drop table sheet_materials;
drop table sheet_prices;
drop table recipe_lines;

drop trigger materials_check_change on materials;
drop function parts_check_change();
drop trigger material_movements_bought_only on material_movements;
drop function parts_no_stock_for_made();

delete from materials;

drop view production_materials;
drop index materials_name_key;

alter table materials
  drop column made,
  drop column size,
  drop column product_id,
  drop column owner_product_id,
  add column cost_by    text not null default 'one' check (cost_by in ('one', 'size', 'parts')),
  add column size_costs jsonb not null default '{}'::jsonb check (jsonb_typeof(size_costs) = 'object'),
  add column sell_price bigint check (sell_price >= 0),
  add column size_sells jsonb not null default '{}'::jsonb check (jsonb_typeof(size_sells) = 'object');

comment on column materials.cost_by is 'one: unit_cost; size: size_costs ({"12x12": 1500}); parts: built from other materials (material_parts).';
comment on column materials.sell_price is 'What a photo book priced from its materials charges for one; size_sells when it differs by size.';

create unique index materials_name_key on materials (tenant_id, lower(trim(name)));

create view production_materials with (security_invoker = true) as
select
  m.id, m.tenant_id, m.name, m.unit, m.kind, m.unit_cost, m.active, m.created_at,
  m.cost_by, m.size_costs, m.sell_price, m.size_sells,
  coalesce(s.stock, 0)                              as stock,
  round(coalesce(s.stock, 0) * m.unit_cost)::bigint as stock_value
from materials m
left join (select material_id, sum(qty) as stock from material_movements group by material_id) s
  on s.material_id = m.id;

-- What a built material is made of: a quantity × the part's cost, or (size_totals)
-- a total for each size. A part is never built itself.
create table material_parts (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default default_tenant_id() references tenants (id),
  material_id  uuid not null references materials (id) on delete cascade,
  part_id      uuid not null references materials (id) on delete restrict,
  qty          numeric(12, 3) not null default 1 check (qty > 0),
  size_totals  jsonb check (size_totals is null or jsonb_typeof(size_totals) = 'object'),
  sort_order   integer not null default 0,
  constraint material_parts_not_itself check (part_id <> material_id)
);

create index material_parts_material_idx on material_parts (material_id, sort_order);
create index material_parts_part_idx on material_parts (part_id);

-- --- Recipes ----------------------------------------------------------------

create table recipe_lines (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default default_tenant_id() references tenants (id),
  product_id   uuid not null references products (id) on delete cascade,
  material_id  uuid not null references materials (id) on delete restrict,
  qty          numeric(12, 3) not null check (qty > 0),
  -- × the order's number of sheets (photo books only).
  per_sheet    boolean not null default false,
  -- Only for these sizes of the order; null: every size.
  sizes        text[] check (sizes is null or cardinality(sizes) > 0),
  -- Only when the order's detail is this value (Type = Crystal).
  when_detail  text check (trim(when_detail) <> ''),
  when_value   text,
  -- This photo book's own selling price for the material, instead of the material's.
  sell_price   bigint check (sell_price >= 0),
  size_sells   jsonb check (size_sells is null or jsonb_typeof(size_sells) = 'object'),
  sort_order   integer not null default 0,
  constraint recipe_lines_when check ((when_detail is null) = (when_value is null))
);

create index recipe_lines_product_idx on recipe_lines (product_id, sort_order);
create index recipe_lines_material_idx on recipe_lines (material_id);

-- --- Photo book prices ------------------------------------------------------

alter table products
  add column auto_price text check (auto_price in ('margin', 'materials')),
  add column margin     numeric(4, 3) check (margin >= 0 and margin < 1);

comment on column products.auto_price is 'Photo books: their price from the recipe. margin: the cost at the margin; materials: the materials'' selling prices. Null: the catalog''s.';
comment on column products.margin is 'This photo book''s own margin (0.4 = 40%); null: costing_settings.margin.';

create table costing_settings (
  tenant_id        uuid primary key default default_tenant_id() references tenants (id),
  -- The margin photo books are priced at, on the whole book with its add-ons.
  margin           numeric(4, 3) not null default 0.4 check (margin >= 0 and margin < 1),
  updated_by_name  text not null,
  updated_at       timestamptz not null default now()
);

alter table material_parts enable row level security;
alter table recipe_lines enable row level security;
alter table costing_settings enable row level security;
revoke all on table material_parts, recipe_lines, costing_settings, production_materials from anon, authenticated;

-- --- Saving, each one transaction ------------------------------------------

-- Adds (p_id null) or replaces a material and what it's built from.
-- p_material: {name, unit, cost_by, unit_cost, size_costs, sell_price, size_sells, active};
-- p_parts: [{part_id, qty, size_totals}] in order (cost_by = 'parts' only).
create or replace function costing_save_material(p_tenant uuid, p_id uuid, p_material jsonb, p_parts jsonb, p_actor_name text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := p_id;
  v_cost_by text := p_material->>'cost_by';
begin
  if v_cost_by = 'parts' then
    if v_id is not null and exists (select 1 from material_parts where part_id = v_id) then
      raise exception 'PRODUCTION:used_as_part';
    end if;
    if exists (select 1 from jsonb_array_elements(coalesce(p_parts, '[]'::jsonb)) x
                 left join materials m on m.id = (x->>'part_id')::uuid and m.tenant_id = p_tenant
                where m.id is null or m.cost_by = 'parts' or m.id = v_id) then
      raise exception 'PRODUCTION:bad_part';
    end if;
  end if;

  if v_id is null then
    insert into materials (tenant_id, name, unit, cost_by, unit_cost, size_costs, sell_price, size_sells, created_by_name)
    values (p_tenant, trim(p_material->>'name'), trim(p_material->>'unit'), v_cost_by,
            coalesce((p_material->>'unit_cost')::numeric, 0), coalesce(p_material->'size_costs', '{}'::jsonb),
            (p_material->>'sell_price')::bigint, coalesce(p_material->'size_sells', '{}'::jsonb), p_actor_name)
    returning id into v_id;
  else
    update materials
       set name = trim(p_material->>'name'), unit = trim(p_material->>'unit'), cost_by = v_cost_by,
           unit_cost = coalesce((p_material->>'unit_cost')::numeric, 0), size_costs = coalesce(p_material->'size_costs', '{}'::jsonb),
           sell_price = (p_material->>'sell_price')::bigint, size_sells = coalesce(p_material->'size_sells', '{}'::jsonb),
           active = coalesce((p_material->>'active')::boolean, active)
     where id = v_id and tenant_id = p_tenant;
    if not found then raise exception 'PRODUCTION:no_material'; end if;
    delete from material_parts where material_id = v_id;
  end if;

  if v_cost_by = 'parts' then
    insert into material_parts (tenant_id, material_id, part_id, qty, size_totals, sort_order)
    select p_tenant, v_id, (x->>'part_id')::uuid, coalesce((x->>'qty')::numeric, 1), nullif(x->'size_totals', 'null'::jsonb), o
      from jsonb_array_elements(coalesce(p_parts, '[]'::jsonb)) with ordinality as t(x, o);
  end if;
  return v_id;
end;
$$;

-- Replaces a product's recipe. p_lines: [{material_id, qty, per_sheet, sizes,
-- when_detail, when_value, sell_price, size_sells}] in order.
create or replace function costing_save_recipe(p_tenant uuid, p_product uuid, p_lines jsonb)
returns void
language plpgsql
as $$
begin
  perform 1 from products where id = p_product for update;
  if not found then raise exception 'PRODUCTION:no_product'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) x
               left join materials m on m.id = (x->>'material_id')::uuid and m.tenant_id = p_tenant
              where m.id is null) then
    raise exception 'PRODUCTION:no_material';
  end if;
  delete from recipe_lines where product_id = p_product and tenant_id = p_tenant;
  insert into recipe_lines (tenant_id, product_id, material_id, qty, per_sheet, sizes, when_detail, when_value, sell_price, size_sells, sort_order)
  select p_tenant, p_product, (x->>'material_id')::uuid, (x->>'qty')::numeric, coalesce((x->>'per_sheet')::boolean, false),
         case when jsonb_typeof(x->'sizes') = 'array' and jsonb_array_length(x->'sizes') > 0
              then array(select jsonb_array_elements_text(x->'sizes')) end,
         nullif(trim(x->>'when_detail'), ''), case when nullif(trim(x->>'when_detail'), '') is not null then x->>'when_value' end,
         (x->>'sell_price')::bigint, nullif(x->'size_sells', 'null'::jsonb), o
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality as t(x, o);
end;
$$;

-- How a photo book is priced (p_auto null: the catalog's) and its own margin
-- (null: the shared one). A product priced from its recipe has no catalog price
-- of its own, which would win on invoices.
create or replace function costing_set_pricing(p_product uuid, p_auto text, p_margin numeric)
returns void
language plpgsql
as $$
begin
  perform 1 from products where id = p_product for update;
  if not found then raise exception 'PRODUCTION:no_product'; end if;
  if p_auto is not null and (exists (select 1 from products where id = p_product and price is not null)
     or exists (select 1 from product_variants where product_id = p_product and price is not null)) then
    raise exception 'PRODUCTION:has_catalog_price';
  end if;
  update products set auto_price = p_auto, margin = p_margin where id = p_product;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'costing_save_material(uuid, uuid, jsonb, jsonb, text)', 'costing_save_recipe(uuid, uuid, jsonb)',
    'costing_set_pricing(uuid, text, numeric)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

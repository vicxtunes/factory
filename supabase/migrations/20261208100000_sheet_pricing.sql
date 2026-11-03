-- Products priced by the sheet (photo books). One sheet's client price is the
-- sum of its components (PVC, Paper & Ink, Lamination), each for a size or for
-- every size, and for a choice like Matt or Glossy; × the number of sheets;
-- + the chosen packaging, itself a product with its own price. What it costs us
-- comes from stock: what one sheet uses, at the materials' latest prices.
--
-- Prices are read when an order is placed and stored on its line, so changing
-- them later never touches existing orders. Staff can still change the price on
-- the call. With no sheet prices for a product, nothing changes: it's priced on
-- the call as before. Applied by hand: node scripts/apply-migration.mjs <this file>

create table sheet_prices (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default default_tenant_id() references tenants (id),
  product_id  uuid not null references products (id) on delete cascade,
  component   text not null check (nullif(trim(component), '') is not null),
  -- Null: every size, or any choice. A size's own price beats the every-size one.
  size        text,
  choice      text,
  price       bigint not null check (price >= 0),
  sort_order  integer not null default 0
);

create unique index sheet_prices_key on sheet_prices (product_id, lower(trim(component)), lower(coalesce(size, '')), lower(coalesce(choice, '')));

create table sheet_materials (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default default_tenant_id() references tenants (id),
  product_id   uuid not null references products (id) on delete cascade,
  material_id  uuid not null references materials (id) on delete restrict,
  size         text,
  choice       text,
  qty          numeric(12, 3) not null check (qty > 0),
  sort_order   integer not null default 0
);

create index sheet_materials_product_idx on sheet_materials (product_id);

-- Every saved version: who changed prices, when, and to what.
create table sheet_price_history (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products (id) on delete cascade,
  prices      jsonb not null,
  materials   jsonb not null,
  actor_id    text,
  actor_name  text not null,
  created_at  timestamptz not null default now()
);

create trigger sheet_price_history_append_only before update or delete on sheet_price_history
  for each row execute function money_history_append_only();

-- An order's detail by the start of its name, as older orders say "NOS" and
-- newer ones "NOS (Number of Sheets)".
create or replace function sheet_detail(p_attributes jsonb, p_pattern text)
returns text
language sql
immutable
as $$
  select nullif(trim(e.value), '') from jsonb_each_text(coalesce(p_attributes, '{}'::jsonb)) e where e.key ~* p_pattern order by e.key limit 1;
$$;

-- The packaging product an order chose, from the Packaging category.
create or replace function sheet_packaging(p_attributes jsonb)
returns products
language sql
stable
as $$
  select p.*
    from products p
    join product_categories c on c.id = p.category_id
   where lower(trim(c.name)) = 'packaging'
     and lower(trim(p.name)) = lower(sheet_detail(p_attributes, '^packag'))
   order by p.active desc
   limit 1;
$$;

-- What one book comes to for the client. Null when the product isn't priced by
-- the sheet. total is null while something's missing (the missing list says
-- what), so a wrong price is never shown. Matches sheetPriceFor() in
-- packages/lib/production/sheets/model.ts.
create or replace function sheet_book_quote(p_product uuid, p_attributes jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_size text := lower(sheet_detail(p_attributes, '^size'));
  v_choice text := lower(sheet_detail(p_attributes, '^lamination'));
  v_count bigint;
  v_sheet bigint := 0;
  v_missing text[] := '{}';
  v_component record;
  v_price bigint;
  v_lines jsonb := '[]'::jsonb;
  v_packaging products;
  v_packaging_name text := sheet_detail(p_attributes, '^packag');
  v_packaging_price bigint := 0;
begin
  if not exists (select 1 from sheet_prices where product_id = p_product) then return null; end if;

  if sheet_detail(p_attributes, '^(nos|sheets|number of sheets)') ~ '^[0-9]+$' then
    v_count := sheet_detail(p_attributes, '^(nos|sheets|number of sheets)')::bigint;
  end if;
  if coalesce(v_count, 0) <= 0 then v_missing := v_missing || 'Number of sheets'::text; end if;

  for v_component in
    select min(s.component) as component, lower(trim(s.component)) as key, min(s.sort_order) as sort
      from sheet_prices s where s.product_id = p_product group by lower(trim(s.component)) order by sort
  loop
    select s.price into v_price
      from sheet_prices s
     where s.product_id = p_product and lower(trim(s.component)) = v_component.key
       and (s.size is null or lower(trim(s.size)) = v_size)
       and (s.choice is null or lower(trim(s.choice)) = v_choice)
     order by s.size is null, s.choice is null
     limit 1;
    if found then
      v_sheet := v_sheet + v_price;
      v_lines := v_lines || jsonb_build_object('component', v_component.component, 'price', v_price);
    else
      v_missing := v_missing || v_component.component;
    end if;
  end loop;

  if v_packaging_name is not null then
    v_packaging := sheet_packaging(p_attributes);
    if v_packaging.id is null then
      v_missing := v_missing || ('Packaging: ' || v_packaging_name);
    else
      v_packaging_price := coalesce(round(v_packaging.price)::bigint, 0);
    end if;
  end if;

  return jsonb_build_object(
    'sheetPrice', v_sheet,
    'sheets', v_count,
    'lines', v_lines,
    'packaging', v_packaging_name,
    'packagingPrice', v_packaging_price,
    'missing', to_jsonb(v_missing),
    'total', case when cardinality(v_missing) = 0 then v_sheet * v_count + v_packaging_price end
  );
end;
$$;

-- Replaces a product's sheet prices and materials as one version.
create or replace function sheet_save(p_product uuid, p_prices jsonb, p_materials jsonb, p_actor_id text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_tenant uuid := default_tenant_id();
begin
  perform 1 from products where id = p_product for update;
  if not found then raise exception 'SHEET:no_product'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_materials, '[]'::jsonb)) m
              where not exists (select 1 from materials x where x.id = (m->>'material_id')::uuid and x.tenant_id = v_tenant)) then
    raise exception 'SHEET:no_material';
  end if;
  delete from sheet_prices where product_id = p_product;
  delete from sheet_materials where product_id = p_product;
  begin
    insert into sheet_prices (product_id, component, size, choice, price, sort_order)
    select p_product, trim(l.v->>'component'), nullif(trim(l.v->>'size'), ''), nullif(trim(l.v->>'choice'), ''), (l.v->>'price')::bigint, l.i
      from jsonb_array_elements(coalesce(p_prices, '[]'::jsonb)) with ordinality l(v, i);
  exception when unique_violation then
    raise exception 'SHEET:duplicate';
  end;
  insert into sheet_materials (product_id, material_id, size, choice, qty, sort_order)
  select p_product, (l.v->>'material_id')::uuid, nullif(trim(l.v->>'size'), ''), nullif(trim(l.v->>'choice'), ''), (l.v->>'qty')::numeric, l.i
    from jsonb_array_elements(coalesce(p_materials, '[]'::jsonb)) with ordinality l(v, i);
  insert into sheet_price_history (product_id, prices, materials, actor_id, actor_name)
  values (p_product, coalesce(p_prices, '[]'::jsonb), coalesce(p_materials, '[]'::jsonb), p_actor_id, p_actor_name);
end;
$$;

-- As in 20261130100000_production_costing.sql, plus what one sheet uses × the
-- number of sheets, and the recipe of the packaging chosen.
create or replace function production_auto_record(p_item uuid)
returns uuid
language plpgsql
as $$
declare
  v_item order_items;
  v_tenant uuid := default_tenant_id();
  v_lines jsonb;
  v_other bigint;
  v_sheet_priced boolean;
  v_size text;
  v_choice text;
  v_sheets numeric := 0;
  v_packaging uuid;
begin
  select * into v_item from order_items where id = p_item;
  if not found or v_item.product_id is null then return null; end if;
  if exists (select 1 from production_records where order_item_id = p_item and voided_at is null) then return null; end if;

  v_sheet_priced := exists (select 1 from sheet_materials where product_id = v_item.product_id)
                 or exists (select 1 from sheet_prices where product_id = v_item.product_id);
  if not v_sheet_priced
     and not exists (select 1 from recipe_lines where tenant_id = v_tenant and product_id = v_item.product_id
                      and (variant_id is null or variant_id = v_item.variant_id)) then
    return null;
  end if;

  if v_sheet_priced then
    v_size := lower(sheet_detail(v_item.attributes, '^size'));
    v_choice := lower(sheet_detail(v_item.attributes, '^lamination'));
    if sheet_detail(v_item.attributes, '^(nos|sheets|number of sheets)') ~ '^[0-9]+$' then
      v_sheets := sheet_detail(v_item.attributes, '^(nos|sheets|number of sheets)')::numeric;
    end if;
    v_packaging := (sheet_packaging(v_item.attributes)).id;
  end if;

  with recipe as (
    select r.material_id, r.qty, r.amount, a.name as detail
      from recipe_lines r
      left join category_attributes a on a.id = r.per_attribute_id
     where r.tenant_id = v_tenant and r.product_id = v_item.product_id
       and (r.variant_id is null or r.variant_id = v_item.variant_id)
  ),
  needed as (
    select material_id, qty * case when detail is null then 1 else production_detail_value(v_item.attributes, detail) end as q, amount
      from recipe
    union all
    select m.material_id, m.qty * v_sheets, null
      from sheet_materials m
     where v_sheet_priced and m.product_id = v_item.product_id
       and (m.size is null or lower(trim(m.size)) = v_size)
       and (m.choice is null or lower(trim(m.choice)) = v_choice)
    union all
    select r.material_id, r.qty, r.amount
      from recipe_lines r
     where v_packaging is not null and r.tenant_id = v_tenant and r.product_id = v_packaging and r.variant_id is null
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object('material_id', material_id, 'expected_qty', q, 'actual_qty', q)), '[]'::jsonb)
       from (select material_id, round(sum(n.q) * v_item.qty, 3) as q
               from needed n where material_id is not null group by material_id having sum(n.q) > 0) m),
    (select coalesce(sum(amount), 0) * v_item.qty from needed where material_id is null)
  into v_lines, v_other;

  return production_record_usage(v_tenant, p_item, v_lines, v_other, null, null, 'Automatic, from the recipe', true);
end;
$$;

alter table sheet_prices enable row level security;
alter table sheet_materials enable row level security;
alter table sheet_price_history enable row level security;

revoke all on sheet_prices, sheet_materials, sheet_price_history from anon, authenticated;
revoke all on function sheet_detail(jsonb, text) from public, anon, authenticated;
revoke all on function sheet_packaging(jsonb) from public, anon, authenticated;
revoke all on function sheet_book_quote(uuid, jsonb) from public, anon, authenticated;
revoke all on function sheet_save(uuid, jsonb, jsonb, text, text) from public, anon, authenticated;

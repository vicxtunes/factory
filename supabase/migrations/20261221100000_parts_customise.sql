-- Each product set up the owner's way, with nothing fixed (owner, 2026-11-06).
--
-- 1. A setup line can attach another catalog product (a box): its cost is that
--    product's own setup, and the line says whether its catalog price adds to
--    what the client pays (adds_price). "The part the order chose" goes: a box
--    the client picks is a line "only when Packaging is Box A".
-- 2. A line says which sizes it's for (sizes, the order form's sizes; null:
--    every size), matched to the order's size (its Size detail, else its size
--    variant's name).
-- 3. A made part can have the owner's own cost (materials.unit_cost > 0 on a
--    made part): products use that figure, and its parts still come off stock.
-- 4. A part can be moved between shared and one product while no other product
--    uses it.
-- 5. parts_add() adds a part in several sizes at once, each with its price, and a
--    made part with what it's made of, in one go.

-- --- Lines -----------------------------------------------------------------

alter table part_lines
  add column product_part_id uuid references products (id) on delete restrict,
  add column adds_price boolean not null default false,
  add column sizes text[] check (sizes is null or cardinality(sizes) > 0);

comment on column part_lines.product_part_id is 'An attached catalog product: its cost is its own setup''s.';
comment on column part_lines.adds_price is 'An attached product''s catalog price adds to what the client pays.';
comment on column part_lines.sizes is 'Only for these sizes of the order (its Size detail, else its size variant); null: every size.';

alter table part_lines drop constraint part_lines_shape;
alter table part_lines add constraint part_lines_shape check (
     (part_id is not null and product_part_id is null and chosen_detail is null and qty is not null and label is null and amount is null)
  or (product_part_id is not null and part_id is null and chosen_detail is null and qty is not null and label is null and amount is null)
  or (part_id is null and product_part_id is null and chosen_detail is not null and qty is not null and label is null and amount is null)
  or (part_id is null and product_part_id is null and chosen_detail is null and qty is null and per_detail is null
      and nullif(trim(label), '') is not null and amount is not null)
);
alter table part_lines add constraint part_lines_adds_price check (not adds_price or product_part_id is not null);
alter table part_lines add constraint part_lines_attached_on_products check (product_part_id is null or product_id is not null);

create index part_lines_product_part_idx on part_lines (product_part_id) where product_part_id is not null;

-- Whether a line counts for an order: its size variant, its sizes, and its condition. As applies().
create or replace function parts_line_applies(p_line part_lines, p_variant uuid, p_attributes jsonb)
returns boolean
language sql
stable
as $$
  select (p_line.variant_id is null or p_line.variant_id = p_variant)
     and (p_line.sizes is null
          or exists (select 1 from unnest(p_line.sizes) s where lower(trim(s)) = lower(coalesce(parts_order_size(p_attributes, p_variant), ''))))
     and (p_line.when_detail is null
          or lower(coalesce(parts_detail_text(p_attributes, p_line.when_detail), '')) = lower(trim(coalesce(p_line.when_value, ''))));
$$;

-- What one unit of a product uses for an order, down to the bought parts, and
-- its other costs: {lines: [{material_id, qty}], other}. Made parts and attached
-- products are walked into (never twice on one path, at most 20 deep). The same
-- walk as PartsCatalog.evaluate().
create or replace function parts_usage(p_product uuid, p_variant uuid, p_attributes jsonb)
returns jsonb
language sql
stable
as $$
  with recursive walk (part_id, attached, amount, times, path, depth) as (
    select parts_line_part(l, p_attributes, p_variant, p_product),
           l.product_part_id,
           l.amount,
           parts_line_times(l, p_attributes),
           array[p_product]::uuid[],
           1
      from part_lines l
     where l.product_id = p_product and parts_line_applies(l, p_variant, p_attributes)
    union all
    select parts_line_part(c, p_attributes, p_variant, coalesce(m.owner_product_id, w.attached)),
           c.product_part_id,
           c.amount,
           w.times * parts_line_times(c, p_attributes),
           w.path || coalesce(w.part_id, w.attached),
           w.depth + 1
      from walk w
      left join materials m on m.id = w.part_id
      join part_lines c on (m.made and c.part_of = w.part_id) or (w.attached is not null and c.product_id = w.attached)
     where not (coalesce(w.part_id, w.attached) = any (w.path))
       and w.depth < 20
       and parts_line_applies(c, p_variant, p_attributes)
  )
  select jsonb_build_object(
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object('material_id', u.part_id, 'qty', u.qty))
        from (select w.part_id, sum(w.times) as qty
                from walk w join materials m on m.id = w.part_id and not m.made
               group by w.part_id having sum(w.times) > 0) u), '[]'::jsonb),
    'other', coalesce((select round(sum(w.amount * w.times)) from walk w where w.part_id is null and w.attached is null and w.amount is not null), 0)
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
    if (v_line->>'product_part_id') is not null
       and (p_product is null or (v_line->>'product_part_id')::uuid = p_product
            or not exists (select 1 from products where id = (v_line->>'product_part_id')::uuid)) then
      raise exception 'PRODUCTION:no_product';
    end if;
    insert into part_lines (tenant_id, product_id, part_of, variant_id, part_id, by_order_size, product_part_id, adds_price, sizes,
                            chosen_detail, qty, per_detail, when_detail, when_value, label, amount, sort_order)
    values (p_tenant, p_product, p_part,
            (v_line->>'variant_id')::uuid, (v_line->>'part_id')::uuid, coalesce((v_line->>'by_order_size')::boolean, false),
            (v_line->>'product_part_id')::uuid, coalesce((v_line->>'adds_price')::boolean, false),
            (select nullif(array_agg(trim(s)) filter (where trim(s) <> ''), '{}') from jsonb_array_elements_text(coalesce(v_line->'sizes', '[]'::jsonb)) s),
            null,
            (v_line->>'qty')::numeric, nullif(trim(v_line->>'per_detail'), ''),
            nullif(trim(v_line->>'when_detail'), ''), nullif(trim(v_line->>'when_value'), ''),
            nullif(trim(v_line->>'label'), ''), (v_line->>'amount')::bigint, v_i);
    v_i := v_i + 1;
  end loop;
end;
$$;

-- Copying a setup carries the new columns too (attached products, sizes, adds price).
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
  update materials m set owner_product_id = null
   where m.owner_product_id = p_from
     and exists (select 1 from part_lines l join materials named on named.id = l.part_id
                  where l.product_id = p_from and l.by_order_size and lower(trim(named.name)) = lower(trim(m.name)));

  select coalesce(jsonb_agg(jsonb_build_object(
           'variant_id', tv.id, 'part_id', l.part_id, 'by_order_size', l.by_order_size,
           'product_part_id', case when l.product_part_id = p_to then null else l.product_part_id end,
           'adds_price', l.adds_price, 'sizes', to_jsonb(l.sizes), 'qty', l.qty,
           'per_detail', l.per_detail, 'when_detail', l.when_detail, 'when_value', l.when_value,
           'label', l.label, 'amount', l.amount) order by l.sort_order)
           filter (where (l.variant_id is null or tv.id is not null) and l.chosen_detail is null and l.product_part_id is distinct from p_to), '[]'::jsonb),
         count(*) filter (where (l.variant_id is not null and tv.id is null) or l.chosen_detail is not null or l.product_part_id = p_to)
    into v_lines, v_left_out
    from part_lines l
    left join product_variants fv on fv.id = l.variant_id
    left join product_variants tv on tv.product_id = p_to and lower(trim(tv.name)) = lower(trim(fv.name))
   where l.product_id = p_from;

  perform parts_save_product(p_tenant, p_to, v_lines, p_actor_id, p_actor_name);
  return v_left_out;
end;
$$;

-- --- Parts -----------------------------------------------------------------

-- A part can move between shared and one product while nothing outside that
-- product uses it; a part with stock stays bought; a part with lines stays made.
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
  if new.owner_product_id is not null and new.owner_product_id is distinct from old.owner_product_id
     and exists (select 1 from part_lines l
                  where l.part_id = new.id
                    and l.product_id is distinct from new.owner_product_id
                    and not exists (select 1 from materials o where o.id = l.part_of and o.owner_product_id = new.owner_product_id)) then
    raise exception 'PRODUCTION:in_use_elsewhere';
  end if;
  return new;
end;
$$;

-- Adds a part in one or more sizes (p_sizes: [{size, unit_cost}], size null for
-- one without a size), each with its price; a made part gets p_lines as what it's
-- made of (each size the same; edit one on its page). Returns the new ids.
create or replace function parts_add(p_tenant uuid, p_part jsonb, p_sizes jsonb, p_lines jsonb, p_actor_id text, p_actor_name text)
returns uuid[]
language plpgsql
as $$
declare
  v_size jsonb;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_made boolean := coalesce((p_part->>'made')::boolean, false);
  v_owner uuid := (p_part->>'owner_product_id')::uuid;
begin
  if jsonb_array_length(coalesce(p_sizes, '[]'::jsonb)) = 0 then p_sizes := '[{}]'::jsonb; end if;
  for v_size in select * from jsonb_array_elements(p_sizes) loop
    insert into materials (tenant_id, name, unit, kind, made, size, unit_cost, product_id, owner_product_id, created_by_name)
    values (p_tenant, trim(p_part->>'name'), trim(p_part->>'unit'), coalesce(p_part->>'kind', 'material'), v_made,
            nullif(trim(v_size->>'size'), ''), coalesce((v_size->>'unit_cost')::numeric, 0),
            case when jsonb_array_length(p_sizes) = 1 then (p_part->>'product_id')::uuid end, v_owner, p_actor_name)
    returning id into v_id;
    v_ids := v_ids || v_id;
    if v_made and jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) > 0 then
      perform parts_save_part(p_tenant, v_id, p_lines, p_actor_id, p_actor_name);
    end if;
  end loop;
  return v_ids;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'parts_line_applies(part_lines, uuid, jsonb)', 'parts_usage(uuid, uuid, jsonb)', 'parts_put_lines(uuid, uuid, uuid, uuid, jsonb)',
    'parts_copy_setup(uuid, uuid, uuid, text, text)', 'parts_check_change()', 'parts_add(uuid, jsonb, jsonb, jsonb, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

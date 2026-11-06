-- Cover Type becomes its own product category, like Packaging and Lamination
-- (20261001120000_lamination_category.sql): each cover is a product, managed in
-- Dashboard -> Products, with a size for each photo book size so each size can
-- have its own price (the boss sets them; none is set here). It's an add-on
-- (packages/lib/production/core/recipes.ts): an order's Cover Type adds that
-- cover's price for the order's size, and its recipe's cost.
--
-- Seeded from the options of the existing "Cover Type" detail, so the order
-- form shows the same choices once this ships. "Only for 8x8" covers get the
-- 8x8 size alone.
insert into product_categories (name, sort_order)
select 'Cover Type', coalesce((select max(sort_order) + 1 from product_categories), 0)
where not exists (select 1 from product_categories where lower(name) = 'cover type');

insert into products (category_id, name)
select c.id, o.opt
from product_categories c
cross join (
  select distinct jsonb_array_elements_text(options) as opt
  from category_attributes
  where lower(name) like '%cover type%' and jsonb_typeof(options) = 'array'
) o
where lower(c.name) = 'cover type'
  and not exists (select 1 from products p where p.category_id = c.id and p.name = o.opt);

-- A size for each photo book size (the Photo Books "Size" detail), no price yet.
insert into product_variants (product_id, name)
select p.id, s.size
from products p
join product_categories c on c.id = p.category_id and lower(c.name) = 'cover type'
cross join (
  select distinct jsonb_array_elements_text(a.options) as size
  from category_attributes a
  join product_categories pc on pc.id = a.category_id and lower(pc.name) = 'photo books'
  where lower(a.name) = 'size' and jsonb_typeof(a.options) = 'array'
) s
where (p.name not ilike '%only for%' or p.name ilike '%' || s.size || '%')
  and not exists (select 1 from product_variants v where v.product_id = p.id and lower(v.name) = lower(s.size));

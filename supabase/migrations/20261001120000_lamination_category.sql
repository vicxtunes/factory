-- Lamination becomes its own product category, like Packaging
-- (20260919170000_packaging_category.sql): each lamination option is a full
-- product with display image, preview video, extra media and its own price,
-- all managed from Dashboard -> Products.
-- Seeded from the options of the existing "Lamination" attributes so nothing
-- disappears from the showroom/order form when this ships.
insert into product_categories (name, sort_order)
select 'Lamination', coalesce((select max(sort_order) + 1 from product_categories), 0)
where not exists (select 1 from product_categories where lower(name) = 'lamination');

insert into products (category_id, name)
select c.id, opt
from product_categories c
cross join (
  select distinct jsonb_array_elements_text(options) as opt
  from category_attributes
  where lower(name) like '%lamination%' and jsonb_typeof(options) = 'array'
) o
where lower(c.name) = 'lamination'
  and not exists (select 1 from products p where p.category_id = c.id and p.name = o.opt);

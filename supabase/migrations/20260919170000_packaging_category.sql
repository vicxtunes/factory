-- Packaging becomes its own product category so each packaging option is a
-- full product: display image, preview video, extra media and its own price,
-- all managed from Dashboard -> Products like any other category.
-- Seeded from the options of the existing "Packaging" attribute so nothing
-- disappears from the showroom/order form when this ships.
insert into product_categories (name, sort_order)
select 'Packaging', coalesce((select max(sort_order) + 1 from product_categories), 0)
where not exists (select 1 from product_categories where lower(name) = 'packaging');

insert into products (category_id, name)
select c.id, opt
from product_categories c
cross join (
  select distinct jsonb_array_elements_text(options) as opt
  from category_attributes
  where lower(name) like '%packaging%' and jsonb_typeof(options) = 'array'
) o
where lower(c.name) = 'packaging'
  and not exists (select 1 from products p where p.category_id = c.id and p.name = o.opt);

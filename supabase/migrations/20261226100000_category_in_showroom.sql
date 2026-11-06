-- A category can be kept off the showroom (product_categories.in_showroom),
-- while its products stay on the order form and in costing: Cover Type is an
-- add-on picked on the order, not something clients browse (owner, 2026-11-07).
-- The boss switches it in Dashboard -> Products.
alter table product_categories add column in_showroom boolean not null default true;

update product_categories set in_showroom = false where lower(name) = 'cover type';

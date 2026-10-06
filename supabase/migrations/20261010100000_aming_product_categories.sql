-- A studio's products categories start from Aming's (see
-- packages/lib/offerings/README.md): a studio adds one of Aming's product
-- categories, with Aming's name, and picks all or some of Aming's products
-- in it. A category Aming doesn't offer is the studio's own, holding the
-- studio's own products.

alter table offering_categories
  -- The Aming product category it was added from; null for the studio's own.
  add column source_category_id uuid references product_categories (id),
  add constraint offering_categories_aming_is_product check (source_category_id is null or kind = 'product');

-- A studio adds each of Aming's categories once among its active ones.
create unique index offering_categories_aming_once on offering_categories (tenant_id, source_category_id)
  where source_category_id is not null and archived_at is null;

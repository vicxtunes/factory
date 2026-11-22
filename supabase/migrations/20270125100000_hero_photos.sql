-- The photos at the top of a business's page (the Showcase hero), chosen by
-- the business (owner, 2026-11-22: businesses want to change them): up to six,
-- in order, from its public albums and its services' galleries. Fewer, or
-- ones since deleted: the rest are picked as before (album covers first).
alter table tenants add column hero_photo_ids uuid[] not null default '{}' check (cardinality(hero_photo_ids) <= 6);

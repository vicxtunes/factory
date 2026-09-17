-- Factory Order Tracker — product price
--
-- Backs the showroom's price tags (Free work mode's stacked 3D card view and
-- the regular product cards) with real, boss-editable data instead of a
-- placeholder. Nullable — an unpriced product just shows no tag rather than
-- a fake $0.00.
alter table products add column price numeric(10, 2);

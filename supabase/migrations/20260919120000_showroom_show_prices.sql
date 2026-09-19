-- Factory Order Tracker — showroom "show prices" toggle
--
-- Product/variant prices have been recorded from the dashboard since day
-- one, but deliberately withheld from clients (see Product.price's comment
-- in lib/types.ts) — the showroom and order form both hard-code "Pricing
-- confirmed after review" instead. The boss now wants a switch for this
-- rather than a permanent hold, so it joins product_view_mode on the same
-- singleton settings row.
alter table showroom_settings add column show_prices boolean not null default false;

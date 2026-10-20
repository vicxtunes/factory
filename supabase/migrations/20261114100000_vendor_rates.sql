-- A vendor's prices for their services (/vendors/profile/edit → Rates), shown
-- to studios on the vendor's page and offered when they hire:
--   [{ "service": "Colour & retouch", "price": 5000, "unit": "photo" }, …]
-- Each rate is checked by vendorProfileSchema (packages/lib/vendors/core/schema.ts).

alter table vendors
  add column rates jsonb not null default '[]'
    check (jsonb_typeof(rates) = 'array' and jsonb_array_length(rates) <= 20);

-- What a vendor's service includes ("Colour & skin retouch", "Delivered in 5
-- days"): the ticks on its card (packages/ui/vendors/ServiceTiles.tsx), each
-- checked by offerSchema (packages/lib/vendors/core/schema.ts).

alter table vendor_services
  add column included text[] not null default '{}'
    check (cardinality(included) <= 8);

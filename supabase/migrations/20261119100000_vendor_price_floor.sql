-- Vendors price their services from UGX 100 (was 500): a per-photo edit can
-- cost less than 500. Checked again by offerSchema (packages/lib/vendors/core/schema.ts).

alter table vendor_services drop constraint if exists vendor_services_price_check;
alter table vendor_services add constraint vendor_services_price_check check (price between 100 and 100000000);

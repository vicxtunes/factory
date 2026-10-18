-- A vendor's answers at sign-up (/vendors/join): an individual or a business,
-- what they offer, and their social handles. Shaped by
-- packages/lib/studios (VendorProfile); null for studios and for vendors who
-- joined before.

alter table tenants add column vendor_profile jsonb;

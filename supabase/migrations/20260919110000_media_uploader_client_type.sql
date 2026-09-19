-- order_item_media.uploaded_by_type's CHECK constraint (added in
-- 20260914150000_media_uploader_ownership.sql, before the client portal
-- existed) never got the 'client' actor type added alongside
-- 'dashboard_user'/'worker'/'designer' — unlike order_notes and
-- order_audit_log, which 20260916100000_client_portal.sql updated at the
-- same time the portal was introduced. Every direct photo upload from the
-- client portal (app/client-side/order-form.tsx, components/media/
-- AddMediaButton.tsx) has been failing the order_item_media insert ever
-- since with "violates check constraint
-- order_item_media_uploaded_by_type_check" — the Storage upload itself
-- succeeds, only recording it fails, so it surfaces as "orders with media
-- upload breaking" for clients specifically.
alter table order_item_media drop constraint order_item_media_uploaded_by_type_check;
alter table order_item_media add constraint order_item_media_uploaded_by_type_check
  check (uploaded_by_type in ('dashboard_user', 'worker', 'designer', 'client'));

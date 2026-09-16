-- Factory Order Tracker — order-lifecycle notifications + client support access
--
-- 1. Two new notification_event values so app code can log "assigned to a
--    designer/worker" and "ready for delivery" the same way the existing
--    trigger already logs completed/delayed — see lib/notifications/notify.ts.
--    (Not used by any DDL in this same transaction, so the add-value is safe
--    here per Postgres's "can't use a new enum value in the same
--    transaction it was added in" rule.)
alter type notification_event add value 'assigned';
alter type notification_event add value 'ready';

-- 2. support_reports.author_type gains 'client' — the shared /support page
--    is reachable from the client portal now too (submitSupportReport /
--    getMySupportReports already resolve any actor via resolveActor()).
alter table support_reports drop constraint support_reports_author_type_check;
alter table support_reports add constraint support_reports_author_type_check
  check (author_type in ('dashboard_user', 'worker', 'designer', 'client'));

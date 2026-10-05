-- Who last downloaded each order file, so the printing team can see which
-- photos are still waiting to be downloaded (and printed) and which are done.
-- Set only when staff press Download; viewing a preview doesn't count, and
-- clients downloading their own files don't mark anything. Each download is
-- also written to order_audit_log, so earlier downloads aren't lost.
alter table order_item_media add column if not exists downloaded_at timestamptz;
alter table order_item_media add column if not exists downloaded_by_type text
  check (downloaded_by_type in ('dashboard_user', 'worker', 'designer'));
alter table order_item_media add column if not exists downloaded_by_id text;
alter table order_item_media add column if not exists downloaded_by_name text;

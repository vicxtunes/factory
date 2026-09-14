-- Track who added each media row, so only that person (or the boss) can
-- replace/delete it — same author-ownership posture as order_notes.
-- Existing rows have no recorded uploader (author_id null), so — same as
-- imported notes — nobody but the boss can touch them going forward.
alter table order_item_media add column uploaded_by_type text
  check (uploaded_by_type in ('dashboard_user', 'worker', 'designer'));
alter table order_item_media add column uploaded_by_id text;
alter table order_item_media add column uploaded_by_name text;
alter table order_item_media add column uploaded_by_role text;

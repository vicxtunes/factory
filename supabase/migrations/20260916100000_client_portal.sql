-- Factory Order Tracker — client self-service portal (/client-side)
--   Clients log in themselves (phone + self-chosen PIN, same pattern as
--   workers/designers) to browse the catalog, place their own orders, and
--   track status/history.
--
-- `clients` already has a blanket anon-read policy ("read clients" ...
-- using (true)) because client_name/email/phone are used across the app —
-- so the PIN hash must NOT live on that table, or it would be exposed to
-- anyone holding the public anon key. It goes in its own table instead,
-- with no anon/authenticated policy at all — same split as
-- workers_public/designers_public hiding pin_hash on those tables.

create table client_credentials (
  client_id  uuid primary key references clients (id) on delete cascade,
  pin_hash   text not null,
  created_at timestamptz not null default now()
);

alter table client_credentials enable row level security;
-- No select/insert/update policy: only the service-role admin client
-- (app/client-side/actions.ts) ever touches this table.

-- ---------------------------------------------------------------------------
-- Allow 'client' as a note/audit actor alongside the existing values, so a
-- client-placed order's initial notes and audit trail attribute correctly.
-- ---------------------------------------------------------------------------
alter table order_notes drop constraint order_notes_author_type_check;
alter table order_notes add constraint order_notes_author_type_check
  check (author_type in ('dashboard_user', 'worker', 'designer', 'system', 'client'));

alter table order_audit_log drop constraint order_audit_log_actor_type_check;
alter table order_audit_log add constraint order_audit_log_actor_type_check
  check (actor_type in ('dashboard_user', 'worker', 'designer', 'client'));

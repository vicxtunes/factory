-- ---------------------------------------------------------------------------
-- order_audit_log — plain-English "who did what" timeline per order, across
-- all its items. Feeds the boss-only "Show logs" button on order detail.
-- ---------------------------------------------------------------------------
create table order_audit_log (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders (id) on delete cascade,
  order_item_id uuid references order_items (id) on delete set null,
  actor_type    text not null check (actor_type in ('dashboard_user', 'worker', 'designer')),
  actor_name    text not null,
  actor_role    text,
  action        text not null,
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index order_audit_log_order_idx on order_audit_log (order_id, created_at desc);

alter table order_audit_log enable row level security;

-- Deliberately no select policy for anon/authenticated: unlike most tables in
-- this app, this one attributes mistakes to named people, so it's only ever
-- read through the service-role admin client from a boss-gated server action
-- (see requireOrderAudit()) — never through the browser anon key.

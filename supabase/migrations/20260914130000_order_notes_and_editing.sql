-- ---------------------------------------------------------------------------
-- Order provenance: who created it.
-- ---------------------------------------------------------------------------
alter table orders add column created_by_name text;
alter table orders add column created_by_role text;

-- ---------------------------------------------------------------------------
-- order_notes — append-only, per-author notes thread. Replaces the old
-- single mutable orders.order_notes / order_items.item_notes columns, whose
-- edits could silently overwrite someone else's note (e.g. the receptionist's
-- original note at intake). order_item_id null = order-level note.
-- ---------------------------------------------------------------------------
create table order_notes (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders (id) on delete cascade,
  order_item_id uuid references order_items (id) on delete cascade,
  author_type   text not null check (author_type in ('dashboard_user', 'worker', 'designer', 'system')),
  author_id     text,
  author_name   text not null,
  author_role   text,
  body          text not null,
  created_at    timestamptz not null default now()
);

create index order_notes_order_idx on order_notes (order_id, created_at);
create index order_notes_item_idx on order_notes (order_item_id, created_at);

alter table order_notes enable row level security;

create policy "read order_notes" on order_notes
  for select to anon, authenticated using (true);
-- No write policy: all writes go through the service-role admin client from
-- server actions (lib/notes/actions.ts), which enforce "only the author can
-- edit/delete their own note" in application code — author identity spans
-- three separate auth systems (dashboard/designer/worker), not something RLS
-- can express here.

-- Backfill existing notes as read-only history before dropping the old
-- columns — author_id null means these rows can never be matched as "mine"
-- by any real actor, so nobody can edit or delete them going forward. That's
-- intentional: it's exactly "never erase the original note".
insert into order_notes (order_id, order_item_id, author_type, author_id, author_name, body, created_at)
select id, null, 'system', null, 'Imported', order_notes, created_at
from orders
where order_notes is not null and order_notes != '';

insert into order_notes (order_id, order_item_id, author_type, author_id, author_name, body, created_at)
select order_id, id, 'system', null, 'Imported', item_notes, created_at
from order_items
where item_notes is not null and item_notes != '';

alter table orders drop column order_notes;
alter table order_items drop column item_notes;

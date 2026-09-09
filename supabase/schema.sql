-- Factory Order Tracker — initial schema
-- Standalone mini-system: orders + line items + workers + notifications.
-- No billing/financial data lives here by design.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type urgency as enum ('normal', 'urgent', 'rush');

create type production_status as enum (
  'not_started',
  'in_production',
  'quality_check',
  'ready_for_pickup',
  'completed'
);

create type notification_event as enum ('completed', 'delayed');

create type app_role as enum ('supervisor', 'boss');

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table orders (
  id            uuid primary key default gen_random_uuid(),
  order_no      text not null,
  client_name   text not null,
  delivery_date date,
  status        text not null default 'At Factory',
  order_notes   text,
  media_link    text,
  media_notes   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index orders_status_idx on orders (status);

create trigger orders_set_updated_at
  before update on orders
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- workers
-- ---------------------------------------------------------------------------
create table workers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  pin_hash   text not null,
  station    text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- stations — managed list backing workers.station (plain text, no FK; see
-- migration 20260905120000_stations.sql for the rationale)
-- ---------------------------------------------------------------------------
create table stations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------------
create table order_items (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references orders (id) on delete cascade,
  product              text not null,
  product_type         text,
  qty                  int not null default 1 check (qty > 0),
  size                 text,
  cover_type           text,
  lamination_type      text,
  box_type             text,
  urgency              urgency not null default 'normal',
  item_notes           text,
  production_status    production_status not null default 'not_started',
  is_delayed           boolean not null default false,
  delay_reason         text,
  assigned_worker_id   uuid references workers (id) on delete set null,
  media_link           text,
  updated_by_worker_id uuid references workers (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint delay_reason_required
    check (is_delayed = false or delay_reason is not null)
);

create index order_items_board_idx
  on order_items (production_status, urgency, order_id);
create index order_items_order_id_idx on order_items (order_id);
create index order_items_assigned_worker_idx on order_items (assigned_worker_id);

create trigger order_items_set_updated_at
  before update on order_items
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table notifications (
  id            uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items (id) on delete cascade,
  event_type    notification_event not null,
  message       text not null,
  created_at    timestamptz not null default now()
);

create index notifications_created_at_idx on notifications (created_at desc);

-- ---------------------------------------------------------------------------
-- profiles — role for Supabase Auth users (supervisor / boss)
-- ---------------------------------------------------------------------------
create table profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       app_role not null default 'boss',
  full_name  text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- workers_public — safe projection (no pin_hash) for the anon client
-- ---------------------------------------------------------------------------
create view workers_public
with (security_invoker = false) as
  select id, name, station, active
  from workers;

-- ---------------------------------------------------------------------------
-- Row Level Security
--   Reads: anon may SELECT orders / order_items / notifications (no billing
--          data here; the factory board + dashboard need live reads).
--   Writes: none for anon/authenticated — all writes go through the
--           service-role key in server actions, which bypasses RLS.
--   workers: no direct anon/authenticated access; use workers_public.
-- ---------------------------------------------------------------------------
alter table orders        enable row level security;
alter table order_items   enable row level security;
alter table notifications enable row level security;
alter table workers       enable row level security;
alter table profiles      enable row level security;
alter table stations      enable row level security;

create policy "read orders" on orders
  for select to anon, authenticated using (true);

create policy "read order_items" on order_items
  for select to anon, authenticated using (true);

create policy "read notifications" on notifications
  for select to anon, authenticated using (true);

-- authenticated (dashboard) users may read their own profile
create policy "read own profile" on profiles
  for select to authenticated using (id = (select auth.uid()));

-- workers_public view runs as owner (security_invoker = false); grant read
grant select on workers_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_items;
alter publication supabase_realtime add table notifications;
-- Factory Order Tracker — event triggers
--   1. order_items -> notifications  (completed / delayed events)
--   2. workers deactivation -> unassign their items

-- ---------------------------------------------------------------------------
-- 1. Notification on completion / delay
-- ---------------------------------------------------------------------------
create or replace function notify_on_item_change()
returns trigger
language plpgsql
as $$
declare
  v_order_no text;
begin
  select order_no into v_order_no from orders where id = new.order_id;

  if new.production_status = 'completed'
     and old.production_status is distinct from 'completed' then
    insert into notifications (order_item_id, event_type, message)
    values (
      new.id,
      'completed',
      format('Order %s, %s, marked complete', v_order_no, new.product)
    );
  end if;

  if new.is_delayed = true and old.is_delayed = false then
    insert into notifications (order_item_id, event_type, message)
    values (
      new.id,
      'delayed',
      format(
        'Order %s, %s, flagged delayed: %s',
        v_order_no, new.product, coalesce(new.delay_reason, 'no reason given')
      )
    );
  end if;

  return new;
end;
$$;

create trigger order_items_notify
  after update on order_items
  for each row execute function notify_on_item_change();

-- ---------------------------------------------------------------------------
-- 2. Unassign items when a worker is deactivated
-- ---------------------------------------------------------------------------
create or replace function unassign_items_on_worker_deactivate()
returns trigger
language plpgsql
as $$
begin
  if new.active = false and old.active = true then
    update order_items
    set assigned_worker_id = null
    where assigned_worker_id = new.id;
  end if;
  return new;
end;
$$;

create trigger workers_unassign_on_deactivate
  after update on workers
  for each row execute function unassign_items_on_worker_deactivate();
-- Factory Order Tracker — order entry overhaul (see
-- migrations/20260908120000_clients_agents_products.sql for full rationale)
--   Adds: clients, agents, product catalog (categories/products/variants),
--   generic per-category custom attributes, order-item media (Google Drive
--   uploads), auto order numbers, and order-level type/deadline/agent.

create type order_type as enum ('normal', 'express');
create type attribute_type as enum ('text', 'number', 'select');

create table clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text,
  phone      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_name_idx on clients (name);

create trigger clients_set_updated_at
  before update on clients
  for each row execute function set_updated_at();

create table agents (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table product_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table category_attributes (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references product_categories (id) on delete cascade,
  name        text not null,
  type        attribute_type not null default 'text',
  options     jsonb,
  required    boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  unique (category_id, name),
  constraint select_requires_options
    check (type <> 'select' or (options is not null and jsonb_typeof(options) = 'array'))
);

create table products (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references product_categories (id) on delete cascade,
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (category_id, name)
);

create table product_variants (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (product_id, name)
);

create index category_attributes_category_idx on category_attributes (category_id);
create index products_category_idx on products (category_id);
create index product_variants_product_idx on product_variants (product_id);

create table order_item_media (
  id            uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items (id) on delete cascade,
  file_name     text not null,
  mime_type     text,
  drive_file_id text not null,
  web_view_link text not null,
  uploaded_at   timestamptz not null default now()
);

create index order_item_media_item_idx on order_item_media (order_item_id);

create table order_number_counters (
  year       int primary key,
  last_value int not null default 0
);

create or replace function generate_order_no()
returns trigger
language plpgsql
as $$
declare
  v_year int := extract(year from now())::int;
  v_seq  int;
begin
  if new.order_no is null or btrim(new.order_no) = '' then
    insert into order_number_counters (year, last_value)
    values (v_year, 1)
    on conflict (year) do update set last_value = order_number_counters.last_value + 1
    returning last_value into v_seq;

    new.order_no := v_year || '-' || lpad(v_seq::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger orders_generate_order_no
  before insert on orders
  for each row execute function generate_order_no();

alter table orders
  add column client_id     uuid references clients (id),
  add column client_email  text,
  add column client_phone  text,
  add column agent_id      uuid references agents (id),
  add column agent_name    text,
  add column order_type    order_type not null default 'normal',
  add column deadline_at   timestamptz;

create index orders_client_idx on orders (client_id);
create index orders_agent_idx on orders (agent_id);

alter table order_items
  add column category_id uuid references product_categories (id),
  add column product_id  uuid references products (id),
  add column variant_id  uuid references product_variants (id),
  add column attributes  jsonb not null default '{}'::jsonb;

create index order_items_category_idx on order_items (category_id);
create index order_items_product_idx on order_items (product_id);

alter table clients             enable row level security;
alter table agents              enable row level security;
alter table product_categories  enable row level security;
alter table category_attributes enable row level security;
alter table products            enable row level security;
alter table product_variants    enable row level security;
alter table order_item_media    enable row level security;

create policy "read clients" on clients
  for select to anon, authenticated using (true);
create policy "read agents" on agents
  for select to anon, authenticated using (true);
create policy "read product_categories" on product_categories
  for select to anon, authenticated using (true);
create policy "read category_attributes" on category_attributes
  for select to anon, authenticated using (true);
create policy "read products" on products
  for select to anon, authenticated using (true);
create policy "read product_variants" on product_variants
  for select to anon, authenticated using (true);
create policy "read order_item_media" on order_item_media
  for select to anon, authenticated using (true);

alter publication supabase_realtime add table order_item_media;

insert into product_categories (name, sort_order) values
  ('Photo Books', 0),
  ('Prints', 1);

insert into category_attributes (category_id, name, type, options, required, sort_order)
select id, 'Size', 'select'::attribute_type, '["8x8", "10x10", "12x12"]'::jsonb, true, 0
from product_categories where name = 'Photo Books'
union all
select id, 'NOS', 'number'::attribute_type, null, true, 1
from product_categories where name = 'Photo Books'
union all
select id, 'Lamination', 'select'::attribute_type, '["Matte", "Glossy"]'::jsonb, true, 2
from product_categories where name = 'Photo Books'
union all
select id, 'Cover Type', 'select'::attribute_type, '["Pitch", "UV", "Vintage"]'::jsonb, true, 3
from product_categories where name = 'Photo Books'
union all
select id, 'Packaging', 'select'::attribute_type, '["Standard", "Vintage Plus", "Vintage X"]'::jsonb, true, 4
from product_categories where name = 'Photo Books';

insert into products (category_id, name)
select id, 'Hard Cover Photo Book' from product_categories where name = 'Photo Books'
union all
select id, '4x6 Prints' from product_categories where name = 'Prints';

insert into product_variants (product_id, name)
select id, 'Standard' from products where name = 'Hard Cover Photo Book'
union all
select id, 'Premium' from products where name = 'Hard Cover Photo Book';
-- Factory Order Tracker — receptionist as manager + graphics designer routing
--   1. `receptionist` becomes a full dashboard role (Supabase Auth), with the
--      same CRUD permissions as `supervisor` — she's the order initiator and
--      needs to manage the same catalog/worker/designer entities. The /intake
--      shared-PIN surface is retired entirely; order entry moves into the
--      dashboard.
--   2. `designers` — graphic designers, managed by the receptionist/
--      supervisor, name + personal PIN login (same pattern as `workers`), on
--      a new /graphics screen.
--   3. Orders gain a `stage`: at creation time, the initiator decides whether
--      an order goes straight to the factory or to a specific designer first
--      (with an optional brief). A designer marks their work done, which
--      auto-forwards the order to the factory. `assigned_designer_id` +
--      `designer_name` follow the same FK-plus-denormalized-snapshot pattern
--      already used for `agent_id`/`agent_name`.

alter type app_role add value 'receptionist';

create type order_stage as enum ('with_designer', 'factory');

-- ---------------------------------------------------------------------------
-- designers
-- ---------------------------------------------------------------------------
create table designers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  pin_hash   text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create view designers_public
with (security_invoker = false) as
  select id, name, active
  from designers;

alter table designers enable row level security;
-- No anon/authenticated policies: managed via the service-role client in
-- dashboard server actions only, same as `workers`.

grant select on designers_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- orders — routing
-- ---------------------------------------------------------------------------
alter table orders
  add column stage               order_stage not null default 'factory',
  add column assigned_designer_id uuid references designers (id) on delete set null,
  add column designer_name       text,
  add column designer_brief      text;

create index orders_stage_idx    on orders (stage);
create index orders_designer_idx on orders (assigned_designer_id);

-- ---------------------------------------------------------------------------
-- Unassign a designer's in-progress orders when they're deactivated — same
-- rationale as unassign_items_on_worker_deactivate(). Only touches orders
-- still awaiting design work; finished ones keep their historical
-- assigned_designer_id/designer_name.
-- ---------------------------------------------------------------------------
create or replace function unassign_orders_on_designer_deactivate()
returns trigger
language plpgsql
as $$
begin
  if new.active = false and old.active = true then
    update orders
    set assigned_designer_id = null
    where assigned_designer_id = new.id
      and stage = 'with_designer';
  end if;
  return new;
end;
$$;

create trigger designers_unassign_on_deactivate
  after update on designers
  for each row execute function unassign_orders_on_designer_deactivate();
-- Factory Order Tracker — switch order/item media from Google Drive to
-- Cloudinary. The GCP organization enforces iam.disableServiceAccountKeyCreation,
-- which blocks minting the service-account key the Drive integration needed;
-- Cloudinary's signed-upload model needs no such key and organizes uploads
-- into virtual folders without a pre-creation round-trip, so the column
-- names change to match what Cloudinary's API actually returns.

alter table order_item_media rename column drive_file_id to cloudinary_public_id;
alter table order_item_media rename column web_view_link  to secure_url;
-- Factory Order Tracker — allow order_item_media rows for pasted links
-- (Drive/Dropbox/etc.), not just direct Cloudinary uploads. A pasted link
-- has no Cloudinary asset behind it, so cloudinary_public_id must be
-- nullable; secure_url still holds the link itself either way.

alter table order_item_media alter column cloudinary_public_id drop not null;
-- Factory Order Tracker — move "stage" from purely order-level to
-- item-level. A designer can now send finished items to the factory one at
-- a time while still working the rest of the order, instead of only being
-- able to release the whole order at once. orders.stage is kept (now means
-- "has the designer fully released every item yet") so the order stays on
-- the designer's board, and the existing "with designer" banners, until
-- every item has moved — see app/graphics/actions.ts.

alter table order_items add column stage order_stage not null default 'factory';

update order_items oi
set stage = o.stage
from orders o
where oi.order_id = o.id;

create index order_items_stage_idx on order_items (stage);

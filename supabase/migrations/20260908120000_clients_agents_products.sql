-- Factory Order Tracker — order entry overhaul
--   Adds: clients, agents, product catalog (categories/products/variants),
--   generic per-category custom attributes, order-item media (Google Drive
--   uploads), auto order numbers, and order-level type/deadline/agent.
--
-- Design: every new lookup table is referenced from orders/order_items by a
-- nullable FK (for lookups/reporting) *and* a denormalized snapshot captured
-- at order-creation time, so renaming/deactivating a catalog entry later
-- never rewrites or breaks a historical order's display. Category attribute
-- values are snapshotted onto order_items as {name: value} pairs keyed by
-- attribute *name*, not id, so editing the attribute catalog later never
-- corrupts past orders.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type order_type as enum ('normal', 'express');
create type attribute_type as enum ('text', 'number', 'select');

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- agents — sales/referral agents, distinct from production `workers`
-- ---------------------------------------------------------------------------
create table agents (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- product catalog: categories -> products -> variants, plus a generic
-- per-category attribute builder (not hardcoded — e.g. Photo Book's
-- Size/NOS/Lamination/Cover Type/Packaging are rows here, not columns).
-- ---------------------------------------------------------------------------
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
  options     jsonb, -- array of strings; required/used when type = 'select'
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

-- ---------------------------------------------------------------------------
-- order_item_media — uploaded Drive files per item (replaces pasted links
-- for new orders; legacy media_link/media_notes stay for historical orders)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- auto order numbers — "{year}-{seq}", matches the existing "2026-3956" style
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- orders — client/agent linkage, order type, deadline
-- ---------------------------------------------------------------------------
alter table orders
  add column client_id     uuid references clients (id),
  add column client_email  text,
  add column client_phone  text,
  add column agent_id      uuid references agents (id),
  add column agent_name    text,
  add column order_type    order_type not null default 'normal',
  add column deadline_at   timestamptz;

-- order_no stays `not null`: the before-insert trigger fills it from NEW
-- before Postgres checks the constraint, so omitting it from an insert is
-- fine as long as the trigger runs (which it always does).

create index orders_client_idx on orders (client_id);
create index orders_agent_idx on orders (agent_id);

-- ---------------------------------------------------------------------------
-- order_items — catalog linkage + generic attributes
-- ---------------------------------------------------------------------------
alter table order_items
  add column category_id uuid references product_categories (id),
  add column product_id  uuid references products (id),
  add column variant_id  uuid references product_variants (id),
  add column attributes  jsonb not null default '{}'::jsonb;

create index order_items_category_idx on order_items (category_id);
create index order_items_product_idx on order_items (product_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — same posture as orders/order_items: anon +
-- authenticated may read (closed factory-intranet tool, no anonymous public
-- access to this app at all); all writes go through the service-role client.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Realtime — item media should show up live on factory/dashboard views
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table order_item_media;

-- ---------------------------------------------------------------------------
-- Seed: Photo Book category with its custom attributes, plus a plain
-- category with none, so the generic attribute builder path is proven for
-- both cases. Editable/removable from the dashboard afterwards.
-- ---------------------------------------------------------------------------
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

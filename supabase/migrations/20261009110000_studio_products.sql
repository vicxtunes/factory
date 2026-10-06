-- Studio products (see packages/lib/offerings/README.md and
-- packages/lib/product-requests/README.md): a studio keeps products
-- (photobooks, frames…) the way it keeps services: categories of their own,
-- each product with its sizes as its packages. A product is the studio's
-- own, or picked from Aming's catalog: then its name, photos, video and
-- sizes are Aming's, and the studio sets its prices and description and may
-- leave some of Aming's photos out. Clients ask for one online ("Order
-- now"); the studio confirms (its invoice is made) or declines.

-- What a category holds: services (booked) or products (ordered). Every
-- category so far holds services.
alter table offering_categories
  add column kind text not null default 'service' check (kind in ('service', 'product')),
  add constraint offering_categories_tenant_id_kind_key unique (tenant_id, id, kind);

-- Two active categories of the same kind can't share a name.
drop index offering_categories_tenant_active_name;
create unique index offering_categories_tenant_active_name on offering_categories (tenant_id, kind, lower(name)) where archived_at is null;

alter table offering_services
  -- Always its category's kind (the key below).
  add column kind text not null default 'service' check (kind in ('service', 'product')),
  -- The Aming product it was picked from; null for the studio's own.
  add column source_product_id uuid references products (id),
  -- Of a picked product: Aming's photos and videos it leaves out ('cover', 'video', or a product_media id).
  add column hidden_media text[] not null default '{}',
  add constraint offering_services_picked_is_product check (source_product_id is null or kind = 'product'),
  drop constraint offering_services_category_fkey,
  add constraint offering_services_category_fkey foreign key (tenant_id, category_id, kind)
    references offering_categories (tenant_id, id, kind) on delete restrict on update cascade;

-- A studio picks each Aming product once among what's on sale.
create unique index offering_services_picked_once on offering_services (tenant_id, source_product_id)
  where source_product_id is not null and archived_at is null;

-- A product asked for online, for the studio to confirm (its invoice is
-- made) or decline. The size's name and price are copied, so editing the
-- product later never changes a request.
create table product_requests (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants (id) on delete restrict,
  customer_id  uuid not null,
  offering_id  uuid not null,
  item_name    text not null check (char_length(item_name) <= 200),
  quantity     int not null check (quantity between 1 and 99),
  unit_price   bigint not null check (unit_price >= 0),
  status       text not null default 'requested' check (status in ('requested', 'confirmed', 'declined')),
  -- The invoice made when it was confirmed.
  invoice_id   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- The client, size and invoice are always this studio's own.
  foreign key (tenant_id, customer_id) references customers (tenant_id, id) on delete restrict,
  foreign key (tenant_id, offering_id) references offerings (tenant_id, id) on delete restrict,
  foreign key (tenant_id, invoice_id) references billing_documents (tenant_id, id) on delete restrict
);

create index product_requests_customer on product_requests (tenant_id, customer_id);
create index product_requests_open on product_requests (tenant_id) where status = 'requested';
create unique index product_requests_one_per_invoice on product_requests (invoice_id) where invoice_id is not null;

create trigger product_requests_set_updated_at
  before update on product_requests
  for each row execute function set_updated_at();

-- Server (service role) only; every query filters by the caller's studio.
alter table product_requests enable row level security;
revoke all on table product_requests from anon, authenticated;

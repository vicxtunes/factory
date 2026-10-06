-- Service categories and studio showroom settings (see
-- packages/lib/offerings/README.md): a studio manages its services the way
-- Aming manages products: categories ("Weddings", "Portraits"…) holding
-- services, each with its packages; and decides whether its showroom shows
-- prices and whether a service's page uses the 3D scene or a carousel.

create table offering_categories (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants (id) on delete restrict,
  name         text not null check (nullif(trim(name), '') is not null and char_length(name) <= 60),
  -- The showroom's order, smallest first.
  position     int not null default 0,
  -- Deactivated instead of deleted: its services are kept.
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, id)
);

-- Two active categories can't share a name.
create unique index offering_categories_tenant_active_name on offering_categories (tenant_id, lower(name)) where archived_at is null;

create trigger offering_categories_set_updated_at
  before update on offering_categories
  for each row execute function set_updated_at();

-- Server (service role) only; every query filters by the caller's studio.
alter table offering_categories enable row level security;
revoke all on table offering_categories from anon, authenticated;

-- Every studio's existing services go in a first category, "Services", to
-- rename or split up from there.
insert into offering_categories (tenant_id, name, position)
select distinct tenant_id, 'Services', 1 from offering_services;

alter table offering_services add column category_id uuid;

update offering_services s
   set category_id = c.id
  from offering_categories c
 where c.tenant_id = s.tenant_id;

alter table offering_services
  alter column category_id set not null,
  -- A service and its category always belong to the same studio.
  add constraint offering_services_category_fkey foreign key (tenant_id, category_id) references offering_categories (tenant_id, id) on delete restrict;

create index offering_services_category on offering_services (category_id);

-- A studio's showroom settings. No row = the defaults.
create table offering_settings (
  tenant_id    uuid primary key references tenants (id) on delete cascade,
  -- Off: the showroom says "Price on request" instead of package prices.
  show_prices  boolean not null default true,
  -- A service's page: the scroll-driven 3D scene or a photo/video carousel.
  view_mode    text not null default 'scene' check (view_mode in ('scene', 'carousel')),
  updated_at   timestamptz not null default now()
);

create trigger offering_settings_set_updated_at
  before update on offering_settings
  for each row execute function set_updated_at();

alter table offering_settings enable row level security;
revoke all on table offering_settings from anon, authenticated;

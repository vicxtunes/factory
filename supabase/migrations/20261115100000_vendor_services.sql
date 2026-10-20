-- A vendor's services (/vendors/services): each with what it is, its price
-- (or on request) and samples of their work, pictures in the photo bucket
-- under vendors/{vendor}/samples/. Studios see them on the vendor's page and
-- can hire at one; the samples fill the profile's Work tab. They replace the
-- rates list (20261114100000): any rate listed becomes a service.

create table vendor_services (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    uuid not null references vendors (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  description  text check (char_length(description) <= 500),
  -- UGX per unit (packages/lib/vendors/core/rates.ts); both null: on request.
  price        bigint check (price between 500 and 100000000),
  unit         text check (unit in ('photo', 'video', 'hour', 'day', 'event', 'item', 'project')),
  created_at   timestamptz not null default now(),
  check ((price is null) = (unit is null))
);

create index vendor_services_vendor_idx on vendor_services (vendor_id, created_at);

create table vendor_service_samples (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references vendor_services (id) on delete cascade,
  vendor_id   uuid not null references vendors (id) on delete cascade,
  key         text not null unique check (char_length(key) <= 300),
  created_at  timestamptz not null default now()
);

create index vendor_service_samples_service_idx on vendor_service_samples (service_id, created_at);

alter table vendor_services enable row level security;
alter table vendor_service_samples enable row level security;
revoke all on table vendor_services from anon, authenticated;
revoke all on table vendor_service_samples from anon, authenticated;

insert into vendor_services (vendor_id, name, price, unit)
select v.id, left(r->>'service', 60), (r->>'price')::bigint, r->>'unit'
  from vendors v, jsonb_array_elements(v.rates) r;

alter table vendors drop column rates;

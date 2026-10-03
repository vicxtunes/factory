-- Bookings: a studio's shoots and sessions on its calendar (My Business,
-- Phase 5a; see packages/lib/bookings/README.md).
--
-- A booking is a client, a day, an optional time span, a place and what was
-- agreed. Days and times are the studio's local calendar day and clock time,
-- stored as such (date, time), so nothing shifts between time zones.
-- An accepted quotation can be booked with one tap (one booking each).

-- Same-studio references, enforced by the database: a booking can only point
-- at its own studio's client and quotation (composite keys below).
alter table customers add constraint customers_tenant_id_key unique (tenant_id, id);
alter table billing_documents add constraint billing_documents_tenant_id_key unique (tenant_id, id);

create table bookings (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants (id) on delete restrict,
  customer_id   uuid not null,
  title         text not null check (nullif(trim(title), '') is not null and char_length(title) <= 120),
  -- The day, and the time span on it; no times = all day.
  starts_on     date not null,
  start_time    time,
  end_time      time,
  location      text check (char_length(location) <= 200),
  -- What was agreed: a package's name (copied) and the amount.
  package_name  text check (char_length(package_name) <= 200),
  amount        bigint check (amount >= 0),
  notes         text check (char_length(notes) <= 2000),
  status        text not null default 'tentative' check (status in ('tentative', 'confirmed', 'completed', 'cancelled')),
  -- The accepted quotation it was booked from, if any.
  quotation_id  uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (tenant_id, customer_id) references customers (tenant_id, id) on delete restrict,
  foreign key (tenant_id, quotation_id) references billing_documents (tenant_id, id) on delete restrict,
  check ((start_time is null) = (end_time is null)),
  check (end_time is null or end_time > start_time)
);

create unique index bookings_one_per_quotation on bookings (quotation_id) where quotation_id is not null;
create index bookings_tenant_day on bookings (tenant_id, starts_on);
create index bookings_customer on bookings (tenant_id, customer_id);

create trigger bookings_set_updated_at
  before update on bookings
  for each row execute function set_updated_at();

-- Server (service role) only; every query filters by the caller's studio.
alter table bookings enable row level security;
revoke all on table bookings from anon, authenticated;

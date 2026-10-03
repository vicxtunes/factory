-- Offerings: a studio's packages and services (My Business, Phase 3; see
-- packages/lib/offerings/README.md).
--
-- What a business sells, priced in its own currency. Quotations and bookings
-- will copy an offering's name, price and inclusions when they use it, so
-- editing an offering never changes something already sent. Like every
-- table a studio owns, tenant_id has NO default.

create table offerings (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants (id) on delete restrict,
  kind         text not null check (kind in ('package', 'service')),
  name         text not null check (nullif(trim(name), '') is not null and char_length(name) <= 80),
  description  text check (char_length(description) <= 1000),
  -- Whole units of the tenant's currency.
  price        bigint not null check (price >= 0),
  -- What a package includes, one short line each ("300 edited photos").
  inclusions   text[] not null default '{}' check (cardinality(inclusions) <= 30),
  -- Archived instead of deleted: quotations will refer to offerings.
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Two things on sale can't share a name (archived ones don't count).
create unique index offerings_tenant_active_name on offerings (tenant_id, lower(name)) where archived_at is null;

create trigger offerings_set_updated_at
  before update on offerings
  for each row execute function set_updated_at();

-- Server (service role) only; every query filters by the caller's studio.
alter table offerings enable row level security;
revoke all on table offerings from anon, authenticated;

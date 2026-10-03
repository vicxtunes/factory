-- Customers (My Business, Phase 2; see packages/lib/customers/README.md).
--
-- A studio's own customers: the people it photographs, quotes and invoices.
-- Every row belongs to one tenant (a studio). tenant_id deliberately has NO
-- default: code that forgets to name the studio fails here instead of
-- quietly filing the customer under Aming.

create table customers (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants (id) on delete restrict,
  name         text not null check (nullif(trim(name), '') is not null and char_length(name) <= 120),
  -- One stored form per number (0772… for Uganda, +… otherwise; packages/lib/kernel/core/phone.ts).
  phone        text check (char_length(phone) <= 20),
  email        text check (char_length(email) <= 120),
  notes        text check (char_length(notes) <= 2000),
  -- Archived instead of deleted: quotations and invoices will refer to customers.
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One profile per person: a number is saved once per studio.
create unique index customers_tenant_phone on customers (tenant_id, phone) where phone is not null;
create index customers_tenant_name on customers (tenant_id, lower(name));

create trigger customers_set_updated_at
  before update on customers
  for each row execute function set_updated_at();

-- Server (service role) only. Studio separation is enforced there: every
-- query filters by the caller's studio (packages/lib/customers).
alter table customers enable row level security;
revoke all on table customers from anon, authenticated;

-- Tenancy foundation (see lib/tenancy/README.md).
--
-- The system is heading for multi-tenant on one shared database: each
-- business (tenant) gets its rows tagged with tenant_id. This migration only
-- lays the ground: the tenants table, this business as the default tenant,
-- and default_tenant_id() for new tables and views to use.
--
-- Existing tables are deliberately NOT given tenant_id here. Adding it to
-- orders, clients, … is the real multi-tenant migration. Until then, new
-- tenant-aware tables default their tenant_id to the default tenant, and
-- read-only views report default_tenant_id() as their tenant.

create table tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (nullif(trim(name), '') is not null),
  -- ISO 4217. Amounts are stored in whole units of this currency (UGX has no minor unit).
  currency    text not null default 'UGX' check (currency ~ '^[A-Z]{3}$'),
  -- BCP 47, for number and date formatting.
  locale      text not null default 'en-UG',
  -- IANA zone: decides where "this month" starts and ends for reports.
  time_zone   text not null default 'Africa/Kampala',
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Exactly one default tenant at most.
create unique index tenants_one_default on tenants (is_default) where is_default;

-- Service-role only, like the money tables.
alter table tenants enable row level security;

-- This business.
insert into tenants (name, is_default) values ('AMING', true);

-- The tenant that rows without an explicit tenant belong to. Stable within a
-- statement, so views and column defaults can call it freely.
create or replace function default_tenant_id()
returns uuid
language sql
stable
as $$
  select id from tenants where is_default;
$$;

revoke all on function default_tenant_id() from public, anon, authenticated;

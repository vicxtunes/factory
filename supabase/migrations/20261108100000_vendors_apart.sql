-- Vendors are their own thing, not a kind of business. A vendor is someone
-- offering their services to photographers (a photo editor, a videographer,
-- a decorator…), with their own side of Aming (/vendors), not a business
-- with a studio's set-up and review (packages/lib/vendors). Undoes
-- 20261106100000_vendors.sql's "a business is a studio or a vendor".

-- ── Vendors ────────────────────────────────────────────────────────────────

create table vendors (
  id         uuid primary key default gen_random_uuid(),
  -- Their Aming account: one vendor per account.
  client_id  uuid not null unique references clients (id) on delete restrict,
  -- Their own name, or their business's.
  name       text not null check (char_length(name) between 1 and 100),
  -- A freelancer on their own, or a company or team.
  kind       text not null check (kind in ('individual', 'business')),
  -- What they do ("photo_editor", "videographer", …): the list lives in the
  -- app (packages/lib/vendors/core/categories.ts), so it grows without a migration.
  category   text not null check (category ~ '^[a-z_]{2,40}$'),
  -- What they offer, from the category's list or their own words.
  skills     text[] not null default '{}' check (cardinality(skills) <= 12),
  -- Plain handles by network ({"instagram": "kato.films", "website": "kato.ug"}).
  socials    jsonb not null default '{}' check (jsonb_typeof(socials) = 'object'),
  status     text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

-- The server only (service role).
alter table vendors enable row level security;

-- Vendors who joined as businesses (20261106100000) move here. Checked
-- beforehand: the one there is (a test) has no records in any business table.
insert into vendors (client_id, name, kind, category, skills, socials, created_at)
select t.owner_client_id,
       t.name,
       coalesce(t.vendor_profile ->> 'as', 'individual'),
       t.vendor_category,
       coalesce(array(select jsonb_array_elements_text(t.vendor_profile -> 'skills')), '{}'),
       coalesce(t.vendor_profile -> 'socials', '{}'),
       t.created_at
  from tenants t
 where t.kind = 'vendor';

delete from tenants where kind = 'vendor';

-- ── Businesses are studios again ───────────────────────────────────────────

-- Aming's fee on a business's customer payments (provider_collection_settle).
create or replace function business_fee_percent(p_tenant uuid)
returns int
language sql
stable
as $$
  select 5;
$$;

drop index tenants_one_kind_per_owner;
alter table tenants
  drop constraint tenants_vendor_category,
  drop column vendor_profile,
  drop column vendor_category,
  drop column kind;
-- One business per account, as before 20261106100000.
create unique index tenants_one_per_owner on tenants (owner_client_id) where owner_client_id is not null;

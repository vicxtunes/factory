-- Team access with levels and roles (owner, 2026-11-13): a business's owner
-- gives each team member none, view or manage on each area (bookings,
-- projects, clients, money, catalog, files). A role (the business's own,
-- editable: Manager, Accounts, Tasks only to start) gives a starting set, and
-- the owner can change single areas for one member on top of it. Members keep
-- exactly what they had: each area they were given becomes manage, on no role.
-- See packages/lib/team/core/access.ts.

create table team_access_roles (
  tenant_id  uuid not null references tenants (id) on delete restrict,
  id         uuid not null default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 40),
  -- {"money": "manage", "clients": "view"}; an area left out is none.
  access     jsonb not null default '{}'::jsonb check (jsonb_typeof(access) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id)
);
create unique index team_access_roles_name on team_access_roles (tenant_id, lower(btrim(name)));
alter table team_access_roles enable row level security;

alter table team_members
  -- Their role (none: only what's set for them below).
  add column access_role_id uuid,
  -- Their own areas, over the role's.
  add column access_levels jsonb not null default '{}'::jsonb check (jsonb_typeof(access_levels) = 'object'),
  -- A role of their own business only; one in use can't be deleted.
  add constraint team_members_access_role foreign key (tenant_id, access_role_id) references team_access_roles (tenant_id, id) on delete restrict;

update team_members
  set access_levels = coalesce((select jsonb_object_agg(a, 'manage') from unnest(access) as a), '{}'::jsonb)
  where cardinality(access) > 0;

alter table team_members drop constraint team_members_access_check;
alter table team_members drop column access;

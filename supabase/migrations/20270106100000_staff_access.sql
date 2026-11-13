-- Team & access (owner, 2026-11-13): the boss decides what each staff member
-- may use, section by section (none, view or manage). A role gives a starting
-- set the boss can edit; Receptionist and Supervisor are roles like any other,
-- set here to exactly what they could do before, so nothing changes on
-- release. The boss can add roles, change one person's sections on top of
-- their role, and suspend or restore a sign-in. The boss always has
-- everything. See packages/lib/staff-access.

-- A role's sections: {"orders": "manage", "clients": "view", ...}; a section
-- left out is none. Checked again by the app (packages/lib/staff-access/core.ts).
create table staff_roles (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 40),
  -- The two roles that existed before: kept (never deleted), still editable.
  built_in   text unique check (built_in in ('receptionist', 'supervisor')),
  access     jsonb not null default '{}'::jsonb check (jsonb_typeof(access) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index staff_roles_name on staff_roles (lower(btrim(name)));
alter table staff_roles enable row level security;

insert into staff_roles (name, built_in, access) values
  ('Receptionist', 'receptionist', '{
     "orders": "manage", "invoices": "manage", "wallets": "manage",
     "workers": "manage", "designers": "view", "stations": "view",
     "catalog": "view", "carousel": "view", "discounts": "view", "announcements": "manage",
     "clients": "manage", "agents": "view"
   }'::jsonb),
  ('Supervisor', 'supervisor', '{
     "orders": "manage", "production": "manage",
     "workers": "manage", "worker_logins": "manage", "designers": "view", "stations": "view",
     "announcements": "manage"
   }'::jsonb);

-- profiles.role now only says boss or not: 'staff' is anyone on a role the
-- boss made; receptionists and supervisors keep their old value.
alter type app_role add value if not exists 'staff';

alter table profiles
  -- Everyone but the boss works under a role.
  add column staff_role_id uuid references staff_roles (id) on delete restrict,
  -- This person's own sections, over their role's: {"expenses": "view"}.
  add column access_overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(access_overrides) = 'object'),
  -- A suspended sign-in is refused at once and on every page; their history stays.
  add column suspended_at timestamptz,
  add column suspended_by_name text;

update profiles p set staff_role_id = r.id
  from staff_roles r
  where r.built_in = p.role::text;

-- Who changed whose access, and when: shown on Team & access → History.
create table staff_access_log (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz not null default now(),
  by_id       uuid,
  by_name     text not null,
  -- The person or role it was about (the name is kept: they may be removed later).
  person_id   uuid,
  about       text not null,
  what        text not null
);
create index staff_access_log_at on staff_access_log (at desc);
alter table staff_access_log enable row level security;

-- Team and tasks (My Business, Phase 5c; see packages/lib/team/README.md and
-- packages/lib/tasks/README.md).
--
-- A studio's team members (no logins yet: a list to assign work to) and the
-- tasks on its projects. References are same-studio by composite keys, so
-- the database refuses another studio's project or team member.

create table team_members (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants (id) on delete restrict,
  name         text not null check (nullif(trim(name), '') is not null and char_length(name) <= 120),
  -- One stored form per number (packages/lib/kernel/core/phone.ts).
  phone        text check (char_length(phone) <= 20),
  -- What they do: "Second shooter", "Editor", …
  role         text check (char_length(role) <= 60),
  -- Archived instead of deleted: tasks keep who did them.
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, id)
);

create index team_members_tenant on team_members (tenant_id);

create trigger team_members_set_updated_at
  before update on team_members
  for each row execute function set_updated_at();

create table tasks (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants (id) on delete restrict,
  project_id   uuid not null,
  title        text not null check (nullif(trim(title), '') is not null and char_length(title) <= 200),
  assignee_id  uuid,
  -- A calendar day in the studio's time zone; open after it = overdue.
  due_on       date,
  priority     text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status       text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  done_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (tenant_id, project_id) references projects (tenant_id, id) on delete cascade,
  foreign key (tenant_id, assignee_id) references team_members (tenant_id, id) on delete restrict,
  check ((status = 'done') = (done_at is not null))
);

create index tasks_tenant_open on tasks (tenant_id, status, due_on);
create index tasks_project on tasks (project_id);
create index tasks_assignee on tasks (tenant_id, assignee_id);

create trigger tasks_set_updated_at
  before update on tasks
  for each row execute function set_updated_at();

-- Server (service role) only; every query filters by the caller's studio.
alter table team_members enable row level security;
alter table tasks enable row level security;
revoke all on table team_members, tasks from anon, authenticated;

-- Projects: a studio's work from a confirmed booking to delivery (My
-- Business, Phase 5b; see packages/lib/projects/README.md).
--
-- A project moves Booked → In progress → Editing → Review → Delivered →
-- Completed. Every change is kept in project_events (the activity history),
-- written in the same transaction as the change.

-- Same-studio references, enforced by the database (as bookings do).
alter table bookings add constraint bookings_tenant_id_key unique (tenant_id, id);

create table projects (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants (id) on delete restrict,
  customer_id  uuid not null,
  -- The booking it was started from, if any; one project per booking.
  booking_id   uuid,
  title        text not null check (nullif(trim(title), '') is not null and char_length(title) <= 120),
  -- The shoot or event day, in the studio's calendar.
  event_date   date,
  notes        text check (char_length(notes) <= 4000),
  status       text not null default 'booked'
               check (status in ('booked', 'in_progress', 'editing', 'review', 'delivered', 'completed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, customer_id) references customers (tenant_id, id) on delete restrict,
  foreign key (tenant_id, booking_id) references bookings (tenant_id, id) on delete restrict
);

create unique index projects_one_per_booking on projects (booking_id) where booking_id is not null;
create index projects_tenant_status on projects (tenant_id, status);
create index projects_customer on projects (tenant_id, customer_id);

create trigger projects_set_updated_at
  before update on projects
  for each row execute function set_updated_at();

-- What happened to a project, newest last. Never updated or deleted by the app.
create table project_events (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants (id) on delete restrict,
  project_id   uuid not null,
  kind         text not null check (kind in ('created', 'status')),
  from_status  text,
  to_status    text,
  -- Who did it, as they were named then.
  actor_name   text not null check (char_length(actor_name) <= 120),
  created_at   timestamptz not null default now(),
  foreign key (tenant_id, project_id) references projects (tenant_id, id) on delete cascade
);

create index project_events_project on project_events (project_id, created_at);

-- Creates a project and its "created" event together. Returns its id.
-- Errors: PROJECTS:already_started (that booking already has a project).
create or replace function projects_create(
  p_tenant uuid, p_customer uuid, p_booking uuid, p_title text, p_event_date date, p_notes text, p_actor text
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if p_booking is not null and exists (select 1 from projects where booking_id = p_booking) then
    raise exception 'PROJECTS:already_started';
  end if;
  insert into projects (tenant_id, customer_id, booking_id, title, event_date, notes)
  values (p_tenant, p_customer, p_booking, p_title, p_event_date, p_notes)
  returning id into v_id;
  insert into project_events (tenant_id, project_id, kind, to_status, actor_name)
  values (p_tenant, v_id, 'created', 'booked', p_actor);
  return v_id;
end;
$$;

-- Moves a project from p_from to p_to, only if it's still at p_from, and logs
-- it. Returns false when it wasn't (someone else moved it first).
create or replace function projects_set_status(p_tenant uuid, p_project uuid, p_from text, p_to text, p_actor text)
returns boolean
language plpgsql
as $$
begin
  update projects set status = p_to where id = p_project and tenant_id = p_tenant and status = p_from;
  if not found then
    return false;
  end if;
  insert into project_events (tenant_id, project_id, kind, from_status, to_status, actor_name)
  values (p_tenant, p_project, 'status', p_from, p_to, p_actor);
  return true;
end;
$$;

-- Server (service role) only; every query filters by the caller's studio.
alter table projects enable row level security;
alter table project_events enable row level security;
revoke all on table projects, project_events from anon, authenticated;
revoke all on function projects_create(uuid, uuid, uuid, text, date, text, text) from public, anon, authenticated;
revoke all on function projects_set_status(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function projects_create(uuid, uuid, uuid, text, date, text, text) to service_role;
grant execute on function projects_set_status(uuid, uuid, text, text, text) to service_role;

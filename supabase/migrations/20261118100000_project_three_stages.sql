-- Projects in three stages instead of six (packages/lib/projects/core):
--   upcoming     was booked
--   in_progress  was in_progress, editing, review and delivered
--   done         was completed
-- Projects and their history are mapped; a history line that maps to the
-- same stage both sides (editing → review) stays, and the app leaves it out.

do $$
declare
  v_name text;
begin
  for v_name in
    select c.conname from pg_constraint c
     where c.conrelid = 'projects'::regclass and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%editing%'
  loop
    execute format('alter table projects drop constraint %I', v_name);
  end loop;
end;
$$;

create or replace function project_stage(p_status text)
returns text
language sql
immutable
as $$
  select case p_status
    when 'booked' then 'upcoming'
    when 'completed' then 'done'
    when 'upcoming' then 'upcoming'
    when 'done' then 'done'
    else 'in_progress'
  end;
$$;

update projects set status = project_stage(status);
update project_events
   set from_status = case when from_status is null then null else project_stage(from_status) end,
       to_status   = case when to_status is null then null else project_stage(to_status) end;

drop function project_stage(text);

alter table projects
  alter column status set default 'upcoming',
  add constraint projects_status_check check (status in ('upcoming', 'in_progress', 'done'));

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
  values (p_tenant, v_id, 'created', 'upcoming', p_actor);
  return v_id;
end;
$$;

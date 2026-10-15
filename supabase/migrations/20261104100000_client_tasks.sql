-- Tasks for clients, and choosing photos (see packages/lib/tasks/README.md →
-- "Tasks for clients" and packages/lib/files/README.md → "Choosing").
--
-- A task can now be given to the project's client instead of a team member,
-- and be one of three kinds: a to-do, "choose" (pick between pick_min and
-- pick_max files in its folder, then submit) or "feedback" (comment on the
-- files in its folder, then say done). A task's folder is where the work is;
-- deleting the folder leaves the task without one.

alter table tasks add constraint tasks_tenant_id_key unique (tenant_id, id);

alter table tasks
  add column customer_id uuid,
  add column kind text not null default 'todo' check (kind in ('todo', 'choose', 'feedback')),
  add column folder_id uuid,
  add column pick_min int check (pick_min >= 0),
  add column pick_max int check (pick_max between 1 and 10000),
  add constraint tasks_customer_fkey foreign key (tenant_id, customer_id) references customers (tenant_id, id) on delete cascade,
  add constraint tasks_folder_fkey foreign key (tenant_id, folder_id) references file_folders (tenant_id, id) on delete set null (folder_id),
  -- Given to a team member or to the client, never both.
  add constraint tasks_one_assignee check (assignee_id is null or customer_id is null),
  -- Only a "choose" task has picks, and its least is at most its most.
  add constraint tasks_picks check ((kind = 'choose') = (pick_max is not null) and (pick_min is null or pick_min <= pick_max));

create index tasks_customer on tasks (tenant_id, customer_id) where customer_id is not null;

-- What was picked in a "choose" task.
create table file_picks (
  tenant_id   uuid not null references tenants (id) on delete restrict,
  task_id     uuid not null,
  file_id     uuid not null,
  created_at  timestamptz not null default now(),
  primary key (task_id, file_id),
  foreign key (tenant_id, task_id) references tasks (tenant_id, id) on delete cascade,
  foreign key (tenant_id, file_id) references files (tenant_id, id) on delete cascade
);

alter table file_picks enable row level security;
revoke all on table file_picks from anon, authenticated;

-- Picks (or unpicks) a file in a "choose" task that's still open, never
-- beyond its most: the task's row is locked, so two taps at once can't both
-- squeeze in. Returns how many are picked now.
-- Errors: FILES:no_task, FILES:task_done, FILES:too_many.
create or replace function files_pick(p_tenant uuid, p_task uuid, p_file uuid, p_picked boolean)
returns int
language plpgsql
as $$
declare
  v_task record;
  v_count int;
begin
  select kind, status, pick_max into v_task from tasks where tenant_id = p_tenant and id = p_task for update;
  if not found or v_task.kind <> 'choose' then
    raise exception 'FILES:no_task';
  end if;
  if v_task.status = 'done' then
    raise exception 'FILES:task_done';
  end if;
  if p_picked then
    select count(*) into v_count from file_picks where task_id = p_task;
    if v_count >= v_task.pick_max and not exists (select 1 from file_picks where task_id = p_task and file_id = p_file) then
      raise exception 'FILES:too_many';
    end if;
    insert into file_picks (tenant_id, task_id, file_id) values (p_tenant, p_task, p_file) on conflict do nothing;
  else
    delete from file_picks where tenant_id = p_tenant and task_id = p_task and file_id = p_file;
  end if;
  select count(*) into v_count from file_picks where task_id = p_task;
  return v_count;
end;
$$;

revoke all on function files_pick(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function files_pick(uuid, uuid, uuid, boolean) to service_role;

-- A folder for every project (see packages/lib/files/README.md → "Project
-- folders").
--
-- Each studio's Files has one "Projects" folder at the top, and in it a
-- folder per project, named after it. Both are made by the database, in the
-- same transaction as the project, so no project is ever without one; a
-- renamed project renames its folder. People can't rename, move or delete
-- them, only fill them. Deleting a project keeps its files: its folder
-- becomes an ordinary one.

alter table file_folders
  -- The project this folder belongs to; null for any other folder.
  add column project_id uuid,
  -- The folder at the top that holds every project's folder.
  add column holds_projects boolean not null default false,
  add foreign key (tenant_id, project_id) references projects (tenant_id, id) on delete set null (project_id);

create unique index file_folders_one_per_project on file_folders (project_id) where project_id is not null;
create unique index file_folders_one_projects_folder on file_folders (tenant_id) where holds_projects;

-- `p_name` made fit to be a folder's name in p_parent: path separators and
-- control characters become spaces, then "Name (2)", "Name (3)"… when it's
-- taken there (whatever the capitals). p_self: the folder being renamed.
create or replace function files_free_folder_name(p_tenant uuid, p_parent uuid, p_name text, p_self uuid)
returns text
language plpgsql
stable
as $$
declare
  v_base text := left(coalesce(nullif(trim(regexp_replace(p_name, '[[:cntrl:]/\\[:space:]]+', ' ', 'g')), ''), 'Project'), 120);
  v_name text := v_base;
  v_n int := 1;
begin
  while exists (
    select 1 from file_folders
     where tenant_id = p_tenant and parent_id is not distinct from p_parent and lower(name) = lower(v_name) and id is distinct from p_self
  ) loop
    v_n := v_n + 1;
    v_name := left(v_base, 120 - char_length(' (' || v_n || ')')) || ' (' || v_n || ')';
  end loop;
  return v_name;
end;
$$;

-- The studio's "Projects" folder, made the first time it's needed, and
-- locked: one project's folder is named at a time, so two projects with the
-- same title get "Title" and "Title (2)".
create or replace function files_projects_folder(p_tenant uuid)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id from file_folders where tenant_id = p_tenant and holds_projects for update;
  if v_id is not null then
    return v_id;
  end if;
  insert into file_folders (tenant_id, parent_id, name, holds_projects)
  values (p_tenant, null, files_free_folder_name(p_tenant, null, 'Projects', null), true)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    -- Another project made it meanwhile.
    select id into v_id from file_folders where tenant_id = p_tenant and holds_projects for update;
  end if;
  return v_id;
end;
$$;

-- Gives a new project its folder, or renames it with the project.
create or replace function projects_keep_folder()
returns trigger
language plpgsql
as $$
declare
  v_parent uuid := files_projects_folder(new.tenant_id);
begin
  if tg_op = 'INSERT' then
    insert into file_folders (tenant_id, parent_id, name, project_id)
    values (new.tenant_id, v_parent, files_free_folder_name(new.tenant_id, v_parent, new.title, null), new.id);
  else
    update file_folders
       set name = files_free_folder_name(tenant_id, parent_id, new.title, id)
     where tenant_id = new.tenant_id and project_id = new.id;
  end if;
  return null;
end;
$$;

create trigger projects_folder_create
  after insert on projects
  for each row execute function projects_keep_folder();

create trigger projects_folder_rename
  after update of title on projects
  for each row when (old.title is distinct from new.title) execute function projects_keep_folder();

-- The projects there already, oldest first (so the oldest keeps a plain name).
do $$
declare
  r record;
  v_parent uuid;
begin
  for r in select id, tenant_id, title from projects order by created_at, id loop
    v_parent := files_projects_folder(r.tenant_id);
    insert into file_folders (tenant_id, parent_id, name, project_id)
    values (r.tenant_id, v_parent, files_free_folder_name(r.tenant_id, v_parent, r.title, null), r.id);
  end loop;
end;
$$;

-- Deleting a folder: as before, but never the Projects folder or a project's.
-- Errors: FILES:no_folder, FILES:locked.
create or replace function files_delete_folder(p_tenant uuid, p_folder uuid)
returns text[]
language plpgsql
as $$
declare
  v_keys text[];
  v_locked boolean;
begin
  select project_id is not null or holds_projects into v_locked
    from file_folders where id = p_folder and tenant_id = p_tenant for update;
  if not found then
    raise exception 'FILES:no_folder';
  end if;
  if v_locked then
    raise exception 'FILES:locked';
  end if;
  with recursive tree as (
    select id from file_folders where id = p_folder and tenant_id = p_tenant
    union all
    select f.id from file_folders f join tree t on f.parent_id = t.id where f.tenant_id = p_tenant
  ),
  gone as (
    delete from files where tenant_id = p_tenant and folder_id in (select id from tree) returning key
  )
  select coalesce(array_agg(key), '{}') into v_keys from gone;
  delete from file_folders where id = p_folder and tenant_id = p_tenant;
  return v_keys;
end;
$$;

revoke all on function files_free_folder_name(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function files_projects_folder(uuid) from public, anon, authenticated;
revoke all on function projects_keep_folder() from public, anon, authenticated;

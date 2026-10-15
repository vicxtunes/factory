-- Renaming many files and folders at once (see packages/lib/files/README.md →
-- "Selecting and renaming many"). All or nothing: everything first takes a
-- placeholder name, then its new one, so names can swap ("a" ↔ "b") and a
-- clash leaves every name as it was.
-- Errors: FILES:no_folder, FILES:no_file, and the name keys' unique violations.

create or replace function files_rename_many(p_tenant uuid, p_folders jsonb, p_files jsonb)
returns void
language plpgsql
as $$
declare
  v_count int;
begin
  -- Never the Projects folder or a project's: the database names those.
  update file_folders f set name = '~' || f.id
    from jsonb_to_recordset(p_folders) as x (id uuid, name text)
   where f.id = x.id and f.tenant_id = p_tenant and f.project_id is null and not f.holds_projects;
  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(p_folders) then
    raise exception 'FILES:no_folder';
  end if;
  update files f set name = '~' || f.id
    from jsonb_to_recordset(p_files) as x (id uuid, name text)
   where f.id = x.id and f.tenant_id = p_tenant;
  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(p_files) then
    raise exception 'FILES:no_file';
  end if;
  update file_folders f set name = x.name
    from jsonb_to_recordset(p_folders) as x (id uuid, name text)
   where f.id = x.id and f.tenant_id = p_tenant;
  update files f set name = x.name
    from jsonb_to_recordset(p_files) as x (id uuid, name text)
   where f.id = x.id and f.tenant_id = p_tenant;
end;
$$;

revoke all on function files_rename_many(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function files_rename_many(uuid, jsonb, jsonb) to service_role;

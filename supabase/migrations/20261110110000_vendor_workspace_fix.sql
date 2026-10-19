-- A vendor's workspace (20261109120000) is a tenant with no owner, which
-- tenants_owned_unless_default refused (only Aming's own tenant has none).
-- Such workspaces are marked, and allowed; still never a business, since
-- studio lists only show tenants with an owner.

alter table tenants add column for_vendor boolean not null default false;

alter table tenants drop constraint tenants_owned_unless_default;
alter table tenants add constraint tenants_owned_unless_default check (is_default or for_vendor or owner_client_id is not null);

-- As in 20261109120000, the workspace marked, and named within a tenant's 80 characters.
create or replace function vendor_workspace(p_vendor uuid) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_workspace uuid;
  v_name text;
begin
  select workspace_id, name into v_workspace, v_name from vendors where id = p_vendor for update;
  if not found then
    raise exception 'VENDORS:no_vendor';
  end if;
  if v_workspace is null then
    insert into tenants (name, for_vendor) values (left(v_name, 80), true) returning id into v_workspace;
    update vendors set workspace_id = v_workspace where id = p_vendor;
  end if;
  return v_workspace;
end;
$$;

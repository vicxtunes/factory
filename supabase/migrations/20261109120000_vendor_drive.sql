-- A vendor's Drive (/vendors/drive): where they receive clients' work and
-- keep their files. The files module (packages/lib/files) keeps files within
-- a workspace (a `tenants` row, with its storage allowance), so each vendor
-- gets one of their own, made the first time they open their Drive. It has
-- no owner, so it's never a business: studio lists only ever show tenants
-- with an owner.

alter table vendors add column workspace_id uuid unique references tenants (id) on delete restrict;

-- The vendor's workspace, made on first use. Locks the vendor's row, so two
-- requests at once still make one.
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
    insert into tenants (name) values (v_name) returning id into v_workspace;
    update vendors set workspace_id = v_workspace where id = p_vendor;
  end if;
  return v_workspace;
end;
$$;

revoke all on function vendor_workspace(uuid) from public, anon, authenticated;
grant execute on function vendor_workspace(uuid) to service_role;

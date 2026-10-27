-- Folders and files from a studio's Drive attached to an Aming order item
-- ("From my Drive" on Place order): linked, not copied. The factory opens
-- them from the order (and may add to a folder); while the order is open
-- (not cancelled, something on it not yet collected) nothing attached, nor
-- anything inside an attached folder, can be deleted or moved. Renaming and
-- adding stay open. Once the order is done the lock lifts, and deleting a
-- folder or file then lets go of its link.

create table order_item_drive_links (
  id             uuid primary key default gen_random_uuid(),
  order_item_id  uuid not null references order_items (id) on delete cascade,
  tenant_id      uuid not null references tenants (id) on delete restrict,
  folder_id      uuid,
  file_id        uuid,
  added_by_name  text not null,
  created_at     timestamptz not null default now(),
  check ((folder_id is null) <> (file_id is null)),
  foreign key (tenant_id, folder_id) references file_folders (tenant_id, id) on delete cascade,
  foreign key (tenant_id, file_id) references files (tenant_id, id) on delete cascade,
  unique (order_item_id, folder_id),
  unique (order_item_id, file_id)
);

create index order_item_drive_links_folder on order_item_drive_links (folder_id) where folder_id is not null;
create index order_item_drive_links_file on order_item_drive_links (file_id) where file_id is not null;

alter table order_item_drive_links enable row level security;

-- The links of orders still open, with their order number: what's locked.
create or replace function files_attached_open(p_tenant uuid)
returns table (folder_id uuid, file_id uuid, order_no text)
language sql
stable
as $$
  select l.folder_id, l.file_id, o.order_no
  from order_item_drive_links l
  join order_items oi on oi.id = l.order_item_id
  join orders o on o.id = oi.order_id
  where l.tenant_id = p_tenant
    and o.cancelled_at is null
    and exists (select 1 from order_items x where x.order_id = o.id and x.production_status <> 'completed');
$$;

-- Whether a folder is an attached one, or inside one, on an open order.
create or replace function files_folder_attached(p_tenant uuid, p_folder uuid)
returns boolean
language sql
stable
as $$
  with recursive up as (
    select id, parent_id from file_folders where tenant_id = p_tenant and id = p_folder
    union all
    select f.id, f.parent_id from file_folders f join up on f.id = up.parent_id where f.tenant_id = p_tenant
  )
  select exists (select 1 from files_attached_open(p_tenant) a join up on up.id = a.folder_id);
$$;

create or replace function files_guard_attached_file()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.folder_id is not distinct from old.folder_id then
    return new;
  end if;
  if exists (select 1 from files_attached_open(old.tenant_id) a where a.file_id = old.id)
     or (old.folder_id is not null and files_folder_attached(old.tenant_id, old.folder_id)) then
    raise exception 'FILES:attached';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function files_guard_attached_folder()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.parent_id is not distinct from old.parent_id then
    return new;
  end if;
  if files_folder_attached(old.tenant_id, old.id) then
    raise exception 'FILES:attached';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger files_guard_attached
  before delete or update of folder_id on files
  for each row execute function files_guard_attached_file();

create trigger file_folders_guard_attached
  before delete or update of parent_id on file_folders
  for each row execute function files_guard_attached_folder();

revoke all on function files_attached_open(uuid) from public, anon, authenticated;
revoke all on function files_folder_attached(uuid, uuid) from public, anon, authenticated;
revoke all on function files_guard_attached_file() from public, anon, authenticated;
revoke all on function files_guard_attached_folder() from public, anon, authenticated;

-- Studio files and buying storage (see packages/lib/files/README.md and
-- packages/lib/photos/README.md → "The allowance").
--
-- Files: any file a studio keeps (documents, design files, videos, zips), as
-- uploaded, in folders. They live in the same R2 bucket as photos and count
-- toward the same storage allowance (tenants.storage_quota_bytes). `bytes` is
-- what the file really takes in R2, read back when the upload is confirmed.
--
-- Buying storage: the studio's owner pays for extra GB from their wallet, at
-- the price per GB the boss set; the allowance goes up in the same
-- transaction.

-- ── Folders and files ──────────────────────────────────────────────────────

create table file_folders (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants (id) on delete restrict,
  -- Null: at the top.
  parent_id   uuid,
  name        text not null check (nullif(trim(name), '') is not null and char_length(name) <= 120),
  created_at  timestamptz not null default now(),
  unique (tenant_id, id),
  -- Deleting a folder deletes the folders inside it.
  foreign key (tenant_id, parent_id) references file_folders (tenant_id, id) on delete cascade
);

-- One name per place, whatever the capitals (the zero id stands for the top).
create unique index file_folders_name_key
  on file_folders (tenant_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table files (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants (id) on delete restrict,
  -- Null: at the top.
  folder_id     uuid,
  name          text not null check (nullif(trim(name), '') is not null and char_length(name) <= 200),
  -- Object key in the R2 bucket.
  key           text not null unique check (char_length(key) <= 300),
  bytes         bigint not null check (bytes > 0),
  content_type  text not null check (char_length(content_type) <= 200),
  created_at    timestamptz not null default now(),
  unique (tenant_id, id),
  -- A folder with files in it can't just vanish: files_delete_folder() takes
  -- the files first, so their R2 objects are deleted too.
  foreign key (tenant_id, folder_id) references file_folders (tenant_id, id) on delete restrict
);

create unique index files_name_key
  on files (tenant_id, coalesce(folder_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- What a studio's storage holds: its photos, its services' videos and its files.
create or replace function photos_used_bytes(p_tenant uuid)
returns bigint
language sql
stable
as $$
  select (select coalesce(sum(bytes), 0) from photos where tenant_id = p_tenant)
       + (select coalesce(sum(video_bytes), 0) from photo_albums where tenant_id = p_tenant)
       + (select coalesce(sum(bytes), 0) from files where tenant_id = p_tenant);
$$;

-- Records an uploaded file, only if it fits the studio's allowance. The
-- studio's row is locked so two uploads at once can't both squeeze in.
-- Errors: FILES:over_quota.
create or replace function files_record(
  p_tenant uuid, p_id uuid, p_folder uuid, p_name text, p_key text, p_bytes bigint, p_content_type text
)
returns void
language plpgsql
as $$
declare
  v_quota bigint;
begin
  select storage_quota_bytes into v_quota from tenants where id = p_tenant for update;
  if photos_used_bytes(p_tenant) + p_bytes > v_quota then
    raise exception 'FILES:over_quota';
  end if;
  insert into files (id, tenant_id, folder_id, name, key, bytes, content_type)
  values (p_id, p_tenant, p_folder, p_name, p_key, p_bytes, p_content_type);
end;
$$;

-- Deletes a folder with everything in it, at any depth. Returns the R2 keys
-- of the files that went, for their objects to be deleted.
-- Errors: FILES:no_folder.
create or replace function files_delete_folder(p_tenant uuid, p_folder uuid)
returns text[]
language plpgsql
as $$
declare
  v_keys text[];
begin
  perform 1 from file_folders where id = p_folder and tenant_id = p_tenant for update;
  if not found then
    raise exception 'FILES:no_folder';
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

-- Server (service role) only; every query filters by the caller's studio.
alter table file_folders enable row level security;
alter table files enable row level security;
revoke all on table file_folders, files from anon, authenticated;
revoke all on function files_record(uuid, uuid, uuid, text, text, bigint, text) from public, anon, authenticated;
revoke all on function files_delete_folder(uuid, uuid) from public, anon, authenticated;
grant execute on function files_record(uuid, uuid, uuid, text, text, bigint, text) to service_role;
grant execute on function files_delete_folder(uuid, uuid) to service_role;

-- ── Team access: Files is an area a member can be given ────────────────────

alter table team_members drop constraint team_members_access_check;
alter table team_members
  add constraint team_members_access_check
  check (access <@ array['bookings', 'projects', 'clients', 'money', 'catalog', 'files']::text[]);

-- A manager has every area: the ones there already get the new one.
update team_members
   set access = access || array['files']
 where access @> array['bookings', 'projects', 'clients', 'money', 'catalog'];

-- ── Buying storage ─────────────────────────────────────────────────────────

-- What a GB of extra storage costs (UGX, once). One row, set by the boss; no
-- row: extra storage isn't on sale.
create table storage_pricing (
  only_row      boolean primary key default true check (only_row),
  price_per_gb  bigint not null check (price_per_gb > 0),
  updated_at    timestamptz not null default now()
);

-- Every purchase, for the record: the money itself is in the wallet's ledger.
create table storage_purchases (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants (id) on delete restrict,
  client_id   uuid not null references clients (id) on delete restrict,
  gb          int not null check (gb > 0),
  amount      bigint not null check (amount > 0),
  actor_name  text not null,
  created_at  timestamptz not null default now()
);

create index storage_purchases_tenant on storage_purchases (tenant_id, created_at desc);

-- Buys p_gb of extra storage for a studio from its owner's wallet, in one
-- transaction: the wallet pays (it can't go below zero), the allowance goes
-- up, the purchase is recorded. p_amount is the price the buyer saw: if the
-- boss changed it meanwhile, nothing is taken. Returns the new allowance.
-- Errors: STORAGE:not_for_sale, STORAGE:price_changed, STORAGE:no_owner,
-- STORAGE:too_much, WALLET:insufficient_funds.
create or replace function storage_buy(p_tenant uuid, p_gb int, p_amount bigint, p_actor_id text, p_actor_name text)
returns bigint
language plpgsql
as $$
declare
  v_price bigint;
  v_owner uuid;
  v_quota bigint;
  v_new   bigint;
begin
  if p_gb is null or p_gb <= 0 then
    raise exception 'STORAGE:too_much';
  end if;
  select price_per_gb into v_price from storage_pricing;
  if v_price is null then
    raise exception 'STORAGE:not_for_sale';
  end if;
  if v_price * p_gb <> p_amount then
    raise exception 'STORAGE:price_changed';
  end if;
  select owner_client_id, storage_quota_bytes into v_owner, v_quota from tenants where id = p_tenant for update;
  if v_owner is null then
    raise exception 'STORAGE:no_owner';
  end if;
  v_new := v_quota + p_gb::bigint * 1073741824;
  -- 1 TB a studio, the most the boss can set too.
  if v_new > 1000::bigint * 1073741824 then
    raise exception 'STORAGE:too_much';
  end if;
  perform wallet_post(v_owner, 'adjustment', -p_amount, null, null, 'Extra storage: ' || p_gb || ' GB', 'client', p_actor_id, p_actor_name);
  update tenants set storage_quota_bytes = v_new where id = p_tenant;
  insert into storage_purchases (tenant_id, client_id, gb, amount, actor_name) values (p_tenant, v_owner, p_gb, p_amount, p_actor_name);
  return v_new;
end;
$$;

alter table storage_pricing enable row level security;
alter table storage_purchases enable row level security;
revoke all on table storage_pricing, storage_purchases from anon, authenticated;
revoke all on function storage_buy(uuid, int, bigint, text, text) from public, anon, authenticated;
grant execute on function storage_buy(uuid, int, bigint, text, text) to service_role;

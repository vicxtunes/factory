-- Vendors are their own thing (20261108100000), so their Drive and their
-- money are theirs too, not a hidden business's: this replaces the workspace
-- of 20261109120000 (never used: making one failed) with
--
--   a vendor's Drive   vendor_folders and vendor_files, within their own
--                      storage allowance (vendors.storage_quota_bytes), served
--                      by the same files module (packages/lib/vendors →
--                      "Their Drive");
--   a vendor's wallet  vendor_wallets and their history: what studios pay for
--                      jobs, less Aming's 10% (vendor_job_pay()).

-- ── No workspace ───────────────────────────────────────────────────────────

drop function vendor_workspace(uuid);
alter table vendors drop column workspace_id;

-- ── The Drive ──────────────────────────────────────────────────────────────

alter table vendors add column storage_quota_bytes bigint not null default 1073741824 check (storage_quota_bytes >= 0);

-- As file_folders and files (20261022100000, 20261105100000), by vendor.
create table vendor_folders (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references vendors (id) on delete restrict,
  -- Null: at the top.
  parent_id   uuid,
  name        text not null check (nullif(trim(name), '') is not null and char_length(name) <= 120),
  created_at  timestamptz not null default now(),
  unique (vendor_id, id),
  -- Deleting a folder deletes the folders inside it.
  foreign key (vendor_id, parent_id) references vendor_folders (vendor_id, id) on delete cascade
);

-- One name per place, whatever the capitals (the zero id stands for the top).
create unique index vendor_folders_name_key
  on vendor_folders (vendor_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table vendor_files (
  id             uuid primary key default gen_random_uuid(),
  vendor_id      uuid not null references vendors (id) on delete restrict,
  -- Null: at the top.
  folder_id      uuid,
  name           text not null check (nullif(trim(name), '') is not null and char_length(name) <= 200),
  -- Object key in the R2 bucket.
  key            text not null unique check (char_length(key) <= 300),
  bytes          bigint not null check (bytes > 0),
  content_type   text not null check (char_length(content_type) <= 200),
  caption        text check (char_length(caption) <= 500),
  -- A picture's preview and thumbnail together; 0: none yet.
  preview_bytes  bigint not null default 0 check (preview_bytes >= 0),
  created_at     timestamptz not null default now(),
  unique (vendor_id, id),
  -- vendor_files_delete_folder() takes the files first, so their R2 objects go too.
  foreign key (vendor_id, folder_id) references vendor_folders (vendor_id, id) on delete restrict
);

create unique index vendor_files_name_key
  on vendor_files (vendor_id, coalesce(folder_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- What a vendor's Drive holds: its files and their small copies.
create or replace function vendor_files_used_bytes(p_vendor uuid)
returns bigint
language sql
stable
as $$
  select coalesce(sum(bytes + preview_bytes), 0) from vendor_files where vendor_id = p_vendor;
$$;

-- Records an uploaded file, only if it fits the vendor's allowance. The
-- vendor's row is locked so two uploads at once can't both squeeze in.
-- Errors: FILES:over_quota.
create or replace function vendor_files_record(
  p_vendor uuid, p_id uuid, p_folder uuid, p_name text, p_key text, p_bytes bigint, p_content_type text
)
returns void
language plpgsql
as $$
declare
  v_quota bigint;
begin
  select storage_quota_bytes into v_quota from vendors where id = p_vendor for update;
  if vendor_files_used_bytes(p_vendor) + p_bytes > v_quota then
    raise exception 'FILES:over_quota';
  end if;
  insert into vendor_files (id, vendor_id, folder_id, name, key, bytes, content_type)
  values (p_id, p_vendor, p_folder, p_name, p_key, p_bytes, p_content_type);
end;
$$;

-- Deletes a folder with everything in it, at any depth. Returns the R2 keys
-- of the files that went, for their objects to be deleted.
-- Errors: FILES:no_folder.
create or replace function vendor_files_delete_folder(p_vendor uuid, p_folder uuid)
returns text[]
language plpgsql
as $$
declare
  v_keys text[];
begin
  perform 1 from vendor_folders where id = p_folder and vendor_id = p_vendor for update;
  if not found then
    raise exception 'FILES:no_folder';
  end if;
  with recursive tree as (
    select id from vendor_folders where id = p_folder and vendor_id = p_vendor
    union all
    select f.id from vendor_folders f join tree t on f.parent_id = t.id where f.vendor_id = p_vendor
  ),
  gone as (
    delete from vendor_files where vendor_id = p_vendor and folder_id in (select id from tree) returning key
  )
  select coalesce(array_agg(key), '{}') into v_keys from gone;
  delete from vendor_folders where id = p_folder and vendor_id = p_vendor;
  return v_keys;
end;
$$;

-- Renames many at once, all or nothing (as files_rename_many(), 20261102100000).
-- Errors: FILES:no_folder, FILES:no_file, and the name keys' unique violations.
create or replace function vendor_files_rename_many(p_vendor uuid, p_folders jsonb, p_files jsonb)
returns void
language plpgsql
as $$
declare
  v_count int;
begin
  update vendor_folders f set name = '~' || f.id
    from jsonb_to_recordset(p_folders) as x (id uuid, name text)
   where f.id = x.id and f.vendor_id = p_vendor;
  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(p_folders) then
    raise exception 'FILES:no_folder';
  end if;
  update vendor_files f set name = '~' || f.id
    from jsonb_to_recordset(p_files) as x (id uuid, name text)
   where f.id = x.id and f.vendor_id = p_vendor;
  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(p_files) then
    raise exception 'FILES:no_file';
  end if;
  update vendor_folders f set name = x.name
    from jsonb_to_recordset(p_folders) as x (id uuid, name text)
   where f.id = x.id and f.vendor_id = p_vendor;
  update vendor_files f set name = x.name
    from jsonb_to_recordset(p_files) as x (id uuid, name text)
   where f.id = x.id and f.vendor_id = p_vendor;
end;
$$;

-- ── The wallet ─────────────────────────────────────────────────────────────

create table vendor_wallets (
  vendor_id   uuid primary key references vendors (id) on delete restrict,
  balance     bigint not null default 0 check (balance >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Its ledger: append-only, one signed row per movement. A job's payment
-- comes in whole, then Aming's fee goes out as a row of its own.
create table vendor_wallet_transactions (
  id             uuid primary key default gen_random_uuid(),
  vendor_id      uuid not null references vendor_wallets (vendor_id) on delete restrict,
  kind           text not null check (kind in ('job_payment', 'fee')),
  amount         bigint not null check (amount <> 0),
  balance_after  bigint not null check (balance_after >= 0),
  vendor_job_id  uuid not null references vendor_jobs (id) on delete restrict,
  note           text,
  actor_type     text not null,
  actor_id       text,
  actor_name     text not null,
  created_at     timestamptz not null default now(),
  check ((kind = 'job_payment' and amount > 0) or (kind = 'fee' and amount < 0)),
  -- A job is paid once, and charged its fee once.
  unique (vendor_job_id, kind)
);

create index vendor_wallet_transactions_vendor_idx on vendor_wallet_transactions (vendor_id, created_at desc);

-- One row of a vendor's wallet, on a wallet already locked.
create or replace function vendor_wallet_post(p_vendor uuid, p_kind text, p_amount bigint, p_job uuid, p_note text, p_actor_type text, p_actor_id text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_balance bigint;
begin
  select balance into v_balance from vendor_wallets where vendor_id = p_vendor;
  if v_balance + p_amount < 0 then
    raise exception 'WALLET:insufficient_funds';
  end if;
  update vendor_wallets set balance = v_balance + p_amount, updated_at = now() where vendor_id = p_vendor;
  insert into vendor_wallet_transactions (vendor_id, kind, amount, balance_after, vendor_job_id, note, actor_type, actor_id, actor_name)
  values (p_vendor, p_kind, p_amount, v_balance + p_amount, p_job, p_note, p_actor_type, p_actor_id, p_actor_name);
end;
$$;

-- A studio's Business card no longer pays into a business's card for a
-- vendor: only its own 'vendor_payment' row remains (20261110100000).
alter table business_wallet_transactions drop constraint business_wallet_transactions_kind_check;
alter table business_wallet_transactions
  add constraint business_wallet_transactions_kind_check
  check (kind in ('customer_payment', 'fee', 'transfer_in', 'transfer_out', 'withdrawal', 'withdrawal_returned', 'vendor_payment'));

alter table business_wallet_transactions drop constraint business_wallet_tx_shape;
alter table business_wallet_transactions
  add constraint business_wallet_tx_shape check (
    (kind = 'customer_payment'    and amount > 0 and collection_id is not null and withdrawal_id is null and vendor_job_id is null) or
    (kind = 'fee'                 and amount < 0 and collection_id is not null and withdrawal_id is null and vendor_job_id is null) or
    (kind = 'transfer_in'         and amount > 0 and collection_id is null and withdrawal_id is null and vendor_job_id is null) or
    (kind = 'transfer_out'        and amount < 0 and collection_id is null and withdrawal_id is null and vendor_job_id is null) or
    (kind = 'withdrawal'          and amount < 0 and collection_id is null and withdrawal_id is not null and vendor_job_id is null) or
    (kind = 'withdrawal_returned' and amount > 0 and collection_id is null and withdrawal_id is not null and vendor_job_id is null) or
    (kind = 'vendor_payment'      and amount < 0 and collection_id is null and withdrawal_id is null and vendor_job_id is not null)
  );

-- As in 20261110100000, the vendor's side on their own wallet: in one
-- transaction the studio's Business card gives the price, the vendor's wallet
-- gets it, and Aming's 10% comes off as a row of its own. The studio's card is
-- always locked before the vendor's wallet, so two payments can't deadlock.
-- Paying a paid job again does nothing.
-- Errors: VENDORS:no_job, VENDORS:not_delivered, WALLET:insufficient_funds.
create or replace function vendor_job_pay(p_tenant uuid, p_job uuid, p_actor_id text, p_actor_name text)
returns jsonb
language plpgsql
as $$
declare
  v_job vendor_jobs;
  v_fee bigint;
begin
  select * into v_job from vendor_jobs where id = p_job and tenant_id = p_tenant for update;
  if not found then
    raise exception 'VENDORS:no_job';
  end if;
  if v_job.status = 'paid' then
    return jsonb_build_object('already_paid', true);
  end if;
  if v_job.status <> 'delivered' then
    raise exception 'VENDORS:not_delivered';
  end if;

  v_fee := (v_job.price * 10 + 50) / 100;

  insert into business_wallets (tenant_id) values (p_tenant) on conflict (tenant_id) do nothing;
  perform 1 from business_wallets where tenant_id = p_tenant for update;
  insert into vendor_wallets (vendor_id) values (v_job.vendor_id) on conflict (vendor_id) do nothing;
  perform 1 from vendor_wallets where vendor_id = v_job.vendor_id for update;

  perform vendor_job_post(p_tenant, 'vendor_payment', -v_job.price, p_job, 'Paid a vendor', 'client', p_actor_id, p_actor_name);
  perform vendor_wallet_post(v_job.vendor_id, 'job_payment', v_job.price, p_job, 'Paid for a job', 'client', p_actor_id, p_actor_name);
  perform vendor_wallet_post(v_job.vendor_id, 'fee', -v_fee, p_job, 'Aming fee, 10% of ' || v_job.price, 'system', null, 'Aming');

  update vendor_jobs set status = 'paid', fee = v_fee, paid_at = now() where id = p_job;
  return jsonb_build_object('already_paid', false, 'fee', v_fee);
end;
$$;

-- ── Server only ────────────────────────────────────────────────────────────

alter table vendor_folders enable row level security;
alter table vendor_files enable row level security;
alter table vendor_wallets enable row level security;
alter table vendor_wallet_transactions enable row level security;
revoke all on table vendor_folders, vendor_files, vendor_wallets, vendor_wallet_transactions from anon, authenticated;

revoke all on function vendor_files_used_bytes(uuid) from public, anon, authenticated;
revoke all on function vendor_files_record(uuid, uuid, uuid, text, text, bigint, text) from public, anon, authenticated;
revoke all on function vendor_files_delete_folder(uuid, uuid) from public, anon, authenticated;
revoke all on function vendor_files_rename_many(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function vendor_wallet_post(uuid, text, bigint, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function vendor_files_used_bytes(uuid) to service_role;
grant execute on function vendor_files_record(uuid, uuid, uuid, text, text, bigint, text) to service_role;
grant execute on function vendor_files_delete_folder(uuid, uuid) to service_role;
grant execute on function vendor_files_rename_many(uuid, jsonb, jsonb) to service_role;
grant execute on function vendor_wallet_post(uuid, text, bigint, uuid, text, text, text, text) to service_role;

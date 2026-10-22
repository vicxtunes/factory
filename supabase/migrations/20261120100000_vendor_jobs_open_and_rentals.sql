-- Vendor jobs beyond projects (packages/lib/vendors → "Jobs"):
--
-- 1. A job needn't be on a project. Without one, the vendor works in a folder
--    of its own inside the studio's "Jobs" folder: one at the top of Drive,
--    made by the database like "Projects", never renamed, moved or deleted.
-- 2. Equipment hire is a rental, not a service: an item (and how many), from
--    a day to a day, priced per day, week or month; nothing to deliver in a
--    folder. The vendor hands it over, then marks it returned (its "delivered");
--    the studio approves and the money is released, as for any job.
-- 3. A studio can pay a job in by mobile money instead of its Business card:
--    the payment holds the money for the job (Aming's fee stays 10%, and the
--    mobile money charge comes out of it). If the job moved on meanwhile, the
--    money goes on the studio's Business card instead.

-- ── 1. Jobs without a project ──────────────────────────────────────────────

alter table vendor_jobs alter column project_id drop not null;

alter table file_folders add column holds_jobs boolean not null default false;
create unique index file_folders_one_jobs_folder on file_folders (tenant_id) where holds_jobs;

-- The studio's "Jobs" folder, made the first time it's needed (as files_projects_folder()).
create or replace function files_jobs_folder(p_tenant uuid)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id from file_folders where tenant_id = p_tenant and holds_jobs for update;
  if v_id is not null then
    return v_id;
  end if;
  insert into file_folders (tenant_id, parent_id, name, holds_jobs)
  values (p_tenant, null, files_free_folder_name(p_tenant, null, 'Jobs', null), true)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from file_folders where tenant_id = p_tenant and holds_jobs for update;
  end if;
  return v_id;
end;
$$;

revoke all on function files_jobs_folder(uuid) from public, anon, authenticated;
grant execute on function files_jobs_folder(uuid) to service_role;

-- The Jobs folder is locked like the Projects folder (20261031100000, 20261102100000).
create or replace function files_delete_folder(p_tenant uuid, p_folder uuid)
returns text[]
language plpgsql
as $$
declare
  v_keys text[];
  v_locked boolean;
begin
  select project_id is not null or holds_projects or holds_jobs into v_locked
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

create or replace function files_rename_many(p_tenant uuid, p_folders jsonb, p_files jsonb)
returns void
language plpgsql
as $$
declare
  v_count int;
begin
  -- Never the Projects or Jobs folder or a project's: the database names those.
  update file_folders f set name = '~' || f.id
    from jsonb_to_recordset(p_folders) as x (id uuid, name text)
   where f.id = x.id and f.tenant_id = p_tenant and f.project_id is null and not f.holds_projects and not f.holds_jobs;
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

-- ── 2. Rentals ─────────────────────────────────────────────────────────────

alter table vendor_jobs
  add column kind text not null default 'service' check (kind in ('service', 'rental')),
  -- A rental: what's hired, how many, and from which day to which.
  add column item text check (char_length(item) between 1 and 60),
  add column quantity int check (quantity between 1 and 1000),
  add column starts_on date,
  add column ends_on date,
  -- When the vendor handed it over (the return is delivered_at).
  add column handed_over_at timestamptz,
  add constraint vendor_jobs_rental_shape check (
    (kind = 'rental' and item is not null and quantity is not null and starts_on is not null and ends_on is not null and ends_on >= starts_on)
    or (kind = 'service' and item is null and quantity is null and starts_on is null and ends_on is null and handed_over_at is null)
  );

-- Equipment is priced per week or month too.
alter table vendor_services drop constraint if exists vendor_services_unit_check;
alter table vendor_services add constraint vendor_services_unit_check check (unit in ('photo', 'video', 'hour', 'day', 'week', 'month', 'event', 'item', 'project'));

-- ── 3. Paying a job in by mobile money ─────────────────────────────────────

alter table provider_collections add column vendor_job_id uuid references vendor_jobs (id) on delete restrict;

-- As in 20261106100000, with a job's payment: the money is held for the job,
-- which goes ahead (as vendor_job_fund() does from a Business card); a job
-- that moved on meanwhile puts it on the studio's Business card instead.
create or replace function provider_collection_settle(p_collection uuid, p_actor_name text)
returns jsonb
language plpgsql
as $$
declare
  v_c provider_collections;
  v_due bigint;
  v_receipt jsonb;
  v_receipt_id uuid;
  v_payment uuid;
  v_order_no text;
  v_item text;
  v_order uuid;
  v_take bigint;
  -- The business a customer's payment is for, and Aming's fee on it.
  v_tenant uuid;
  v_fee bigint;
  v_rate int;
  -- What still has to go somewhere, and what went on orders.
  v_left bigint;
  v_applied bigint := 0;
  -- A vendor job paid in.
  v_job vendor_jobs;
begin
  select * into v_c from provider_collections where id = p_collection for update;
  if not found then
    raise exception 'WALLET:payment_not_found';
  end if;
  if v_c.status = 'succeeded' then
    return jsonb_build_object('already_settled', true, 'receipt_id', v_c.receipt_id, 'payment_id', v_c.payment_id);
  end if;
  -- A 'failed' row the provider now reports as paid still settles: the
  -- client's money arrived.
  v_left := v_c.amount;

  if v_c.vendor_job_id is not null then
    select * into v_job from vendor_jobs where id = v_c.vendor_job_id for update;
    if v_job.status in ('awaiting_funds', 'samples_sent') and v_c.amount >= v_job.price then
      update vendor_jobs set status = 'in_progress', funded_at = now() where id = v_job.id;
    else
      insert into business_wallets (tenant_id) values (v_job.tenant_id) on conflict (tenant_id) do nothing;
      perform 1 from business_wallets where tenant_id = v_job.tenant_id for update;
      perform vendor_job_post(v_job.tenant_id, 'vendor_refund', v_c.amount, v_job.id, 'Mobile money for a vendor job that had moved on', 'system', null, p_actor_name);
    end if;
    v_left := 0;
  end if;

  if v_c.order_id is not null then
    begin
      select order_no, round(quoted_price)::bigint - wallet_order_paid(id)
        into v_order_no, v_due
        from orders where id = v_c.order_id for update;
      v_receipt := wallet_record_order_receipt(
        v_c.id, v_c.order_id, v_c.amount, 'mobile_money', v_c.provider_ref,
        'Paid by mobile money (' || initcap(v_c.provider) || ')',
        case when v_c.amount > coalesce(v_due, 0) then 'wallet' end,
        'system', null, p_actor_name
      );
      v_receipt_id := v_c.id;
      v_payment := (select wallet_payment_id from order_payment_receipts where id = v_c.id);
      v_applied := coalesce((v_receipt ->> 'applied')::bigint, 0);
      v_left := 0;
    exception when others then
      -- The order can't take it (paid meanwhile, cancelled, repriced, no
      -- invoice): fall through to a wallet deposit of the whole amount.
      v_receipt_id := null;
      v_payment := null;
    end;
  end if;

  if v_c.order_ids is not null then
    foreach v_order in array v_c.order_ids loop
      exit when v_left <= 0;
      begin
        select round(quoted_price)::bigint - wallet_order_paid(id)
          into v_due
          from orders where id = v_order and client_id = v_c.client_id for update;
        v_take := least(v_left, coalesce(v_due, 0));
        if v_take > 0 then
          perform wallet_record_order_receipt(
            gen_random_uuid(), v_order, v_take, 'mobile_money', v_c.provider_ref,
            'Paid by mobile money (' || initcap(v_c.provider) || ')',
            null, 'system', null, p_actor_name
          );
          v_left := v_left - v_take;
          v_applied := v_applied + v_take;
        end if;
      exception when others then
        -- This order can't take it: its share stays for the next one, then the wallet.
        null;
      end;
    end loop;
  end if;

  if v_left > 0 then
    if v_c.product_request_id is not null then
      select quantity || ' × ' || item_name, tenant_id into v_item, v_tenant from product_requests where id = v_c.product_request_id;
    end if;
    if v_c.booking_id is not null then
      select title, tenant_id into v_item, v_tenant from bookings where id = v_c.booking_id;
    end if;
    if v_c.billing_document_id is not null then
      select number, tenant_id into v_item, v_tenant from billing_documents where id = v_c.billing_document_id;
    end if;
    if v_tenant is not null then
      perform business_wallet_post(
        v_tenant, 'customer_payment', v_left, v_c.id, null,
        case
          when v_c.product_request_id is not null then 'Customer payment for ' || coalesce(v_item, 'an order request')
          when v_c.billing_document_id is not null then 'Customer payment for invoice ' || coalesce(v_item, '')
          else 'Customer payment for booking ' || coalesce(v_item, '')
        end,
        'system', null, v_c.created_by_name
      );
      -- Whole shillings, halves up. Nothing on a payment too small to carry one.
      -- The rate is the business's kind's: a vendor's work pays more.
      v_rate := business_fee_percent(v_tenant);
      v_fee := (v_left * v_rate + 50) / 100;
      if v_fee > 0 then
        perform business_wallet_post(v_tenant, 'fee', -v_fee, v_c.id, null, 'Aming fee, ' || v_rate || '% of ' || v_left, 'system', null, 'Aming');
      end if;
    else
      insert into payments (
        client_id, amount, method, status, provider, provider_ref, reference, note,
        created_by_type, created_by_id, created_by_name
      ) values (
        v_c.client_id, v_left, 'mobile_money', 'pending', v_c.provider, v_c.provider_ref, v_c.provider_ref,
        case
          when v_c.order_ids is not null then 'Mobile money for your invoices — kept in the wallet: they didn''t need it any more'
          when v_c.order_id is null then 'Wallet top-up by mobile money'
          else 'Mobile money for order ' || coalesce(v_order_no, '') || ' — kept in the wallet: the order couldn''t take it'
        end,
        'system', null, p_actor_name
      ) returning id into v_payment;
      perform wallet_settle_payment(v_payment, 'system', null, p_actor_name);
    end if;
  end if;

  update provider_collections
     set status = 'succeeded',
         failure_reason = null,
         receipt_id = v_receipt_id,
         payment_id = v_payment,
         resolved_at = now()
   where id = v_c.id;

  return jsonb_build_object(
    'already_settled', false,
    'receipt_id', v_receipt_id,
    'payment_id', v_payment,
    'applied', v_applied
  );
end;
$$;

-- A studio hires a vendor on a project (packages/lib/vendors → "Jobs"): it
-- sends a request (what's needed, by when, for how much), the vendor accepts
-- or declines, works in the project's folder, marks it delivered, and the
-- studio approves and pays from its Business card. The vendor's Business card
-- (their workspace's, 20261109120000) gets the price less Aming's 10%.

create table vendor_jobs (
  id                 uuid primary key default gen_random_uuid(),
  -- The studio, and its project.
  tenant_id          uuid not null references tenants (id) on delete restrict,
  project_id         uuid not null,
  vendor_id          uuid not null references vendors (id) on delete restrict,
  -- What the studio needs done.
  brief              text not null check (char_length(brief) between 1 and 1000),
  due_on             date,
  -- Whole UGX, what the studio pays; the vendor gets it less Aming's fee.
  price              bigint not null check (price > 0),
  status             text not null default 'requested'
                     check (status in ('requested', 'accepted', 'declined', 'cancelled', 'delivered', 'paid')),
  -- Aming's fee, taken when it's paid.
  fee                bigint check (fee >= 0),
  requested_by_name  text not null,
  created_at         timestamptz not null default now(),
  responded_at       timestamptz,
  delivered_at       timestamptz,
  paid_at            timestamptz,
  foreign key (tenant_id, project_id) references projects (tenant_id, id) on delete restrict,
  check ((status = 'paid') = (paid_at is not null and fee is not null))
);

create index vendor_jobs_vendor_idx on vendor_jobs (vendor_id, created_at desc);
create index vendor_jobs_project_idx on vendor_jobs (tenant_id, project_id, created_at desc);
-- A vendor has one open job on a project at a time.
create unique index vendor_jobs_one_open on vendor_jobs (project_id, vendor_id) where status in ('requested', 'accepted', 'delivered');

-- The server only (service role).
alter table vendor_jobs enable row level security;

-- ── Business cards: paying a vendor ────────────────────────────────────────

alter table business_wallet_transactions add column vendor_job_id uuid references vendor_jobs (id) on delete restrict;

alter table business_wallet_transactions drop constraint business_wallet_transactions_kind_check;
alter table business_wallet_transactions
  add constraint business_wallet_transactions_kind_check
  check (kind in ('customer_payment', 'fee', 'transfer_in', 'transfer_out', 'withdrawal', 'withdrawal_returned', 'vendor_payment', 'vendor_earning'));

-- As in 20261025100000, with a job's three rows: the studio's payment, the
-- vendor's earning and the fee on it.
alter table business_wallet_transactions drop constraint business_wallet_tx_shape;
alter table business_wallet_transactions
  add constraint business_wallet_tx_shape check (
    (kind = 'customer_payment'    and amount > 0 and collection_id is not null and withdrawal_id is null and vendor_job_id is null) or
    (kind = 'fee'                 and amount < 0 and withdrawal_id is null and (collection_id is null) <> (vendor_job_id is null)) or
    (kind = 'transfer_in'         and amount > 0 and collection_id is null and withdrawal_id is null and vendor_job_id is null) or
    (kind = 'transfer_out'        and amount < 0 and collection_id is null and withdrawal_id is null and vendor_job_id is null) or
    (kind = 'withdrawal'          and amount < 0 and collection_id is null and withdrawal_id is not null and vendor_job_id is null) or
    (kind = 'withdrawal_returned' and amount > 0 and collection_id is null and withdrawal_id is not null and vendor_job_id is null) or
    (kind = 'vendor_payment'      and amount < 0 and collection_id is null and withdrawal_id is null and vendor_job_id is not null) or
    (kind = 'vendor_earning'      and amount > 0 and collection_id is null and withdrawal_id is null and vendor_job_id is not null)
  );

-- A job is paid once: each of its rows is written once.
create unique index business_wallet_tx_vendor_job_key on business_wallet_transactions (vendor_job_id, kind) where vendor_job_id is not null;

-- One row of a job's money, on a card already locked by vendor_job_pay().
create or replace function vendor_job_post(p_tenant uuid, p_kind text, p_amount bigint, p_job uuid, p_note text, p_actor_type text, p_actor_id text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_balance bigint;
begin
  select balance into v_balance from business_wallets where tenant_id = p_tenant;
  if v_balance + p_amount < 0 then
    raise exception 'WALLET:insufficient_funds';
  end if;
  update business_wallets set balance = v_balance + p_amount, updated_at = now() where tenant_id = p_tenant;
  insert into business_wallet_transactions (tenant_id, kind, amount, balance_after, vendor_job_id, note, actor_type, actor_id, actor_name)
  values (p_tenant, p_kind, p_amount, v_balance + p_amount, p_job, p_note, p_actor_type, p_actor_id, p_actor_name);
end;
$$;

-- The studio pays a delivered job, in one transaction: its Business card
-- gives the price; the vendor's card gets it, then Aming's 10% comes off as a
-- row of its own. Paying a paid job again does nothing.
-- Errors: VENDORS:no_job, VENDORS:not_delivered, WALLET:insufficient_funds.
create or replace function vendor_job_pay(p_tenant uuid, p_job uuid, p_actor_id text, p_actor_name text)
returns jsonb
language plpgsql
as $$
declare
  v_job vendor_jobs;
  v_vendor_card uuid;
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

  v_vendor_card := vendor_workspace(v_job.vendor_id);
  v_fee := (v_job.price * 10 + 50) / 100;

  insert into business_wallets (tenant_id) values (p_tenant), (v_vendor_card) on conflict (tenant_id) do nothing;
  -- Both cards locked, always in the same order, so two payments can't deadlock.
  perform 1 from business_wallets where tenant_id in (p_tenant, v_vendor_card) order by tenant_id for update;

  perform vendor_job_post(p_tenant, 'vendor_payment', -v_job.price, p_job, 'Paid a vendor', 'client', p_actor_id, p_actor_name);
  perform vendor_job_post(v_vendor_card, 'vendor_earning', v_job.price, p_job, 'Paid for a job', 'client', p_actor_id, p_actor_name);
  perform vendor_job_post(v_vendor_card, 'fee', -v_fee, p_job, 'Aming fee, 10% of ' || v_job.price, 'system', null, 'Aming');

  update vendor_jobs set status = 'paid', fee = v_fee, paid_at = now() where id = p_job;
  return jsonb_build_object('already_paid', false, 'fee', v_fee);
end;
$$;

revoke all on function vendor_job_post(uuid, text, bigint, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function vendor_job_pay(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function vendor_job_post(uuid, text, bigint, uuid, text, text, text, text) to service_role;
grant execute on function vendor_job_pay(uuid, uuid, text, text) to service_role;

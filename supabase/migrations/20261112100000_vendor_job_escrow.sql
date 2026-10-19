-- Vendor jobs, held by Aming (packages/lib/vendors → "Jobs"): the studio's
-- money is collected and held by Aming while the work is done, then released
-- to the vendor or refunded to the studio. Before it goes ahead a job may
-- need samples, and the vendor only sees the folder chosen for the job.
--
--   requested ──▶ samples ──▶ samples_sent ──▶ (approved, paid in) in_progress
--       │  └──────▶ awaiting_funds ─────────────▶ (paid in) ─┘
--       └▶ declined                in_progress ──▶ delivered ──▶ paid (released)
--   cancelled: by the studio before money is held      │   └──▶ disputed ──▶ paid | refunded
--   refunded: the vendor withdrew, or staff refunded   └── no answer: released after 2 days
--
-- The studio's Business card pays in when the work goes ahead (vendor_job_fund);
-- the money sits with Aming (the job is funded and not yet released or
-- refunded); vendor_job_release() pays the vendor's wallet less Aming's 10%,
-- vendor_job_refund() puts it back on the studio's card.

-- ── The job ────────────────────────────────────────────────────────────────

alter table vendor_jobs drop constraint vendor_jobs_status_check;
-- The old paid check (it goes with paid_at below anyway).
alter table vendor_jobs drop constraint if exists vendor_jobs_check;
drop index vendor_jobs_one_open;

alter table vendor_jobs
  -- The folder the vendor works in: one inside the project's folder.
  add column folder_id uuid,
  add foreign key (tenant_id, folder_id) references file_folders (tenant_id, id) on delete set null (folder_id),
  -- Samples first: what the studio wants to see before the work goes ahead.
  add column samples_wanted text check (char_length(samples_wanted) <= 500),
  add column samples_sent_at timestamptz,
  -- The money: held from funded_at until released_at or refunded_at.
  add column funded_at timestamptz,
  add column released_at timestamptz,
  add column refunded_at timestamptz,
  -- A dispute over delivered (or held) work, for Aming's staff to settle.
  add column disputed_at timestamptz,
  add column disputed_by text check (disputed_by in ('studio', 'vendor')),
  add column dispute_reason text check (char_length(dispute_reason) <= 1000),
  add column settled_by_name text,
  -- Delivered work with no answer: the boss and the studio were warned.
  add column overdue_alerted_at timestamptz;

-- The test jobs from 20261110100000: paid ones were paid as they were
-- approved (held and released at once); the rest never had money held, so
-- they wait for the studio to pay in.
update vendor_jobs set funded_at = paid_at, released_at = paid_at where status = 'paid';
update vendor_jobs set status = 'awaiting_funds' where status in ('accepted', 'delivered');

alter table vendor_jobs drop column paid_at;

-- Checked once the jobs above fit.
alter table vendor_jobs
  add constraint vendor_jobs_status_check check (status in (
    'requested', 'declined', 'samples', 'samples_sent', 'awaiting_funds', 'cancelled',
    'in_progress', 'delivered', 'disputed', 'paid', 'refunded'
  )),
  add constraint vendor_jobs_money check (
    (released_at is null or refunded_at is null)
    and (released_at is null and refunded_at is null or funded_at is not null)
    and ((status = 'paid') = (released_at is not null))
    and ((status = 'refunded') = (refunded_at is not null))
    and (status not in ('in_progress', 'delivered', 'disputed') or funded_at is not null)
    and ((status = 'paid') = (fee is not null))
  );

-- A vendor has one open job on a project at a time.
create unique index vendor_jobs_one_open on vendor_jobs (project_id, vendor_id)
  where status in ('requested', 'samples', 'samples_sent', 'awaiting_funds', 'in_progress', 'delivered', 'disputed');
-- Staff's queue: disputes, and delivered work waiting on the studio.
create index vendor_jobs_attention_idx on vendor_jobs (status, delivered_at) where status in ('delivered', 'disputed');

-- ── The money ──────────────────────────────────────────────────────────────

-- The studio's card: the job's money out to Aming (vendor_payment, as
-- before), and back if it's refunded (vendor_refund).
alter table business_wallet_transactions drop constraint business_wallet_transactions_kind_check;
alter table business_wallet_transactions
  add constraint business_wallet_transactions_kind_check
  check (kind in ('customer_payment', 'fee', 'transfer_in', 'transfer_out', 'withdrawal', 'withdrawal_returned', 'vendor_payment', 'vendor_refund'));

alter table business_wallet_transactions drop constraint business_wallet_tx_shape;
alter table business_wallet_transactions
  add constraint business_wallet_tx_shape check (
    (kind = 'customer_payment'    and amount > 0 and collection_id is not null and withdrawal_id is null and vendor_job_id is null) or
    (kind = 'fee'                 and amount < 0 and collection_id is not null and withdrawal_id is null and vendor_job_id is null) or
    (kind = 'transfer_in'         and amount > 0 and collection_id is null and withdrawal_id is null and vendor_job_id is null) or
    (kind = 'transfer_out'        and amount < 0 and collection_id is null and withdrawal_id is null and vendor_job_id is null) or
    (kind = 'withdrawal'          and amount < 0 and collection_id is null and withdrawal_id is not null and vendor_job_id is null) or
    (kind = 'withdrawal_returned' and amount > 0 and collection_id is null and withdrawal_id is not null and vendor_job_id is null) or
    (kind = 'vendor_payment'      and amount < 0 and collection_id is null and withdrawal_id is null and vendor_job_id is not null) or
    (kind = 'vendor_refund'       and amount > 0 and collection_id is null and withdrawal_id is null and vendor_job_id is not null)
  );

drop function vendor_job_pay(uuid, uuid, text, text);

-- The studio pays a job's price in to Aming, and the work goes ahead: from
-- awaiting_funds, or approving the samples (samples_sent).
-- Errors: VENDORS:no_job, VENDORS:not_now, WALLET:insufficient_funds.
create or replace function vendor_job_fund(p_tenant uuid, p_job uuid, p_actor_id text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_job vendor_jobs;
begin
  select * into v_job from vendor_jobs where id = p_job and tenant_id = p_tenant for update;
  if not found then
    raise exception 'VENDORS:no_job';
  end if;
  if v_job.status not in ('awaiting_funds', 'samples_sent') then
    raise exception 'VENDORS:not_now';
  end if;
  insert into business_wallets (tenant_id) values (p_tenant) on conflict (tenant_id) do nothing;
  perform 1 from business_wallets where tenant_id = p_tenant for update;
  perform vendor_job_post(p_tenant, 'vendor_payment', -v_job.price, p_job, 'Held by Aming for a vendor''s job', 'client', p_actor_id, p_actor_name);
  update vendor_jobs set status = 'in_progress', funded_at = now() where id = p_job;
end;
$$;

-- The held money goes to the vendor's wallet, less Aming's 10%: the studio
-- approved the delivered work, staff settled a dispute for the vendor, or no
-- one answered in time (the system). Releasing a released job does nothing.
-- Errors: VENDORS:no_job, VENDORS:not_now.
create or replace function vendor_job_release(p_job uuid, p_actor_type text, p_actor_id text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_job vendor_jobs;
  v_fee bigint;
begin
  select * into v_job from vendor_jobs where id = p_job for update;
  if not found then
    raise exception 'VENDORS:no_job';
  end if;
  if v_job.status = 'paid' then
    return;
  end if;
  if v_job.status not in ('delivered', 'disputed') then
    raise exception 'VENDORS:not_now';
  end if;
  v_fee := (v_job.price * 10 + 50) / 100;
  insert into vendor_wallets (vendor_id) values (v_job.vendor_id) on conflict (vendor_id) do nothing;
  perform 1 from vendor_wallets where vendor_id = v_job.vendor_id for update;
  perform vendor_wallet_post(v_job.vendor_id, 'job_payment', v_job.price, p_job, 'Paid for a job', p_actor_type, p_actor_id, p_actor_name);
  perform vendor_wallet_post(v_job.vendor_id, 'fee', -v_fee, p_job, 'Aming fee, 10% of ' || v_job.price, 'system', null, 'Aming');
  update vendor_jobs set status = 'paid', fee = v_fee, released_at = now(), settled_by_name = p_actor_name where id = p_job;
end;
$$;

-- The held money goes back on the studio's Business card: the vendor
-- withdrew from work in progress, or staff settled a dispute for the studio.
-- Refunding a refunded job does nothing.
-- Errors: VENDORS:no_job, VENDORS:not_now.
create or replace function vendor_job_refund(p_job uuid, p_actor_type text, p_actor_id text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_job vendor_jobs;
begin
  select * into v_job from vendor_jobs where id = p_job for update;
  if not found then
    raise exception 'VENDORS:no_job';
  end if;
  if v_job.status = 'refunded' then
    return;
  end if;
  if v_job.status not in ('in_progress', 'delivered', 'disputed') then
    raise exception 'VENDORS:not_now';
  end if;
  insert into business_wallets (tenant_id) values (v_job.tenant_id) on conflict (tenant_id) do nothing;
  perform 1 from business_wallets where tenant_id = v_job.tenant_id for update;
  perform vendor_job_post(v_job.tenant_id, 'vendor_refund', v_job.price, p_job, 'Refunded: a vendor''s job', p_actor_type, p_actor_id, p_actor_name);
  update vendor_jobs set status = 'refunded', refunded_at = now(), settled_by_name = p_actor_name where id = p_job;
end;
$$;

revoke all on function vendor_job_fund(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function vendor_job_release(uuid, text, text, text) from public, anon, authenticated;
revoke all on function vendor_job_refund(uuid, text, text, text) from public, anon, authenticated;
grant execute on function vendor_job_fund(uuid, uuid, text, text) to service_role;
grant execute on function vendor_job_release(uuid, text, text, text) to service_role;
grant execute on function vendor_job_refund(uuid, text, text, text) to service_role;

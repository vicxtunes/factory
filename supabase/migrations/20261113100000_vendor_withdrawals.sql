-- Vendors withdraw from their wallet (packages/lib/vendors → "Wallet"), as
-- businesses do from their Business card (20261023100000, 20261026100000):
-- the money leaves the wallet at once (so it can't be spent twice), staff
-- approve it and the gateway (HivePay's payouts) sends it, or staff refuse
-- it (or the gateway fails it) and it goes back.
--
--   pending   asked for: off the wallet, waiting for staff
--   sending   approved: handed to the gateway, waiting for its answer
--   paid      the gateway delivered it
--   rejected  refused by staff, or failed at the gateway: back on the wallet

create table vendor_withdrawals (
  id                 uuid primary key default gen_random_uuid(),
  vendor_id          uuid not null references vendor_wallets (vendor_id) on delete restrict,
  amount             bigint not null check (amount > 0),
  -- The mobile money number to send it to (+256…).
  phone              text not null check (char_length(phone) <= 20),
  status             text not null default 'pending' check (status in ('pending', 'sending', 'paid', 'rejected')),
  -- Paid: the gateway's reference. Rejected: why (shown to the vendor).
  reference          text check (char_length(reference) <= 100),
  reason             text check (char_length(reason) <= 500),
  requested_by_name  text not null,
  approved_by_name   text,
  resolved_by_name   text,
  created_at         timestamptz not null default now(),
  sent_at            timestamptz,
  resolved_at        timestamptz,
  -- What the gateway took from the amount, and its reference for the payout.
  payout_fee         bigint check (payout_fee >= 0),
  gateway_reference  text check (char_length(gateway_reference) <= 100),
  -- Why the last try to hand it to the gateway didn't go (it stays pending).
  last_error         text check (char_length(last_error) <= 500)
);

create index vendor_withdrawals_open_idx on vendor_withdrawals (created_at) where status in ('pending', 'sending');
create index vendor_withdrawals_vendor_idx on vendor_withdrawals (vendor_id, created_at desc);

alter table vendor_withdrawals enable row level security;
revoke all on table vendor_withdrawals from anon, authenticated;

-- ── The wallet's ledger: withdrawals too ───────────────────────────────────

alter table vendor_wallet_transactions alter column vendor_job_id drop not null;
alter table vendor_wallet_transactions add column withdrawal_id uuid references vendor_withdrawals (id) on delete restrict;
-- The old kind and shape checks (20261110120000; the shape one was made
-- without a name), found by what they check.
do $$
declare
  v_name text;
begin
  for v_name in
    select c.conname from pg_constraint c
     where c.conrelid = 'vendor_wallet_transactions'::regclass and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%job_payment%'
  loop
    execute format('alter table vendor_wallet_transactions drop constraint %I', v_name);
  end loop;
end;
$$;
alter table vendor_wallet_transactions
  add constraint vendor_wallet_transactions_kind_check check (kind in ('job_payment', 'fee', 'withdrawal', 'withdrawal_returned')),
  add constraint vendor_wallet_tx_shape check (
    (kind = 'job_payment'         and amount > 0 and vendor_job_id is not null and withdrawal_id is null) or
    (kind = 'fee'                 and amount < 0 and vendor_job_id is not null and withdrawal_id is null) or
    (kind = 'withdrawal'          and amount < 0 and vendor_job_id is null and withdrawal_id is not null) or
    (kind = 'withdrawal_returned' and amount > 0 and vendor_job_id is null and withdrawal_id is not null)
  );
-- A withdrawal leaves once, and comes back once.
create unique index vendor_wallet_tx_withdrawal_key on vendor_wallet_transactions (withdrawal_id, kind) where withdrawal_id is not null;

-- As vendor_wallet_post() (20261110120000), for a withdrawal's rows; locks the wallet itself.
create or replace function vendor_wallet_post_withdrawal(p_vendor uuid, p_kind text, p_amount bigint, p_withdrawal uuid, p_note text, p_actor_type text, p_actor_id text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_balance bigint;
begin
  insert into vendor_wallets (vendor_id) values (p_vendor) on conflict (vendor_id) do nothing;
  select balance into v_balance from vendor_wallets where vendor_id = p_vendor for update;
  if v_balance + p_amount < 0 then
    raise exception 'WALLET:insufficient_funds';
  end if;
  update vendor_wallets set balance = v_balance + p_amount, updated_at = now() where vendor_id = p_vendor;
  insert into vendor_wallet_transactions (vendor_id, kind, amount, balance_after, withdrawal_id, note, actor_type, actor_id, actor_name)
  values (p_vendor, p_kind, p_amount, v_balance + p_amount, p_withdrawal, p_note, p_actor_type, p_actor_id, p_actor_name);
end;
$$;

-- ── Withdrawing ────────────────────────────────────────────────────────────

-- The vendor asks: the money leaves the wallet now. Errors: WALLET:invalid_amount, WALLET:insufficient_funds.
create or replace function vendor_withdraw_request(p_vendor uuid, p_amount bigint, p_phone text, p_actor_id text, p_actor_name text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'WALLET:invalid_amount';
  end if;
  insert into vendor_wallets (vendor_id) values (p_vendor) on conflict (vendor_id) do nothing;
  insert into vendor_withdrawals (vendor_id, amount, phone, requested_by_name)
  values (p_vendor, p_amount, p_phone, p_actor_name)
  returning id into v_id;
  perform vendor_wallet_post_withdrawal(p_vendor, 'withdrawal', -p_amount, v_id, 'Withdrawal to ' || p_phone, 'client', p_actor_id, p_actor_name);
  return v_id;
end;
$$;

-- Staff approve: pending → sending, before the gateway is called, so a second
-- click can never send it twice. Returns what to send.
-- Errors: WALLET:withdrawal_not_pending.
create or replace function vendor_withdraw_approve(p_withdrawal uuid, p_actor_name text)
returns jsonb
language plpgsql
as $$
declare
  v_w vendor_withdrawals;
begin
  select * into v_w from vendor_withdrawals where id = p_withdrawal for update;
  if not found or v_w.status <> 'pending' then
    raise exception 'WALLET:withdrawal_not_pending';
  end if;
  update vendor_withdrawals set status = 'sending', approved_by_name = p_actor_name, sent_at = now(), last_error = null where id = p_withdrawal;
  return jsonb_build_object('amount', v_w.amount, 'phone', v_w.phone, 'vendor_id', v_w.vendor_id);
end;
$$;

-- The gateway turned it down before taking it: back to pending, with why.
create or replace function vendor_withdraw_not_taken(p_withdrawal uuid, p_error text)
returns void
language plpgsql
as $$
begin
  update vendor_withdrawals set status = 'pending', sent_at = null, last_error = left(p_error, 500) where id = p_withdrawal and status = 'sending';
end;
$$;

-- The gateway's reference, once it has taken the payout.
create or replace function vendor_withdraw_taken(p_withdrawal uuid, p_gateway_reference text, p_fee bigint)
returns void
language plpgsql
as $$
begin
  update vendor_withdrawals set gateway_reference = p_gateway_reference, payout_fee = p_fee where id = p_withdrawal and status = 'sending';
end;
$$;

-- The gateway's answer for a payout it took: delivered, or failed (the money
-- goes back on the wallet). Answering twice changes nothing: returns false
-- when it was already settled.
create or replace function vendor_withdraw_payout_result(p_withdrawal uuid, p_delivered boolean, p_fee bigint, p_gateway_reference text, p_reason text)
returns boolean
language plpgsql
as $$
declare
  v_w vendor_withdrawals;
begin
  select * into v_w from vendor_withdrawals where id = p_withdrawal for update;
  if not found or v_w.status <> 'sending' then
    return false;
  end if;
  if p_delivered then
    update vendor_withdrawals
       set status = 'paid', payout_fee = p_fee, gateway_reference = coalesce(p_gateway_reference, gateway_reference),
           reference = coalesce(p_gateway_reference, gateway_reference), resolved_by_name = 'HivePay', resolved_at = now()
     where id = p_withdrawal;
  else
    update vendor_withdrawals
       set status = 'rejected', gateway_reference = coalesce(p_gateway_reference, gateway_reference),
           reason = left(coalesce(p_reason, 'The mobile money network turned it down.'), 500), resolved_by_name = 'HivePay', resolved_at = now()
     where id = p_withdrawal;
    perform vendor_wallet_post_withdrawal(v_w.vendor_id, 'withdrawal_returned', v_w.amount, v_w.id,
      'Withdrawal not sent: ' || left(coalesce(p_reason, 'the mobile money network turned it down.'), 400), 'system', null, 'HivePay');
  end if;
  return true;
end;
$$;

-- Staff refuse a waiting withdrawal (the vendor sees why): the money goes back.
-- Errors: WALLET:withdrawal_not_pending.
create or replace function vendor_withdraw_refuse(p_withdrawal uuid, p_reason text, p_actor_id text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_w vendor_withdrawals;
begin
  select * into v_w from vendor_withdrawals where id = p_withdrawal for update;
  if not found or v_w.status <> 'pending' then
    raise exception 'WALLET:withdrawal_not_pending';
  end if;
  update vendor_withdrawals set status = 'rejected', reason = p_reason, resolved_by_name = p_actor_name, resolved_at = now() where id = p_withdrawal;
  perform vendor_wallet_post_withdrawal(v_w.vendor_id, 'withdrawal_returned', v_w.amount, v_w.id, 'Withdrawal not sent: ' || p_reason, 'dashboard_user', p_actor_id, p_actor_name);
end;
$$;

revoke all on function vendor_wallet_post_withdrawal(uuid, text, bigint, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function vendor_withdraw_request(uuid, bigint, text, text, text) from public, anon, authenticated;
revoke all on function vendor_withdraw_approve(uuid, text) from public, anon, authenticated;
revoke all on function vendor_withdraw_not_taken(uuid, text) from public, anon, authenticated;
revoke all on function vendor_withdraw_taken(uuid, text, bigint) from public, anon, authenticated;
revoke all on function vendor_withdraw_payout_result(uuid, boolean, bigint, text, text) from public, anon, authenticated;
revoke all on function vendor_withdraw_refuse(uuid, text, text, text) from public, anon, authenticated;
grant execute on function vendor_wallet_post_withdrawal(uuid, text, bigint, uuid, text, text, text, text) to service_role;
grant execute on function vendor_withdraw_request(uuid, bigint, text, text, text) to service_role;
grant execute on function vendor_withdraw_approve(uuid, text) to service_role;
grant execute on function vendor_withdraw_not_taken(uuid, text) to service_role;
grant execute on function vendor_withdraw_taken(uuid, text, bigint) to service_role;
grant execute on function vendor_withdraw_payout_result(uuid, boolean, bigint, text, text) to service_role;
grant execute on function vendor_withdraw_refuse(uuid, text, text, text) to service_role;

-- Petty cash is sent from the app (owner, 2026-11-16). The boxes stay (Office for
-- the Receptionists, Factory for the Supervisors), but the money in them is a
-- set-aside part of Aming's HivePay money: the boss tops a box up from HivePay
-- only, and its holder pays with "Use petty cash": what it's for, the amount,
-- the withdraw charge that goes with it (the receiver's mobile money charge for
-- cashing it out, not HivePay's), who receives it and their number. The app
-- sends amount + withdraw charge by HivePay at once, with no approval.
--
-- Each payment is an expense under 'Petty cash' (no category to pick: it's
-- day-to-day spending) with a bill payout (expense_payouts) that names the box,
-- so HivePay's answer, the checks every 2 minutes and the stuck alerts settle
-- it as they settle bills. Once delivered, the payment comes out of the box;
-- HivePay's own sending fee stays Aming's, an expense paid from HivePay (as
-- since 2026-11-14). If it isn't delivered, the expense is voided and the money
-- stays in the box. Recording a cash payment from a box is gone.
--
-- Applied by hand: node scripts/apply-migration.mjs <this file>

insert into expense_categories (key, name, automatic) values ('petty_cash', 'Petty cash', true)
on conflict (key) do nothing;

-- The box a payout is paid from; null for a bill, paid from HivePay.
alter table expense_payouts add column from_account_id uuid references money_accounts (id) on delete restrict;
create index expense_payouts_from_account_sending_idx on expense_payouts (from_account_id) where status = 'sending' and from_account_id is not null;

drop function petty_cash_spend(uuid, uuid, text, text, bigint, text, text, text, text);

-- A box is topped up from HivePay only, and the money never leaves HivePay, so
-- no reference is needed (nor between cash and the boxes, as before).
create or replace function money_move(
  p_id uuid,
  p_from uuid,
  p_to uuid,
  p_amount bigint,
  p_moved_on date,
  p_reference text,
  p_note text,
  p_actor_id text,
  p_actor_name text
)
returns void
language plpgsql
as $$
declare
  v_found integer;
  v_from text;
  v_to text;
begin
  if p_from is null or p_to is null or p_from = p_to then raise exception 'DAYBOOK:move_same'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'DAYBOOK:bad_amount'; end if;
  if p_moved_on is null or p_moved_on > production_today(default_tenant_id()) then raise exception 'DAYBOOK:move_date'; end if;
  select count(*) into v_found from money_accounts where id in (p_from, p_to) and tenant_id = default_tenant_id();
  if v_found <> 2 then raise exception 'DAYBOOK:bad_account'; end if;
  select kind into v_from from money_accounts where id = p_from;
  select kind into v_to from money_accounts where id = p_to;
  if v_to = 'petty_cash' and v_from <> 'hivepay' then raise exception 'PETTY:from_hivepay'; end if;
  if nullif(trim(p_reference), '') is null
     and not ((v_from = 'hivepay' and v_to = 'petty_cash') or (v_from = 'petty_cash' and v_to = 'hivepay'))
     and (v_from not in ('cash', 'petty_cash') or v_to not in ('cash', 'petty_cash')) then
    raise exception 'DAYBOOK:move_reference';
  end if;
  insert into money_moves (id, from_account_id, to_account_id, amount, moved_on, reference, note, actor_id, actor_name)
  values (p_id, p_from, p_to, p_amount, p_moved_on, nullif(trim(p_reference), ''), nullif(trim(p_note), ''), p_actor_id, p_actor_name)
  on conflict (id) do nothing;
end;
$$;

-- What a box can still send: what it holds, less what is on its way.
create or replace function petty_cash_available(p_account uuid)
returns bigint
language sql
stable
as $$
  select coalesce(petty_cash_balance(p_account), 0)
       - coalesce((select sum(credit) from expense_payouts where from_account_id = p_account and status = 'sending'), 0);
$$;

-- "Use petty cash": the expense and its payout, checked under the box's lock.
-- Returns what to hand HivePay (amount + withdraw charge + HivePay's fee), or
-- null when this payout id was already started: the caller sends only on a number.
create or replace function petty_cash_send(
  p_id uuid,
  p_expense uuid,
  p_account uuid,
  p_name text,
  p_amount bigint,
  p_charge bigint,
  p_recipient text,
  p_phone text,
  p_actor_id text,
  p_actor_name text
)
returns bigint
language plpgsql
as $$
declare
  v_today date := production_today(default_tenant_id());
  v_credit bigint;
  v_sent bigint;
  v_available bigint;
begin
  perform pg_advisory_xact_lock(hashtext('petty_cash_send'), hashtext(p_account::text));
  if exists (select 1 from expense_payouts where id = p_id) then return null; end if;
  perform 1 from money_accounts where id = p_account and kind = 'petty_cash' and tenant_id = default_tenant_id();
  if not found then raise exception 'PETTY:bad_box'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'EXPENSE:name'; end if;
  if nullif(trim(p_recipient), '') is null then raise exception 'PETTY:recipient'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'EXPENSE:amount'; end if;
  if p_charge is null or p_charge < 0 then raise exception 'PETTY:charge'; end if;
  v_credit := p_amount + p_charge;
  v_available := petty_cash_available(p_account);
  if v_credit > v_available then raise exception 'PETTY:not_enough:%', greatest(v_available, 0); end if;
  v_sent := hivepay_send_gross(v_credit);
  if v_sent < 500 or v_sent > 5000000 or v_sent < v_credit then raise exception 'EXPENSE:payout_limits'; end if;

  insert into expenses (id, category, amount, spent_on, name, description, recipient, approval, approved_by_name, approved_at, actor_id, actor_name)
  values (p_expense, 'petty_cash', v_credit, v_today, trim(p_name),
          case when p_charge > 0 then p_amount || ' + ' || p_charge || ' withdraw charge' end,
          trim(p_recipient), 'approved', p_actor_name, now(), p_actor_id, p_actor_name);
  insert into expense_payouts (id, expense_id, credit, sent, phone, from_account_id, actor_id, actor_name)
  values (p_id, p_expense, v_credit, v_sent, p_phone, p_account, p_actor_id, p_actor_name);
  return v_sent;
end;
$$;

-- As on 2026-11-14 (20270111100000), with petty cash: a delivered payout comes
-- out of its box, and one not delivered voids its expense (nothing left the box).
create or replace function expense_payout_result(p_id uuid, p_delivered boolean, p_fee bigint, p_reference text, p_reason text)
returns boolean
language plpgsql
as $$
declare
  v_payout expense_payouts;
  v_expense expenses;
  v_paid bigint;
  v_credited bigint;
  v_fee bigint;
  v_fee_expense uuid;
  v_fee_payment uuid;
  v_today date;
begin
  select * into v_payout from expense_payouts where id = p_id and status = 'sending' for update;
  if not found then return false; end if;

  if not p_delivered then
    update expense_payouts set status = 'failed', last_error = left(p_reason, 500), settled_at = now() where id = p_id;
    if v_payout.from_account_id is not null then
      update expenses set
        voided_at = now(),
        void_reason = left('Not sent: ' || coalesce(p_reason, 'no reason given'), 500),
        voided_by_name = 'Aming (automatic)'
      where id = v_payout.expense_id and voided_at is null;
    else
      update expenses set
        autopay_held_at = now(),
        autopay_held_by_name = 'Aming (automatic)',
        autopay_hold_reason = left('Sending failed: ' || coalesce(p_reason, 'no reason given'), 500)
      where id = v_payout.expense_id and autopay_held_at is null and voided_at is null;
    end if;
    return true;
  end if;

  v_today := production_today(v_payout.tenant_id);
  select * into v_expense from expenses where id = v_payout.expense_id for update;
  select coalesce(sum(amount), 0) into v_paid from expense_payments where expense_id = v_payout.expense_id and voided_at is null;
  v_credited := greatest(least(v_payout.sent - coalesce(p_fee, v_payout.fee, v_payout.sent - v_payout.credit), v_expense.amount - v_paid), 0);
  v_fee := v_payout.sent - v_credited;

  if v_credited > 0 then
    insert into expense_payments (id, expense_id, amount, paid_on, money_account_id, method, phone, reference, note, actor_id, actor_name)
    values (p_id, v_payout.expense_id, v_credited, v_today, coalesce(v_payout.from_account_id, money_hivepay_account()), 'mobile_money', v_payout.phone,
            coalesce(p_reference, v_payout.gateway_reference),
            case when v_payout.from_account_id is not null then 'Sent from petty cash through HivePay' else 'Sent through HivePay' end,
            v_payout.actor_id, v_payout.actor_name);
  end if;

  if v_fee > 0 then
    v_fee_expense := gen_random_uuid();
    v_fee_payment := gen_random_uuid();
    insert into expenses (id, category, amount, spent_on, name, recipient, approval, actor_id, actor_name)
    values (v_fee_expense, 'hivepay_send_fee', v_fee, v_today, 'HivePay sending fee: ' || v_expense.name, 'HivePay', 'approved', v_payout.actor_id, v_payout.actor_name);
    update expense_payouts set fee_payment_id = v_fee_payment where id = p_id;
    insert into expense_payments (id, expense_id, amount, paid_on, money_account_id, method, phone, reference, note, actor_id, actor_name)
    values (v_fee_payment, v_fee_expense, v_fee, v_today, money_hivepay_account(), 'mobile_money', null,
            coalesce(p_reference, v_payout.gateway_reference), 'HivePay sending fee', v_payout.actor_id, v_payout.actor_name);
  end if;

  update expense_payouts set
    status = 'paid',
    fee = coalesce(p_fee, fee),
    gateway_reference = coalesce(p_reference, gateway_reference),
    settled_at = now()
  where id = p_id;
  return true;
end;
$$;

revoke all on function money_move(uuid, uuid, uuid, bigint, date, text, text, text, text) from public, anon, authenticated;
revoke all on function petty_cash_available(uuid) from public, anon, authenticated;
revoke all on function petty_cash_send(uuid, uuid, uuid, text, bigint, bigint, text, text, text, text) from public, anon, authenticated;
revoke all on function expense_payout_result(uuid, boolean, bigint, text, text) from public, anon, authenticated;

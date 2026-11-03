-- Paying a bill through the app: real mobile money sent through HivePay. It only
-- counts as paid once HivePay confirms it. HivePay cuts its fee out of what's
-- sent, and Aming carries that fee, so the fee is sent on top of the bill and
-- recorded as its own expense. The bill is credited with what the phone really
-- received. Applied by hand: node scripts/apply-migration.mjs <this file>

insert into expense_categories (key, name, automatic) values ('hivepay_send_fee', 'HivePay sending fees', true);

create table expense_payouts (
  -- Chosen by the screen, so pressing Send twice can never send twice.
  id                 uuid primary key,
  tenant_id          uuid not null default default_tenant_id() references tenants (id),
  expense_id         uuid not null references expenses (id) on delete restrict,
  -- What the phone should receive, and what leaves HivePay (that plus the expected fee).
  credit             bigint not null check (credit > 0),
  sent               bigint not null check (sent between 500 and 5000000),
  phone              text not null,
  status             text not null default 'sending' check (status in ('sending', 'paid', 'failed')),
  gateway_reference  text,
  -- HivePay's real fee, when it has said.
  fee                bigint check (fee >= 0),
  last_error         text,
  fee_payment_id     uuid,
  actor_id           text,
  actor_name         text not null,
  created_at         timestamptz not null default now(),
  settled_at         timestamptz,
  constraint expense_payouts_sent check (sent >= credit)
);

-- One at a time per bill: until HivePay answers, nobody knows what's left to pay.
create unique index expense_payouts_one_sending on expense_payouts (expense_id) where status = 'sending';
create index expense_payouts_sending_idx on expense_payouts (created_at) where status = 'sending';

alter table expense_payouts enable row level security;
revoke all on table expense_payouts from anon, authenticated;

-- While money is on its way, the bill can't be paid by hand. Money HivePay has
-- sent has really left, so its payment can't be voided.
create function expense_payments_payout_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from expense_payouts where expense_id = new.expense_id and status = 'sending' and id <> new.id) then
      raise exception 'EXPENSE:payout_sending';
    end if;
  elsif old.voided_at is null and new.voided_at is not null
    and exists (select 1 from expense_payouts where id = new.id or fee_payment_id = new.id) then
    raise exception 'EXPENSE:sent_by_hivepay';
  end if;
  return new;
end;
$$;

create trigger expense_payments_payout_guard before insert or update on expense_payments
  for each row execute function expense_payments_payout_guard();

create function expenses_payout_guard()
returns trigger
language plpgsql
as $$
begin
  if old.voided_at is null and new.voided_at is not null
    and exists (select 1 from expense_payouts where expense_id = new.id and status = 'sending') then
    raise exception 'EXPENSE:payout_sending';
  end if;
  return new;
end;
$$;

create trigger expenses_payout_guard before update on expenses
  for each row execute function expenses_payout_guard();

-- Checks everything before any money moves. True only the first time for an id:
-- the caller sends the money only on true. The server allows only the boss here,
-- so a bill waiting for approval is approved by sending it.
create function expense_payout_start(
  p_id uuid,
  p_expense uuid,
  p_credit bigint,
  p_sent bigint,
  p_actual bigint,
  p_phone text,
  p_actor_id text,
  p_actor_name text
)
returns boolean
language plpgsql
as $$
declare
  v_expense expenses;
  v_paid bigint;
  v_total bigint;
begin
  if exists (select 1 from expense_payouts where id = p_id) then return false; end if;
  select * into v_expense from expenses where id = p_expense for update;
  if not found or v_expense.voided_at is not null then raise exception 'EXPENSE:gone'; end if;
  if v_expense.purchase_id is not null or v_expense.repayment_id is not null or v_expense.collection_id is not null then raise exception 'EXPENSE:automatic'; end if;
  if v_expense.category = 'hivepay_send_fee' then raise exception 'EXPENSE:automatic'; end if;
  if v_expense.approval = 'rejected' then raise exception 'EXPENSE:rejected'; end if;
  if p_credit is null or p_credit <= 0 then raise exception 'EXPENSE:amount'; end if;
  if p_sent < 500 or p_sent > 5000000 then raise exception 'EXPENSE:payout_limits'; end if;
  if exists (select 1 from expense_payouts where expense_id = p_expense and status = 'sending') then raise exception 'EXPENSE:payout_sending'; end if;

  v_total := v_expense.amount;
  if v_expense.amount_is_estimate then
    if p_actual is null or p_actual <= 0 then raise exception 'EXPENSE:actual'; end if;
    v_total := p_actual;
  end if;
  select coalesce(sum(amount), 0) into v_paid from expense_payments where expense_id = p_expense and voided_at is null;
  if p_credit > v_total - v_paid then raise exception 'EXPENSE:too_much'; end if;

  update expenses set
    amount = v_total,
    amount_is_estimate = false,
    approval = 'approved',
    approved_by_name = case when approval = 'waiting' then p_actor_name else approved_by_name end,
    approved_at = case when approval = 'waiting' then now() else approved_at end
  where id = p_expense;

  insert into expense_payouts (id, expense_id, credit, sent, phone, actor_id, actor_name)
  values (p_id, p_expense, p_credit, p_sent, p_phone, p_actor_id, p_actor_name);
  return true;
end;
$$;

-- HivePay's answer. Delivered: the bill is credited with what the phone received
-- (sent less the real fee, and never more than is left), and everything else
-- that left HivePay is the fee. Failed: nothing was paid. True if this settled it.
create function expense_payout_result(p_id uuid, p_delivered boolean, p_fee bigint, p_reference text, p_reason text)
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
    return true;
  end if;

  v_today := production_today(v_payout.tenant_id);
  select * into v_expense from expenses where id = v_payout.expense_id for update;
  select coalesce(sum(amount), 0) into v_paid from expense_payments where expense_id = v_payout.expense_id and voided_at is null;
  v_credited := greatest(least(v_payout.sent - coalesce(p_fee, v_payout.fee, v_payout.sent - v_payout.credit), v_expense.amount - v_paid), 0);
  v_fee := v_payout.sent - v_credited;

  if v_credited > 0 then
    insert into expense_payments (id, expense_id, amount, paid_on, money_account_id, method, phone, reference, note, actor_id, actor_name)
    values (p_id, v_payout.expense_id, v_credited, v_today, money_hivepay_account(), 'mobile_money', v_payout.phone,
            coalesce(p_reference, v_payout.gateway_reference), 'Sent through HivePay', v_payout.actor_id, v_payout.actor_name);
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

revoke all on function expense_payments_payout_guard() from public, anon, authenticated;
revoke all on function expenses_payout_guard() from public, anon, authenticated;
revoke all on function expense_payout_start(uuid, uuid, bigint, bigint, bigint, text, text, text) from public, anon, authenticated;
revoke all on function expense_payout_result(uuid, boolean, bigint, text, text) from public, anon, authenticated;

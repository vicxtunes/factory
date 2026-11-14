-- Sending charges stay with Aming (owner, 2026-11-14: "for agents and
-- suppliers' expense withdraw fix: the money has to go out full, the charges
-- stay to company"; first decided for bills on 2026-11-03). HivePay always
-- keeps its fee out of what it's sent and offers no way to charge it to the
-- account, so Aming sends the amount plus the fee: the agent or supplier
-- receives the full amount. The fee comes from HivePay's own price bands,
-- which the boss keeps here (HivePay publishes none). Should HivePay keep more
-- than the bands say, an agent gets the difference back on their balance and
-- a bill keeps the rest owing, so nobody is short. Business card and vendor
-- withdrawals are unchanged.

-- HivePay's sending fee bands: up to this amount sent (inclusive, above the
-- previous band), this fee.
create table hivepay_send_fees (
  up_to           bigint primary key check (up_to between 1 and 5000000),
  fee             bigint not null check (fee >= 0),
  updated_by_name text not null,
  updated_at      timestamptz not null default now()
);
alter table hivepay_send_fees enable row level security;

-- What to send so `p_due` arrives after HivePay's fee: the smallest amount
-- whose band's fee, kept out of it, leaves at least p_due. With no band for it
-- (none entered yet, or past the last), p_due itself: HivePay's reported fee
-- then settles who is owed what. Never over HivePay's 5,000,000.
create function hivepay_send_gross(p_due bigint)
returns bigint
language sql
stable
as $$
  select least(coalesce((
    select p_due + f.fee
      from hivepay_send_fees f
     where p_due + f.fee <= f.up_to
       and p_due + f.fee > coalesce((select max(g.up_to) from hivepay_send_fees g where g.up_to < f.up_to), 0)
     order by f.up_to
     limit 1
  ), p_due), 5000000);
$$;
revoke all on function hivepay_send_gross(bigint) from public, anon, authenticated;

-- The boss saves the bands all at once: [{"up_to": 40000, "fee": 1000}, …].
create function hivepay_send_fees_set(p_bands jsonb, p_by text)
returns void
language plpgsql
as $$
begin
  delete from hivepay_send_fees where true;
  insert into hivepay_send_fees (up_to, fee, updated_by_name)
  select (b ->> 'up_to')::bigint, (b ->> 'fee')::bigint, p_by from jsonb_array_elements(p_bands) b;
end;
$$;
revoke all on function hivepay_send_fees_set(jsonb, text) from public, anon, authenticated;

-- Agents: what was handed to HivePay (the amount plus the fee). Aming always
-- carries the fee now.
alter table agent_withdrawals add column sent bigint check (sent >= amount);
update agent_settings set withdrawal_fee_paid_by = 'aming';
alter table agent_settings alter column withdrawal_fee_paid_by set default 'aming';

-- When HivePay kept more than was sent on top, the difference goes back on the
-- agent's balance, once (before: the whole fee, as nothing was sent on top).
create or replace function agent_withdraw_credit_fee(p_withdrawal uuid)
returns void
language plpgsql
as $$
declare
  v_w agent_withdrawals;
  v_short bigint;
begin
  select * into v_w from agent_withdrawals where id = p_withdrawal;
  v_short := coalesce(v_w.payout_fee, 0) - (coalesce(v_w.sent, v_w.amount) - v_w.amount);
  if v_w.status = 'paid' and v_w.fee_paid_by = 'aming' and v_short > 0
     and not exists (select 1 from agent_wallet_transactions where withdrawal_id = p_withdrawal and kind = 'fee_credit') then
    perform agent_wallet_post(v_w.agent_id, 'fee_credit', v_short, null, p_withdrawal, 'Sending fee, paid by Aming', 'system', null, 'Aming');
  end if;
end;
$$;

-- Bills going by themselves send the bill plus the fee too.
create or replace function expense_autopay_start(p_id uuid, p_expense uuid, p_now timestamptz)
returns table (amount bigint, phone text)
language plpgsql
as $$
declare
  v_expense expenses;
  v_amount bigint;
  v_sent bigint;
begin
  select * into v_expense from expenses where expenses.id = p_expense for update;
  if not found or v_expense.autopay_at is null or v_expense.autopay_at > p_now then return; end if;
  v_amount := expense_autopay_amount(p_expense, production_today(v_expense.tenant_id));
  if v_amount is null then return; end if;
  v_sent := hivepay_send_gross(v_amount);
  if not expense_payout_start(p_id, p_expense, v_amount, v_sent, null, v_expense.pay_phone, null, 'Aming (automatic)') then return; end if;
  update expense_payouts set automatic = true where expense_payouts.id = p_id;
  return query select v_sent, v_expense.pay_phone;
end;
$$;

-- Where Aming's sending fees go (made on 2026-11-03; here in case it's gone).
insert into expense_categories (key, name, automatic) values ('hivepay_send_fee', 'HivePay sending fees', true)
on conflict (key) do nothing;

-- A bill payout's result, as on 2026-11-03: what reached the supplier pays the
-- bill (never more than it owes; less leaves the rest owing), and the rest of
-- what was sent is Aming's HivePay sending fee, an expense of its own. A
-- failure holds an autopay bill, as since 2026-11-13.
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
    update expenses set
      autopay_held_at = now(),
      autopay_held_by_name = 'Aming (automatic)',
      autopay_hold_reason = left('Sending failed: ' || coalesce(p_reason, 'no reason given'), 500)
    where id = v_payout.expense_id and autopay_held_at is null and voided_at is null;
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

-- The day book: an agent's payout is money out at what was handed to HivePay
-- (as 20261216100000, with that one change).
create or replace view money_day_lines with (security_invoker = true) as
with zone as (
  select t.time_zone, t.id as tenant_id from tenants t where t.id = default_tenant_id()
)
-- In: from clients.
select
  m.tenant_id,
  m.id,
  'in'::text as direction,
  m.kind,
  (m.received_at at time zone z.time_zone)::date as day,
  m.received_at as at,
  m.amount,
  coalesce(
    a.id,
    -- Money that came through a HivePay prompt sits with HivePay.
    case when exists (
      select 1 from provider_collections c
       where c.provider_ref = m.reference or c.receipt_id = m.id or c.payment_id = m.id
    ) then money_hivepay_account() end,
    money_default_account(m.method)
  ) as money_account_id,
  m.method,
  coalesce(c.name, 'Client') as party,
  m.sender_name,
  m.sender_phone as phone,
  m.reference,
  case when m.order_no is not null then 'Order ' || m.order_no else 'Wallet top-up' end as detail,
  m.recorded_by,
  coalesce(m.recorded_at, m.received_at) as recorded_at
from accounting_money_in m
cross join zone z
left join clients c on c.id = m.customer_id
left join money_accounts a on a.tenant_id = m.tenant_id and a.name = m.account_name
union all
-- In: owners' money, other income, money borrowed.
select
  o.tenant_id,
  o.id,
  'in',
  o.kind,
  o.received_on,
  money_received_at(o.recorded_at, o.received_on),
  o.amount,
  coalesce(a.id, money_default_account(o.method)),
  o.method,
  o.sender_name,
  o.sender_name,
  o.sender_phone,
  o.reference,
  o.note,
  o.recorded_by,
  o.recorded_at
from accounting_other_money_in o
left join money_accounts a on a.tenant_id = o.tenant_id and a.name = o.account_name
union all
-- Out: materials paid for (bought on credit moves no money until it's repaid).
-- The expense's interest category isn't here: it's part of the repayment below.
select
  p.tenant_id,
  p.id,
  'out',
  'materials',
  p.purchased_on,
  money_received_at(p.created_at, p.purchased_on),
  p.total,
  money_default_account(p.paid_from),
  p.paid_from,
  coalesce(nullif(trim(p.supplier), ''), 'Supplier'),
  null,
  null,
  p.reference,
  'Materials: ' || m.name,
  p.actor_name,
  p.created_at
from material_purchases p
join materials m on m.id = p.material_id
where p.voided_at is null and p.paid_from <> 'on_credit'
union all
-- Out: paying back what was borrowed, interest included.
select
  r.tenant_id,
  r.id,
  'out',
  'loan_repayment',
  r.paid_on,
  money_received_at(r.created_at, r.paid_on),
  r.amount,
  money_default_account(r.paid_from),
  r.paid_from,
  n.name,
  null,
  n.phone,
  r.reference,
  'Loan repayment',
  r.actor_name,
  r.created_at
from loan_repayments r
join loans l on l.id = r.loan_id
join lenders n on n.id = l.lender_id
where r.voided_at is null
union all
-- Out: studios' money sent to them. Internal moves between wallets aren't here:
-- no money enters or leaves the business.
select
  default_tenant_id(),
  w.id,
  'out',
  'business_withdrawal',
  (coalesce(w.resolved_at, w.created_at) at time zone z.time_zone)::date,
  coalesce(w.resolved_at, w.created_at),
  w.amount,
  case when w.gateway_reference is not null or w.resolved_by_name = 'HivePay' then money_hivepay_account() else money_default_account('mobile_money') end,
  'mobile_money',
  coalesce(t.name, 'Studio'),
  null,
  w.phone,
  w.reference,
  'Studio withdrawal',
  coalesce(w.resolved_by_name, w.requested_by_name),
  coalesce(w.resolved_at, w.created_at)
from business_withdrawals w
cross join zone z
left join tenants t on t.id = w.tenant_id
where w.status = 'paid'
union all
select
  default_tenant_id(),
  w.id,
  'out',
  'vendor_withdrawal',
  (coalesce(w.resolved_at, w.created_at) at time zone z.time_zone)::date,
  coalesce(w.resolved_at, w.created_at),
  w.amount,
  case when w.gateway_reference is not null or w.resolved_by_name = 'HivePay' then money_hivepay_account() else money_default_account('mobile_money') end,
  'mobile_money',
  v.name,
  null,
  w.phone,
  coalesce(w.reference, w.gateway_reference),
  'Vendor withdrawal',
  coalesce(w.resolved_by_name, w.approved_by_name, w.requested_by_name),
  coalesce(w.resolved_at, w.created_at)
from vendor_withdrawals w
cross join zone z
join vendors v on v.id = w.vendor_id
where w.status = 'paid'
union all
-- Out: paid to an agent, through HivePay or by the boss from an account.
select
  default_tenant_id(),
  w.id,
  'out',
  'agent_withdrawal',
  (coalesce(w.resolved_at, w.created_at) at time zone z.time_zone)::date,
  coalesce(w.resolved_at, w.created_at),
  coalesce(w.sent, w.amount),
  coalesce(w.money_account_id, money_hivepay_account()),
  case w.method when 'bank' then 'bank_transfer' else 'mobile_money' end,
  a.name,
  null,
  w.phone,
  coalesce(w.reference, w.gateway_reference),
  'Agent commission withdrawal',
  coalesce(w.resolved_by_name, w.approved_by_name, w.requested_by_name),
  coalesce(w.resolved_at, w.created_at)
from agent_withdrawals w
cross join zone z
join agents a on a.id = w.agent_id
where w.status = 'paid'
union all
-- Out: taken from a wallet where money really left an account.
select
  default_tenant_id(),
  x.id,
  'out',
  'wallet_money_back',
  w.left_on,
  money_received_at(x.created_at, w.left_on),
  abs(x.amount),
  w.money_account_id,
  case a.kind when 'bank' then 'bank_transfer' when 'hivepay' then 'mobile_money' else a.kind end,
  coalesce(c.name, 'Client'),
  null,
  null,
  null,
  x.note,
  x.actor_name,
  x.created_at
from wallet_adjustment_money w
join wallet_transactions x on x.id = w.entry_id
join money_accounts a on a.id = w.money_account_id
left join clients c on c.id = x.client_id
union all
-- Out: what was paid on an expense. Part payments are each their own line.
select
  e.tenant_id,
  p.id,
  'out',
  'expense',
  p.paid_on,
  money_received_at(p.created_at, p.paid_on),
  p.amount,
  p.money_account_id,
  p.method,
  coalesce(nullif(trim(e.recipient), ''), e.name),
  null,
  p.phone,
  p.reference,
  e.name,
  p.actor_name,
  p.created_at
from expense_payments p
join expenses e on e.id = p.expense_id
where p.voided_at is null
union all
-- Moves between the business's own accounts: out of one and into the other.
-- Today keeps them apart from money in and out: they're neither income nor spending.
select
  v.tenant_id,
  v.id,
  'out',
  'move',
  v.moved_on,
  money_received_at(v.created_at, v.moved_on),
  v.amount,
  v.from_account_id,
  'move',
  'To ' || t.name,
  null,
  null,
  v.reference,
  v.note,
  v.actor_name,
  v.created_at
from money_moves v
join money_accounts t on t.id = v.to_account_id
where v.voided_at is null
union all
select
  v.tenant_id,
  v.id,
  'in',
  'move',
  v.moved_on,
  money_received_at(v.created_at, v.moved_on),
  v.amount,
  v.to_account_id,
  'move',
  'From ' || f.name,
  null,
  null,
  v.reference,
  v.note,
  v.actor_name,
  v.created_at
from money_moves v
join money_accounts f on f.id = v.from_account_id
where v.voided_at is null
union all
-- Out: what HivePay keeps from each collection.
select
  e.tenant_id,
  e.id,
  'out',
  'hivepay_fee',
  e.spent_on,
  e.created_at,
  e.amount,
  money_hivepay_account(),
  'mobile_money',
  'HivePay',
  null,
  null,
  c.provider_ref,
  e.note,
  'HivePay',
  e.created_at
from expenses e
join provider_collections c on c.id = e.collection_id
where e.voided_at is null;

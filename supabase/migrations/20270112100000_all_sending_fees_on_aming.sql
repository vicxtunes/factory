-- Every HivePay charge is Aming's, and each is an expense of its own (owner,
-- 2026-11-14: "all charges on withdraw and collection are on aming"; "for
-- every withdraw or money transfer put these charges in record as expense so
-- that we track clearly"). Collections already were (3%, 20261207100000).
--
--   * HivePay's payout charges, from its own table (the owner's photo of
--     HivePay's "Merchant Payout Charges", 2026-11-14), become the fee bands;
--     the boss can still change them (Accounts → Expenses → HivePay fees).
--   * Business card and vendor wallet withdrawals now go out in full too: the
--     amount plus the charge is sent (`sent`), like agents' since 20270111100000.
--   * Every payout HivePay delivers (an agent's, a Business card's, a
--     vendor's, the boss's own) books its charge as a 'HivePay sending fees'
--     expense, paid from the HivePay account: what HivePay reported, else what
--     was sent on top. The day book counts the payout at what reached the
--     phone, and the charge as its expense, so both add up to what left
--     HivePay. Bills already did this (expense_payout_result).
--   * The boss can take Aming's money out of HivePay to their phone
--     (owner_withdrawals): an owner's drawing, not an expense; its charge is.
--
-- Payouts settled before this keep their books as they were.

-- HivePay's payout charges (UGX), by the amount sent.
delete from hivepay_send_fees where true;
insert into hivepay_send_fees (up_to, fee, updated_by_name) values
  (50000, 1000, 'HivePay price list (2026-11-14)'),
  (200000, 2000, 'HivePay price list (2026-11-14)'),
  (400000, 2700, 'HivePay price list (2026-11-14)'),
  (1000000, 4500, 'HivePay price list (2026-11-14)'),
  (5000000, 9200, 'HivePay price list (2026-11-14)');

-- What was handed to HivePay for a Business card's or vendor's withdrawal (the amount plus the charge).
alter table business_withdrawals add column sent bigint check (sent >= amount);
alter table vendor_withdrawals add column sent bigint check (sent >= amount);

-- The boss's own withdrawals from HivePay.
create table owner_withdrawals (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null default default_tenant_id() references tenants (id) on delete restrict,
  -- What reaches the phone, and what was sent for it (plus HivePay's charge).
  amount            bigint not null check (amount between 500 and 5000000),
  sent              bigint not null check (sent >= amount),
  phone             text not null check (char_length(phone) <= 20),
  note              text check (char_length(note) <= 300),
  status            text not null default 'sending' check (status in ('sending', 'paid', 'failed')),
  gateway_reference text check (char_length(gateway_reference) <= 100),
  payout_fee        bigint check (payout_fee >= 0),
  last_error        text check (char_length(last_error) <= 500),
  actor_id          text,
  actor_name        text not null,
  created_at        timestamptz not null default now(),
  sent_at           timestamptz not null default now(),
  resolved_at       timestamptz
);
create index owner_withdrawals_sending_idx on owner_withdrawals (sent_at) where status = 'sending';
create index owner_withdrawals_created_idx on owner_withdrawals (created_at desc);
alter table owner_withdrawals enable row level security;

-- Which payout a sending-fee expense is for: one live fee per payout.
alter table expenses add column payout_id uuid;
create unique index expenses_payout_key on expenses (payout_id) where payout_id is not null and voided_at is null;

-- A payout HivePay delivered books its charge as an expense paid from HivePay.
-- Only payouts sent under the new rule (`sent` set) and through HivePay. A
-- payout must never fail to settle because of this: a problem is a warning.
create function hivepay_book_payout_fee() returns trigger
language plpgsql as $$
declare
  v_fee bigint;
  v_expense uuid := gen_random_uuid();
  v_today date := production_today(default_tenant_id());
  v_what text := case tg_table_name
    when 'agent_withdrawals' then 'agent withdrawal'
    when 'business_withdrawals' then 'Business card withdrawal'
    when 'vendor_withdrawals' then 'vendor withdrawal'
    else 'owner''s withdrawal' end;
begin
  if new.status <> 'paid' or old.status = 'paid' or new.sent is null or new.gateway_reference is null then
    return new;
  end if;
  begin
    v_fee := coalesce(new.payout_fee, new.sent - new.amount);
    if v_fee <= 0 then return new; end if;
    insert into expenses (id, category, amount, spent_on, name, recipient, approval, actor_name, payout_id)
    values (v_expense, 'hivepay_send_fee', v_fee, v_today, 'HivePay sending fee: ' || v_what || ' to ' || new.phone, 'HivePay', 'approved', 'HivePay', new.id)
    on conflict (payout_id) where payout_id is not null and voided_at is null do nothing;
    if found then
      insert into expense_payments (id, expense_id, amount, paid_on, money_account_id, method, phone, reference, note, actor_name)
      values (gen_random_uuid(), v_expense, v_fee, v_today, money_hivepay_account(), 'mobile_money', null, new.gateway_reference, 'HivePay sending fee', 'HivePay');
    end if;
  exception when others then
    raise warning 'hivepay sending fee not booked for % %: %', tg_table_name, new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function hivepay_book_payout_fee() from public, anon, authenticated;

create trigger agent_withdrawals_send_fee after update of status on agent_withdrawals for each row execute function hivepay_book_payout_fee();
create trigger business_withdrawals_send_fee after update of status on business_withdrawals for each row execute function hivepay_book_payout_fee();
create trigger vendor_withdrawals_send_fee after update of status on vendor_withdrawals for each row execute function hivepay_book_payout_fee();
create trigger owner_withdrawals_send_fee after update of status on owner_withdrawals for each row execute function hivepay_book_payout_fee();

-- The day book (as 20270111100000): payouts sent under the new rule count
-- what reached the phone (their charge is its expense line), and the boss's
-- own withdrawals show as the owner taking money out.
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
  case when w.sent is not null and w.gateway_reference is not null then w.sent - coalesce(w.payout_fee, w.sent - w.amount) else w.amount end,
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
  case when w.sent is not null and w.gateway_reference is not null then w.sent - coalesce(w.payout_fee, w.sent - w.amount) else w.amount end,
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
  case when w.sent is not null and w.gateway_reference is not null then w.sent - coalesce(w.payout_fee, w.sent - w.amount) else w.amount end,
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
-- Out: the boss taking Aming's money out of HivePay to their phone (owner's drawing).
select
  w.tenant_id,
  w.id,
  'out',
  'owner_drawing',
  (coalesce(w.resolved_at, w.created_at) at time zone z.time_zone)::date,
  coalesce(w.resolved_at, w.created_at),
  w.sent - coalesce(w.payout_fee, w.sent - w.amount),
  money_hivepay_account(),
  'mobile_money',
  w.actor_name,
  null,
  w.phone,
  w.gateway_reference,
  coalesce('Owner took out: ' || w.note, 'Owner took out'),
  w.actor_name,
  coalesce(w.resolved_at, w.created_at)
from owner_withdrawals w
cross join zone z
where w.status = 'paid'
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

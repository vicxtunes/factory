-- HivePay is its own account. Money from HivePay prompts sits with HivePay, not
-- on the business's mobile money line, so each can be checked against its own
-- balance. Hand-recorded mobile money stays under Mobile money. Moving it out
-- to the bank or the line is a move (money_moves). Applied by hand:
-- node scripts/apply-migration.mjs <this file>

alter table money_accounts drop constraint money_accounts_kind_check;
alter table money_accounts add constraint money_accounts_kind_check check (kind in ('cash', 'bank', 'mobile_money', 'hivepay'));

insert into money_accounts (name, kind) values ('HivePay', 'hivepay');

create or replace function money_hivepay_account()
returns uuid
language sql
stable
as $$
  select a.id from money_accounts a where a.tenant_id = default_tenant_id() and a.kind = 'hivepay' order by a.created_at limit 1;
$$;

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
where v.voided_at is null;

-- Cash, bank, mobile money, then HivePay.
create or replace function money_day_balances(p_day date)
returns table (
  money_account_id uuid,
  name text,
  kind text,
  opening_on date,
  opening bigint,
  money_in bigint,
  money_out bigint,
  expected bigint,
  counted bigint,
  difference bigint,
  closing bigint,
  closed_at timestamptz,
  closed_by text,
  close_note text
)
language sql
stable
as $$
  with lines as (
    select l.money_account_id, l.day, case l.direction when 'in' then l.amount else -l.amount end as signed, l.direction, l.amount
      from money_day_lines l
     where l.money_account_id is not null
  ),
  base as (
    select a.id, a.name, a.kind, a.created_at, b.opening_on, b.amount as start
      from money_accounts a
      left join money_opening_balances b on b.money_account_id = a.id
     where a.tenant_id = default_tenant_id()
  ),
  figures as (
    select
      b.*,
      case when b.opening_on is null or p_day < b.opening_on then null else
        b.start
        + coalesce((select sum(l.signed) from lines l where l.money_account_id = b.id and l.day >= b.opening_on and l.day < p_day), 0)
        + coalesce((select sum(d.counted - d.expected) from day_closes d where d.money_account_id = b.id and d.counted is not null and d.day >= b.opening_on and d.day < p_day), 0)
      end::bigint as opening,
      coalesce((select sum(l.amount) from lines l where l.money_account_id = b.id and l.day = p_day and l.direction = 'in'), 0)::bigint as money_in,
      coalesce((select sum(l.amount) from lines l where l.money_account_id = b.id and l.day = p_day and l.direction = 'out'), 0)::bigint as money_out
    from base b
  )
  select
    f.id,
    f.name,
    f.kind,
    f.opening_on,
    f.opening,
    f.money_in,
    f.money_out,
    f.opening + f.money_in - f.money_out,
    d.counted,
    d.counted - d.expected,
    f.opening + f.money_in - f.money_out + coalesce(d.counted - d.expected, 0),
    d.closed_at,
    d.actor_name,
    d.note
  from figures f
  left join day_closes d on d.money_account_id = f.id and d.day = p_day
  order by case f.kind when 'cash' then 1 when 'bank' then 2 when 'mobile_money' then 3 else 4 end, f.name;
$$;

revoke all on function money_hivepay_account() from public, anon, authenticated;

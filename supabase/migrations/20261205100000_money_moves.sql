-- Moving money between the business's own accounts: cash banked, cash drawn
-- from the bank, mobile money sent to the bank. The business holds the same
-- money, so it's neither income nor an expense, but each account's balance
-- changes. Applied by hand: node scripts/apply-migration.mjs <this file>

create table money_moves (
  id               uuid primary key,
  tenant_id        uuid not null default default_tenant_id() references tenants (id),
  from_account_id  uuid not null references money_accounts (id) on delete restrict,
  to_account_id    uuid not null references money_accounts (id) on delete restrict,
  amount           bigint not null check (amount > 0),
  moved_on         date not null,
  reference        text,
  note             text,
  actor_id         text,
  actor_name       text not null,
  created_at       timestamptz not null default now(),
  voided_at        timestamptz,
  void_reason      text,
  voided_by_name   text,
  constraint money_moves_two_accounts check (from_account_id <> to_account_id)
);

create index money_moves_day_idx on money_moves (tenant_id, moved_on);

create trigger money_moves_void_only before update or delete on money_moves
  for each row execute function production_void_only();
create trigger money_moves_closed_day before insert or update on money_moves
  for each row execute function money_guard_closed_day('moved_on');

-- Retrying with the same id is safe. A bank or mobile money side always leaves a slip or transaction ID.
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
begin
  if p_from is null or p_to is null or p_from = p_to then raise exception 'DAYBOOK:move_same'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'DAYBOOK:bad_amount'; end if;
  if p_moved_on is null or p_moved_on > production_today(default_tenant_id()) then raise exception 'DAYBOOK:move_date'; end if;
  select count(*) into v_found from money_accounts where id in (p_from, p_to) and tenant_id = default_tenant_id();
  if v_found <> 2 then raise exception 'DAYBOOK:bad_account'; end if;
  if nullif(trim(p_reference), '') is null
     and exists (select 1 from money_accounts where id in (p_from, p_to) and kind <> 'cash') then
    raise exception 'DAYBOOK:move_reference';
  end if;
  insert into money_moves (id, from_account_id, to_account_id, amount, moved_on, reference, note, actor_id, actor_name)
  values (p_id, p_from, p_to, p_amount, p_moved_on, nullif(trim(p_reference), ''), nullif(trim(p_note), ''), p_actor_id, p_actor_name)
  on conflict (id) do nothing;
end;
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
  coalesce(a.id, money_default_account(m.method)) as money_account_id,
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
  money_default_account('mobile_money'),
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
  money_default_account('mobile_money'),
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
  case a.kind when 'bank' then 'bank_transfer' else a.kind end,
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

alter table money_moves enable row level security;

revoke all on money_moves from anon, authenticated;
revoke all on function money_move(uuid, uuid, uuid, bigint, date, text, text, text, text) from public, anon, authenticated;

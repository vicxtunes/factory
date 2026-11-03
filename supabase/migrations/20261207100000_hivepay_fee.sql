-- HivePay keeps 3% of every collection, so the money it holds is less than what
-- clients paid. Each successful collection now records its fee by itself: an
-- automatic expense, paid out of the HivePay account, so the balance and the
-- cost are both right. Stored per collection, so a later rate never rewrites the
-- past. Collections before this update aren't back-filled: the first count of
-- the HivePay balance already reflects them. Applied by hand:
-- node scripts/apply-migration.mjs <this file>

insert into expense_categories (key, name, automatic) values ('hivepay_fee', 'HivePay fees', true);

alter table expenses add column collection_id uuid references provider_collections (id) on delete restrict;

-- One live fee per collection. A collection that failed after all voids its fee.
create unique index expenses_collection_key on expenses (collection_id) where collection_id is not null and voided_at is null;

alter table expenses drop constraint expenses_source;
alter table expenses add constraint expenses_source check (
     (category = 'materials' and purchase_id is not null and repayment_id is null and collection_id is null and paid_from is not null)
  or (category = 'interest' and repayment_id is not null and purchase_id is null and collection_id is null and paid_from is not null)
  or (category = 'hivepay_fee' and collection_id is not null and purchase_id is null and repayment_id is null and paid_from is not null)
  or (category not in ('materials', 'interest', 'hivepay_fee') and purchase_id is null and repayment_id is null and collection_id is null and paid_from is null and nullif(trim(name), '') is not null)
);

create or replace function hivepay_record_fee()
returns trigger
language plpgsql
as $$
begin
  -- A client's payment must never fail because of this: if the fee can't be
  -- recorded, the money still goes through, and the gap shows at the next count.
  begin
    if new.status = 'succeeded' and (tg_op = 'INSERT' or old.status is distinct from 'succeeded') then
      insert into expenses (category, amount, paid_from, spent_on, name, recipient, collection_id, note, actor_name)
      values (
        'hivepay_fee',
        greatest(round(new.amount * 0.03)::bigint, 1),
        'mobile_money',
        production_today(default_tenant_id()),
        'HivePay fee',
        'HivePay',
        new.id,
        '3% of ' || new.amount::text,
        'HivePay'
      )
      on conflict (collection_id) where collection_id is not null and voided_at is null do nothing;
    elsif tg_op = 'UPDATE' and old.status = 'succeeded' and new.status <> 'succeeded' then
      update expenses
         set voided_at = now(), void_reason = 'The collection did not go through', voided_by_name = 'HivePay'
       where collection_id = new.id and voided_at is null;
    end if;
  exception when others then
    raise warning 'hivepay fee not recorded for collection %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

create trigger provider_collections_hivepay_fee after insert or update of status on provider_collections
  for each row execute function hivepay_record_fee();

create or replace function expense_pay(
  p_id uuid,
  p_expense uuid,
  p_amount bigint,
  p_actual bigint,
  p_paid_on date,
  p_account uuid,
  p_method text,
  p_phone text,
  p_reference text,
  p_note text,
  p_is_boss boolean,
  p_actor_id text,
  p_actor_name text
)
returns void
language plpgsql
as $$
declare
  v_expense expenses;
  v_total bigint;
  v_paid bigint;
begin
  if exists (select 1 from expense_payments where id = p_id) then return; end if;
  select * into v_expense from expenses where id = p_expense for update;
  if not found or v_expense.voided_at is not null then raise exception 'EXPENSE:gone'; end if;
  if v_expense.purchase_id is not null or v_expense.repayment_id is not null or v_expense.collection_id is not null then raise exception 'EXPENSE:automatic'; end if;
  if v_expense.approval = 'rejected' then raise exception 'EXPENSE:rejected'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'EXPENSE:amount'; end if;
  if p_paid_on is null or p_paid_on > production_today(default_tenant_id()) then raise exception 'EXPENSE:paid_date'; end if;
  if p_method not in ('cash', 'bank_transfer', 'mobile_money', 'other') then raise exception 'EXPENSE:method'; end if;
  if p_method in ('mobile_money', 'bank_transfer') and nullif(trim(p_reference), '') is null then raise exception 'EXPENSE:reference'; end if;
  perform 1 from money_accounts where id = p_account and tenant_id = default_tenant_id();
  if not found then raise exception 'EXPENSE:account'; end if;

  v_total := v_expense.amount;
  if v_expense.amount_is_estimate then
    if p_actual is null or p_actual <= 0 then raise exception 'EXPENSE:actual'; end if;
    v_total := p_actual;
    update expenses set
      amount = p_actual,
      amount_is_estimate = false,
      -- Someone else's approval was for the expected amount; a higher real one goes back to the boss.
      approval = case when expense_needs_approval(p_actual, p_is_boss) then 'waiting' else approval end
    where id = p_expense
    returning * into v_expense;
  end if;
  if v_expense.approval = 'waiting' then
    if p_is_boss then
      update expenses set approval = 'approved', approved_by_name = p_actor_name, approved_at = now() where id = p_expense;
    else
      raise exception 'EXPENSE:needs_approval';
    end if;
  end if;

  select coalesce(sum(amount), 0) into v_paid from expense_payments where expense_id = p_expense and voided_at is null;
  if p_amount > v_total - v_paid then raise exception 'EXPENSE:too_much'; end if;
  insert into expense_payments (id, expense_id, amount, paid_on, money_account_id, method, phone, reference, note, actor_id, actor_name)
  values (p_id, p_expense, p_amount, p_paid_on, p_account, p_method, nullif(trim(p_phone), ''), nullif(trim(p_reference), ''), nullif(trim(p_note), ''), p_actor_id, p_actor_name);
end;
$$;

create or replace function expense_void(p_expense uuid, p_reason text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_expense expenses;
begin
  if nullif(trim(p_reason), '') is null then raise exception 'EXPENSE:void_reason'; end if;
  select * into v_expense from expenses where id = p_expense for update;
  if not found or v_expense.voided_at is not null then raise exception 'EXPENSE:gone'; end if;
  if v_expense.purchase_id is not null or v_expense.repayment_id is not null or v_expense.collection_id is not null then raise exception 'EXPENSE:automatic'; end if;
  if exists (select 1 from expense_payments where expense_id = p_expense and voided_at is null) then raise exception 'EXPENSE:has_payments'; end if;
  update expenses set voided_at = now(), void_reason = trim(p_reason), voided_by_name = p_actor_name where id = p_expense;
end;
$$;

create or replace view expense_lines with (security_invoker = true) as
select
  e.id,
  e.tenant_id,
  e.category,
  c.name as category_name,
  coalesce(e.name, c.name) as name,
  e.description,
  coalesce(e.recipient, m.supplier, n.name) as recipient,
  e.amount,
  e.amount_is_estimate,
  e.spent_on,
  e.due_on,
  e.schedule_id,
  s.every as schedule_every,
  e.paid_from,
  e.purchase_id is not null or e.repayment_id is not null or e.collection_id is not null as automatic,
  case
    when e.paid_from = 'on_credit' then 0
    when e.paid_from is not null then e.amount
    else coalesce((select sum(p.amount) from expense_payments p where p.expense_id = e.id and p.voided_at is null), 0)
  end::bigint as paid,
  e.approval,
  e.approved_by_name,
  e.approved_at,
  e.approval_note,
  e.note,
  e.actor_name,
  e.created_at,
  e.voided_at,
  e.void_reason,
  e.voided_by_name
from expenses e
join expense_categories c on c.key = e.category
left join expense_schedules s on s.id = e.schedule_id
left join material_purchases m on m.id = e.purchase_id
left join loan_repayments r on r.id = e.repayment_id
left join loans l on l.id = r.loan_id
left join lenders n on n.id = l.lender_id;

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

revoke all on function hivepay_record_fee() from public, anon, authenticated;

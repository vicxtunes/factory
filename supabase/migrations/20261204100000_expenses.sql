-- Expenses: everything the business spends, one-time and recurring, with who
-- it's for, what's been paid, and the proof.
--
--   * expenses is widened: materials and interest stay automatic and paid; the
--     rest are recorded by hand and paid in one go or in parts.
--   * expense_schedules: rent, salaries (same amount) and electricity, water
--     (expected amount; the real one is entered when paying). The next one
--     appears by itself with its due date.
--   * expense_payments: each payment, from which account. They reach Today.
--   * expense_settings: above what amount the boss must approve.
--
-- Nothing is edited: a mistake is voided with a reason. Applied by hand:
-- node scripts/apply-migration.mjs <this file>

create table expense_categories (
  key        text primary key,
  tenant_id  uuid not null default default_tenant_id() references tenants (id),
  name       text not null check (nullif(trim(name), '') is not null),
  -- Materials and interest are recorded by themselves, never by hand.
  automatic  boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index expense_categories_name_key on expense_categories (tenant_id, lower(trim(name)));

insert into expense_categories (key, name, automatic) values
  ('salaries', 'Salaries', false),
  ('rent', 'Rent', false),
  ('utilities', 'Utilities', false),
  ('transport', 'Transport', false),
  ('marketing', 'Marketing', false),
  ('supplier_payments', 'Supplier payments', false),
  ('other', 'Other', false),
  ('materials', 'Materials', true),
  ('interest', 'Loan interest', true);

create table expense_settings (
  tenant_id       uuid primary key default default_tenant_id() references tenants (id),
  -- Null: nothing needs approval.
  approval_above  bigint check (approval_above >= 0),
  updated_by_name text not null,
  updated_at      timestamptz not null default now()
);

create table expense_schedules (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default default_tenant_id() references tenants (id),
  name             text not null check (nullif(trim(name), '') is not null),
  description      text,
  category         text not null references expense_categories (key),
  recipient        text,
  -- The amount, or what's expected when it varies.
  amount           bigint not null check (amount > 0),
  varies           boolean not null,
  every            text not null check (every in ('week', 'month', 'year')),
  first_due_on     date not null,
  -- How many have been created. The next is counted from the first due date,
  -- so the 31st comes back after February.
  created_count    integer not null default 0 check (created_count >= 0),
  -- The boss set it up, so the ones it makes don't need approving one by one.
  boss_approved    boolean not null,
  actor_id         text,
  actor_name       text not null,
  created_at       timestamptz not null default now(),
  ended_at         timestamptz,
  ended_by_name    text
);

alter table expenses drop constraint expenses_category_check;
alter table expenses drop constraint expenses_source;
alter table expenses drop constraint expenses_paid_from_check;
alter table expenses alter column paid_from drop not null;

alter table expenses
  add column name               text,
  add column description        text,
  add column recipient          text,
  add column due_on             date,
  add column schedule_id        uuid references expense_schedules (id) on delete restrict,
  -- The amount is only expected until the real one is entered when paying.
  add column amount_is_estimate boolean not null default false,
  add column approval           text not null default 'approved' check (approval in ('approved', 'waiting', 'rejected')),
  add column approved_by_name   text,
  add column approved_at        timestamptz,
  add column approval_note      text,
  add column actor_id           text,
  add constraint expenses_category_fkey foreign key (category) references expense_categories (key),
  add constraint expenses_paid_from_check check (paid_from in ('cash', 'bank_transfer', 'mobile_money', 'other', 'on_credit')),
  add constraint expenses_source check (
       (category = 'materials' and purchase_id is not null and repayment_id is null and paid_from is not null)
    or (category = 'interest' and repayment_id is not null and purchase_id is null and paid_from is not null)
    or (category not in ('materials', 'interest') and purchase_id is null and repayment_id is null and paid_from is null and nullif(trim(name), '') is not null)
  );

-- One for each due date, however often the schedule is run.
create unique index expenses_schedule_due_key on expenses (schedule_id, due_on) where schedule_id is not null;

-- History stays: only a void, an approval, and the real amount of an estimate can change.
create or replace function expenses_guard()
returns trigger
language plpgsql
as $$
declare
  v_open text[] := array['voided_at', 'void_reason', 'voided_by_name', 'amount', 'amount_is_estimate', 'approval', 'approved_by_name', 'approved_at', 'approval_note'];
begin
  if tg_op = 'DELETE'
     or old.voided_at is not null
     or (new.voided_at is not null and nullif(trim(new.void_reason), '') is null)
     or (new.amount <> old.amount and not old.amount_is_estimate)
     or (to_jsonb(new) - v_open) is distinct from (to_jsonb(old) - v_open) then
    raise exception 'PRODUCTION:history';
  end if;
  return new;
end;
$$;

drop trigger expenses_void_only on expenses;
create trigger expenses_guard before update or delete on expenses
  for each row execute function expenses_guard();

create table expense_payments (
  id                uuid primary key,
  tenant_id         uuid not null default default_tenant_id() references tenants (id),
  expense_id        uuid not null references expenses (id) on delete restrict,
  amount            bigint not null check (amount > 0),
  paid_on           date not null,
  money_account_id  uuid not null references money_accounts (id) on delete restrict,
  method            text not null check (method in ('cash', 'bank_transfer', 'mobile_money', 'other')),
  phone             text,
  reference         text,
  note              text,
  actor_id          text,
  actor_name        text not null,
  created_at        timestamptz not null default now(),
  voided_at         timestamptz,
  void_reason       text,
  voided_by_name    text
);

create index expense_payments_expense_idx on expense_payments (expense_id, paid_on);
create index expense_payments_day_idx on expense_payments (tenant_id, paid_on);

create trigger expense_payments_void_only before update or delete on expense_payments
  for each row execute function production_void_only();
create trigger expense_payments_closed_day before insert or update on expense_payments
  for each row execute function money_guard_closed_day('paid_on');

create table expense_documents (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references expenses (id) on delete restrict,
  path         text not null unique,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  actor_name   text not null,
  created_at   timestamptz not null default now()
);

create index expense_documents_expense_idx on expense_documents (expense_id);

create trigger expense_documents_append_only before update or delete on expense_documents
  for each row execute function money_history_append_only();

-- Receipts and invoices are private: served only through short-lived links.
insert into storage.buckets (id, name, public, file_size_limit)
values ('expense-documents', 'expense-documents', false, 26214400)
on conflict (id) do nothing;

-- --- Recording ------------------------------------------------------------------

-- Does this amount wait for the boss?
create or replace function expense_needs_approval(p_amount bigint, p_is_boss boolean)
returns boolean
language sql
stable
as $$
  select not p_is_boss and coalesce(p_amount > (select s.approval_above from expense_settings s where s.tenant_id = default_tenant_id()), false);
$$;

-- Retrying with the same id is safe.
create or replace function expense_record(
  p_id uuid,
  p_name text,
  p_description text,
  p_category text,
  p_amount bigint,
  p_recipient text,
  p_spent_on date,
  p_due_on date,
  p_is_boss boolean,
  p_actor_id text,
  p_actor_name text
)
returns void
language plpgsql
as $$
begin
  if nullif(trim(p_name), '') is null then raise exception 'EXPENSE:name'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'EXPENSE:amount'; end if;
  if p_spent_on is null or p_spent_on > production_today(default_tenant_id()) then raise exception 'EXPENSE:date'; end if;
  perform 1 from expense_categories where key = p_category and not automatic;
  if not found then raise exception 'EXPENSE:category'; end if;
  insert into expenses (id, category, amount, spent_on, name, description, recipient, due_on, approval, approved_by_name, approved_at, actor_id, actor_name)
  values (
    p_id, p_category, p_amount, p_spent_on, trim(p_name), nullif(trim(p_description), ''), nullif(trim(p_recipient), ''), p_due_on,
    case when expense_needs_approval(p_amount, p_is_boss) then 'waiting' else 'approved' end,
    case when p_is_boss then p_actor_name end,
    case when p_is_boss then now() end,
    p_actor_id, p_actor_name
  )
  on conflict (id) do nothing;
end;
$$;

-- Creates what's due within two weeks, so it shows before it's due. Past ones a
-- schedule missed are created too: they're still owed.
create or replace function expense_generate_due(p_today date)
returns integer
language plpgsql
as $$
declare
  v_schedule expense_schedules;
  v_due date;
  v_made integer := 0;
begin
  for v_schedule in
    select * from expense_schedules where ended_at is null and tenant_id = default_tenant_id() for update
  loop
    loop
      v_due := (v_schedule.first_due_on + (v_schedule.created_count * ('1 ' || v_schedule.every)::interval))::date;
      exit when v_due > p_today + 14;
      insert into expenses (category, amount, spent_on, name, description, recipient, due_on, schedule_id, amount_is_estimate, approval, approved_by_name, approved_at, actor_id, actor_name)
      values (
        v_schedule.category, v_schedule.amount, least(v_due, p_today), v_schedule.name, v_schedule.description, v_schedule.recipient, v_due, v_schedule.id, v_schedule.varies,
        -- An expected amount is checked again when the real one is entered.
        case when not v_schedule.boss_approved and expense_needs_approval(v_schedule.amount, false) then 'waiting' else 'approved' end,
        case when v_schedule.boss_approved then v_schedule.actor_name end,
        case when v_schedule.boss_approved then now() end,
        v_schedule.actor_id, v_schedule.actor_name
      )
      on conflict do nothing;
      if found then v_made := v_made + 1; end if;
      v_schedule.created_count := v_schedule.created_count + 1;
      update expense_schedules set created_count = v_schedule.created_count where id = v_schedule.id;
    end loop;
  end loop;
  return v_made;
end;
$$;

create or replace function expense_schedule_add(
  p_id uuid,
  p_name text,
  p_description text,
  p_category text,
  p_amount bigint,
  p_varies boolean,
  p_every text,
  p_first_due_on date,
  p_recipient text,
  p_is_boss boolean,
  p_actor_id text,
  p_actor_name text
)
returns void
language plpgsql
as $$
begin
  if nullif(trim(p_name), '') is null then raise exception 'EXPENSE:name'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'EXPENSE:amount'; end if;
  if p_first_due_on is null then raise exception 'EXPENSE:first_due'; end if;
  if p_every not in ('week', 'month', 'year') then raise exception 'EXPENSE:every'; end if;
  perform 1 from expense_categories where key = p_category and not automatic;
  if not found then raise exception 'EXPENSE:category'; end if;
  insert into expense_schedules (id, name, description, category, recipient, amount, varies, every, first_due_on, boss_approved, actor_id, actor_name)
  values (p_id, trim(p_name), nullif(trim(p_description), ''), p_category, nullif(trim(p_recipient), ''), p_amount, p_varies, p_every, p_first_due_on, p_is_boss, p_actor_id, p_actor_name)
  on conflict (id) do nothing;
  perform expense_generate_due(production_today(default_tenant_id()));
end;
$$;

-- --- Paying ---------------------------------------------------------------------

-- A payment, whole or part. p_actual: the real amount, when it was only expected.
-- Retrying with the same id is safe.
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
  if v_expense.purchase_id is not null or v_expense.repayment_id is not null then raise exception 'EXPENSE:automatic'; end if;
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

create or replace function expense_decide(p_expense uuid, p_approve boolean, p_note text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_expense expenses;
begin
  select * into v_expense from expenses where id = p_expense for update;
  if not found or v_expense.voided_at is not null then raise exception 'EXPENSE:gone'; end if;
  if v_expense.approval <> 'waiting' then raise exception 'EXPENSE:not_waiting'; end if;
  if not p_approve and nullif(trim(p_note), '') is null then raise exception 'EXPENSE:reject_reason'; end if;
  update expenses set
    approval = case when p_approve then 'approved' else 'rejected' end,
    approved_by_name = p_actor_name,
    approved_at = now(),
    approval_note = nullif(trim(p_note), '')
  where id = p_expense;
end;
$$;

-- A mistake: only with no payments left on it, and never the automatic ones
-- (they follow the purchase or repayment they came from).
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
  if v_expense.purchase_id is not null or v_expense.repayment_id is not null then raise exception 'EXPENSE:automatic'; end if;
  if exists (select 1 from expense_payments where expense_id = p_expense and voided_at is null) then raise exception 'EXPENSE:has_payments'; end if;
  update expenses set voided_at = now(), void_reason = trim(p_reason), voided_by_name = p_actor_name where id = p_expense;
end;
$$;

-- --- Reading --------------------------------------------------------------------

create view expense_lines with (security_invoker = true) as
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
  e.purchase_id is not null or e.repayment_id is not null as automatic,
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

-- Today's money out gains what's paid on expenses.
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
where p.voided_at is null;

-- --- Who can reach it -----------------------------------------------------------

alter table expense_categories enable row level security;
alter table expense_settings enable row level security;
alter table expense_schedules enable row level security;
alter table expense_payments enable row level security;
alter table expense_documents enable row level security;

revoke all on expense_categories, expense_settings, expense_schedules, expense_payments, expense_documents, expense_lines from anon, authenticated;
revoke all on function expenses_guard() from public, anon, authenticated;
revoke all on function expense_needs_approval(bigint, boolean) from public, anon, authenticated;
revoke all on function expense_record(uuid, text, text, text, bigint, text, date, date, boolean, text, text) from public, anon, authenticated;
revoke all on function expense_generate_due(date) from public, anon, authenticated;
revoke all on function expense_schedule_add(uuid, text, text, text, bigint, boolean, text, date, text, boolean, text, text) from public, anon, authenticated;
revoke all on function expense_pay(uuid, uuid, bigint, bigint, date, uuid, text, text, text, text, boolean, text, text) from public, anon, authenticated;
revoke all on function expense_decide(uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function expense_void(uuid, text, text) from public, anon, authenticated;

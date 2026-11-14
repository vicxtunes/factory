-- Petty cash and the month-end check (owner, 2026-11-14/15).
--
-- Petty cash: two boxes for day-to-day payments, 'Petty cash: Office' held by
-- the Receptionists and 'Petty cash: Factory' held by the Supervisors. The boss
-- sets each box's float and tops it up from another account (a money move).
-- The holder records what they pay from their box: an expense, paid from it,
-- with no approval limit. A box isn't counted when the day closes (it isn't in
-- the office safe); it is checked at month end.
--
-- Month-end check: from 20:00 on a month's last day, the boss or anyone with
-- Accounts → manage enters what each account really holds. The books' figure is
-- the account's closing on the last day (as Accounts → Today works it out). A
-- difference needs a reason; the check is sent to the boss, who approves it and
-- says what each difference was: a shortage (an expense, 'Month-end shortages',
-- paid from that account), a surplus (other income into it), or a wrong
-- starting balance (a fix, neither income nor spending). All three are dated the
-- month's last day, although that day is closed. Once approved, nothing in the
-- check changes.
--
-- Applied by hand: node scripts/apply-migration.mjs <this file>

-- --- Petty cash ----------------------------------------------------------------

alter table money_accounts drop constraint money_accounts_kind_check;
alter table money_accounts add constraint money_accounts_kind_check check (kind in ('cash', 'bank', 'mobile_money', 'hivepay', 'petty_cash'));

alter table money_accounts
  -- The staff role whose members hold a petty cash box.
  add column holder_role_id uuid references staff_roles (id) on delete restrict,
  -- What the boss keeps a petty cash box topped up to.
  add column float_amount bigint check (float_amount >= 0),
  add constraint money_accounts_petty_cash check ((kind = 'petty_cash') = (holder_role_id is not null));

insert into money_accounts (name, kind, holder_role_id)
select 'Petty cash: Office', 'petty_cash', r.id from staff_roles r where r.built_in = 'receptionist'
union all
select 'Petty cash: Factory', 'petty_cash', r.id from staff_roles r where r.built_in = 'supervisor';

do $$
begin
  if (select count(*) from money_accounts where kind = 'petty_cash') <> 2 then
    raise exception 'petty cash: the Receptionist and Supervisor roles must both exist';
  end if;
end;
$$;

-- They start empty today: the boss's first top-up is a money move into them.
insert into money_opening_balances (money_account_id, opening_on, amount, actor_name)
select id, production_today(default_tenant_id()), 0, 'Aming (automatic)' from money_accounts where kind = 'petty_cash';

-- How money leaves or enters an account of this kind, for lines that only know the account.
create or replace function money_account_method(p_kind text)
returns text
language sql
immutable
as $$
  select case p_kind when 'bank' then 'bank_transfer' when 'hivepay' then 'mobile_money' when 'mobile_money' then 'mobile_money' else 'cash' end;
$$;

-- Moves between cash and a petty cash box need no reference: it's notes changing hands.
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
     and exists (select 1 from money_accounts where id in (p_from, p_to) and kind not in ('cash', 'petty_cash')) then
    raise exception 'DAYBOOK:move_reference';
  end if;
  insert into money_moves (id, from_account_id, to_account_id, amount, moved_on, reference, note, actor_id, actor_name)
  values (p_id, p_from, p_to, p_amount, p_moved_on, nullif(trim(p_reference), ''), nullif(trim(p_note), ''), p_actor_id, p_actor_name)
  on conflict (id) do nothing;
end;
$$;

create or replace function petty_cash_set_float(p_account uuid, p_amount bigint)
returns void
language plpgsql
as $$
begin
  if p_amount is not null and p_amount < 0 then raise exception 'DAYBOOK:bad_amount'; end if;
  update money_accounts set float_amount = p_amount
   where id = p_account and kind = 'petty_cash' and tenant_id = default_tenant_id();
  if not found then raise exception 'PETTY:bad_box'; end if;
end;
$$;

-- What a box holds now, as Today works it out.
create or replace function petty_cash_balance(p_account uuid)
returns bigint
language sql
stable
as $$
  select closing from money_day_balances(production_today(default_tenant_id())) where money_account_id = p_account;
$$;

-- A payment from a petty cash box: an expense, approved (no limit), paid today
-- from the box. The box can't pay more than it holds.
create or replace function petty_cash_spend(
  p_id uuid,
  p_account uuid,
  p_name text,
  p_category text,
  p_amount bigint,
  p_recipient text,
  p_description text,
  p_actor_id text,
  p_actor_name text
)
returns void
language plpgsql
as $$
declare
  v_today date := production_today(default_tenant_id());
  v_balance bigint;
begin
  perform pg_advisory_xact_lock(hashtext('petty_cash_spend'), hashtext(p_account::text));
  if exists (select 1 from expenses where id = p_id) then return; end if;
  perform 1 from money_accounts where id = p_account and kind = 'petty_cash' and tenant_id = default_tenant_id();
  if not found then raise exception 'PETTY:bad_box'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'EXPENSE:name'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'EXPENSE:amount'; end if;
  perform 1 from expense_categories where key = p_category and not automatic;
  if not found then raise exception 'EXPENSE:category'; end if;
  v_balance := coalesce(petty_cash_balance(p_account), 0);
  if p_amount > v_balance then raise exception 'PETTY:not_enough:%', v_balance; end if;
  insert into expenses (id, category, amount, spent_on, name, description, recipient, approval, actor_id, actor_name)
  values (p_id, p_category, p_amount, v_today, trim(p_name), nullif(trim(p_description), ''), nullif(trim(p_recipient), ''), 'approved', p_actor_id, p_actor_name);
  insert into expense_payments (id, expense_id, amount, paid_on, money_account_id, method, note, actor_id, actor_name)
  values (gen_random_uuid(), p_id, p_amount, v_today, p_account, 'cash', 'Paid from petty cash', p_actor_id, p_actor_name);
end;
$$;

-- --- Month-end check -------------------------------------------------------------

insert into expense_categories (key, name, automatic) values ('month_end_shortage', 'Month-end shortages', true)
on conflict (key) do nothing;

create table month_checks (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null default default_tenant_id() references tenants (id),
  -- The month's first day.
  month             date not null check (extract(day from month) = 1),
  status            text not null default 'draft' check (status in ('draft', 'waiting', 'approved')),
  submitted_by_name text,
  submitted_at      timestamptz,
  approved_by_name  text,
  approved_at       timestamptz,
  created_at        timestamptz not null default now(),
  unique (tenant_id, month)
);

create table month_check_lines (
  check_id          uuid not null references month_checks (id) on delete restrict,
  money_account_id  uuid not null references money_accounts (id) on delete restrict,
  -- The books, worked out again on every save until the boss approves.
  opening           bigint not null,
  money_in          bigint not null,
  money_out         bigint not null,
  -- Differences found when days were closed with a count.
  day_counts        bigint not null,
  books             bigint not null,
  actual            bigint check (actual >= 0),
  reason            text,
  entered_by_name   text,
  entered_at        timestamptz,
  booked_as         text check (booked_as in ('shortage', 'surplus', 'opening')),
  primary key (check_id, money_account_id)
);

alter table month_checks enable row level security;
alter table month_check_lines enable row level security;
revoke all on table month_checks, month_check_lines from anon, authenticated;

-- An approved check is history.
create or replace function month_check_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'month_checks' then
    if tg_op = 'DELETE' or old.status = 'approved' then raise exception 'MONTHCHECK:approved'; end if;
    return new;
  end if;
  if exists (select 1 from month_checks where id = old.check_id and status = 'approved') then raise exception 'MONTHCHECK:approved'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger month_checks_guard before update or delete on month_checks
  for each row execute function month_check_guard();
create trigger month_check_lines_guard before update or delete on month_check_lines
  for each row execute function month_check_guard();

-- A closed day takes the month-end check's bookings: they belong on the month's last day.
create or replace function money_day_open(p_day date)
returns void
language plpgsql
stable
as $$
begin
  if current_setting('aming.month_check', true) = 'on' then return; end if;
  if p_day < production_today(default_tenant_id())
     and exists (select 1 from day_closes where tenant_id = default_tenant_id() and day >= p_day) then
    raise exception 'DAYBOOK:day_closed';
  end if;
end;
$$;

-- Each account's month: from its opening (the month's first day, or the day its
-- opening balance starts if later) to its closing on the last day. Accounts with
-- no opening balance by the last day aren't in the month.
create or replace function month_check_figures(p_month date)
returns table (money_account_id uuid, opening bigint, money_in bigint, money_out bigint, day_counts bigint, books bigint)
language sql
stable
as $$
  with bounds as (
    select a.id, b.amount as start, b.opening_on,
           greatest(p_month, b.opening_on) as first_day,
           (p_month + interval '1 month - 1 day')::date as last_day
      from money_accounts a
      join money_opening_balances b on b.money_account_id = a.id
     where a.tenant_id = default_tenant_id()
       and b.opening_on <= (p_month + interval '1 month - 1 day')::date
  ),
  lines as (
    select l.money_account_id, l.day, l.direction, l.amount from money_day_lines l where l.money_account_id is not null
  ),
  counts as (
    select d.money_account_id, d.day, d.counted - d.expected as diff from day_closes d where d.counted is not null
  )
  select
    b.id,
    (b.start
      + coalesce((select sum(case l.direction when 'in' then l.amount else -l.amount end) from lines l where l.money_account_id = b.id and l.day >= b.opening_on and l.day < b.first_day), 0)
      + coalesce((select sum(c.diff) from counts c where c.money_account_id = b.id and c.day >= b.opening_on and c.day < b.first_day), 0))::bigint,
    coalesce((select sum(l.amount) from lines l where l.money_account_id = b.id and l.direction = 'in' and l.day between b.first_day and b.last_day), 0)::bigint,
    coalesce((select sum(l.amount) from lines l where l.money_account_id = b.id and l.direction = 'out' and l.day between b.first_day and b.last_day), 0)::bigint,
    coalesce((select sum(c.diff) from counts c where c.money_account_id = b.id and c.day between b.first_day and b.last_day), 0)::bigint,
    (b.start
      + coalesce((select sum(case l.direction when 'in' then l.amount else -l.amount end) from lines l where l.money_account_id = b.id and l.day >= b.opening_on and l.day <= b.last_day), 0)
      + coalesce((select sum(c.diff) from counts c where c.money_account_id = b.id and c.day >= b.opening_on and c.day <= b.last_day), 0))::bigint
  from bounds b;
$$;

-- Open from 20:00 on the month's last day (CLOSE_FROM_HOUR, as the day close).
create or replace function month_check_is_open(p_month date)
returns boolean
language sql
stable
as $$
  select (now() at time zone t.time_zone) >= ((p_month + interval '1 month - 1 day')::date + time '20:00')
    from tenants t where t.id = default_tenant_id();
$$;

-- The check for a month, made if it isn't there, with the books worked out again.
create or replace function month_check_refresh(p_month date)
returns uuid
language plpgsql
as $$
declare
  v_check uuid;
begin
  if p_month is null or extract(day from p_month) <> 1 then raise exception 'MONTHCHECK:bad_month'; end if;
  if not month_check_is_open(p_month) then raise exception 'MONTHCHECK:not_yet'; end if;
  perform pg_advisory_xact_lock(hashtext('month_check'), hashtext(p_month::text));
  insert into month_checks (month) values (p_month) on conflict (tenant_id, month) do nothing;
  select id into v_check from month_checks where tenant_id = default_tenant_id() and month = p_month;
  if (select status from month_checks where id = v_check) = 'approved' then raise exception 'MONTHCHECK:approved'; end if;
  insert into month_check_lines (check_id, money_account_id, opening, money_in, money_out, day_counts, books)
  select v_check, f.money_account_id, f.opening, f.money_in, f.money_out, f.day_counts, f.books from month_check_figures(p_month) f
  on conflict (check_id, money_account_id) do update
    set opening = excluded.opening, money_in = excluded.money_in, money_out = excluded.money_out,
        day_counts = excluded.day_counts, books = excluded.books;
  return v_check;
end;
$$;

-- What each account really holds, and why it differs. Saving sends it back to
-- draft: it's sent to the boss again.
create or replace function month_check_save(p_month date, p_lines jsonb, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_check uuid := month_check_refresh(p_month);
  v_line jsonb;
  v_actual bigint;
begin
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_actual := (v_line ->> 'actual')::bigint;
    if v_actual < 0 then raise exception 'DAYBOOK:bad_amount'; end if;
    update month_check_lines
       set actual = v_actual, reason = nullif(trim(v_line ->> 'reason'), ''), entered_by_name = p_actor_name, entered_at = now()
     where check_id = v_check and money_account_id = (v_line ->> 'account')::uuid
       and (actual is distinct from v_actual or reason is distinct from nullif(trim(v_line ->> 'reason'), ''));
  end loop;
  update month_checks set status = 'draft', submitted_by_name = null, submitted_at = null where id = v_check and status <> 'draft';
end;
$$;

create or replace function month_check_ready(p_check uuid)
returns void
language plpgsql
as $$
begin
  if exists (select 1 from month_check_lines where check_id = p_check and actual is null) then raise exception 'MONTHCHECK:missing'; end if;
  if exists (select 1 from month_check_lines where check_id = p_check and actual <> books and reason is null) then raise exception 'MONTHCHECK:reason'; end if;
end;
$$;

create or replace function month_check_submit(p_month date, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_check uuid := month_check_refresh(p_month);
begin
  perform month_check_ready(v_check);
  update month_checks set status = 'waiting', submitted_by_name = p_actor_name, submitted_at = now() where id = v_check;
end;
$$;

-- The boss approves, saying what each difference was, and it's booked on the month's last day.
create or replace function month_check_approve(p_month date, p_bookings jsonb, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_check uuid;
  v_last date := (p_month + interval '1 month - 1 day')::date;
  v_label text := to_char(p_month, 'FMMonth YYYY');
  v_line record;
  v_as text;
  v_diff bigint;
  v_expense uuid;
begin
  if (select status from month_checks where tenant_id = default_tenant_id() and month = p_month) is distinct from 'waiting' then
    raise exception 'MONTHCHECK:not_sent';
  end if;
  v_check := month_check_refresh(p_month);
  perform month_check_ready(v_check);
  perform set_config('aming.month_check', 'on', true);
  for v_line in
    select l.*, a.name, a.kind from month_check_lines l join money_accounts a on a.id = l.money_account_id
     where l.check_id = v_check and l.actual <> l.books
  loop
    v_diff := v_line.actual - v_line.books;
    select b ->> 'as' into v_as from jsonb_array_elements(coalesce(p_bookings, '[]'::jsonb)) b where (b ->> 'account')::uuid = v_line.money_account_id;
    if v_as is null or v_as not in ('shortage', 'surplus', 'opening')
       or (v_as = 'shortage' and v_diff > 0) or (v_as = 'surplus' and v_diff < 0) then
      raise exception 'MONTHCHECK:booking';
    end if;
    update month_check_lines set booked_as = v_as where check_id = v_check and money_account_id = v_line.money_account_id;
    if v_as = 'shortage' then
      v_expense := gen_random_uuid();
      insert into expenses (id, category, amount, spent_on, name, description, approval, approved_by_name, approved_at, actor_name)
      values (v_expense, 'month_end_shortage', -v_diff, v_last, 'Month-end shortage: ' || v_line.name || ', ' || v_label, v_line.reason, 'approved', p_actor_name, now(), p_actor_name);
      insert into expense_payments (id, expense_id, amount, paid_on, money_account_id, method, note, actor_name)
      values (gen_random_uuid(), v_expense, -v_diff, v_last, v_line.money_account_id, money_account_method(v_line.kind), 'Month-end check', p_actor_name);
    elsif v_as = 'surplus' then
      insert into other_money_in (kind, amount, sender_name, method, received_on, money_account_id, note, actor_name)
      values ('other_income', v_diff, 'Month-end surplus', 'other', v_last, v_line.money_account_id, 'Month-end surplus, ' || v_label || ': ' || v_line.reason, p_actor_name);
    end if;
  end loop;
  perform set_config('aming.month_check', 'off', true);
  update month_checks set status = 'approved', approved_by_name = p_actor_name, approved_at = now() where id = v_check;
end;
$$;

-- --- The day book: petty cash boxes' method, and starting-balance fixes ----------

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
  money_account_method(a.kind),
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
where e.voided_at is null
union all
-- A month-end check's starting-balance fix: not income or spending, only where
-- the balance really stood. Dated the month's last day.
select
  k.tenant_id,
  md5(l.check_id::text || l.money_account_id::text)::uuid,
  case when l.actual > l.books then 'in' else 'out' end,
  'opening_fix',
  (k.month + interval '1 month - 1 day')::date,
  k.approved_at,
  abs(l.actual - l.books),
  l.money_account_id,
  money_account_method(a.kind),
  'Starting balance fix',
  null,
  null,
  null,
  l.reason,
  k.approved_by_name,
  k.approved_at
from month_check_lines l
join month_checks k on k.id = l.check_id
join money_accounts a on a.id = l.money_account_id
where k.status = 'approved' and l.booked_as = 'opening';


create or replace function money_flow(p_from date, p_to date)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'moneyIn', coalesce(sum(amount) filter (where direction = 'in'), 0),
    'moneyOut', coalesce(sum(amount) filter (where direction = 'out'), 0)
  )
  from money_day_lines
  where tenant_id = default_tenant_id()
    and kind not in ('move', 'opening_fix')
    and (p_from is null or day >= p_from)
    and (p_to is null or day <= p_to)
$$;

-- --- Reminder: once per day it goes out ---------------------------------------------

create table month_check_reminders (
  day     date primary key,
  sent_at timestamptz not null default now()
);
alter table month_check_reminders enable row level security;
revoke all on table month_check_reminders from anon, authenticated;

revoke all on function money_account_method(text) from public, anon, authenticated;
revoke all on function money_move(uuid, uuid, uuid, bigint, date, text, text, text, text) from public, anon, authenticated;
revoke all on function petty_cash_set_float(uuid, bigint) from public, anon, authenticated;
revoke all on function petty_cash_balance(uuid) from public, anon, authenticated;
revoke all on function petty_cash_spend(uuid, uuid, text, text, bigint, text, text, text, text) from public, anon, authenticated;
revoke all on function month_check_guard() from public, anon, authenticated;
revoke all on function money_day_open(date) from public, anon, authenticated;
revoke all on function month_check_figures(date) from public, anon, authenticated;
revoke all on function month_check_is_open(date) from public, anon, authenticated;
revoke all on function month_check_refresh(date) from public, anon, authenticated;
revoke all on function month_check_save(date, jsonb, text) from public, anon, authenticated;
revoke all on function month_check_ready(uuid) from public, anon, authenticated;
revoke all on function month_check_submit(date, text) from public, anon, authenticated;
revoke all on function month_check_approve(date, jsonb, text) from public, anon, authenticated;
revoke all on function money_flow(date, date) from public, anon, authenticated;

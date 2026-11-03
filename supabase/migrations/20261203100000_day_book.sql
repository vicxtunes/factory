-- The day book: one place that says, for each of cash, bank and mobile money,
-- opening balance + money in − money out = closing, for any day.
--
--   * money_opening_balances: what was really counted on the day we start.
--   * wallet_adjustment_money: a wallet deduction where money really left an
--     account (cash handed back, or a deposit that never truly arrived).
--   * money_day_lines: every movement of money, in and out, with its account.
--   * day_closes: the count at the end of a day and any difference. A closed
--     day can't be changed by hand; a difference carries into the next day.
--
-- A balance is always worked out from the lines, never stored, so it can't
-- drift from them. Applied by hand: node scripts/apply-migration.mjs <this file>

create table money_opening_balances (
  money_account_id  uuid primary key references money_accounts (id) on delete restrict,
  tenant_id         uuid not null default default_tenant_id() references tenants (id),
  -- The balance at the start of this day: this day's own lines count on top.
  opening_on        date not null,
  amount            bigint not null check (amount >= 0),
  actor_id          text,
  actor_name        text not null,
  created_at        timestamptz not null default now()
);

create trigger money_opening_balances_append_only before update or delete on money_opening_balances
  for each row execute function money_history_append_only();

create table wallet_adjustment_money (
  entry_id          uuid primary key references wallet_transactions (id) on delete restrict,
  money_account_id  uuid not null references money_accounts (id) on delete restrict,
  left_on           date not null,
  created_at        timestamptz not null default now()
);

create trigger wallet_adjustment_money_append_only before update or delete on wallet_adjustment_money
  for each row execute function money_history_append_only();

create table day_closes (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null default default_tenant_id() references tenants (id),
  day               date not null,
  money_account_id  uuid not null references money_accounts (id) on delete restrict,
  -- What the lines said when it was closed, and what was really there.
  -- Counted is empty when nobody could check that account (bank, mobile money).
  expected          bigint not null,
  counted           bigint check (counted >= 0),
  note              text,
  actor_id          text,
  actor_name        text not null,
  closed_at         timestamptz not null default now(),
  unique (day, money_account_id)
);

create index day_closes_tenant_day_idx on day_closes (tenant_id, day desc);

create trigger day_closes_append_only before update or delete on day_closes
  for each row execute function money_history_append_only();

-- --- Which account money without one belongs to ------------------------------

-- Older and automatic money says how it came, not where it went. 'other' stays
-- with no account: Today shows it apart rather than guess.
create or replace function money_default_account(p_method text)
returns uuid
language sql
stable
as $$
  select a.id
    from money_accounts a
   where a.tenant_id = default_tenant_id()
     and a.kind = case p_method
       when 'cash' then 'cash'
       when 'mobile_money' then 'mobile_money'
       when 'bank_transfer' then 'bank'
     end
   order by a.created_at
   limit 1;
$$;

-- --- Every movement of money --------------------------------------------------

create view money_day_lines with (security_invoker = true) as
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
left join clients c on c.id = x.client_id;

-- --- A day's balances ----------------------------------------------------------

-- For each account: opening + in − out = expected, then the count if the day is
-- closed. Money before an account's opening day isn't counted: the count on
-- that day already holds it. A difference found at a close carries forward.
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
  order by case f.kind when 'cash' then 1 when 'bank' then 2 else 3 end, f.name;
$$;

-- --- Starting and closing ------------------------------------------------------

-- Once per account. A later mistake shows up as a difference at a close.
create or replace function money_set_opening(p_account uuid, p_amount bigint, p_actor_id text, p_actor_name text)
returns void
language plpgsql
as $$
begin
  if p_amount is null or p_amount < 0 then raise exception 'DAYBOOK:bad_amount'; end if;
  perform 1 from money_accounts where id = p_account and tenant_id = default_tenant_id();
  if not found then raise exception 'DAYBOOK:bad_account'; end if;
  insert into money_opening_balances (money_account_id, opening_on, amount, actor_id, actor_name)
  values (p_account, production_today(default_tenant_id()), p_amount, p_actor_id, p_actor_name)
  on conflict (money_account_id) do nothing;
  if not found then raise exception 'DAYBOOK:opening_set'; end if;
end;
$$;

-- p_counts: [{ "account": uuid, "counted": number | null }]. Cash must be
-- counted; bank and mobile money are checked when someone can see the balance.
-- Days close in order: a skipped day can't be closed afterwards, because the
-- later close has already been worked out without it.
create or replace function money_close_day(p_day date, p_counts jsonb, p_note text, p_actor_id text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_tenant uuid := default_tenant_id();
  v_row record;
  v_counted bigint;
begin
  perform pg_advisory_xact_lock(hashtext('money_close_day'));
  if p_day > production_today(v_tenant) then raise exception 'DAYBOOK:future_day'; end if;
  if exists (select 1 from day_closes where tenant_id = v_tenant and day >= p_day) then raise exception 'DAYBOOK:already_closed'; end if;
  if exists (select 1 from money_accounts a where a.tenant_id = v_tenant and not exists (select 1 from money_opening_balances b where b.money_account_id = a.id and b.opening_on <= p_day)) then
    raise exception 'DAYBOOK:opening_missing';
  end if;
  for v_row in select * from money_day_balances(p_day) loop
    select (c ->> 'counted')::bigint into v_counted from jsonb_array_elements(p_counts) c where (c ->> 'account')::uuid = v_row.money_account_id;
    if v_counted < 0 then raise exception 'DAYBOOK:bad_amount'; end if;
    if v_row.kind = 'cash' and v_counted is null then raise exception 'DAYBOOK:count_cash'; end if;
    -- A difference is always explained.
    if v_counted is distinct from v_row.expected and v_counted is not null and nullif(trim(p_note), '') is null then
      raise exception 'DAYBOOK:note_needed';
    end if;
    insert into day_closes (tenant_id, day, money_account_id, expected, counted, note, actor_id, actor_name)
    values (v_tenant, p_day, v_row.money_account_id, v_row.expected, v_counted, nullif(trim(p_note), ''), p_actor_id, p_actor_name);
  end loop;
end;
$$;

-- --- A closed day doesn't change -----------------------------------------------

-- Refuses hand-entered money on or before the last closed day, adding or
-- voiding. Today stays open to money that arrives after closing: it shows as
-- late and carries into tomorrow's opening, so the count isn't touched.
-- Money that arrives by itself (HivePay, payouts) isn't stopped: it happened.
create or replace function money_day_open(p_day date)
returns void
language plpgsql
stable
as $$
begin
  if p_day < production_today(default_tenant_id())
     and exists (select 1 from day_closes where tenant_id = default_tenant_id() and day >= p_day) then
    raise exception 'DAYBOOK:day_closed';
  end if;
end;
$$;

create or replace function money_guard_closed_day()
returns trigger
language plpgsql
as $$
begin
  -- Only a new line or a void moves money on that day.
  if tg_op = 'UPDATE' then
    if old.voided_at is not null or new.voided_at is null then return new; end if;
  end if;
  perform money_day_open((to_jsonb(new) ->> tg_argv[0])::date);
  return new;
end;
$$;

create trigger other_money_in_closed_day before insert or update on other_money_in
  for each row execute function money_guard_closed_day('received_on');
create trigger material_purchases_closed_day before insert or update on material_purchases
  for each row execute function money_guard_closed_day('purchased_on');
create trigger loans_closed_day before insert or update on loans
  for each row execute function money_guard_closed_day('received_on');
create trigger loan_repayments_closed_day before insert or update on loan_repayments
  for each row execute function money_guard_closed_day('paid_on');
create trigger money_in_details_closed_day before insert on money_in_details
  for each row execute function money_guard_closed_day('received_on');

-- --- Money handed back from a wallet --------------------------------------------

-- Takes from a wallet and says which account the money left, in one go.
create or replace function money_wallet_take(
  p_client uuid,
  p_amount bigint,
  p_note text,
  p_account uuid,
  p_actor_type text,
  p_actor_id text,
  p_actor_name text
)
returns bigint
language plpgsql
as $$
declare
  v_row wallet_transactions;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'WALLET:invalid_amount'; end if;
  perform 1 from money_accounts where id = p_account and tenant_id = default_tenant_id();
  if not found then raise exception 'WALLET:source_account'; end if;
  v_row := wallet_post(p_client, 'adjustment', -p_amount, null, null, p_note, p_actor_type, p_actor_id, p_actor_name);
  insert into wallet_adjustment_money (entry_id, money_account_id, left_on)
  values (v_row.id, p_account, production_today(default_tenant_id()));
  return v_row.balance_after;
end;
$$;

-- Undoing it would put the money back in the wallet while the day book still
-- says it left. Money that really comes back is a deposit.
create or replace function money_guard_undo_taken()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from wallet_adjustment_money where entry_id = new.reverses_id) then
    raise exception 'WALLET:adjust_money_left';
  end if;
  return new;
end;
$$;

create trigger wallet_adjustment_reversals_money_left before insert on wallet_adjustment_reversals
  for each row execute function money_guard_undo_taken();

-- --- Who can reach it -----------------------------------------------------------

alter table money_opening_balances enable row level security;
alter table wallet_adjustment_money enable row level security;
alter table day_closes enable row level security;

revoke all on money_opening_balances, wallet_adjustment_money, day_closes, money_day_lines from anon, authenticated;
revoke all on function money_default_account(text) from public, anon, authenticated;
revoke all on function money_day_balances(date) from public, anon, authenticated;
revoke all on function money_set_opening(uuid, bigint, text, text) from public, anon, authenticated;
revoke all on function money_close_day(date, jsonb, text, text, text) from public, anon, authenticated;
revoke all on function money_day_open(date) from public, anon, authenticated;
revoke all on function money_guard_undo_taken() from public, anon, authenticated;
revoke all on function money_guard_closed_day() from public, anon, authenticated;
revoke all on function money_wallet_take(uuid, bigint, text, uuid, text, text, text) from public, anon, authenticated;

-- Accounts → Expenses gets its dashboard, the Overview gets money out and net
-- cash, and a morning reminder tells the boss and supervisors what's due.
-- Nothing here changes a record. Applied by hand: node scripts/apply-migration.mjs

-- The days the morning reminder has gone out, so it goes once even across restarts.
create table expense_reminders (
  day     date primary key,
  sent_at timestamptz not null default now()
);

alter table expense_reminders enable row level security;
revoke all on table expense_reminders from anon, authenticated;

-- Everything with something still to pay, however old, so the list and the
-- reminder never lose a bill among the many automatic lines.
create function expense_open_lines()
returns setof expense_lines
language sql
stable
as $$
  select * from expense_lines
   where tenant_id = default_tenant_id()
     and voided_at is null
     and approval <> 'rejected'
     and paid_from is distinct from 'on_credit'
     and paid < amount
$$;

-- What the dashboard shows. To pay, overdue and upcoming are as of today,
-- whatever the period. Total, paid, left and the categories are the expenses
-- belonging to the period: a recurring bill belongs to the day it's due, even
-- though it's created up to 14 days ahead. Null dates mean all time.
-- Overdue follows expenseStatus (packages/lib/books/expenses.ts): one still
-- waiting for approval isn't overdue yet, though it does count as to pay.
create function expense_dashboard(p_from date, p_to date, p_today date)
returns jsonb
language sql
stable
as $$
  with live as (
    select
      e.*,
      case when e.schedule_id is not null then coalesce(e.due_on, e.spent_on) else e.spent_on end as belongs_on,
      case when e.paid_from = 'on_credit' then 0 else greatest(e.amount - e.paid, 0) end as owing
    from expense_lines e
    where e.tenant_id = default_tenant_id() and e.voided_at is null and e.approval <> 'rejected'
  ),
  period as (
    select * from live
     where (p_from is null or belongs_on >= p_from) and (p_to is null or belongs_on <= p_to)
  ),
  late as (
    select * from live where owing > 0 and approval = 'approved' and due_on < p_today
  ),
  soon as (
    select * from live where owing > 0 and due_on between p_today and p_today + 14
  ),
  categories as (
    select category as key, category_name as name, sum(amount)::bigint as total, sum(paid)::bigint as paid, sum(owing)::bigint as owing
      from period
     group by category, category_name
  )
  select jsonb_build_object(
    'toPay', (select coalesce(sum(owing), 0) from live),
    'overdue', (select coalesce(sum(owing), 0) from late),
    'overdueCount', (select count(*) from late),
    'upcoming', (select coalesce(sum(owing), 0) from soon),
    'upcomingCount', (select count(*) from soon),
    'total', (select coalesce(sum(amount), 0) from period),
    'paid', (select coalesce(sum(paid), 0) from period),
    'owing', (select coalesce(sum(owing), 0) from period),
    'byCategory', (select coalesce(jsonb_agg(c order by c.total desc, c.name), '[]'::jsonb) from categories c)
  )
$$;

-- All the money in and out over a period, as Today counts it. Moves between the
-- business's own accounts are neither.
create function money_flow(p_from date, p_to date)
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
    and kind <> 'move'
    and (p_from is null or day >= p_from)
    and (p_to is null or day <= p_to)
$$;

revoke all on function expense_open_lines() from public, anon, authenticated;
revoke all on function expense_dashboard(date, date, date) from public, anon, authenticated;
revoke all on function money_flow(date, date) from public, anon, authenticated;

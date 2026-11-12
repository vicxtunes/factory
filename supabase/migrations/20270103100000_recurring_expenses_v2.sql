-- Recurring expenses, second round (owner, 2026-11-12):
--
--   * every day too, and every N days, weeks, months or years;
--   * an end date, or a number of bills, after which it finishes by itself;
--   * edit: only bills not yet created follow the change;
--   * pause: nothing is created meanwhile, and what fell due while paused is
--     skipped on resume, not owed;
--   * pause or cancel can also void its unpaid bills, chosen one by one, and a
--     bill voided that way can be restored.
--
-- The next bill is still counted from the start date (first_due_on +
-- created_count steps), so the 31st comes back after February. An edit or a
-- resume moves the start date and the count, never the bills already made.
-- Applied by hand: node scripts/apply-migration.mjs <this file>

alter table expense_schedules drop constraint expense_schedules_every_check;
alter table expense_schedules
  add constraint expense_schedules_every_check check (every in ('day', 'week', 'month', 'year')),
  -- Every 2 weeks, every 3 months.
  add column every_count    integer not null default 1 check (every_count between 1 and 366),
  -- Nothing due after this day.
  add column ends_on        date,
  -- At most this many bills in all.
  add column times          integer check (times between 1 and 1000),
  add column paused_at      timestamptz,
  add column paused_by_name text,
  add column edited_at      timestamptz,
  add column edited_by_name text;

alter table expenses
  -- Voided together with its recurring expense: the only void that can be undone.
  add column voided_with_schedule boolean not null default false,
  add column restored_at          timestamptz,
  add column restored_by_name     text;

-- The due date `p_step` steps after the start.
create function expense_schedule_due_on(p_first date, p_every text, p_count integer, p_step integer)
returns date
language sql
immutable
as $$
  select (p_first + (p_step * p_count) * ('1 ' || p_every)::interval)::date
$$;

-- History stays: only a void, an approval, the real amount of an estimate and a
-- restore can change. Only a bill voided with its recurring expense comes back,
-- and nothing else about it changes on the way.
create or replace function expenses_guard()
returns trigger
language plpgsql
as $$
declare
  v_open text[] := array['voided_at', 'void_reason', 'voided_by_name', 'voided_with_schedule', 'amount', 'amount_is_estimate', 'approval', 'approved_by_name', 'approved_at', 'approval_note'];
  v_void text[] := array['voided_at', 'void_reason', 'voided_by_name', 'voided_with_schedule', 'restored_at', 'restored_by_name'];
begin
  if tg_op = 'DELETE' then raise exception 'PRODUCTION:history'; end if;
  if old.voided_at is not null then
    if old.voided_with_schedule
       and new.voided_at is null and new.void_reason is null and new.voided_by_name is null
       and not new.voided_with_schedule and new.restored_at is not null and nullif(trim(new.restored_by_name), '') is not null
       and (to_jsonb(new) - v_void) = (to_jsonb(old) - v_void) then
      return new;
    end if;
    raise exception 'PRODUCTION:history';
  end if;
  if (new.voided_at is not null and nullif(trim(new.void_reason), '') is null)
     or (new.voided_with_schedule and new.voided_at is null)
     or (new.amount <> old.amount and not old.amount_is_estimate)
     or (to_jsonb(new) - v_open) is distinct from (to_jsonb(old) - v_open) then
    raise exception 'PRODUCTION:history';
  end if;
  return new;
end;
$$;

-- Ends it by itself once its end date or number of bills is reached.
create or replace function expense_generate_due(p_today date)
returns integer
language plpgsql
as $$
declare
  v_schedule expense_schedules;
  v_due date;
  v_bills integer;
  v_made integer := 0;
begin
  for v_schedule in
    select * from expense_schedules where ended_at is null and paused_at is null and tenant_id = default_tenant_id() for update
  loop
    select count(*) into v_bills from expenses where schedule_id = v_schedule.id;
    loop
      v_due := expense_schedule_due_on(v_schedule.first_due_on, v_schedule.every, v_schedule.every_count, v_schedule.created_count);
      if (v_schedule.times is not null and v_bills >= v_schedule.times) or (v_schedule.ends_on is not null and v_due > v_schedule.ends_on) then
        update expense_schedules set ended_at = now(), ended_by_name = 'Aming (automatic)' where id = v_schedule.id;
        exit;
      end if;
      exit when v_due > p_today + 14;
      insert into expenses (category, amount, spent_on, name, description, recipient, due_on, schedule_id, amount_is_estimate, approval, approved_by_name, approved_at, actor_id, actor_name)
      values (
        v_schedule.category, v_schedule.amount, least(v_due, p_today), v_schedule.name, v_schedule.description, v_schedule.recipient, v_due, v_schedule.id, v_schedule.varies,
        case when not v_schedule.boss_approved and expense_needs_approval(v_schedule.amount, false) then 'waiting' else 'approved' end,
        case when v_schedule.boss_approved then v_schedule.actor_name end,
        case when v_schedule.boss_approved then now() end,
        v_schedule.actor_id, v_schedule.actor_name
      )
      on conflict do nothing;
      if found then
        v_made := v_made + 1;
        v_bills := v_bills + 1;
      end if;
      v_schedule.created_count := v_schedule.created_count + 1;
      update expense_schedules set created_count = v_schedule.created_count where id = v_schedule.id;
    end loop;
  end loop;
  return v_made;
end;
$$;

-- Checks shared by adding and editing.
create function expense_schedule_check(p_name text, p_category text, p_amount bigint, p_every text, p_every_count integer, p_first date, p_ends_on date, p_times integer)
returns void
language plpgsql
as $$
begin
  if nullif(trim(p_name), '') is null then raise exception 'EXPENSE:name'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'EXPENSE:amount'; end if;
  if p_first is null then raise exception 'EXPENSE:first_due'; end if;
  if p_every is null or p_every not in ('day', 'week', 'month', 'year') then raise exception 'EXPENSE:every'; end if;
  if p_every_count is null or p_every_count not between 1 and 366 then raise exception 'EXPENSE:every_count'; end if;
  if p_ends_on is not null and p_ends_on < p_first then raise exception 'EXPENSE:ends_on'; end if;
  if p_times is not null and p_times not between 1 and 1000 then raise exception 'EXPENSE:times'; end if;
  perform 1 from expense_categories where key = p_category and not automatic;
  if not found then raise exception 'EXPENSE:category'; end if;
end;
$$;

drop function expense_schedule_add(uuid, text, text, text, bigint, boolean, text, date, text, boolean, text, text);

create function expense_schedule_add(
  p_id uuid,
  p_name text,
  p_description text,
  p_category text,
  p_amount bigint,
  p_varies boolean,
  p_every text,
  p_every_count integer,
  p_first_due_on date,
  p_ends_on date,
  p_times integer,
  p_recipient text,
  p_is_boss boolean,
  p_actor_id text,
  p_actor_name text
)
returns void
language plpgsql
as $$
begin
  perform expense_schedule_check(p_name, p_category, p_amount, p_every, p_every_count, p_first_due_on, p_ends_on, p_times);
  insert into expense_schedules (id, name, description, category, recipient, amount, varies, every, every_count, first_due_on, ends_on, times, boss_approved, actor_id, actor_name)
  values (p_id, trim(p_name), nullif(trim(p_description), ''), p_category, nullif(trim(p_recipient), ''), p_amount, p_varies, p_every, p_every_count, p_first_due_on, p_ends_on, p_times, p_is_boss, p_actor_id, p_actor_name)
  on conflict (id) do nothing;
  perform expense_generate_due(production_today(default_tenant_id()));
end;
$$;

-- Bills already created stay as they are; the next one is due on p_next_due_on.
-- Someone other than the boss changing it sends its bills back to the approval limit.
create function expense_schedule_edit(
  p_id uuid,
  p_name text,
  p_description text,
  p_category text,
  p_amount bigint,
  p_varies boolean,
  p_every text,
  p_every_count integer,
  p_next_due_on date,
  p_ends_on date,
  p_times integer,
  p_recipient text,
  p_is_boss boolean,
  p_actor_name text
)
returns void
language plpgsql
as $$
declare
  v_schedule expense_schedules;
begin
  select * into v_schedule from expense_schedules where id = p_id and tenant_id = default_tenant_id() for update;
  if not found or v_schedule.ended_at is not null then raise exception 'EXPENSE:schedule_ended'; end if;
  perform expense_schedule_check(p_name, p_category, p_amount, p_every, p_every_count, p_next_due_on, p_ends_on, p_times);
  if p_next_due_on < production_today(default_tenant_id()) then raise exception 'EXPENSE:next_due'; end if;
  update expense_schedules set
    name = trim(p_name),
    description = nullif(trim(p_description), ''),
    category = p_category,
    recipient = nullif(trim(p_recipient), ''),
    amount = p_amount,
    varies = p_varies,
    every = p_every,
    every_count = p_every_count,
    first_due_on = p_next_due_on,
    created_count = 0,
    ends_on = p_ends_on,
    times = p_times,
    boss_approved = p_is_boss,
    edited_at = now(),
    edited_by_name = p_actor_name
  where id = p_id;
  perform expense_generate_due(production_today(default_tenant_id()));
end;
$$;

-- Pause (p_end false) or cancel (true). p_void: the unpaid bills the person
-- chose to void with it; one paid since they looked is left alone. Returns how
-- many were voided.
create function expense_schedule_stop(p_id uuid, p_end boolean, p_void uuid[], p_actor_name text)
returns integer
language plpgsql
as $$
declare
  v_schedule expense_schedules;
  v_voided integer;
begin
  select * into v_schedule from expense_schedules where id = p_id and tenant_id = default_tenant_id() for update;
  if not found or v_schedule.ended_at is not null then raise exception 'EXPENSE:schedule_ended'; end if;
  if not p_end and v_schedule.paused_at is not null then raise exception 'EXPENSE:schedule_paused'; end if;
  if p_end then
    update expense_schedules set ended_at = now(), ended_by_name = p_actor_name where id = p_id;
  else
    update expense_schedules set paused_at = now(), paused_by_name = p_actor_name where id = p_id;
  end if;
  update expenses e set
    voided_at = now(),
    void_reason = case when p_end then 'Cancelled with ' else 'Paused with ' end || v_schedule.name,
    voided_by_name = p_actor_name,
    voided_with_schedule = true
  where e.id = any (coalesce(p_void, '{}'))
    and e.schedule_id = p_id
    and e.voided_at is null
    and not exists (select 1 from expense_payments p where p.expense_id = e.id and p.voided_at is null)
    and not exists (select 1 from expense_payouts o where o.expense_id = e.id and o.status = 'sending');
  get diagnostics v_voided = row_count;
  return v_voided;
end;
$$;

-- Starts again from the first due date on or after today: what fell due while
-- paused is skipped.
create function expense_schedule_resume(p_id uuid, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_schedule expense_schedules;
  v_today date := production_today(default_tenant_id());
begin
  select * into v_schedule from expense_schedules where id = p_id and tenant_id = default_tenant_id() for update;
  if not found or v_schedule.ended_at is not null then raise exception 'EXPENSE:schedule_ended'; end if;
  if v_schedule.paused_at is null then raise exception 'EXPENSE:schedule_running'; end if;
  while expense_schedule_due_on(v_schedule.first_due_on, v_schedule.every, v_schedule.every_count, v_schedule.created_count) < v_today loop
    v_schedule.created_count := v_schedule.created_count + 1;
  end loop;
  update expense_schedules set paused_at = null, paused_by_name = null, created_count = v_schedule.created_count, edited_at = now(), edited_by_name = p_actor_name where id = p_id;
  perform expense_generate_due(v_today);
end;
$$;

-- Undoes a void made with a pause or cancel. The bill is owed again.
create function expense_restore(p_expense uuid, p_actor_name text)
returns void
language plpgsql
as $$
begin
  update expenses set
    voided_at = null,
    void_reason = null,
    voided_by_name = null,
    voided_with_schedule = false,
    restored_at = now(),
    restored_by_name = p_actor_name
  where id = p_expense and tenant_id = default_tenant_id() and voided_with_schedule and voided_at is not null;
  if not found then raise exception 'EXPENSE:not_restorable'; end if;
end;
$$;

-- Bills a running schedule will create in the next p_days, not yet created.
create function expense_schedule_upcoming(p_today date, p_days integer)
returns table (schedule_id uuid, due_on date)
language sql
stable
as $$
  select s.id, d.due_on
    from expense_schedules s
   cross join lateral (
     select g as step, expense_schedule_due_on(s.first_due_on, s.every, s.every_count, s.created_count + g) as due_on
       from generate_series(0, 400) g
   ) d
   where s.tenant_id = default_tenant_id()
     and s.ended_at is null
     and s.paused_at is null
     and d.due_on <= p_today + p_days
     and (s.ends_on is null or d.due_on <= s.ends_on)
     and (s.times is null or (select count(*) from expenses e where e.schedule_id = s.id) + d.step < s.times)
   order by d.due_on
$$;

-- New columns go last so the view keeps its shape for what reads it.
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
  e.voided_by_name,
  s.every_count as schedule_every_count,
  e.voided_with_schedule,
  e.restored_at,
  e.restored_by_name,
  -- Which accounts paid it: the payments' own, or where an automatic one came from.
  coalesce(
    (select array_agg(distinct a.name order by a.name) from expense_payments p join money_accounts a on a.id = p.money_account_id where p.expense_id = e.id and p.voided_at is null),
    case when e.paid_from is not null and e.paid_from <> 'on_credit' then (select array[a.name] from money_accounts a where a.id = money_default_account(e.paid_from)) end,
    '{}'
  ) as paid_from_accounts
from expenses e
join expense_categories c on c.key = e.category
left join expense_schedules s on s.id = e.schedule_id
left join material_purchases m on m.id = e.purchase_id
left join loan_repayments r on r.id = e.repayment_id
left join loans l on l.id = r.loan_id
left join lenders n on n.id = l.lender_id;

-- Each recurring expense with what it has cost and when the next bill is made.
create view expense_schedule_lines with (security_invoker = true) as
select
  s.id,
  s.tenant_id,
  s.name,
  s.description,
  s.category,
  c.name as category_name,
  s.recipient,
  s.amount,
  s.varies,
  s.every,
  s.every_count,
  s.first_due_on,
  s.ends_on,
  s.times,
  s.actor_name,
  s.created_at,
  s.paused_at,
  s.paused_by_name,
  s.edited_at,
  s.edited_by_name,
  s.ended_at,
  s.ended_by_name,
  case when s.ended_at is null then expense_schedule_due_on(s.first_due_on, s.every, s.every_count, s.created_count) end as next_created_on,
  (select count(*) from expenses e where e.schedule_id = s.id)::integer as bills,
  (select coalesce(sum(l.paid), 0) from expense_lines l where l.schedule_id = s.id)::bigint as paid_total
from expense_schedules s
join expense_categories c on c.key = s.category;

-- What was spent each month, the last p_months up to p_to's month, for the
-- month-by-month chart. A recurring bill belongs to its due day, as on the dashboard.
create function expense_months(p_to date, p_months integer)
returns table (month date, total bigint, paid bigint)
language sql
stable
as $$
  with months as (
    select (date_trunc('month', p_to) - (g * interval '1 month'))::date as month
      from generate_series(0, greatest(p_months, 1) - 1) g
  ),
  live as (
    select
      date_trunc('month', case when schedule_id is not null then coalesce(due_on, spent_on) else spent_on end)::date as month,
      amount,
      paid
    from expense_lines
    where tenant_id = default_tenant_id() and voided_at is null and approval <> 'rejected'
  )
  select m.month, coalesce(sum(l.amount), 0)::bigint, coalesce(sum(l.paid), 0)::bigint
    from months m
    left join live l on l.month = m.month
   group by m.month
   order by m.month
$$;

revoke all on expense_schedule_lines from anon, authenticated;
revoke all on function expense_schedule_due_on(date, text, integer, integer) from public, anon, authenticated;
revoke all on function expense_schedule_check(text, text, bigint, text, integer, date, date, integer) from public, anon, authenticated;
revoke all on function expense_schedule_add(uuid, text, text, text, bigint, boolean, text, integer, date, date, integer, text, boolean, text, text) from public, anon, authenticated;
revoke all on function expense_schedule_edit(uuid, text, text, text, bigint, boolean, text, integer, date, date, integer, text, boolean, text) from public, anon, authenticated;
revoke all on function expense_schedule_stop(uuid, boolean, uuid[], text) from public, anon, authenticated;
revoke all on function expense_schedule_resume(uuid, text) from public, anon, authenticated;
revoke all on function expense_restore(uuid, text) from public, anon, authenticated;
revoke all on function expense_schedule_upcoming(date, integer) from public, anon, authenticated;
revoke all on function expense_months(date, integer) from public, anon, authenticated;

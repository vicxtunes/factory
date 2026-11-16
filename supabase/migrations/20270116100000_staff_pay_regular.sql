-- Staff pay, round 2 (owner, 2026-11-17): allowances and advances on their own
-- days, and every salary in one place.
--
--   * An allowance comes with every pay (as before), or every day, every week,
--     or on chosen weekdays. The boss picks per allowance whether one on days
--     is added up on the payslip (5,000 × the days in that pay's period) or
--     given on the day by itself.
--   * An advance is given any time (as before), or every day, every week, or
--     on chosen weekdays. Each one given comes off the next payslip, as before.
--   * One given on the day either sends by itself through HivePay (the same
--     switch and time as pay that sends by itself; only on its own day) or
--     waits under To pay for the boss to pay or cancel. Each is an expense:
--     'Staff allowances' or 'Salary advances'. Nothing given on the day is
--     ever made for a day before the boss set it up.
--   * staff_pay_allowances becomes staff_pay_regulars (with every pay, on the
--     payslip).
--
-- Applied by hand: node scripts/apply-migration.mjs <this file>

insert into expense_categories (key, name, automatic) values ('staff_allowance', 'Staff allowances', true)
on conflict (key) do nothing;

create table staff_pay_regulars (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references staff_pay_people (id) on delete restrict,
  kind       text not null check (kind in ('allowance', 'advance')),
  name       text not null check (nullif(trim(name), '') is not null and char_length(name) <= 80),
  amount     bigint not null check (amount > 0 and amount <= 5000000),
  -- The weekdays it falls on (0 Sunday): all seven is every day, one is every
  -- week. Null: with every pay (allowances only).
  weekdays   smallint[] check (weekdays is null or (cardinality(weekdays) between 1 and 7 and weekdays <@ '{0,1,2,3,4,5,6}')),
  -- 'payslip': added to the payslip. 'send': given on the day, sent by
  -- HivePay by itself. 'hand': given on the day, waits to be paid.
  how        text not null check (how in ('payslip', 'send', 'hand')),
  -- The first day it counts.
  starts_on  date not null,
  -- Given on the day: the next day not yet looked at.
  next_on    date not null,
  stopped_at timestamptz,
  actor_name text not null,
  created_at timestamptz not null default now(),
  check (weekdays is not null or (kind = 'allowance' and how = 'payslip')),
  check (kind = 'allowance' or how <> 'payslip'),
  check (how = 'payslip' or amount >= 500)
);
create index staff_pay_regulars_person_idx on staff_pay_regulars (person_id) where stopped_at is null;

-- One given on its day: its expense.
create table staff_pay_given (
  id                uuid primary key references expenses (id) on delete restrict,
  regular_id        uuid not null references staff_pay_regulars (id) on delete restrict,
  person_id         uuid not null references staff_pay_people (id) on delete restrict,
  kind              text not null check (kind in ('allowance', 'advance')),
  due_on            date not null,
  -- Sends by itself once only: set when it was tried.
  autosend_tried_at timestamptz,
  unique (regular_id, due_on)
);
create index staff_pay_given_person_idx on staff_pay_given (person_id, due_on);

alter table staff_pay_regulars enable row level security;
alter table staff_pay_given enable row level security;
revoke all on table staff_pay_regulars, staff_pay_given from anon, authenticated;

insert into staff_pay_regulars (person_id, kind, name, amount, how, starts_on, next_on, actor_name, created_at)
select a.person_id, 'allowance', a.name, a.amount, 'payslip', a.created_at::date, a.created_at::date, p.actor_name, a.created_at
  from staff_pay_allowances a join staff_pay_people p on p.id = a.person_id;
drop table staff_pay_allowances;

-- How many of `p_weekdays` fall from `p_from` to `p_to`.
create function staff_pay_count_days(p_weekdays smallint[], p_from date, p_to date)
returns integer
language sql
immutable
as $$
  select count(*)::integer from generate_series(p_from, p_to, interval '1 day') d
   where extract(dow from d)::smallint = any (p_weekdays);
$$;

-- What a payslip on `p_pay_on` gets: allowances with every pay, those on days
-- added up over its period (from the day after the last payslip), and the
-- one-offs not yet taken.
create function staff_pay_slip_lines(p_person uuid, p_pay_on date)
returns jsonb
language plpgsql
stable
as $$
declare
  v_after date := (select max(pay_on) from staff_pay_slips where person_id = p_person and pay_on < p_pay_on);
begin
  return coalesce((
    select jsonb_agg(line order by at)
      from (
        select r.created_at as at, jsonb_build_object('name', r.name, 'amount', r.amount, 'once', false) as line
          from staff_pay_regulars r
         where r.person_id = p_person and r.how = 'payslip' and r.weekdays is null and r.stopped_at is null
        union all
        select r.created_at, jsonb_build_object('name', r.name, 'amount', r.amount * n.days, 'once', false, 'days', n.days, 'each', r.amount)
          from staff_pay_regulars r,
               lateral (select staff_pay_count_days(r.weekdays,
                                                    greatest(r.starts_on, coalesce(v_after + 1, r.starts_on)),
                                                    least(p_pay_on, coalesce((r.stopped_at at time zone (select time_zone from tenants where id = default_tenant_id()))::date, p_pay_on))) as days) n
         where r.person_id = p_person and r.how = 'payslip' and r.weekdays is not null and n.days > 0
        union all
        select x.created_at, jsonb_build_object('name', x.name, 'amount', x.amount, 'once', true)
          from staff_pay_extras x
         where x.person_id = p_person and x.slip_id is null
      ) lines
  ), '[]');
end;
$$;

-- Allowances and advances given on their day: one expense each, from the
-- regular's next day to today.
create function staff_pay_make_given(p_today date)
returns integer
language plpgsql
as $$
declare
  r record;
  d date;
  v_id uuid;
  v_made integer := 0;
begin
  for r in
    select g.*, p.name as person_name, p.phone
      from staff_pay_regulars g
      join staff_pay_people p on p.id = g.person_id
     where p.tenant_id = default_tenant_id() and g.how in ('send', 'hand') and g.stopped_at is null and p.stopped_at is null
       and g.next_on <= p_today
     for update of g skip locked
  loop
    d := greatest(r.next_on, r.starts_on);
    while d <= p_today loop
      if extract(dow from d)::smallint = any (r.weekdays) and not exists (select 1 from staff_pay_given where regular_id = r.id and due_on = d) then
        v_id := gen_random_uuid();
        insert into expenses (id, category, amount, spent_on, due_on, name, recipient, approval, approved_by_name, approved_at, actor_name, pay_phone)
        values (v_id, case r.kind when 'advance' then 'salary_advance' else 'staff_allowance' end, r.amount, d, d,
                case r.kind when 'advance' then 'Salary advance' else r.name end || ': ' || r.person_name || ', ' || to_char(d, 'FMDD Mon YYYY'),
                r.person_name, 'approved', r.actor_name, now(), 'Aming (automatic)', r.phone);
        insert into staff_pay_given (id, regular_id, person_id, kind, due_on) values (v_id, r.id, r.person_id, r.kind, d);
        if r.kind = 'advance' then
          insert into staff_pay_advances (id, person_id, amount, given_on) values (v_id, r.person_id, r.amount, d);
        end if;
        v_made := v_made + 1;
      end if;
      d := d + 1;
    end loop;
    update staff_pay_regulars set next_on = p_today + 1 where id = r.id;
  end loop;
  return v_made;
end;
$$;

-- As before, with the payslip's lines from staff_pay_slip_lines, then what's
-- given on its day.
create or replace function staff_pay_make_slips(p_today date)
returns integer
language plpgsql
as $$
declare
  v_person staff_pay_people;
  v_slip uuid;
  v_made integer := 0;
begin
  for v_person in
    select * from staff_pay_people
     where tenant_id = default_tenant_id() and stopped_at is null and next_pay_on <= p_today
     for update skip locked
  loop
    while v_person.next_pay_on <= p_today loop
      v_slip := gen_random_uuid();
      insert into staff_pay_slips (id, person_id, pay_on, rate, day_rate, basic, allowances)
      values (
        v_slip, v_person.id, v_person.next_pay_on, v_person.rate, v_person.day_rate,
        case when v_person.day_rate then null else v_person.rate end,
        staff_pay_slip_lines(v_person.id, v_person.next_pay_on)
      )
      on conflict (person_id, pay_on) do nothing;
      if found then
        update staff_pay_extras set slip_id = v_slip where person_id = v_person.id and slip_id is null;
        perform staff_pay_finish(v_slip, 'Aming (automatic)');
        v_made := v_made + 1;
      end if;
      v_person.next_pay_on := staff_pay_next(v_person.pay_every, v_person.pay_day, v_person.next_pay_on);
    end loop;
    update staff_pay_people set next_pay_on = v_person.next_pay_on where id = v_person.id;
  end loop;
  return v_made + staff_pay_make_given(p_today);
end;
$$;

-- Adds or changes a person and their allowances and regular advances
-- ([{id, kind, name, amount, weekdays, how}]). Ones left out stop; new ones
-- start tomorrow.
drop function staff_pay_save(uuid, text, uuid, uuid, uuid, text, boolean, bigint, smallint, text, boolean, jsonb, text);
create function staff_pay_save(
  p_id uuid,
  p_name text,
  p_worker uuid,
  p_profile uuid,
  p_designer uuid,
  p_every text,
  p_day_rate boolean,
  p_rate bigint,
  p_pay_day smallint,
  p_phone text,
  p_sends_itself boolean,
  p_regulars jsonb,
  p_actor_name text
)
returns void
language plpgsql
as $$
declare
  v_today date := production_today(default_tenant_id());
  v_old staff_pay_people;
  v_after date;
  x jsonb;
  v_weekdays smallint[];
begin
  if p_every not in ('month', 'week') or p_rate is null or p_rate <= 0 then raise exception 'STAFFPAY:staff_pay'; end if;
  if p_sends_itself and nullif(trim(p_phone), '') is null then raise exception 'STAFFPAY:staff_phone'; end if;
  select * into v_old from staff_pay_people where id = p_id for update;
  if found then
    if v_old.stopped_at is not null then raise exception 'STAFFPAY:staff_stopped'; end if;
    -- After the last payslip made, so a changed day never pays twice.
    v_after := greatest(v_today - 1, coalesce((select max(pay_on) from staff_pay_slips where person_id = p_id), v_today - 1));
    update staff_pay_people set
      name = trim(p_name), worker_id = p_worker, profile_id = p_profile, designer_id = p_designer,
      pay_every = p_every, day_rate = p_day_rate, rate = p_rate, pay_day = p_pay_day,
      next_pay_on = case when p_every = v_old.pay_every and p_pay_day = v_old.pay_day then v_old.next_pay_on
                         else staff_pay_next(p_every, p_pay_day, v_after) end,
      phone = nullif(trim(p_phone), ''), sends_itself = p_sends_itself,
      edited_at = now(), edited_by_name = p_actor_name
    where id = p_id;
  else
    insert into staff_pay_people (id, name, worker_id, profile_id, designer_id, pay_every, day_rate, rate, pay_day, next_pay_on, phone, sends_itself, actor_name)
    values (p_id, trim(p_name), p_worker, p_profile, p_designer, p_every, p_day_rate, p_rate, p_pay_day,
            staff_pay_next(p_every, p_pay_day, v_today - 1), nullif(trim(p_phone), ''), p_sends_itself, p_actor_name);
  end if;

  update staff_pay_regulars set stopped_at = now()
   where person_id = p_id and stopped_at is null
     and id not in (select (y->>'id')::uuid from jsonb_array_elements(coalesce(p_regulars, '[]')) y);
  for x in select * from jsonb_array_elements(coalesce(p_regulars, '[]')) loop
    if x->>'how' = 'send' and nullif(trim(p_phone), '') is null then raise exception 'STAFFPAY:staff_phone'; end if;
    v_weekdays := case when jsonb_typeof(x->'weekdays') = 'array' then (select array_agg(distinct v::smallint order by v::smallint) from jsonb_array_elements_text(x->'weekdays') v) end;
    update staff_pay_regulars set name = trim(x->>'name'), amount = (x->>'amount')::bigint, weekdays = v_weekdays, how = x->>'how'
     where id = (x->>'id')::uuid and person_id = p_id and stopped_at is null and kind = x->>'kind';
    if not found then
      if exists (select 1 from staff_pay_regulars where id = (x->>'id')::uuid) then raise exception 'STAFFPAY:staff_gone'; end if;
      insert into staff_pay_regulars (id, person_id, kind, name, amount, weekdays, how, starts_on, next_on, actor_name)
      values ((x->>'id')::uuid, p_id, x->>'kind', trim(x->>'name'), (x->>'amount')::bigint, v_weekdays, x->>'how', v_today + 1, v_today + 1, p_actor_name);
    end if;
  end loop;
end;
$$;

-- What's given on its day that sends by itself now: the switch is on, it's
-- past the boss's time, it's today's, set to send, unpaid, nothing on its
-- way, never tried. Each is claimed, so it's tried once only. A day missed
-- waits to be paid by hand.
create function staff_pay_given_claim(p_now timestamptz)
returns table (given_id uuid, expense_id uuid, amount bigint, phone text, name text, what text)
language plpgsql
as $$
declare
  v_zone text := (select time_zone from tenants where id = default_tenant_id());
  v_today date := (p_now at time zone v_zone)::date;
begin
  if not exists (select 1 from staff_pay_settings c where c.tenant_id = default_tenant_id() and c.sends_on and (p_now at time zone v_zone)::time >= c.send_at) then
    return;
  end if;
  return query
  with due as (
    select g.id
      from staff_pay_given g
      join staff_pay_regulars r on r.id = g.regular_id
      join staff_pay_people p on p.id = g.person_id
      join expense_lines l on l.id = g.id
     where g.due_on = v_today and g.autosend_tried_at is null
       and r.how = 'send' and p.phone is not null and p.stopped_at is null
       and l.voided_at is null and l.paid < l.amount and not l.payout_sending
     for update of g skip locked
  )
  update staff_pay_given g set autosend_tried_at = p_now
    from due, staff_pay_regulars r, staff_pay_people p, expense_lines l
   where g.id = due.id and r.id = g.regular_id and p.id = g.person_id and l.id = g.id
  returning g.id, g.id, (l.amount - l.paid)::bigint, p.phone, p.name,
            case g.kind when 'advance' then 'advance' else lower(r.name) end;
end;
$$;

-- Staff cost by month and person, for the page's charts: basic and
-- allowances on payslips (not cancelled), allowances given on their day
-- (not cancelled), and advances once given.
create function staff_pay_month_totals(p_from date)
returns table (month date, person_id uuid, basic bigint, allowances bigint, advances bigint)
language sql
stable
as $$
  with x as (
    select date_trunc('month', s.pay_on)::date as m, s.person_id, coalesce(s.basic, 0) as b,
           coalesce((select sum((a->>'amount')::bigint) from jsonb_array_elements(s.allowances) a), 0) as al, 0::bigint as ad
      from staff_pay_slips s left join expenses e on e.id = s.expense_id
     where s.tenant_id = default_tenant_id() and s.pay_on >= p_from and s.net is not null and (s.expense_id is null or e.voided_at is null)
    union all
    select date_trunc('month', g.due_on)::date, g.person_id, 0, l.amount, 0
      from staff_pay_given g join expense_lines l on l.id = g.id
     where g.kind = 'allowance' and g.due_on >= p_from and l.voided_at is null
    union all
    select date_trunc('month', a.given_on)::date, a.person_id, 0, 0, a.amount
      from staff_pay_advances a join expense_lines l on l.id = a.id
     where a.given_on >= p_from and l.voided_at is null and l.paid >= l.amount
  )
  select m, x.person_id, sum(b)::bigint, sum(al)::bigint, sum(ad)::bigint from x group by m, x.person_id;
$$;

revoke all on function staff_pay_count_days(smallint[], date, date) from public, anon, authenticated;
revoke all on function staff_pay_slip_lines(uuid, date) from public, anon, authenticated;
revoke all on function staff_pay_make_given(date) from public, anon, authenticated;
revoke all on function staff_pay_make_slips(date) from public, anon, authenticated;
revoke all on function staff_pay_save(uuid, text, uuid, uuid, uuid, text, boolean, bigint, smallint, text, boolean, jsonb, text) from public, anon, authenticated;
revoke all on function staff_pay_given_claim(timestamptz) from public, anon, authenticated;
revoke all on function staff_pay_month_totals(date) from public, anon, authenticated;

-- --- The rest of the salaries move from Expenses (owner, 2026-11-17) ------------
--
-- Read on live 2026-11-17: SK had already added Faith Abbo, Carol, Obwana
-- Malaika and Otim Andrew to Staff pay on 15 Nov, but their 5 repeating
-- salary bills in Expenses still ran. They stop here, so no salary is billed
-- in two places. Their two unpaid bills are the same November salaries as
-- their Staff pay payslips (owner: "Duplicates: cancel both"), so they're
-- voided. Only on live: elsewhere these rows don't exist.

update expense_schedules set ended_at = now(), ended_by_name = 'Moved to Staff pay'
 where ended_at is null and category = 'salaries'
   and id in ('8fb7c8df-d2ba-460f-9fc7-2fd60870bade',  -- Faith Salary 300,000 on the 10th
              '93e1f26c-5a82-4fc2-b05f-f3ca1cb457f7',  -- Hope caroline (Carol) 600,000 on the 25th
              '13900e73-ae27-42c8-b249-0d0907d8c79d',  -- Hope Caroline (Carol) 400,000 on the 25th
              'bd91e158-44b3-4aee-8560-35ac23f179b0',  -- Obwana Malaika 350,000 on the 5th
              'af55b7ae-9048-48af-8c11-9088ff654433'); -- Otim Andrew 600,000 on the 13th

do $$
declare
  v_id uuid;
begin
  foreach v_id in array array['5d534883-1495-4706-a73d-6914a318d749',   -- Obwana Malaika, 5 Nov, 350,000
                              'b21e50b2-6e57-4f7a-b90d-7419533af8e3']::uuid[] -- Faith, 10 Nov, 300,000
  loop
    if exists (select 1 from expense_lines where id = v_id and voided_at is null and paid = 0) then
      perform expense_void(v_id, 'Paid through Staff pay', 'Moved to Staff pay');
    end if;
  end loop;
end;
$$;
